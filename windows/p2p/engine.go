// Package p2p streams torrents to the MKCinema desktop apps on this computer only.
//
// It is off until the user switches it on in Settings, listens on 127.0.0.1 with a random port and a random
// token in every path, never uploads (NoUpload, no seeding, no port forwarding), keeps at most two torrents,
// and deletes everything it downloaded when it stops.
//
// Each torrent is stored in its own folder named after its info hash (<dataDir>/p2p/<40 hex>), and the engine only
// ever deletes folders it built from a hash. Names inside a torrent's metadata are never used to pick what to delete
// (SEC-N-01: a torrent named "../../.." used to make it delete the user's home folder).
package p2p

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
	"github.com/anacrolix/torrent/storage"

	"mkcinema/origins"
)

type Engine struct {
	Base  string // http://127.0.0.1:PORT/TOKEN
	cl    *torrent.Client
	store storage.ClientImplCloser
	srv   *http.Server
	dir   string
	token string
	mu    sync.Mutex
	order []metainfo.Hash
	opt   Options
	full  bool
	done  chan struct{}
}

var videoExt = map[string]bool{".mkv": true, ".mp4": true, ".m4v": true, ".avi": true, ".webm": true, ".mov": true, ".ts": true, ".m2ts": true, ".wmv": true, ".mpg": true}

// Options tune the engine for small devices.
type Options struct {
	Keep    int   // torrents kept at once (default 2)
	Reserve int64 // stop downloading when free space on the cache drive falls below this many bytes (0 = no check)
	Conns   int   // peer connections per torrent (0 = library default)
}

// Start creates the engine under dataDir/p2p (wiped first) and starts the local HTTP server.
func Start(dataDir string) (*Engine, error) { return StartOpts(dataDir, Options{}) }

