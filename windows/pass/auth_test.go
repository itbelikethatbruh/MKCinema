package pass

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestAuthHandBack(t *testing.T) {
	s, err := Start()
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	get := func(path, origin string) (*http.Response, string) {
		req, _ := http.NewRequest("GET", s.Base+path, nil)
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(res.Body)
		res.Body.Close()
		return res, string(b)
	}
	if res, _ := get("/auth/wait?probe=1", "https://evil.example"); res.StatusCode != 403 {
		t.Fatalf("other sites must not read codes, got %d", res.StatusCode)
	}
	if _, b := get("/auth/wait?probe=1", "https://app.mkcinema.app"); !strings.Contains(b, "ok") {
		t.Fatalf("probe: %s", b)
	}
	get("/auth/wait?start=1", "https://app.mkcinema.app")
	done := make(chan map[string]string, 1)
	go func() {
		_, b := get("/auth/wait", "https://mkcinema.pages.dev")
		m := map[string]string{}
		_ = json.Unmarshal([]byte(b), &m)
		done <- m
	}()
	time.Sleep(200 * time.Millisecond)
	res, page := get("/auth?code=abc123", "")
	if res.StatusCode != 200 || !strings.Contains(page, "Back to MKCinema") {
		t.Fatalf("callback page: %d %s", res.StatusCode, page)
	}
	select {
	case m := <-done:
		if m["code"] != "abc123" {
			t.Fatalf("waiting page got %v", m)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("waiting page never answered")
	}
	// handed over once only
	if res, page := get("/auth?error_description=access_denied", ""); res.StatusCode != 200 || !strings.Contains(page, "did not finish") {
		t.Fatalf("error page: %s", page)
	}
	_, b := get("/auth/wait", "https://app.mkcinema.app")
	if !strings.Contains(b, "access_denied") || strings.Contains(b, "abc123") {
		t.Fatalf("second answer: %s", b)
	}
}
