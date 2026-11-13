//go:build windows

package main

// The native player (1.6.0): films play in libmpv, drawn in a child window under the web page. While a film plays
// the page turns its own background see-through, so its controls, subtitles tools, X-Ray and the rest sit on top of
// the native picture. The page drives it through MKDesktop.player (mkPlayer below); every command is checked by
// package mpv first. Without libmpv-2.dll the page simply keeps its web player.

import (
	"encoding/json"
	"errors"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"

	"mkcinema/mpv"
)

var (
	pRegisterClassExW = user32.NewProc("RegisterClassExW")
	pCreateWindowExW  = user32.NewProc("CreateWindowExW")
	pDefWindowProcW   = user32.NewProc("DefWindowProcW")
	pGetClientRect    = user32.NewProc("GetClientRect")
	pGetStockObject   = windows.NewLazySystemDLL("gdi32.dll").NewProc("GetStockObject")
	pGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")
)

type wndClassEx struct {
	Size, Style                        uint32
	WndProc                            uintptr
	ClsExtra, WndExtra                 int32
	Instance, Icon, Cursor, Background uintptr
	MenuName, ClassName                *uint16
	IconSm                             uintptr
}

type nativePlayer struct {
	mu      sync.Mutex
	w       webview2.WebView
	c       *edge.Chromium
	parent  uintptr
	video   uintptr // the child window mpv draws into
	cl      *mpv.Client
	st      *mpv.State
	extra   map[string]any // one-off news for the page (file loaded, end of file, errors)
	shown   bool
	loadErr error
}

var np = &nativePlayer{st: mpv.NewState(), extra: map[string]any{}}

func defProc(hwnd, msg, wp, lp uintptr) uintptr {
	r, _, _ := pDefWindowProcW.Call(hwnd, msg, wp, lp)
	return r
}

// setupPlayer runs on the window's thread at start-up; libmpv itself loads only when the page first asks.
func setupPlayer(w webview2.WebView, c *edge.Chromium, parent uintptr) {
	np.w, np.c, np.parent = w, c, parent
	inst, _, _ := pGetModuleHandleW.Call(0)
	name, _ := windows.UTF16PtrFromString("MKCinemaVideo")
	black, _, _ := pGetStockObject.Call(4) // BLACK_BRUSH
	wc := wndClassEx{WndProc: windows.NewCallback(defProc), Instance: inst, Background: black, ClassName: name}
	wc.Size = uint32(unsafe.Sizeof(wc))
	_, _, _ = pRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	const wsChild, wsClipSiblings, wsDisabled = 0x40000000, 0x04000000, 0x08000000
	h, _, err := pCreateWindowExW.Call(0, uintptr(unsafe.Pointer(name)), 0, wsChild|wsClipSiblings|wsDisabled,
		0, 0, 1, 1, parent, 0, inst, 0)
	if h == 0 {
		log.Printf("player: video window: %v", err)
		return
	}
	np.video = h
	webview2.OnSize = func(uintptr) { np.fit() }
	np.fit()
}

// fit sizes the video window to the whole window, under the page.
func (p *nativePlayer) fit() {
	if p.video == 0 {
		return
	}
	var r rect
	_, _, _ = pGetClientRect.Call(p.parent, uintptr(unsafe.Pointer(&r)))
	const hwndBottom, swpNoActivate = 1, 0x0010
	_, _, _ = pSetWindowPos.Call(p.video, hwndBottom, 0, 0, uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), swpNoActivate)
}

// show puts the native picture under the page (the page is see-through while it plays) or hides it again.
func (p *nativePlayer) show(on bool) {
	p.w.Dispatch(func() {
		if p.video == 0 {
			return
		}
		p.fit()
		cmd := uintptr(0) // SW_HIDE
		alpha := uint8(255)
		if on {
			cmd, alpha = 8, 0 // SW_SHOWNA
		}
		_, _, _ = pShowWindow.Call(p.video, cmd)
		if ctl := p.c.GetController(); ctl != nil {
			if c2 := ctl.GetICoreWebView2Controller2(); c2 != nil {
				_ = c2.PutDefaultBackgroundColor(edge.COREWEBVIEW2_COLOR{A: alpha})
			}
		}
	})
	p.mu.Lock()
	p.shown = on
	p.mu.Unlock()
}

func mpvDirs() []string {
	var d []string
	if exe, err := os.Executable(); err == nil {
		d = append(d, filepath.Dir(exe))
	}
	return append(d, filepath.Join(dataDir, "mpv"))
}

