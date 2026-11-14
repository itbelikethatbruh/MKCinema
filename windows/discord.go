package main

// Discord Rich Presence over Discord's local IPC pipe (\\.\pipe\discord-ipc-N). Nothing is sent anywhere
// else, and nothing at all unless the user turned "Show on Discord" on.

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"strings"
	"sync"
	"time"
)

// MKCinema's Discord application (public id). Override with -ldflags "-X main.discordAppID=<id>"; empty turns presence off.
var discordAppID = "1567818702479425586"

type activity struct {
	Title   string `json:"title"`
	Sub     string `json:"sub"`
	Start   int64  `json:"-"` // unix ms when playback started (0 = paused)
	End     int64  `json:"-"` // unix ms when it ends
	Paused  bool   `json:"paused"`
	Image   string `json:"image"`
	PageURL string `json:"url"`
}

// parseActivity reads the page's status. The page works out start and end from the video's current time, so they
// arrive with fractions of a millisecond: they are read as numbers and rounded.
func parseActivity(raw string) (activity, error) {
	var a activity
	if err := json.Unmarshal([]byte(raw), &a); err != nil {
		return a, err
	}
	var t struct {
		Start *float64 `json:"start"`
		End   *float64 `json:"end"`
	}
	if err := json.Unmarshal([]byte(raw), &t); err != nil {
		return a, err
	}
	ms := func(f *float64) int64 {
		if f == nil || math.IsNaN(*f) || *f <= 0 || *f > 1e15 {
			return 0
		}
		return int64(math.Round(*f))
	}
	a.Start, a.End = ms(t.Start), ms(t.End)
	return a, nil
}

var (
	dcMu   sync.Mutex
	dcPipe *os.File
)

func dcWrite(f *os.File, op uint32, v any) error {
	body, _ := json.Marshal(v)
	hdr := make([]byte, 8)
	binary.LittleEndian.PutUint32(hdr[0:], op)
	binary.LittleEndian.PutUint32(hdr[4:], uint32(len(body)))
	_, err := f.Write(append(hdr, body...))
	return err
}

func dcConnect() *os.File {
	if dcPipe != nil {
		return dcPipe
	}
	for i := 0; i < 10; i++ {
		f, err := os.OpenFile(fmt.Sprintf(`\\.\pipe\discord-ipc-%d`, i), os.O_RDWR, 0)
		if err != nil {
			continue
		}
		if err := dcWrite(f, 0, map[string]any{"v": 1, "client_id": discordAppID}); err != nil {
			f.Close()
			continue
		}
		// Discord answers every frame. A pipe opened this way does one thing at a time, so a reader left waiting
		// in the background would hold up every later write: each answer is read right after its request instead.
		if err := dcRead(f); err != nil {
			f.Close()
			continue
		}
		dcPipe = f
		return f
	}
	return nil
}

func dcSend(act any) bool {
	dcMu.Lock()
	defer dcMu.Unlock()
	if discordAppID == "" {
		return false
	}
	f := dcConnect()
	if f == nil {
		return false
	}
	err := dcWrite(f, 1, map[string]any{
		"cmd":   "SET_ACTIVITY",
		"args":  map[string]any{"pid": os.Getpid(), "activity": act},
		"nonce": fmt.Sprint(time.Now().UnixNano()),
	})
	if err == nil {
		err = dcRead(f)
	}
	if err != nil {
		log.Printf("discord: %v", err)
		f.Close()
		dcPipe = nil
		return false
	}
	return true
}

// dcRead reads one whole answer frame (8-byte header, then its JSON body) and drops it.
func dcRead(f *os.File) error {
	hdr := make([]byte, 8)
	if _, err := io.ReadFull(f, hdr); err != nil {
		return err
	}
	n := binary.LittleEndian.Uint32(hdr[4:])
	if n > 1<<20 {
		return fmt.Errorf("discord answer too large")
	}
	_, err := io.CopyN(io.Discard, f, int64(n))
	return err
}

func trim(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n-1]) + "…"
	}
	if len(r) < 2 && len(r) > 0 {
		return s + " "
	}
	return s
}

func presenceSet(a activity) bool {
	img := a.Image
	if len(img) > 250 || !strings.HasPrefix(img, "https://") {
		img = "https://mkcinema.pages.dev/icon-512.png"
	}
	act := map[string]any{
		"type":    3, // Watching
		"details": trim(a.Title, 120),
		"assets":  map[string]any{"large_image": img, "large_text": "MKCinema", "small_image": "https://mkcinema.pages.dev/icon-512.png", "small_text": "MKCinema"},
	}
	if a.Sub != "" {
		act["state"] = trim(a.Sub, 120)
	} else if a.Paused {
		act["state"] = "Paused"
	}
	if !a.Paused && a.Start > 0 {
		ts := map[string]any{"start": a.Start}
		if a.End > a.Start {
			ts["end"] = a.End
		}
		act["timestamps"] = ts
	}
	return dcSend(act)
}

func presenceClear() { dcSend(nil) }
