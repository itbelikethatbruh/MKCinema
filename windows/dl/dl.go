// Package dl keeps offline downloads for the MKCinema desktop app (Windows app 1.3.0).
//
// The web app hands it a direct or debrid link it already resolved. Files go to Videos\MKCinema (the user's own
// Videos folder, so any video player can open them), two at a time, resuming after a dropped connection or an app
// restart when the link still allows it. Finished files are served to the in-app player on 127.0.0.1 with a random
// token, the same way as the torrent engine. Nothing is uploaded and nothing leaves this computer.
package dl

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"mkcinema/origins"
)

// Item is one download. URL and Headers stay in the index (to resume) but never go back to the page.
type Item struct {
	ID      string            `json:"id"`
	URL     string            `json:"url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	File    string            `json:"file"`
	Path    string            `json:"path,omitempty"`
	Meta    json.RawMessage   `json:"meta,omitempty"`
	Created int64             `json:"created"`
	State   string            `json:"state"` // queued, running, paused, done, failed
	Got     int64             `json:"got"`
	Size    int64             `json:"size"`
	Err     string            `json:"err"`
}

type Manager struct {
	Dir     string
	index   string
	mu      sync.Mutex
	items   []*Item
	cancel  map[string]context.CancelFunc
	slots   chan struct{}
	saved   time.Time
	base    string
	srv     *http.Server
	closing bool
}

const reserve = 512 << 20 // keep this much disk free

// New loads the list from indexPath and picks up unfinished downloads.
func New(dir, indexPath string) (*Manager, error) {
	if dir == "" {
		dir = DefaultDir()
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	m := &Manager{Dir: dir, index: indexPath, cancel: map[string]context.CancelFunc{}, slots: make(chan struct{}, 2)}
	if b, err := os.ReadFile(indexPath); err == nil {
		_ = json.Unmarshal(b, &m.items)
	}
	for _, it := range m.items {
		if it.State == "running" || it.State == "queued" || it.State == "paused" {
			it.State = "queued"
			m.run(it)
		}
		if it.State == "done" {
			if _, err := os.Stat(it.Path); err != nil {
				it.State, it.Err = "failed", "the file was moved or deleted"
			}
		}
	}
	return m, nil
}

type startReq struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	File    string            `json:"file"`
	SubURL  string            `json:"subUrl"`
	Meta    json.RawMessage   `json:"meta"`
}

// VideoExt are the only file types a download is saved as or opened with: anything else is saved as .mkv,
// so a page can never drop an .exe, .lnk, .hta or script into Videos\MKCinema or have Windows run it.
var VideoExt = map[string]bool{".mkv": true, ".mp4": true, ".m4v": true, ".webm": true, ".avi": true, ".mov": true, ".ts": true, ".m2ts": true}

// SubExt are the subtitle files saved next to a film.
var SubExt = map[string]bool{".srt": true, ".vtt": true}

// dropHeaders are request headers a page may not set on a download: hop-by-hop and connection headers, and cookies
// (the page could otherwise replay a session against any site).
var dropHeaders = map[string]bool{"host": true, "cookie": true, "cookie2": true, "connection": true, "keep-alive": true, "proxy-authorization": true,
	"proxy-connection": true, "te": true, "trailer": true, "transfer-encoding": true, "upgrade": true, "range": true, "content-length": true, "expect": true}

func cleanHeaders(h map[string]string) map[string]string {
	if len(h) == 0 {
		return nil
	}
	out := map[string]string{}
	for k, v := range h {
		lk := strings.ToLower(strings.TrimSpace(k))
		if lk == "" || dropHeaders[lk] || strings.HasPrefix(lk, "sec-") || strings.HasPrefix(lk, "proxy-") || strings.ContainsAny(k+v, "\r\n") {
			continue
		}
		out[k] = v
	}
	return out
}

// videoName makes a safe file name that always ends in a video extension.
func videoName(file string) string {
	name := safeName(file)
	if ext := strings.ToLower(filepath.Ext(name)); !VideoExt[ext] {
		if ext != "" && len(ext) <= 6 {
			name = strings.TrimSpace(strings.TrimSuffix(name, filepath.Ext(name)))
		}
		if name == "" {
			name = "MKCinema"
		}
		name += ".mkv"
	}
	return name
}

// inDir reports whether p sits strictly inside dir.
func inDir(dir, p string) bool {
	if dir == "" || p == "" {
		return false
	}
	rel, err := filepath.Rel(filepath.Clean(dir), filepath.Clean(p))
	return err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

var unsafeName = regexp.MustCompile(`[\\/:*?"<>|\x00-\x1f]+`)

func safeName(n string) string {
	n = strings.Join(strings.Fields(unsafeName.ReplaceAllString(n, " ")), " ")
	n = strings.ReplaceAll(strings.TrimRight(n, ". "), " .", ".")
	if len(n) > 120 {
		n = strings.TrimSpace(n[:120])
	}
	if n == "" || strings.HasPrefix(n, ".") {
		n = "MKCinema" + n
	}
	return n
}

// Start queues a download from the page's JSON and returns its id.
func (m *Manager) Start(raw string) (string, error) {
	var r startReq
	if err := json.Unmarshal([]byte(raw), &r); err != nil {
		return "", errors.New("bad request")
	}
	if !strings.HasPrefix(r.URL, "https://") && !strings.HasPrefix(r.URL, "http://") {
		return "", errors.New("this source can't be downloaded")
	}
	if f := FreeBytes(m.Dir); f >= 0 && f < 2*reserve {
		return "", errors.New("less than 1 GB is free on this drive")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	name := videoName(r.File)
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	p := filepath.Join(m.Dir, name)
	for i := 2; m.taken(p) && i < 1000; i++ {
		p = filepath.Join(m.Dir, fmt.Sprintf("%s %d%s", base, i, ext))
	}
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	it := &Item{ID: hex.EncodeToString(b), URL: r.URL, Headers: cleanHeaders(r.Headers), File: filepath.Base(p), Path: p, Meta: r.Meta, Created: time.Now().UnixMilli(), State: "queued", Size: -1}
	m.items = append(m.items, it)
	m.saveLocked(true)
	m.run(it)
	if strings.HasPrefix(r.SubURL, "https://") {
		go fetchSubs(r.SubURL, strings.TrimSuffix(p, ext))
	}
	return it.ID, nil
}

func (m *Manager) taken(p string) bool {
	if _, err := os.Stat(p); err == nil {
		return true
	}
	if _, err := os.Stat(p + ".part"); err == nil {
		return true
	}
	for _, it := range m.items {
		if strings.EqualFold(it.Path, p) {
			return true
		}
	}
	return false
}

// fetchSubs saves the subtitles next to the film, so VLC and other players load them by themselves.
func fetchSubs(url, base string) {
	c := &http.Client{Timeout: 30 * time.Second}
	res, err := c.Get(url)
	if err != nil {
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil || len(b) == 0 {
		return
	}
	ext := ".srt"
	if strings.HasPrefix(strings.TrimPrefix(string(b[:min(len(b), 16)]), "\uFEFF"), "WEBVTT") {
		ext = ".vtt"
	}
	if os.WriteFile(base+ext, b, 0o644) == nil {
		MarkFromInternet(base + ext)
	}
}

func (m *Manager) find(id string) *Item {
	for _, it := range m.items {
		if it.ID == id {
			return it
		}
	}
	return nil
}

func (m *Manager) run(it *Item) {
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel[it.ID] = cancel
	go func() {
		select {
		case m.slots <- struct{}{}:
		case <-ctx.Done():
			return
		}
		defer func() { <-m.slots }()
		m.work(ctx, it)
	}()
}

type httpErr struct{ code int }

func (e httpErr) Error() string { return "HTTP " + strconv.Itoa(e.code) }

// work downloads one item, resuming from the .part file, and retries a dropped connection a few times.
func (m *Manager) work(ctx context.Context, it *Item) {
	wait := 2 * time.Second
	for try := 0; ; try++ {
		m.set(it, func() { it.State, it.Err = "running", "" })
		err := m.fetch(ctx, it)
		if err == nil {
			m.set(it, func() { it.State, it.Err, it.Got = "done", "", it.Size })
			return
		}
		if ctx.Err() != nil {
			return
		}
		var he httpErr
		permanent := errors.As(err, &he) && he.code >= 400 && he.code != 429 && he.code < 500
		if permanent || errors.Is(err, errNoSpace) || try >= 6 {
			msg := err.Error()
			if permanent {
				msg = fmt.Sprintf("the link stopped working (error %d). Debrid links expire: download it again", he.code)
			}
			m.set(it, func() { it.State, it.Err = "failed", msg })
			log.Printf("dl %s: %v", it.ID, err)
			return
		}
		m.set(it, func() { it.State, it.Err = "paused", "The connection dropped, trying again" })
		select {
		case <-time.After(wait):
		case <-ctx.Done():
			return
		}
		if wait < 30*time.Second {
			wait *= 2
		}
	}
}

var errNoSpace = errors.New("not enough free space on this drive")

var client = &http.Client{Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, ResponseHeaderTimeout: 45 * time.Second, IdleConnTimeout: 60 * time.Second, TLSHandshakeTimeout: 20 * time.Second}}

func (m *Manager) fetch(ctx context.Context, it *Item) error {
	part := it.Path + ".part"
	var have int64
	if st, err := os.Stat(part); err == nil {
		have = st.Size()
	}
	rctx, stop := context.WithCancel(ctx)
	defer stop()
	req, err := http.NewRequestWithContext(rctx, "GET", it.URL, nil)
	if err != nil {
		return err
	}
	for k, v := range cleanHeaders(it.Headers) {
		req.Header.Set(k, v)
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "MKCinema/1.3 (Windows)")
	}
	if have > 0 {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-", have))
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	flag := os.O_CREATE | os.O_WRONLY | os.O_APPEND
	var total int64 = -1
	switch {
	case res.StatusCode == http.StatusPartialContent && have > 0:
		if cr := res.Header.Get("Content-Range"); cr != "" {
			if i := strings.LastIndex(cr, "/"); i > 0 {
				total, _ = strconv.ParseInt(cr[i+1:], 10, 64)
			}
		}
	case res.StatusCode == http.StatusOK:
		have, flag = 0, os.O_CREATE|os.O_WRONLY|os.O_TRUNC // no resume: start over
		total = res.ContentLength
	case res.StatusCode == http.StatusRequestedRangeNotSatisfiable && have > 0:
		_ = os.Remove(part)
		return errors.New("the file changed on the server, starting over")
	default:
		return httpErr{res.StatusCode}
	}
	if total > 0 {
		if f := FreeBytes(m.Dir); f >= 0 && f < total-have+reserve {
			return errNoSpace
		}
	}
	m.set(it, func() { it.Got, it.Size = have, total })
	f, err := os.OpenFile(part, flag, 0o644)
	if err != nil {
		return err
	}
	// a stalled connection (no bytes for a minute) is dropped and retried
	idle := time.AfterFunc(60*time.Second, stop)
	defer idle.Stop()
	buf := make([]byte, 256<<10)
	got := have
	for {
		n, rerr := res.Body.Read(buf)
		if n > 0 {
			idle.Reset(60 * time.Second)
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				if FreeBytes(m.Dir) >= 0 && FreeBytes(m.Dir) < int64(len(buf)) {
					return errNoSpace
				}
				return werr
			}
			got += int64(n)
			m.progress(it, got)
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			f.Close()
			return rerr
		}
	}
	if err := f.Close(); err != nil {
		return err
	}
	if total > 0 && got < total {
		return io.ErrUnexpectedEOF
	}
	m.set(it, func() { it.Size = got })
	if err := os.Rename(part, it.Path); err != nil {
		return err
	}
	MarkFromInternet(it.Path)
	return nil
}

func (m *Manager) set(it *Item, f func()) {
	m.mu.Lock()
	f()
	m.saveLocked(true)
	m.mu.Unlock()
}

func (m *Manager) progress(it *Item, got int64) {
	m.mu.Lock()
	it.Got = got
	m.saveLocked(false)
	m.mu.Unlock()
}

func (m *Manager) saveLocked(now bool) {
	if m.index == "" || (!now && time.Since(m.saved) < 5*time.Second) {
		return
	}
	m.saved = time.Now()
	b, err := json.Marshal(m.items)
	if err != nil {
		return
	}
	tmp := m.index + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, m.index)
	}
}