// StartOpts is Start with options.
func StartOpts(dataDir string, o Options) (*Engine, error) {
	if o.Keep <= 0 {
		o.Keep = 2
	}
	if dataDir == "" {
		return nil, errors.New("no cache folder")
	}
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, err
	}
	// The cache is always the fixed "p2p" folder inside the data folder, so this wipe can't reach anything else.
	dir := filepath.Join(abs, "p2p")
	_ = os.RemoveAll(dir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	store := newStorage(dir)
	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = dir
	cfg.DefaultStorage = store
	cfg.NoUpload = true
	cfg.Seed = false
	cfg.NoDefaultPortForwarding = true
	cfg.ListenPort = 0
	if o.Conns > 0 {
		cfg.EstablishedConnsPerTorrent = o.Conns
		cfg.HalfOpenConnsPerTorrent = o.Conns / 2
	}
	cl, err := torrent.NewClient(cfg)
	if err != nil {
		// PCs with IPv6 turned off fail to open the IPv6 listener: try again on IPv4 only
		log.Printf("p2p: %v, retrying without IPv6", err)
		cfg.DisableIPv6 = true
		if cl, err = torrent.NewClient(cfg); err != nil {
			_ = store.Close()
			return nil, err
		}
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	e := &Engine{cl: cl, store: store, dir: dir, token: hex.EncodeToString(b), opt: o, done: make(chan struct{})}
	if o.Reserve > 0 {
		go e.watchSpace()
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		cl.Close()
		_ = store.Close()
		return nil, err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/"+e.token+"/stream", e.stream)
	mux.HandleFunc("/"+e.token+"/status", e.status)
	e.srv = &http.Server{Handler: cors(mux), ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = e.srv.Serve(ln) }()
	e.Base = fmt.Sprintf("http://127.0.0.1:%d/%s", ln.Addr().(*net.TCPAddr).Port, e.token)
	log.Printf("p2p: engine on %s", ln.Addr())
	return e, nil
}

// Close stops everything and deletes the downloaded data.
func (e *Engine) Close() {
	if e == nil {
		return
	}
	if e.done != nil {
		close(e.done)
	}
	if e.srv != nil {
		_ = e.srv.Close()
	}
	if e.cl != nil {
		errs := e.cl.Close()
		for _, err := range errs {
			log.Printf("p2p: close: %v", err)
		}
	}
	if e.store != nil {
		_ = e.store.Close()
	}
	_ = os.RemoveAll(e.dir)
	log.Printf("p2p: engine stopped, cache removed")
}

// cors lets the app page reach this local server, including Chrome's private network access preflight.
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

func (e *Engine) add(r *http.Request) (*torrent.Torrent, error) {
	q := r.URL.Query()
	ih := strings.ToLower(q.Get("ih"))
	if len(ih) != 40 {
		return nil, errors.New("bad info hash")
	}
	var h metainfo.Hash
	if err := h.FromHexString(ih); err != nil {
		return nil, err
	}
	t, isNew := e.cl.AddTorrentInfoHash(h)
	if isNew {
		var trs [][]string
		for _, tr := range q["tr"] {
			if strings.HasPrefix(tr, "udp://") || strings.HasPrefix(tr, "http://") || strings.HasPrefix(tr, "https://") {
				trs = append(trs, []string{tr})
			}
		}
		if len(trs) > 0 {
			t.AddTrackers(trs)
		}
		e.remember(h)
	}
	select {
	case <-t.GotInfo():
	case <-time.After(75 * time.Second):
		return nil, errors.New("no peers sent the torrent's details in time")
	case <-r.Context().Done():
		return nil, r.Context().Err()
	}
	if !safeInfo(t.Info()) {
		e.drop(h)
		return nil, errors.New("this torrent has unsafe file names")
	}
	return t, nil
}

// safeInfo refuses torrents whose name or file paths try to climb out of their folder. Storage already keeps every
// file inside the torrent's own folder; this drops such torrents before anything is written.
func safeInfo(i *metainfo.Info) bool {
	if i == nil {
		return false
	}
	bad := func(p string) bool {
		return p == "." || p == ".." || strings.ContainsAny(p, "/\\\x00") || filepath.IsAbs(p) || filepath.VolumeName(p) != "" ||
			(runtime.GOOS == "windows" && strings.ContainsRune(p, ':')) // drive letters and NTFS streams
	}
	// the torrent's own name (both spellings a torrent may carry); an empty name is fine, storage doesn't use it
	for _, n := range []string{i.Name, i.NameUtf8} {
		if n != "" && bad(n) {
			return false
		}
	}
	for _, f := range i.UpvertedFiles() {
		for _, p := range f.BestPath() {
			if bad(p) {
				return false
			}
		}
	}
	return true
}

// newStorage keeps each torrent in <dir>/<info hash>. File paths inside that folder come from the torrent but are
// checked by the storage to stay inside it; a single-file torrent is stored as <dir>/<hash>/data.
func newStorage(dir string) storage.ClientImplCloser {
	pc, err := storage.NewDefaultPieceCompletionForDir(dir)
	if err != nil {
		log.Printf("p2p: piece completion: %v, keeping it in memory", err)
		pc = storage.NewMapPieceCompletion()
	}
	return storage.NewFileOpts(storage.NewFileClientOpts{
		ClientBaseDir: dir,
		TorrentDirMaker: func(base string, _ *metainfo.Info, h metainfo.Hash) string {
			return filepath.Join(base, h.HexString())
		},
		FilePathMaker: func(o storage.FilePathMakerOpts) string {
			parts := o.File.BestPath()
			if len(parts) == 0 {
				return "data"
			}
			return filepath.Join(parts...)
		},
		PieceCompletion: pc,
	})
}

// hashDir is the only kind of path the engine deletes: <e.dir>/<40 hex characters>, checked to sit directly
// inside e.dir. It returns "" when the check fails.
func (e *Engine) hashDir(h metainfo.Hash) string {
	name := h.HexString()
	if len(name) != 40 || strings.Trim(name, "0123456789abcdef") != "" {
		return ""
	}
	p := filepath.Join(e.dir, name)
	if !inside(e.dir, p) {
		return ""
	}
	return p
}

// inside reports whether p is strictly inside dir (not dir itself, not above it).
func inside(dir, p string) bool {
	rel, err := filepath.Rel(filepath.Clean(dir), filepath.Clean(p))
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return false
	}
	return true
}

// drop forgets a torrent and deletes its folder.
func (e *Engine) drop(h metainfo.Hash) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for i, x := range e.order {
		if x == h {
			e.order = append(e.order[:i], e.order[i+1:]...)
			break
		}
	}
	e.dropLocked(h)
}

