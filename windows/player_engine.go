//go:build windows

package main

// The native player's engine (libmpv-2.dll, about 120 MB) is not inside MKCinema.exe, so the download stays one small
// file. The release workflow attaches it to the GitHub release as a zip and builds its address and SHA-256 into the
// exe; the first time the app starts without it, the zip is downloaded in the background, checked against that
// SHA-256 and unpacked into the app's data folder\mpv. Until then, and if anything goes wrong, films play in the web
// player as before. A libmpv-2.dll placed next to MKCinema.exe is used instead and nothing is downloaded.

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"mkcinema/mpv"
)

// Set by the release build: go build -ldflags "-X main.engineURL=... -X main.engineSHA=...".
var engineURL, engineSHA string

func haveEngine() bool {
	for _, d := range mpvDirs() {
		if st, err := os.Stat(filepath.Join(d, mpv.DLLName)); err == nil && st.Size() > 0 {
			return true
		}
	}
	return false
}

// fetchEngine runs once per start, in the background.
func fetchEngine() {
	if engineURL == "" || engineSHA == "" || haveEngine() || os.Getenv("MKC_NATIVE_SELFTEST") != "" {
		return
	}
	// let the app and the page load first
	time.Sleep(15 * time.Second)
	dir := filepath.Join(dataDir, "mpv")
	hc := &http.Client{Timeout: 15 * time.Minute}
	for try := 1; try <= 3; try++ {
		log.Printf("player: downloading the native player engine (try %d)", try)
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		err := mpv.FetchEngine(ctx, hc, engineURL, engineSHA, dir)
		cancel()
		if err == nil {
			log.Printf("player: native player engine ready in %s", dir)
			// the page asked once at start and was told no; ask it to check again so the next film plays natively
			if np.w != nil {
				np.w.Dispatch(func() {
					np.w.Eval("window.MkNative&&(MkNative.probed=null,MkNative.probe())")
				})
			}
			return
		}
		log.Printf("player: engine download: %v", err)
		time.Sleep(time.Duration(try*try) * time.Minute)
	}
}