// List is the page's view of the downloads: no links, headers or paths.
func (m *Manager) List() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Item, 0, len(m.items))
	for _, it := range m.items {
		c := *it
		c.URL, c.Headers, c.Path = "", nil, ""
		out = append(out, c)
	}
	b, _ := json.Marshal(out)
	return string(b)
}

// Remove stops a download if it is running and deletes its files.
func (m *Manager) Remove(id string) error {
	m.mu.Lock()
	it := m.find(id)
	if it == nil {
		m.mu.Unlock()
		return errors.New("no such download")
	}
	if c := m.cancel[id]; c != nil {
		c()
		delete(m.cancel, id)
	}
	keep := m.items[:0]
	for _, x := range m.items {
		if x.ID != id {
			keep = append(keep, x)
		}
	}
	m.items = keep
	m.saveLocked(true)
	m.mu.Unlock()
	if !inDir(m.Dir, it.Path) {
		// an index entry pointing outside the downloads folder (edited or very old): forget it, delete nothing
		log.Printf("dl %s: not deleting %q, it is outside %q", id, it.Path, m.Dir)
		return nil
	}
	go func() {
		// let the worker close the file first (Windows can't delete an open file)
		for i := 0; i < 20; i++ {
			e1, e2 := os.Remove(it.Path+".part"), os.Remove(it.Path)
			if (e1 == nil || os.IsNotExist(e1)) && (e2 == nil || os.IsNotExist(e2)) {
				break
			}
			time.Sleep(250 * time.Millisecond)
		}
		base := strings.TrimSuffix(it.Path, filepath.Ext(it.Path))
		_ = os.Remove(base + ".srt")
		_ = os.Remove(base + ".vtt")
	}()
	return nil
}

