//go:build !windows

package discord

import (
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"time"
)

// dirs lists where Discord puts its socket: the same folders Discord itself checks, plus the Flatpak and Snap
// versions' own folders on Linux.
func dirs() []string {
	var d []string
	for _, k := range []string{"XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"} {
		if v := os.Getenv(k); v != "" {
			d = append(d, v)
		}
	}
	d = append(d, "/tmp")
	if v := os.Getenv("XDG_RUNTIME_DIR"); v != "" {
		d = append(d, filepath.Join(v, "app", "com.discordapp.Discord"), filepath.Join(v, "snap.discord"))
	}
	return d
}

// conn gives every read and write a few seconds, so a Discord that stops answering can't hold the status up.
type conn struct{ net.Conn }

func (c conn) Read(b []byte) (int, error) {
	_ = c.SetReadDeadline(time.Now().Add(5 * time.Second))
	return c.Conn.Read(b)
}

func (c conn) Write(b []byte) (int, error) {
	_ = c.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return c.Conn.Write(b)
}

// dial opens Discord's socket number i (discord-ipc-0 to 9) in the first folder that has it, or returns nil.
func dial(i int) io.ReadWriteCloser {
	for _, d := range dirs() {
		c, err := net.DialTimeout("unix", filepath.Join(d, fmt.Sprintf("discord-ipc-%d", i)), 2*time.Second)
		if err == nil {
			return conn{c}
		}
	}
	return nil
}
