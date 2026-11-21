//go:build !windows

package discord

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"path/filepath"
	"testing"
)

// A stand-in for the Discord app: it answers the handshake and each status, and records what it got.
func TestUnixSocketStatus(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_RUNTIME_DIR", dir)
	ln, err := net.Listen("unix", filepath.Join(dir, "discord-ipc-0"))
	if err != nil {
		t.Skip("no unix sockets here:", err)
	}
	defer ln.Close()
	got := make(chan map[string]any, 4)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		for {
			hdr := make([]byte, 8)
			if _, err := io.ReadFull(c, hdr); err != nil {
				return
			}
			body := make([]byte, binary.LittleEndian.Uint32(hdr[4:]))
			if _, err := io.ReadFull(c, body); err != nil {
				return
			}
			var m map[string]any
			_ = json.Unmarshal(body, &m)
			got <- m
			ans := []byte(`{"evt":null}`)
			out := make([]byte, 8)
			binary.LittleEndian.PutUint32(out[0:], 1)
			binary.LittleEndian.PutUint32(out[4:], uint32(len(ans)))
			_, _ = c.Write(append(out, ans...))
		}
	}()
	a, err := Parse(`{"title":"Film","sub":"2024","start":1762430000000,"end":1762437200000,"paused":false}`)
	if err != nil {
		t.Fatal(err)
	}
	if !Set(a) {
		t.Fatal("status not sent")
	}
	if hs := <-got; hs["client_id"] != AppID {
		t.Fatalf("handshake %v", hs)
	}
	m := <-got
	act := m["args"].(map[string]any)["activity"].(map[string]any)
	if m["cmd"] != "SET_ACTIVITY" || act["details"] != "Film" || act["state"] != "2024" {
		t.Fatalf("status %v", m)
	}
	Clear()
	if m := <-got; m["args"].(map[string]any)["activity"] != nil {
		t.Fatalf("clear %v", m)
	}
}
