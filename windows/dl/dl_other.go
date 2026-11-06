//go:build !windows

package dl

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"golang.org/x/sys/unix"
)

// DefaultDir is ~/Videos/MKCinema (~/Movies/MKCinema on a Mac).
func DefaultDir() string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Movies", "MKCinema")
	}
	return filepath.Join(home, "Videos", "MKCinema")
}

// FreeBytes is the free space for this user on the drive holding dir, or -1 if unknown.
func FreeBytes(dir string) int64 {
	var st unix.Statfs_t
	if err := unix.Statfs(dir, &st); err != nil {
		return -1
	}
	return int64(st.Bavail) * int64(st.Bsize)
}

// Reveal shows the file (or folder) in the file manager.
func Reveal(path string) error {
	if runtime.GOOS == "darwin" {
		return exec.Command("open", "-R", path).Start()
	}
	if filepath.Ext(path) != "" {
		path = filepath.Dir(path)
	}
	return exec.Command("xdg-open", path).Start()
}

// MarkFromInternet does nothing here: the downloads feature ships in the Windows app only.
func MarkFromInternet(path string) {}