// FilePath is a finished download's file.
func (m *Manager) FilePath(id string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	it := m.find(id)
	if it == nil || it.State != "done" {
		return "", errors.New("this download isn't finished")
	}
	if _, err := os.Stat(it.Path); err != nil {
		return "", errors.New("the file was moved or deleted")
	}
	return it.Path, nil
}

// MediaPath is a finished download's file when it is safe to hand to the user's own video player: a video file
// inside the downloads folder. Anything else is refused, so "open" can never run a program.
func (m *Manager) MediaPath(id string) (string, error) {
	p, err := m.FilePath(id)
	if err != nil {
		return "", err
	}
	if !VideoExt[strings.ToLower(filepath.Ext(p))] || !inDir(m.Dir, p) {
		return "", errors.New("only films in the downloads folder can be opened")
	}
	if st, err := os.Lstat(p); err != nil || !st.Mode().IsRegular() {
		return "", errors.New("only films in the downloads folder can be opened")
	}
	return p, nil
}

// URL is where the in-app player can play a finished download.
func (m *Manager) URL(id string) (string, error) {
	if _, err := m.MediaPath(id); err != nil {
		return "", err
	}
	base, err := m.serve()
	if err != nil {
		return "", err
	}
	return base + "/f/" + id, nil
}

func (m *Manager) serve() (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.base != "" {
		return m.base, nil
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	tok := hex.EncodeToString(b)
	mux := http.NewServeMux()
	mux.HandleFunc("/"+tok+"/f/", func(w http.ResponseWriter, r *http.Request) {
		p, err := m.MediaPath(strings.TrimPrefix(r.URL.Path, "/"+tok+"/f/"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		f, err := os.Open(p)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		defer f.Close()
		st, _ := f.Stat()
		ct := map[string]string{".mkv": "video/x-matroska", ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".avi": "video/x-msvideo", ".ts": "video/mp2t", ".m2ts": "video/mp2t"}[strings.ToLower(filepath.Ext(p))]
		if ct == "" {
			ct = mime.TypeByExtension(filepath.Ext(p))
		}
		if ct != "" {
			w.Header().Set("Content-Type", ct)
		}
		http.ServeContent(w, r, "", st.ModTime(), f)
	})
	m.srv = &http.Server{Handler: cors(mux), ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = m.srv.Serve(ln) }()
	m.base = fmt.Sprintf("http://127.0.0.1:%d/%s", ln.Addr().(*net.TCPAddr).Port, tok)
	return m.base, nil
}

func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		o := r.Header.Get("Origin")
		if origins.Allowed(o) {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Range")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

// Close pauses running downloads (they resume on the next start) and stops the local server.
func (m *Manager) Close() {
	m.mu.Lock()
	for _, c := range m.cancel {
		c()
	}
	for _, it := range m.items {
		if it.State == "running" || it.State == "queued" {
			it.State = "paused"
		}
	}
	m.saveLocked(true)
	srv := m.srv
	m.mu.Unlock()
	if srv != nil {
		_ = srv.Close()
	}
}
