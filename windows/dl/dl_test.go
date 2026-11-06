package dl

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestVideoName(t *testing.T) {
	for in, want := range map[string]string{
		"a.exe":             "a.mkv",
		"Season 1.exe":      "Season 1.mkv",
		"x.scr":             "x.mkv",
		"x.lnk":             "x.mkv",
		"run.hta":           "run.mkv",
		"Film (2024).mp4":   "Film (2024).mp4",
		"Film.MKV":          "Film.MKV",
		"Film":              "Film.mkv",
		"../../evil.bat":    "MKCinema.... evil.mkv",
		`..\..\evil.cmd`:    "MKCinema.... evil.mkv",
		"evil.exe.":         "evil.mkv",
		"evil.exe  ":        "evil.mkv",
		".exe":              "MKCinema.mkv",
		"a.mp4.exe":         "a.mp4.mkv",
		"Show S01E02.webm":  "Show S01E02.webm",
		"x:Zone.Identifier": "x Zone.Identifier.mkv",
	} {
		got := videoName(in)
		if got != want {
			t.Errorf("videoName(%q) = %q, want %q", in, got, want)
		}
		if strings.ContainsAny(got, `/\:`) || filepath.Base(got) != got {
			t.Errorf("videoName(%q) = %q has path characters", in, got)
		}
		if !VideoExt[strings.ToLower(filepath.Ext(got))] {
			t.Errorf("videoName(%q) = %q is not a video name", in, got)
		}
	}
}

func TestStartStoresExeAsVideo(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Cookie") != "" || r.Header.Get("Host") == "evil" {
			t.Errorf("forbidden header reached the server: %v", r.Header)
		}
		_, _ = w.Write([]byte("MZ not really a program"))
	}))
	defer srv.Close()
	dir := t.TempDir()
	m, err := New(dir, filepath.Join(t.TempDir(), "downloads.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	req, _ := json.Marshal(map[string]any{"url": srv.URL + "/y", "file": "a.exe", "headers": map[string]string{"Cookie": "s=1", "Host": "evil", "X-Ok": "1"}})
	id, err := m.Start(string(req))
	if err != nil {
		t.Fatal(err)
	}
	var p string
	for i := 0; i < 100; i++ {
		if p, err = m.MediaPath(id); err == nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("download did not finish: %v", err)
	}
	if filepath.Base(p) != "a.mkv" {
		t.Fatalf("stored as %q, want a.mkv", filepath.Base(p))
	}
	if _, err := os.Stat(filepath.Join(dir, "a.exe")); !os.IsNotExist(err) {
		t.Fatal("an .exe was written")
	}
	if h := m.find(id).Headers; h["Cookie"] != "" || h["Host"] != "" || h["X-Ok"] != "1" {
		t.Fatalf("headers kept: %v", h)
	}
}

func TestStartRefusesOtherSchemes(t *testing.T) {
	m, err := New(t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	for _, u := range []string{"file:///C:/Windows/System32/calc.exe", "ftp://x/y", "javascript:alert(1)", ""} {
		req, _ := json.Marshal(map[string]any{"url": u, "file": "a.mkv"})
		if _, err := m.Start(string(req)); err == nil {
			t.Errorf("Start accepted %q", u)
		}
	}
}

func TestMediaPathRefusesNonVideoAndOutside(t *testing.T) {
	dir := t.TempDir()
	m, err := New(dir, "")
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	outside := filepath.Join(t.TempDir(), "x.mkv")
	exe := filepath.Join(dir, "x.exe")
	ok := filepath.Join(dir, "ok.mp4")
	for _, p := range []string{outside, exe, ok} {
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	m.items = []*Item{{ID: "out", Path: outside, State: "done"}, {ID: "exe", Path: exe, State: "done"}, {ID: "ok", Path: ok, State: "done"}}
	if _, err := m.MediaPath("out"); err == nil {
		t.Error("file outside the downloads folder accepted")
	}
	if _, err := m.MediaPath("exe"); err == nil {
		t.Error(".exe accepted")
	}
	if p, err := m.MediaPath("ok"); err != nil || p != ok {
		t.Errorf("film refused: %v", err)
	}
	// Remove never deletes outside the downloads folder
	if err := m.Remove("out"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	if _, err := os.Stat(outside); err != nil {
		t.Fatal("Remove deleted a file outside the downloads folder")
	}
}

func TestCORSExactOrigins(t *testing.T) {
	h := cors(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	for o, want := range map[string]bool{
		"https://mkcinema.pages.dev":      true,
		"https://app.mkcinema.app":        true,
		"https://evil.mkcinema.pages.dev": false,
		"http://localhost.evil.com":       false,
		"https://evil.com":                false,
	} {
		rr := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/", nil)
		r.Header.Set("Origin", o)
		h.ServeHTTP(rr, r)
		if got := rr.Header().Get("Access-Control-Allow-Origin") != ""; got != want {
			t.Errorf("origin %q allowed=%v, want %v", o, got, want)
		}
	}
}
