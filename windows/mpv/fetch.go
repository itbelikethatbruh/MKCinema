package mpv

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// DLLName is the file the app loads.
const DLLName = "libmpv-2.dll"

// MaxEngineZip caps the engine download (the zip is about 50 MB).
const MaxEngineZip = 200 << 20

// FetchEngine downloads the engine zip from url, checks its SHA-256 against want (the hash built into the app, so
// only the exact zip from the release is ever used), and puts libmpv-2.dll from it into dir. A half-written file is
// never left at dir\libmpv-2.dll: the DLL is written next to it under a temporary name and renamed when complete.
func FetchEngine(ctx context.Context, hc *http.Client, url, want, dir string) error {
	want = strings.ToLower(strings.TrimSpace(want))
	if len(want) != 64 {
		return errors.New("engine: no checksum built in")
	}
	if !strings.HasPrefix(url, "https://") {
		return errors.New("engine: address must be https")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	zf, err := os.CreateTemp(dir, "engine-*.zip")
	if err != nil {
		return err
	}
	defer func() { zf.Close(); os.Remove(zf.Name()) }()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("engine: download answered %s", res.Status)
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(zf, h), io.LimitReader(res.Body, MaxEngineZip+1))
	if err != nil {
		return err
	}
	if n > MaxEngineZip {
		return errors.New("engine: download is larger than expected")
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != want {
		return fmt.Errorf("engine: checksum %s does not match %s", got, want)
	}
	return extractDLL(zf, n, dir)
}

func extractDLL(zf *os.File, size int64, dir string) error {
	zr, err := zip.NewReader(zf, size)
	if err != nil {
		return err
	}
	for _, f := range zr.File {
		if f.Name != DLLName {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		defer rc.Close()
		tmp, err := os.CreateTemp(dir, "libmpv-*.part")
		if err != nil {
			return err
		}
		_, err = io.Copy(tmp, io.LimitReader(rc, MaxEngineZip*2))
		if cerr := tmp.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			os.Remove(tmp.Name())
			return err
		}
		if err := os.Rename(tmp.Name(), filepath.Join(dir, DLLName)); err != nil {
			os.Remove(tmp.Name())
			return err
		}
		return nil
	}
	return errors.New("engine: " + DLLName + " is not in the download")
}
