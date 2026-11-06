package p2p

import (
	"crypto/sha1"
	"os"
	"path/filepath"
	"testing"

	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

// evilTorrent builds a one-piece torrent with the given name and file path, like the SEC-N-01 attack.
func evilTorrent(t *testing.T, name string, path []string, data string) *metainfo.MetaInfo {
	t.Helper()
	sum := sha1.Sum([]byte(data))
	info := metainfo.Info{
		Name:        name,
		PieceLength: 16384,
		Pieces:      sum[:],
		Files:       []metainfo.FileInfo{{Length: int64(len(data)), Path: path}},
	}
	b, err := bencode.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	return &metainfo.MetaInfo{InfoBytes: b}
}

func mustExist(t *testing.T, p string) {
	t.Helper()
	if _, err := os.Stat(p); err != nil {
		t.Fatalf("%s was deleted: %v", p, err)
	}
}

// A torrent named "../../.." (or "../..") must never make the engine delete anything outside its cache, neither
// when it is evicted (Keep: 1) nor when the engine stops.
func TestEvilNameCannotDeleteOutsideCache(t *testing.T) {
	for _, tc := range []struct {
		name string
		path []string
	}{
		{"../../..", []string{"a", "p2p", "x"}}, // the audit's example
		{"../..", []string{"a", "p2p", "x"}},    // climbs exactly back into the cache with the old storage
		{"..", []string{"p2p", "x"}},
		{"../../../../../../../../..", []string{"x"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			home := filepath.Join(root, "home")
			data := filepath.Join(home, "a") // engine cache becomes <root>/home/a/p2p
			if err := os.MkdirAll(data, 0o700); err != nil {
				t.Fatal(err)
			}
			sentinels := []string{filepath.Join(root, "keep.txt"), filepath.Join(home, "keep.txt"), filepath.Join(data, "keep.txt")}
			for _, s := range sentinels {
				if err := os.WriteFile(s, []byte("keep"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			e, err := StartOpts(data, Options{Keep: 1})
			if err != nil {
				t.Fatal(err)
			}
			mi := evilTorrent(t, tc.name, tc.path, "evil")
			info, err := mi.UnmarshalInfo()
			if err != nil {
				t.Fatal(err)
			}
			if safeInfo(&info) {
				t.Fatalf("safeInfo accepted name %q", tc.name)
			}
			// add it the way the engine would (the storage may refuse it; either way it is remembered for eviction)
			evil := mi.HashInfoBytes()
			if tor, err := e.cl.AddTorrent(mi); err == nil {
				evil = tor.InfoHash()
			}
			e.remember(evil)
			// a second, normal torrent evicts the first (Keep: 1)
			good := evilTorrent(t, "Film", []string{"Film.mkv"}, "good")
			gt, err := e.cl.AddTorrent(good)
			if err != nil {
				t.Fatal(err)
			}
			e.remember(gt.InfoHash())
			for _, s := range sentinels {
				mustExist(t, s)
			}
			if _, ok := e.cl.Torrent(evil); ok {
				t.Fatal("evil torrent was not dropped")
			}
			// the normal torrent lives in its hash folder, and evicting it deletes that folder
			gdir := filepath.Join(e.dir, gt.InfoHash().HexString())
			if !inside(e.dir, gdir) {
				t.Fatal("hash folder not inside the cache")
			}
			third := evilTorrent(t, "Other", []string{"Other.mkv"}, "more")
			tt, err := e.cl.AddTorrent(third)
			if err != nil {
				t.Fatal(err)
			}
			_ = os.MkdirAll(gdir, 0o700)
			e.remember(tt.InfoHash())
			if _, err := os.Stat(gdir); !os.IsNotExist(err) {
				t.Fatalf("evicted torrent folder still there: %v", err)
			}
			e.Close()
			for _, s := range sentinels {
				mustExist(t, s)
			}
			if _, err := os.Stat(filepath.Join(data, "p2p")); !os.IsNotExist(err) {
				t.Fatalf("cache not removed on stop: %v", err)
			}
		})
	}
}

func TestSafeInfo(t *testing.T) {
	ok := metainfo.Info{Name: "Film (2024)", Files: []metainfo.FileInfo{{Path: []string{"Sub", "Film.mkv"}}}}
	if !safeInfo(&ok) {
		t.Fatal("normal torrent refused")
	}
	single := metainfo.Info{Name: "Film.mkv", Length: 10}
	if !safeInfo(&single) {
		t.Fatal("single-file torrent refused")
	}
	for _, bad := range []metainfo.Info{
		{Name: ".."},
		{Name: "a/../../b"},
		{Name: `..\..`},
		{Name: "/etc"},
		{Name: "ok", Files: []metainfo.FileInfo{{Path: []string{"..", "x"}}}},
		{Name: "ok", Files: []metainfo.FileInfo{{Path: []string{"a/b"}}}},
		{Name: "ok", NameUtf8: "../.."},
	} {
		b := bad
		if safeInfo(&b) {
			t.Errorf("accepted %q %q %v", bad.Name, bad.NameUtf8, bad.Files)
		}
	}
}

func TestHashDirOnlyInsideCache(t *testing.T) {
	e := &Engine{dir: t.TempDir()}
	var h metainfo.Hash
	p := e.hashDir(h)
	if p == "" || filepath.Dir(p) != e.dir || len(filepath.Base(p)) != 40 {
		t.Fatalf("hashDir = %q", p)
	}
	if inside(e.dir, e.dir) || inside(e.dir, filepath.Dir(e.dir)) || inside(e.dir, filepath.Join(e.dir, "..", "x")) {
		t.Fatal("inside accepted a path outside the cache")
	}
}
