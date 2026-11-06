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
	share   *http.Server // 1.4.0: finished downloads for the TV, on the home network
	shareAt string
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
	name := safeName(r.File)
	ext := filepath.Ext(name)
	if ext == "" {
		ext, name = ".mkv", name+".mkv"
	}
	base := strings.TrimSuffix(name, ext)
	p := filepath.Join(m.Dir, name)
	for i := 2; m.taken(p) && i < 1000; i++ {
		p = filepath.Join(m.Dir, fmt.Sprintf("%s %d%s", base, i, ext))
	}
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	it := &Item{ID: hex.EncodeToString(b), URL: r.URL, Headers: r.Headers, File: filepath.Base(p), Path: p, Meta: r.Meta, Created: time.Now().UnixMilli(), State: "queued", Size: -1}
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
	_ = os.WriteFile(base+ext, b, 0o644)
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
	for k, v := range it.Headers {
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
	return os.Rename(part, it.Path)
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

// URL is where the in-app player can play a finished download.
func (m *Manager) URL(id string) (string, error) {
	if _, err := m.FilePath(id); err != nil {
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
	mux.HandleFunc("/"+tok+"/f/", m.fileHandler("/"+tok+"/f/"))
	m.srv = &http.Server{Handler: cors(mux), ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = m.srv.Serve(ln) }()
	m.base = fmt.Sprintf("http://127.0.0.1:%d/%s", ln.Addr().(*net.TCPAddr).Port, tok)
	return m.base, nil
}

// fileHandler serves a finished download by id under prefix, with Range support for seeking.
func (m *Manager) fileHandler(prefix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p, err := m.FilePath(strings.TrimPrefix(r.URL.Path, prefix))
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
	}
}

// SharePort is the fixed port for sharing with a TV, so the address the TV keeps stays the same between starts.
const SharePort = 47990

// Share starts (on) or stops serving finished downloads to other devices on the home network, for "Play on your TV"
// (Windows app 1.4.0). Every address carries a secret key kept in keyPath, so only devices that were given the
// address (through the user's own account) can list or play anything. Windows asks once whether MKCinema may use
// private networks. It returns {"on", "base", "name"}: base is http://<this PC's home network address>:<port>/<key>.
func (m *Manager) Share(on bool, keyPath string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	host, _ := os.Hostname()
	if !on {
		if m.share != nil {
			_ = m.share.Close()
			m.share, m.shareAt = nil, ""
		}
		b, _ := json.Marshal(map[string]any{"on": false, "name": host})
		return string(b), nil
	}
	key := ""
	if b, err := os.ReadFile(keyPath); err == nil && regexp.MustCompile(`^[0-9a-f]{32}$`).Match(b) {
		key = string(b)
	} else {
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		key = hex.EncodeToString(b)
		_ = os.WriteFile(keyPath, []byte(key), 0o600)
	}
	ip := LANAddr()
	if ip == "" {
		return "", errors.New("this computer isn't connected to a home network")
	}
	if m.share == nil {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", SharePort))
		if err != nil {
			if ln, err = net.Listen("tcp", ":0"); err != nil {
				return "", err
			}
		}
		mux := http.NewServeMux()
		mux.HandleFunc("/"+key+"/f/", m.fileHandler("/"+key+"/f/"))
		mux.HandleFunc("/"+key+"/list", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, m.List())
		})
		m.share = &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
		port := ln.Addr().(*net.TCPAddr).Port
		go func(s *http.Server) { _ = s.Serve(ln) }(m.share)
		m.shareAt = fmt.Sprintf(":%d/%s", port, key)
	}
	b, _ := json.Marshal(map[string]any{"on": true, "base": "http://" + ip + m.shareAt, "name": host})
	return string(b), nil
}

// LANAddr is this computer's address on the home network: the one its internet traffic leaves from (no packet is
// sent), or else the first private IPv4 address of a network adapter.
func LANAddr() string {
	private := func(ip net.IP) bool { return ip != nil && ip.To4() != nil && ip.IsPrivate() }
	if c, err := net.Dial("udp", "192.0.2.1:9"); err == nil {
		a := c.LocalAddr().(*net.UDPAddr).IP
		c.Close()
		if private(a) {
			return a.String()
		}
	}
	ifs, _ := net.Interfaces()
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 || regexp.MustCompile(`(?i)vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback`).MatchString(i.Name) {
			continue
		}
		as, _ := i.Addrs()
		for _, a := range as {
			if n, ok := a.(*net.IPNet); ok && private(n.IP) {
				return n.IP.String()
			}
		}
	}
	return ""
}

func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		o := r.Header.Get("Origin")
		if o == "https://mkcinema.pages.dev" || strings.HasSuffix(o, ".mkcinema.pages.dev") {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Range")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
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
	srv, sh := m.srv, m.share
	m.mu.Unlock()
	if srv != nil {
		_ = srv.Close()
	}
	if sh != nil {
		_ = sh.Close()
	}
}
