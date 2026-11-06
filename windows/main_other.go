//go:build !windows

// MKCinema for Windows builds for Windows only. On other systems this package holds just the parts that are tested
// there (Discord status parsing); the torrent engine and downloads have their own packages.
package main

import "fmt"

func main() { fmt.Println("MKCinema for Windows runs on Windows only. Build with GOOS=windows.") }
