//go:build windows

package dl

import (
	"os/exec"
	"path/filepath"

	"golang.org/x/sys/windows"
)

// DefaultDir is Videos\MKCinema, so the files are easy to find and any video player can open them.
func DefaultDir() string {
	if v, err := windows.KnownFolderPath(windows.FOLDERID_Videos, 0); err == nil && v != "" {
		return filepath.Join(v, "MKCinema")
	}
	home, _ := windows.KnownFolderPath(windows.FOLDERID_Profile, 0)
	return filepath.Join(home, "Videos", "MKCinema")
}

// FreeBytes is the free space for this user on the drive holding dir, or -1 if unknown.
func FreeBytes(dir string) int64 {
	p, err := windows.UTF16PtrFromString(dir)
	if err != nil {
		return -1
	}
	var free, total, all uint64
	if windows.GetDiskFreeSpaceEx(p, &free, &total, &all) != nil {
		return -1
	}
	return int64(free)
}

// Reveal opens Explorer with the file selected (or the folder itself).
func Reveal(path string) error {
	if filepath.Ext(path) == "" {
		return exec.Command("explorer.exe", path).Start()
	}
	return exec.Command("explorer.exe", "/select,", path).Start()
}
