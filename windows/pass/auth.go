package pass

// Google sign-in for the desktop apps (2026-11, Windows 1.5.0 / Mac 1.3.0). Google refuses sign-in inside an app's
// web view, so the page opens Google in the default browser with redirect_to = Base + "/auth" (PKCE: the verifier
// stays in the app's page). The browser comes back here with ?code=...; the page, which is waiting on /auth/wait,
// picks the code up and finishes the sign-in itself. The code alone is useless without the page's verifier.

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"sync"
	"time"

	"mkcinema/origins"
)

var sprintf = fmt.Sprintf

// originOK: only MKCinema's own pages may pick up a sign-in code.
func originOK(r *http.Request) bool { return origins.Allowed(r.Header.Get("Origin")) }

type authSlot struct {
	mu    sync.Mutex
	code  string
	err   string
	at    time.Time
	ready chan struct{}
}

func (a *authSlot) reset() {
	a.mu.Lock()
	a.code, a.err, a.at = "", "", time.Time{}
	a.ready = make(chan struct{})
	a.mu.Unlock()
}

const authPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MKCinema</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#f2efe9;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0;opacity:.75}</style></head>
<body><main><h1>%s</h1><p>%s</p></main><script>setTimeout(function(){try{window.close()}catch(e){}},1500)</script></body></html>`

// callback: the browser lands here after Google.
func (s *Server) authBack(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	code, bad := q.Get("code"), q.Get("error_description")
	if code == "" && bad == "" {
		bad = "Sign-in did not finish. Go back to MKCinema and try again."
	}
	s.auth.mu.Lock()
	if s.auth.ready == nil {
		s.auth.ready = make(chan struct{})
	}
	s.auth.code, s.auth.err, s.auth.at = code, bad, time.Now()
	select {
	case <-s.auth.ready:
	default:
		close(s.auth.ready)
	}
	s.auth.mu.Unlock()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	title, line := "Back to MKCinema", "Google sign-in is done. Go back to MKCinema and it finishes signing you in. You can close this tab."
	if bad != "" {
		title, line = "Sign-in did not finish", bad
	}
	_, _ = w.Write([]byte(sprintf(authPage, html.EscapeString(title), html.EscapeString(line))))
}

// wait: the app's page asks for the code (CORS limits reading the answer to MKCinema's own pages). It answers as soon
// as the browser is back, or with {} after 25 s so the page asks again. GET ?probe=1 just says the route exists.
func (s *Server) authWait(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "GET only", http.StatusMethodNotAllowed)
		return
	}
	if !originOK(r) {
		http.Error(w, "MKCinema only", http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	q := r.URL.Query()
	if q.Get("probe") == "1" {
		_, _ = w.Write([]byte(`{"ok":true}`))
		return
	}
	if q.Get("start") == "1" { // a new sign-in: forget any old answer
		s.auth.reset()
		_, _ = w.Write([]byte(`{}`))
		return
	}
	s.auth.mu.Lock()
	if s.auth.ready == nil {
		s.auth.ready = make(chan struct{})
	}
	ch := s.auth.ready
	s.auth.mu.Unlock()
	select {
	case <-ch:
	case <-time.After(25 * time.Second):
	case <-r.Context().Done():
		return
	}
	s.auth.mu.Lock()
	out := map[string]string{}
	if !s.auth.at.IsZero() && time.Since(s.auth.at) < 10*time.Minute {
		if s.auth.code != "" {
			out["code"] = s.auth.code
		}
		if s.auth.err != "" {
			out["error"] = s.auth.err
		}
		s.auth.code, s.auth.err, s.auth.at = "", "", time.Time{} // handed over once
		s.auth.ready = make(chan struct{})
	}
	s.auth.mu.Unlock()
	_ = json.NewEncoder(w).Encode(out)
}