// client starts libmpv on first use.
func (p *nativePlayer) client() (*mpv.Client, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cl != nil {
		return p.cl, nil
	}
	if p.video == 0 {
		return nil, errors.New("no video window")
	}
	if err := mpv.Load(mpvDirs()...); err != nil {
		p.loadErr = err
		return nil, err
	}
	cl, err := mpv.New(p.video, [][2]string{
		// nothing from the PC's own mpv setup, scripts or web-video helpers; keys and mouse belong to the page
		{"config", "no"}, {"load-scripts", "no"}, {"ytdl", "no"}, {"osc", "no"}, {"osd-level", "0"},
		{"input-default-bindings", "no"}, {"input-vo-keyboard", "no"}, {"input-cursor", "no"}, {"cursor-autohide", "no"},
		{"terminal", "no"}, {"idle", "yes"}, {"keep-open", "yes"}, {"force-window", "yes"},
		// picture: the GPU renderer, hardware decoding where it's safe, HDR sent to HDR screens
		{"vo", "gpu-next"}, {"gpu-api", "d3d11"}, {"hwdec", "auto-safe"}, {"target-colorspace-hint", "yes"},
		{"video-sync", "audio"}, {"interpolation", "no"},
		// network: a large read-ahead so debrid links ride out slow patches
		{"cache", "yes"}, {"demuxer-max-bytes", "400MiB"}, {"demuxer-max-back-bytes", "100MiB"}, {"demuxer-readahead-secs", "60"},
		{"network-timeout", "25"}, {"stream-lavf-o", "reconnect=1,reconnect_streamed=1,reconnect_delay_max=8"},
		// sound and subtitles: the web player's volume goes to 200 %; files' own subtitles stay off until the page picks
		{"volume-max", "200"}, {"audio-file-auto", "no"}, {"sub-auto", "no"}, {"sub-font-size", "52"},
		{"sub-border-size", "2.5"}, {"sub-shadow-offset", "1"}, {"sub-ass-override", "scale"},
		{"screenshot-directory", filepath.Join(dataDir, "stills")},
	})
	if err != nil {
		p.loadErr = err
		return nil, err
	}
	cl.Observe()
	p.cl = cl
	go p.loop(cl)
	go p.pump(cl)
	log.Printf("player: libmpv ready (client API %d.%d)", mpv.Version()>>16, mpv.Version()&0xffff)
	return cl, nil
}

// loop reads libmpv's events until the player closes.
func (p *nativePlayer) loop(cl *mpv.Client) {
	for {
		ev := cl.Wait(0.5)
		switch ev.Kind {
		case mpv.EvShutdown:
			cl.Destroy()
			return
		case mpv.EvPropChange:
			p.st.Set(ev.Name, ev.Val, ev.HasVal)
		case mpv.EvFileLoaded:
			p.news("loaded", true)
		case mpv.EvEndFile:
			switch ev.EndReason {
			case mpv.EndEOF:
				p.news("end", "eof")
			case mpv.EndError:
				p.news("end", "error")
				p.news("err", ev.Err)
				log.Printf("player: could not play: %s", ev.Err)
			}
		case mpv.EvLog:
			log.Printf("mpv %s: %s", ev.Name, strings.TrimSpace(ev.Val))
		}
	}
}

func (p *nativePlayer) news(k string, v any) {
	p.mu.Lock()
	p.extra[k] = v
	p.mu.Unlock()
}

// pump hands the page what changed, at most 8 times a second.
func (p *nativePlayer) pump(cl *mpv.Client) {
	t := time.NewTicker(125 * time.Millisecond)
	defer t.Stop()
	for range t.C {
		if cl.Dead() {
			return
		}
		p.mu.Lock()
		ex := p.extra
		p.extra = map[string]any{}
		p.mu.Unlock()
		if j := p.st.Flush(ex); j != "" {
			p.w.Dispatch(func() {
				p.w.Eval("window.MKDesktop&&MKDesktop.player&&MKDesktop.player._ev&&MKDesktop.player._ev(" + j + ")")
			})
		}
	}
}

// mkPlayer(cmd, arg) is the page's MKDesktop.player.cmd.
func mkPlayer(c, arg string) (string, error) {
	switch c {
	case "probe": // can this PC play natively? Loads libmpv once.
		_, err := np.client()
		b, _ := json.Marshal(map[string]any{"ok": err == nil, "api": mpv.Version(), "err": errString(err)})
		return string(b), nil
	case "show":
		np.show(arg != "0")
		return "", nil
	case "get": // one property, for the page's stats panel
		cl, err := np.client()
		if err != nil {
			return "", err
		}
		for _, w := range mpv.Watched {
			if w == arg {
				v, _ := cl.Get(arg)
				return v, nil
			}
		}
		return "", mpv.ErrBad
	}
	ops, err := mpv.Translate(c, arg)
	if err != nil {
		return "", err
	}
	cl, err := np.client()
	if err != nil {
		return "", err
	}
	gen := 0
	if c == "open" {
		gen = np.st.Opened()
	}
	for _, o := range ops {
		if e := cl.Do(o); e != nil && (c != "open" || len(o.Args) > 0) {
			log.Printf("player: %s: %v", c, e)
			err = e
		}
	}
	if c == "open" {
		b, _ := json.Marshal(map[string]any{"gen": gen})
		return string(b), err
	}
	return "", err
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func stopPlayer() {
	np.mu.Lock()
	cl := np.cl
	np.mu.Unlock()
	if cl != nil {
		cl.Close()
	}
}
