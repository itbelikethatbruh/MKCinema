package mpv

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func engineZip(t *testing.T, name, body string) []byte {
	t.Helper()
	var b bytes.Buffer
	zw := zip.NewWriter(&b)
	w, err := zw.Create(name)
	if err != nil {
		t.Fatal(err)
	}
	w.Write([]byte(body))
	zw.Close()
	return b.Bytes()
}

func TestFetchEngine(t *testing.T) {
	good := engineZip(t, DLLName, "MZ fake dll")
	noDLL := engineZip(t, "README.txt", "hi")
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/good.zip":
			w.Write(good)
		case "/nodll.zip":
			w.Write(noDLL)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	sum := func(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }
	ctx := context.Background()

	dir := t.TempDir()
	if err := FetchEngine(ctx, srv.Client(), srv.URL+"/good.zip", strings.ToUpper(sum(good)), dir); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, DLLName)); string(b) != "MZ fake dll" {
		t.Fatalf("dll = %q", b)
	}
	left, _ := filepath.Glob(filepath.Join(dir, "*"))
	if len(left) != 1 {
		t.Fatalf("temporary files left: %v", left)
	}

	bad := []struct{ name, url, sha string }{
		{"wrong checksum", srv.URL + "/good.zip", sum(noDLL)},
		{"no checksum", srv.URL + "/good.zip", ""},
		{"not https", strings.Replace(srv.URL, "https", "http", 1) + "/good.zip", sum(good)},
		{"missing", srv.URL + "/gone.zip", sum(good)},
		{"no dll inside", srv.URL + "/nodll.zip", sum(noDLL)},
	}
	for _, c := range bad {
		d := t.TempDir()
		if err := FetchEngine(ctx, srv.Client(), c.url, c.sha, d); err == nil {
			t.Errorf("%s: no error", c.name)
		}
		if _, err := os.Stat(filepath.Join(d, DLLName)); err == nil {
			t.Errorf("%s: dll written", c.name)
		}
	}
}
