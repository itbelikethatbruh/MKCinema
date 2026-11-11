package pass

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func file(t *testing.T) *httptest.Server {
	body := strings.Repeat("0123456789", 1000)
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" {
			t.Errorf("forwarded a header it should not: %v", r.Header)
		}
		http.ServeContent(w, r, "film.mkv", timeZero, strings.NewReader(body))
	}))
}

func get(t *testing.T, s *Server, target, origin, rng string, extra map[string]string) *http.Response {
	req, _ := http.NewRequest("GET", s.Base+"/r?u="+url.QueryEscape(target), nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	if rng != "" {
		req.Header.Set("Range", rng)
	}
	for k, v := range extra {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestRangeAndCors(t *testing.T) {
	AllowPrivate = true
	defer func() { AllowPrivate = false }()
	f := file(t)
	defer f.Close()
	s, err := Start()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	res := get(t, s, f.URL+"/film.mkv", "https://mkcinema.pages.dev", "bytes=10-19", map[string]string{"Cookie": "a=b", "Authorization": "x"})
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 206 || string(b) != "0123456789" {
		t.Fatalf("got %d %q", res.StatusCode, b)
	}
	if res.Header.Get("Content-Range") != "bytes 10-19/10000" || res.Header.Get("Access-Control-Allow-Origin") != "https://mkcinema.pages.dev" {
		t.Fatalf("headers %v", res.Header)
	}
	// another site may not read the answer
	res = get(t, s, f.URL+"/film.mkv", "https://evil.example", "bytes=0-1", nil)
	res.Body.Close()
	if res.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("evil origin allowed")
	}
}

func TestRefusesLocalAndOddTargets(t *testing.T) {
	f := file(t)
	defer f.Close()
	s, err := Start()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	for _, u := range []string{f.URL + "/film.mkv", "file:///etc/passwd", "ftp://example.com/x", "http://user:pw@example.com/"} {
		res := get(t, s, u, "https://mkcinema.pages.dev", "", nil)
		res.Body.Close()
		if res.StatusCode < 400 {
			t.Errorf("%s: got %d, want refusal", u, res.StatusCode)
		}
	}
	// a wrong token is not found
	bad := strings.Replace(s.Base, s.Base[strings.LastIndex(s.Base, "/")+1:], "00000000000000000000000000000000", 1)
	res, err := http.Get(bad + "/r?u=" + url.QueryEscape("https://example.com/"))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 404 {
		t.Errorf("wrong token: %d", res.StatusCode)
	}
	// POST is refused
	res, err = http.Post(s.Base+"/r?u="+url.QueryEscape("https://example.com/"), "text/plain", nil)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 405 {
		t.Errorf("POST: %d", res.StatusCode)
	}
}

func TestPublicIP(t *testing.T) {
	for ip, want := range map[string]bool{"8.8.8.8": true, "127.0.0.1": false, "10.1.2.3": false, "192.168.1.1": false, "172.16.0.1": false, "169.254.169.254": false, "100.64.1.1": false, "0.0.0.0": false, "::1": false, "fe80::1": false, "fd00::1": false, "2606:4700::1111": true} {
		if got := publicIP(net.ParseIP(ip)); got != want {
			t.Errorf("%s: %v", ip, got)
		}
	}
}

var timeZero time.Time
