// Package pass lets MKCinema's own page read video files from hosts that don't send CORS headers.
//
// Browsers let a page show a video from any host, but not read its bytes unless the host allows it (CORS). MKCinema's
// in-app engine has to read the bytes to turn Dolby, DTS and TrueHD sound into AAC and to decode HEVC, so on hosts
// that don't allow it (some debrid hosts among them) it could not help in the web app. In the Windows app this small server on
// 127.0.0.1 makes the same Range request itself and hands the answer to the page with the CORS header added.
//
// It is not a proxy anyone can use: it listens on 127.0.0.1 only, every address has a random 128-bit token in its
// path, only MKCinema's own pages may read its answers, it makes GET and HEAD requests to public http(s) hosts only
// (never this computer or the local network), and it forwards nothing but the Range headers. Nothing is stored.
package pass

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"

	"mkcinema/origins"
)

// Server is a running pass server. Base is http://127.0.0.1:PORT/TOKEN; files are read at Base + "/r?u=URL" and
// TV services at Base + "/tv?h=HEADERS&u=URL" (tv.go).
type Server struct {
	Base string
	srv  *http.Server
	cl   *http.Client
}

// ErrPrivate is returned for addresses on this computer or the local network.
var ErrPrivate = errors.New("pass: only public hosts are allowed")

// AllowPrivate is for tests only: it lets the server reach 127.0.0.1.
var AllowPrivate = false

func publicIP(ip net.IP) bool {
	return ip != nil && !(ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() || ip.IsInterfaceLocalMulticast() ||
		// 100.64.0.0/10 (carrier-grade NAT) and 0.0.0.0/8
		(ip.To4() != nil && (ip.To4()[0] == 100 && ip.To4()[1]&0xc0 == 64 || ip.To4()[0] == 0)))
}

// the address is checked after DNS, at connect time, so a name that resolves to a local address is refused too
func control(_, address string, _ syscall.RawConn) error {
	if AllowPrivate {
		return nil
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	if !publicIP(net.ParseIP(host)) {
		return ErrPrivate
	}
	return nil
}

func target(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if s := strings.ToLower(u.Scheme); s != "http" && s != "https" {
		return nil, errors.New("pass: http and https only")
	}
	if u.Host == "" || u.User != nil {
		return nil, errors.New("pass: bad address")
	}
	return u, nil
}

// Start opens the server on a random port of 127.0.0.1.
func Start() (*Server, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(b)
	dial := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second, Control: control}
	tr := &http.Transport{
		DialContext:           dial.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: 25 * time.Second,
		DisableCompression:    true, // byte ranges must stay byte ranges
	}
	s := &Server{cl: &http.Client{
		Transport: tr,
		CheckRedirect: func(r *http.Request, via []*http.Request) error {
			if len(via) >= 6 {
				return errors.New("pass: too many redirects")
			}
			_, err := target(r.URL.String())
			return err
		},
	}}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/"+token+"/r", s.read)
	mux.HandleFunc("/"+token+"/tv", s.tv) // the person's own TV service, see tv.go
	s.srv = &http.Server{Handler: cors(mux), ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = s.srv.Serve(ln) }()
	s.Base = fmt.Sprintf("http://127.0.0.1:%d/%s", ln.Addr().(*net.TCPAddr).Port, token)
	log.Printf("pass: on %s", ln.Addr())
	return s, nil
}

// Close stops the server.
func (s *Server) Close() {
	if s != nil && s.srv != nil {
		_ = s.srv.Close()
	}
}

func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		o := r.Header.Get("Origin")
		if origins.Allowed(o) {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Range, If-Range")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

var keep = []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "Etag"}

func (s *Server) read(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "GET or HEAD only", http.StatusMethodNotAllowed)
		return
	}
	u, err := target(r.URL.Query().Get("u"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, u.String(), nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	for _, h := range []string{"Range", "If-Range"} {
		if v := r.Header.Get(h); v != "" {
			req.Header.Set(h, v)
		}
	}
	req.Header.Set("User-Agent", "MKCinema")
	res, err := s.cl.Do(req)
	if err != nil {
		code := http.StatusBadGateway
		if errors.Is(err, ErrPrivate) {
			code = http.StatusForbidden
		} else if errors.Is(err, context.Canceled) {
			return
		}
		http.Error(w, "pass: "+err.Error(), code)
		return
	}
	defer res.Body.Close()
	for _, h := range keep {
		if v := res.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.WriteHeader(res.StatusCode)
	if r.Method == http.MethodHead {
		return
	}
	stream(w, r, res, u) // as it arrives, so the engine sees the first bytes right away
}
