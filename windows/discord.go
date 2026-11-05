package main

// Discord Rich Presence over Discord's local IPC pipe (\\.\pipe\discord-ipc-N). Nothing is sent anywhere
// else, and nothing at all unless the user turned "Show on Discord" on.

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"sync"
	"time"
)

// Set at build time: -ldflags "-X main.discordAppID=<Discord application id>". Empty turns presence off.
var discordAppID = ""

type activity struct {
	Title   string `json:"title"`
	Sub     string `json:"sub"`
	Start   int64  `json:"start"` // unix ms when playback started (0 = paused)
	End     int64  `json:"end"`   // unix ms when it ends
	Paused  bool   `json:"paused"`
	Image   string `json:"image"`
	PageURL string `json:"url"`
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
		// Discord answers every frame; read and discard so the pipe never fills up.
		go func(f *os.File) {
			_, _ = io.Copy(io.Discard, f)
			dcMu.Lock()
			if dcPipe == f {
				dcPipe = nil
			}
			dcMu.Unlock()
		}(f)
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
	if err != nil {
		log.Printf("discord: %v", err)
		f.Close()
		dcPipe = nil
		return false
	}
	return true
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
	if len(img) > 250 || img == "" {
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
