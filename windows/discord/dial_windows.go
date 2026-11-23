package discord

import (
	"fmt"
	"io"
	"os"
)

// dial opens Discord's pipe number i (\\.\pipe\discord-ipc-0 to 9), or returns nil.
func dial(i int) io.ReadWriteCloser {
	f, err := os.OpenFile(fmt.Sprintf(`\\.\pipe\discord-ipc-%d`, i), os.O_RDWR, 0)
	if err != nil {
		return nil
	}
	return f
}