func (e *Engine) dropLocked(h metainfo.Hash) {
	if t, ok := e.cl.Torrent(h); ok {
		t.Drop()
	}
	if p := e.hashDir(h); p != "" {
		_ = os.RemoveAll(p)
	}
}

// remember keeps the two most recent torrents and drops (and deletes) older ones.
func (e *Engine) remember(h metainfo.Hash) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.order = append([]metainfo.Hash{h}, e.order...)
	for len(e.order) > e.opt.Keep {
		old := e.order[len(e.order)-1]
		e.order = e.order[:len(e.order)-1]
		e.dropLocked(old)
	}
}

func pickFile(t *torrent.Torrent, idx int) *torrent.File {
	files := t.Files()
	if idx >= 0 && idx < len(files) {
		return files[idx]
	}
	vids := make([]*torrent.File, 0, len(files))
	for _, f := range files {
		if videoExt[strings.ToLower(path.Ext(f.DisplayPath()))] {
			vids = append(vids, f)
		}
	}
	if len(vids) == 0 {
		vids = files
	}
	sort.Slice(vids, func(i, j int) bool { return vids[i].Length() > vids[j].Length() })
	if len(vids) == 0 {
		return nil
	}
	return vids[0]
}

func (e *Engine) stream(w http.ResponseWriter, r *http.Request) {
	if e.isFull() {
		http.Error(w, "this device is almost out of storage", http.StatusInsufficientStorage)
		return
	}
	t, err := e.add(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusGatewayTimeout)
		return
	}
	idx, err := strconv.Atoi(r.URL.Query().Get("idx"))
	if err != nil {
		idx = -1
	}
	f := pickFile(t, idx)
	if f == nil {
		http.Error(w, "no file", http.StatusNotFound)
		return
	}
	// only fetch the file being watched
	for _, o := range t.Files() {
		if o != f {
			o.SetPriority(torrent.PiecePriorityNone)
		}
	}
	rd := f.NewReader()
	defer rd.Close()
	rd.SetResponsive()
	rd.SetReadahead(16 << 20)
	w.Header().Set("Cache-Control", "no-store")
	http.ServeContent(w, r, path.Base(f.DisplayPath()), time.Time{}, rd)
}

func (e *Engine) status(w http.ResponseWriter, r *http.Request) {
	var h metainfo.Hash
	if err := h.FromHexString(strings.ToLower(r.URL.Query().Get("ih"))); err != nil {
		http.Error(w, "bad info hash", http.StatusBadRequest)
		return
	}
	out := map[string]any{"known": false}
	if t, ok := e.cl.Torrent(h); ok {
		st := t.Stats()
		out = map[string]any{"known": true, "info": t.Info() != nil, "peers": st.ActivePeers, "seeds": st.ConnectedSeeders, "read": st.BytesReadUsefulData.Int64()}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (e *Engine) isFull() bool { e.mu.Lock(); defer e.mu.Unlock(); return e.full }

// watchSpace drops every torrent (and its pieces) when the cache drive gets close to full, so a small TV stick
// never runs out of storage. Playback stops with an error the app explains.
func (e *Engine) watchSpace() {
	for {
		select {
		case <-e.done:
			return
		case <-time.After(4 * time.Second):
		}
		free := freeBytes(e.dir)
		if free < 0 {
			continue
		}
		e.mu.Lock()
		if free < e.opt.Reserve && !e.full {
			e.full = true
			for _, h := range e.order {
				if t, ok := e.cl.Torrent(h); ok {
					t.Drop()
				}
			}
			hs := e.order
			e.order = nil
			// delete only the torrents' own hash folders (the piece-completion database stays)
			go func(hs []metainfo.Hash) {
				for _, h := range hs {
					if p := e.hashDir(h); p != "" {
						_ = os.RemoveAll(p)
					}
				}
			}(hs)
			log.Printf("p2p: storage nearly full (%d bytes free), dropped torrents", free)
		} else if free > e.opt.Reserve*2 {
			e.full = false
		}
		e.mu.Unlock()
	}
}
