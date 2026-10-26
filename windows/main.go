// MKCinema for Windows: the MKCinema web app in its own window, using the WebView2 runtime built into Windows 10 and 11.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"

	"github.com/jchv/go-webview2"
)

const home = "https://mkcinema.pages.dev/"

func main() {
	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "MKCinema")
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  data,
		WindowOptions: webview2.WindowOptions{
			Title:  "MKCinema",
			Width:  1440,
			Height: 900,
			IconId: 2,
			Center: true,
		},
	})
	if w == nil {
		if ask("MKCinema needs Microsoft Edge WebView2, which is missing on this PC.\n\nOpen Microsoft's download page now?") {
			exec.Command("rundll32", "url.dll,FileProtocolHandler", "https://go.microsoft.com/fwlink/p/?LinkId=2124703").Start()
		}
		return
	}
	defer w.Destroy()
	w.SetSize(1100, 680, webview2.HintMin)
	w.Navigate(home)
	w.Run()
}

func ask(msg string) bool {
	user32 := syscall.NewLazyDLL("user32.dll")
	t, _ := syscall.UTF16PtrFromString("MKCinema")
	m, _ := syscall.UTF16PtrFromString(msg)
	r, _, _ := user32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x4|0x40)
	return r == 6
}
