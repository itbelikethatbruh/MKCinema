package pass

// The /tv route lets MKCinema's own page open the person's own TV service (an M3U playlist or an Xtream login) when
// that service is on plain http:// or sends no CORS header. Browsers refuse http:// inside an https page, but a page
// may always talk to 127.0.0.1, so this server makes the request instead and hands the answer back.
//
// Same rules as /r: 127.0.0.1 only, the random token in the path, only MKCinema's pages may read the answer, public
// hosts only (checked after DNS), GET and HEAD only, nothing stored. On top of Range it forwards a User-Agent and a
// Referer when the playlist asks for them (#EXTVLCOPT), and it rewrites HLS playlists so every part of a channel
// (variants, segments, keys, subtitles) also comes through here.
//
// Address: Base + "/tv?h=HEADERS&u=URL". h is optional JSON ({"User-Agent":"…","Referer":"…"}) and goes first, so
// an address still ends in ".m3u8" when the channel's does.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// the request headers a playlist may set; anything else in h is ignored
var tvHeaders = []string{"User-Agent", "Referer", "Origin"}

// HLS playlists are small; anything larger is a channel list or a video and is passed through untouched
const maxPlaylist = 4 << 20

func tvHeadersFrom(raw string) (map[string]string, error) {
	out := map[string]string{}
	if raw == "" {
		return out, nil
	}
	var in map[string]any
	if err := json.Unmarshal([]byte(raw), &in); err != nil {
		return nil, errors.New("pass: bad headers")
	}
	for k, v := range in {
		for _, h := range tvHeaders {
			if strings.EqualFold(k, h) {
				s, _ := v.(string)
				if s != "" && len(s) <= 1024 && !strings.ContainsAny(s, "\r\n\x00") {
					out[h] = s
				}
			}
		}
	}
	return out, nil
}

// TVURL is the local address for target, carrying the playlist's headers (h is the raw JSON, may be empty).
func (s *Server) TVURL(target, h string) string {
	q := ""
	if h != "" {
		q = "h=" + url.QueryEscape(h) + "&"
	}
	return s.Base + "/tv?" + q + "u=" + url.QueryEscape(target)
}

func isPlaylist(u *url.URL, ct string) bool {
	ct = strings.ToLower(ct)
	return strings.Contains(ct, "mpegurl") || strings.HasSuffix(strings.ToLower(u.Path), ".m3u8")
}

var uriAttr = regexp.MustCompile(`URI="([^"]*)"`)

// rewrite points every address in an HLS playlist (one with #EXT-X- tags) back at this server. A plain M3U channel
// list has no #EXT-X- tags and is returned as it is, so its channels keep their own addresses.
func (s *Server) rewrite(body []byte, base *url.URL, h string) ([]byte, bool) {
	if !bytes.HasPrefix(bytes.TrimLeft(body, "\ufeff \t\r\n"), []byte("#EXTM3U")) || !bytes.Contains(body, []byte("#EXT-X-")) {
		return body, false
	}
	abs := func(ref string) string {
		r, err := base.Parse(strings.TrimSpace(ref))
		if err != nil {
			return ref
		}
		if sc := strings.ToLower(r.Scheme); sc != "http" && sc != "https" {
			return ref // data:, skd: and the like stay as they are
		}
		return s.TVURL(r.String(), h)
	}
	lines := strings.Split(string(body), "\n")
	for i, ln := range lines {
		t := strings.TrimSpace(ln)
		switch {
		case t == "":
		case strings.HasPrefix(t, "#"):
			if strings.Contains(t, `URI="`) {
				lines[i] = uriAttr.ReplaceAllStringFunc(ln, func(m string) string {
					return `URI="` + abs(uriAttr.FindStringSubmatch(m)[1]) + `"`
				})
			}
		default:
			lines[i] = abs(t)
		}
	}
	return []byte(strings.Join(lines, "\n")), true
}

func (s *Server) tv(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "GET or HEAD only", http.StatusMethodNotAllowed)
		return
	}
	u, err := target(r.URL.Query().Get("u"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	hraw := r.URL.Query().Get("h")
	hdr, err := tvHeadersFrom(hraw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, u.String(), nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	for _, k := range []string{"Range", "If-Range"} {
		if v := r.Header.Get(k); v != "" {
			req.Header.Set(k, v)
		}
	}
	// the app's own browser name, as the Android app sends, unless the playlist names one
	req.Header.Set("User-Agent", "MKCinema")
	if v := r.Header.Get("User-Agent"); v != "" && len(v) <= 512 {
		req.Header.Set("User-Agent", v)
	}
	req.Header.Set("Accept", "*/*")
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
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
	w.Header().Set("Cache-Control", "no-store")

	if r.Method == http.MethodGet && res.StatusCode == http.StatusOK && isPlaylist(res.Request.URL, res.Header.Get("Content-Type")) {
		body, err := io.ReadAll(io.LimitReader(res.Body, maxPlaylist+1))
		if err != nil {
			http.Error(w, "pass: "+err.Error(), http.StatusBadGateway)
			return
		}
		if len(body) <= maxPlaylist {
			// relative addresses count from where the playlist really came from, after any redirect
			out, _ := s.rewrite(body, res.Request.URL, hraw)
			ct := res.Header.Get("Content-Type")
			if ct == "" {
				ct = "application/vnd.apple.mpegurl"
			}
			w.Header().Set("Content-Type", ct)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(out)
			return
		}
		// too big for an HLS playlist: send what was read, then the rest as it comes
		copyHeaders(w, res)
		w.WriteHeader(res.StatusCode)
		if _, err := w.Write(body); err != nil {
			return
		}
		stream(w, r, res, u)
		return
	}
	copyHeaders(w, res)
	w.WriteHeader(res.StatusCode)
	if r.Method == http.MethodHead {
		return
	}
	stream(w, r, res, u)
}

func copyHeaders(w http.ResponseWriter, res *http.Response) {
	for _, h := range keep {
		if v := res.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
}

// stream copies the answer as it arrives (live channels never end), so the player sees the first bytes right away
func stream(w http.ResponseWriter, r *http.Request, res *http.Response, u *url.URL) {
	buf := make([]byte, 64<<10)
	fl, _ := w.(http.Flusher)
	for {
		n, rerr := res.Body.Read(buf)
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				return
			}
			if fl != nil {
				fl.Flush()
			}
		}
		if rerr != nil {
			if rerr != io.EOF && r.Context().Err() == nil {
				log.Printf("pass: %s: %v", u.Host, rerr)
			}
			return
		}
	}
}
