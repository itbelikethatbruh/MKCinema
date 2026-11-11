package pass

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

const master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/index.m3u8\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI=\"subs/en.m3u8\"\n"
const media = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-KEY:METHOD=AES-128,URI=\"/keys/k1\"\n#EXTINF:6,\nseg1.ts\n#EXTINF:6,\nhttp://cdn.example/seg2.ts\n"
const list = "#EXTM3U\n#EXTINF:-1 tvg-id=\"a\",News\nhttp://tv.example/live/u/p/1.ts\n"

func tvService(t *testing.T) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/redir/master.m3u8":
			http.Redirect(w, r, "/live/master.m3u8", http.StatusFound)
		case "/live/master.m3u8":
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			_, _ = io.WriteString(w, master)
		case "/live/low/index.m3u8":
			w.Header().Set("Content-Type", "audio/mpegurl")
			_, _ = io.WriteString(w, media)
		case "/get.php":
			w.Header().Set("Content-Type", "audio/x-mpegurl")
			_, _ = io.WriteString(w, list)
		case "/ua":
			_, _ = io.WriteString(w, r.Header.Get("User-Agent")+"|"+r.Header.Get("Referer")+"|"+r.Header.Get("Cookie"))
		case "/player_api.php":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"user_info":{"auth":1}}`)
		default:
			http.NotFound(w, r)
		}
	}))
}

func tvGet(t *testing.T, s *Server, addr string, hdr map[string]string) (*http.Response, string) {
	req, _ := http.NewRequest("GET", addr, nil)
	req.Header.Set("Origin", "https://app.mkcinema.app")
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	return res, string(b)
}

func TestTVRewritesHLS(t *testing.T) {
	AllowPrivate = true
	defer func() { AllowPrivate = false }()
	f := tvService(t)
	defer f.Close()
	s, err := Start()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	// the master playlist, reached through a redirect: its parts count from the final address
	res, body := tvGet(t, s, s.TVURL(f.URL+"/redir/master.m3u8", ""), nil)
	if res.StatusCode != 200 || res.Header.Get("Access-Control-Allow-Origin") != "https://app.mkcinema.app" {
		t.Fatalf("master: %d %v", res.StatusCode, res.Header)
	}
	if !strings.Contains(body, s.TVURL(f.URL+"/live/low/index.m3u8", "")) || !strings.Contains(body, `URI="`+s.TVURL(f.URL+"/live/subs/en.m3u8", "")+`"`) {
		t.Fatalf("master not rewritten:\n%s", body)
	}

	// a variant, with the playlist's headers carried on to every part
	h := `{"User-Agent":"Box/1","Referer":"http://tv.example/"}`
	_, body = tvGet(t, s, s.TVURL(f.URL+"/live/low/index.m3u8", h), nil)
	for _, want := range []string{s.TVURL(f.URL+"/live/low/seg1.ts", h), s.TVURL("http://cdn.example/seg2.ts", h), `URI="` + s.TVURL(f.URL+"/keys/k1", h) + `"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %s in\n%s", want, body)
		}
	}
	// the address keeps ending in .m3u8, so the player knows it is HLS
	if !strings.HasSuffix(s.TVURL(f.URL+"/live/low/index.m3u8", h), ".m3u8") {
		t.Fatal("h must come before u")
	}

	// a channel list (no #EXT-X- tags) keeps its channels' own addresses
	_, body = tvGet(t, s, s.TVURL(f.URL+"/get.php?username=u&password=p", ""), nil)
	if body != list {
		t.Fatalf("channel list changed:\n%s", body)
	}

	// Xtream API answers pass through as they are
	_, body = tvGet(t, s, s.TVURL(f.URL+"/player_api.php?username=u&password=p", ""), nil)
	if body != `{"user_info":{"auth":1}}` {
		t.Fatalf("api: %s", body)
	}
}

func TestTVHeaders(t *testing.T) {
	AllowPrivate = true
	defer func() { AllowPrivate = false }()
	f := tvService(t)
	defer f.Close()
	s, _ := Start()
	defer s.Close()
	// the page's own browser name by default, a playlist's when it names one; never a cookie, never a bad value
	_, body := tvGet(t, s, s.TVURL(f.URL+"/ua", ""), map[string]string{"User-Agent": "WebView/1"})
	if body != "WebView/1||" {
		t.Fatalf("default: %q", body)
	}
	_, body = tvGet(t, s, s.TVURL(f.URL+"/ua", `{"user-agent":"Box/1","Referer":"http://r/","Cookie":"a=b"}`), nil)
	if body != "Box/1|http://r/|" {
		t.Fatalf("playlist headers: %q", body)
	}
	_, body = tvGet(t, s, s.TVURL(f.URL+"/ua", `{"User-Agent":"a\r\nX-Evil: 1"}`), map[string]string{"User-Agent": "WebView/1"})
	if body != "WebView/1||" {
		t.Fatalf("bad header value went through: %q", body)
	}
	if res, _ := tvGet(t, s, s.Base+"/tv?h=nope&u="+url.QueryEscape(f.URL+"/ua"), nil); res.StatusCode != 400 {
		t.Fatalf("bad h: %d", res.StatusCode)
	}
}

func TestTVRefusesLocal(t *testing.T) {
	f := tvService(t)
	defer f.Close()
	s, _ := Start()
	defer s.Close()
	// without the test switch, this computer and the local network are off limits
	if res, _ := tvGet(t, s, s.TVURL(f.URL+"/get.php", ""), nil); res.StatusCode != 403 {
		t.Fatalf("local host: %d", res.StatusCode)
	}
	if res, _ := tvGet(t, s, s.TVURL("file:///etc/passwd", ""), nil); res.StatusCode != 400 {
		t.Fatalf("file: %d", res.StatusCode)
	}
	// a wrong token finds nothing
	if res, _ := tvGet(t, s, strings.Replace(s.TVURL("http://example.com/", ""), "/tv?", "x/tv?", 1), nil); res.StatusCode != 404 {
		t.Fatalf("wrong token: %d", res.StatusCode)
	}
}
