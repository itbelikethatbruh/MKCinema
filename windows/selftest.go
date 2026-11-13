//go:build windows

package main

// Native player self-test (used by the windows-native workflow, never by people): MKC_NATIVE_SELFTEST=<file> opens a
// see-through test page with a red bar on top, plays a colour test pattern in libmpv under it, takes a picture of the
// window and writes <file>.png and <file>.json ({"page":true,"video":true} when both show). This proves the page really
// is see-through over the native picture on that machine.

import (
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"log"
	"os"
	"time"
	"unsafe"

	"github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"

	"mkcinema/mpv"
)

const selfTestHTML = `<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent">
<div style="position:fixed;left:0;top:0;right:0;height:60px;background:#ff0000"></div></body></html>`

var (
	gdi32               = windows.NewLazySystemDLL("gdi32.dll")
	pGetDC              = user32.NewProc("GetDC")
	pReleaseDC          = user32.NewProc("ReleaseDC")
	pClientToScreen     = user32.NewProc("ClientToScreen")
	pCreateCompatibleDC = gdi32.NewProc("CreateCompatibleDC")
	pCreateCompatBitmap = gdi32.NewProc("CreateCompatibleBitmap")
	pSelectObject       = gdi32.NewProc("SelectObject")
	pBitBlt             = gdi32.NewProc("BitBlt")
	pGetDIBits          = gdi32.NewProc("GetDIBits")
	pDeleteObject       = gdi32.NewProc("DeleteObject")
	pDeleteDC           = gdi32.NewProc("DeleteDC")
)

type bitmapInfoHeader struct {
	Size                         uint32
	Width, Height                int32
	Planes, BitCount             uint16
	Compression, SizeImage       uint32
	XPelsPerMeter, YPelsPerMeter int32
	ClrUsed, ClrImportant        uint32
}

func grabWindow(hwnd uintptr) *image.RGBA {
	var r rect
	_, _, _ = pGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
	pt := [2]int32{0, 0}
	_, _, _ = pClientToScreen.Call(hwnd, uintptr(unsafe.Pointer(&pt)))
	w, h := int(r.Right-r.Left), int(r.Bottom-r.Top)
	screen, _, _ := pGetDC.Call(0)
	defer pReleaseDC.Call(0, screen)
	mem, _, _ := pCreateCompatibleDC.Call(screen)
	defer pDeleteDC.Call(mem)
	bmp, _, _ := pCreateCompatBitmap.Call(screen, uintptr(w), uintptr(h))
	defer pDeleteObject.Call(bmp)
	old, _, _ := pSelectObject.Call(mem, bmp)
	_, _, _ = pBitBlt.Call(mem, 0, 0, uintptr(w), uintptr(h), screen, uintptr(pt[0]), uintptr(pt[1]), 0x00CC0020|0x40000000) // SRCCOPY|CAPTUREBLT
	_, _, _ = pSelectObject.Call(mem, old)
	bi := bitmapInfoHeader{Width: int32(w), Height: -int32(h), Planes: 1, BitCount: 32}
	bi.Size = uint32(unsafe.Sizeof(bi))
	buf := make([]byte, w*h*4)
	_, _, _ = pGetDIBits.Call(mem, bmp, 0, uintptr(h), uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&bi)), 0)
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for i := 0; i < w*h; i++ {
		img.Pix[i*4], img.Pix[i*4+1], img.Pix[i*4+2], img.Pix[i*4+3] = buf[i*4+2], buf[i*4+1], buf[i*4], 255
	}
	return img
}

func nativeSelfTest(w webview2.WebView, hwnd uintptr, out string) {
	res := map[string]any{}
	done := func() {
		b, _ := json.Marshal(res)
		_ = os.WriteFile(out+".json", b, 0o644)
		log.Printf("selftest: %s", b)
		w.Dispatch(w.Terminate)
	}
	time.Sleep(4 * time.Second)
	cl, err := np.client()
	if err != nil {
		res["err"] = err.Error()
		done()
		return
	}
	np.show(true)
	if err := cl.Do(mpv.Op{Args: []string{"loadfile", "av://lavfi:testsrc2=size=1280x720:rate=30", "replace"}}); err != nil {
		res["err"] = err.Error()
	}
	time.Sleep(5 * time.Second)
	// colourful = the test pattern shows: count the different colours in the middle of the window
	shot := func(name string) {
		img := grabWindow(hwnd)
		if f, err := os.Create(out + "-" + name + ".png"); err == nil {
			_ = png.Encode(f, img)
			f.Close()
		}
		b := img.Bounds()
		top := img.RGBAAt(b.Dx()/2, 30)
		seen := map[color.RGBA]bool{}
		for y := b.Dy() / 4; y < b.Dy()*3/4; y += 7 {
			for x := b.Dx() / 4; x < b.Dx()*3/4; x += 7 {
				c := img.RGBAAt(x, y)
				seen[color.RGBA{c.R &^ 15, c.G &^ 15, c.B &^ 15, 255}] = true
			}
		}
		res[name] = map[string]any{"page": top.R > 200 && top.G < 60 && top.B < 60, "colours": len(seen), "video": len(seen) > 12}
	}
	ui := func(f func()) {
		d := make(chan struct{})
		w.Dispatch(func() { f(); close(d) })
		<-d
		time.Sleep(1500 * time.Millisecond)
	}
	shot("clip")
	ui(func() { _ = np.c.Hide() })
	shot("hidden")
	ui(func() { _ = np.c.Show() })
	ui(func() {
		const gwlStyle = ^uintptr(15) // -16
		st, _, _ := pGetWindowLongPtrW.Call(np.video, gwlStyle)
		_, _, _ = pSetWindowLongPtrW.Call(np.video, gwlStyle, st&^0x04000000)
		_, _, _ = pSetWindowPos.Call(np.video, 1, 0, 0, 0, 0, 0x0001|0x0002|0x0010|0x0020) // NOSIZE NOMOVE NOACTIVATE FRAMECHANGED
	})
	shot("noclip")
	res["page"], res["video"] = res["clip"].(map[string]any)["page"], res["clip"].(map[string]any)["video"]
	if v, ok := cl.Get("vo-configured"); ok {
		res["vo"] = v
	}
	if v, ok := cl.Get("current-vo"); ok {
		res["current_vo"] = v
	}
	done()
}
