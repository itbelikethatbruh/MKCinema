// MKCinema for Windows: the MKCinema web app in its own window, using the
// Microsoft Edge WebView2 runtime that ships with Windows 10 and 11.

//go:build windows

package main

import (
	"bytes"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"time"
	"unsafe"

	"github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/pkg/edge"
	"github.com/jchv/go-webview2/webviewloader"
	"golang.org/x/sys/windows"

	"mkcinema/origins"
)

const (
	version     = "1.3.2"
	home        = "https://mkcinema.pages.dev/" // origins.Hosts[0]: the saved sign-in and settings live on this origin
	title       = "MKCinema"
	runtimeLink = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	dwmapi   = windows.NewLazySystemDLL("dwmapi.dll")

	pMessageBoxW           = user32.NewProc("MessageBoxW")
	pFindWindowW           = user32.NewProc("FindWindowW")
	pShowWindow            = user32.NewProc("ShowWindow")
	pSetWindowTextW        = user32.NewProc("SetWindowTextW")
	pIsIconic              = user32.NewProc("IsIconic")
	pSetForegroundWindow   = user32.NewProc("SetForegroundWindow")
	pSystemParametersInfoW = user32.NewProc("SystemParametersInfoW")
	pGetDpiForSystem       = user32.NewProc("GetDpiForSystem")
	pGetWindowPlacement    = user32.NewProc("GetWindowPlacement")
	pSetWindowPlacement    = user32.NewProc("SetWindowPlacement")
	pMonitorFromRect       = user32.NewProc("MonitorFromRect")
	pMonitorFromWindow     = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfoW       = user32.NewProc("GetMonitorInfoW")
	pGetWindowLongPtrW     = user32.NewProc("GetWindowLongPtrW")
	pSetWindowLongPtrW     = user32.NewProc("SetWindowLongPtrW")
	pSetWindowPos          = user32.NewProc("SetWindowPos")
	pCreateMutexW          = kernel32.NewProc("CreateMutexW")
	pLoadLibraryExW        = kernel32.NewProc("LoadLibraryExW")
	pSetAppUserModelID     = shell32.NewProc("SetCurrentProcessExplicitAppUserModelID")
	pShellExecuteW         = shell32.NewProc("ShellExecuteW")
	pDwmSetWindowAttribute = dwmapi.NewProc("DwmSetWindowAttribute")
)

type rect struct{ Left, Top, Right, Bottom int32 }

type windowPlacement struct {
	Length         uint32
	Flags          uint32
	ShowCmd        uint32
	MinPosition    [2]int32
	MaxPosition    [2]int32
	NormalPosition rect
}

type monitorInfo struct {
	Size    uint32
	Monitor rect
	Work    rect
	Flags   uint32
}

var (
	dataDir      string
	instanceLock windows.Handle
)

func main() {
	dataDir = pickDataDir()
	logFile := startLog()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("panic: %v\n%s", r, debug.Stack())
			msg(fmt.Sprintf("MKCinema hit an unexpected error and has to close.\n\n%v\n\nDetails were saved to:\n%s", r, logPath()), 0x10)
			os.Exit(2)
		}
	}()
	if logFile != nil {
		// Crashes that cannot be recovered (for example inside native code) still get written down.
		_ = debug.SetCrashOutput(logFile, debug.CrashOptions{})
	}

	appID, _ := windows.UTF16PtrFromString("MKCinema.App")
	_, _, _ = pSetAppUserModelID.Call(uintptr(unsafe.Pointer(appID)))

	if !singleInstance() {
		return
	}

	// Load WebView2Loader.dll from disk. The library's fallback loads it straight
	// from memory, which some antivirus tools and Windows exploit protection block.
	loadLoaderFromDisk()

	ver, err := webviewloader.GetInstalledVersion()
	log.Printf("MKCinema for Windows %s, WebView2 runtime %q (err %v), data %s", version, ver, err, dataDir)
	if err == nil && ver == "" {
		offerRuntime("MKCinema needs the Microsoft Edge WebView2 Runtime, which is missing on this PC.\n\nIt's free from Microsoft and takes a minute to install. Open the download page now?")
		return
	}

	// Trailers and previews may start with sound, like in a desktop media app.
	// The page talks to this app's own 127.0.0.1 helpers (torrents, downloads, pass and TV over http). Newer WebView2
	// releases may start asking before a web page reaches 127.0.0.1 (Local Network Access) with no prompt to answer it,
	// which would cut those helpers off; this keeps today's behaviour. The helpers still accept only MKCinema's own
	// pages and a random token. (Owner's choice, 2026-11-11.)
	os.Setenv("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--autoplay-policy=no-user-gesture-required --disable-features=LocalNetworkAccessChecks")

	width, height, minW, minH, maximize := defaultSize()
	webview2.OnClose = savePlacement

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  dataDir,
		// Bound Go functions (mkP2P, mkPresence, mkDL, mkPass) exist and answer only on MKCinema's own pages, and run off the window's thread so a slow call can't freeze it.
		AllowSource:   origins.AppURL,
		BindGuard:     pageGuardJS,
		AsyncBindings: true,
		WindowOptions: webview2.WindowOptions{
			Title:  title,
			Width:  uint(width),
			Height: uint(height),
			IconId: 2,
			Center: true,
			BeforeShow: func(hwnd uintptr) {
				darkTitleBar(hwnd)
				if !restorePlacement(hwnd) && maximize {
					wp := windowPlacement{Length: uint32(unsafe.Sizeof(windowPlacement{}))}
					_, _, _ = pGetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&wp)))
					wp.ShowCmd = 3 // SW_SHOWMAXIMIZED
					_, _, _ = pSetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&wp)))
				}
			},
		},
	})
	if w == nil {
		startFailed(edge.LastError)
		return
	}
	hwnd := uintptr(w.Window())
	w.SetSize(minW, minH, webview2.HintMin)

	if c := w.(interface{ Chromium() *edge.Chromium }).Chromium(); c != nil {
		setupBrowser(c, hwnd, w.Dispatch)
	}

	_ = w.Bind("mkP2P", mkP2P)
	_ = w.Bind("mkPresence", mkPresence)
	_ = w.Bind("mkDL", mkDL)
	_ = w.Bind("mkPass", mkPass)
	w.Init(desktopInit())

	w.Navigate(home)
	w.Run()
	stopPass()
	stopP2P()
	stopDL()
	presenceClear()
	log.Printf("closed normally")
}

// setupBrowser wires up video fullscreen, F11, outside links and crash recovery.
func setupBrowser(c *edge.Chromium, hwnd uintptr, later func(func())) {
	if ctl := c.GetController(); ctl != nil {
		if c2 := ctl.GetICoreWebView2Controller2(); c2 != nil {
			_ = c2.PutDefaultBackgroundColor(edge.COREWEBVIEW2_COLOR{A: 255})
		}
	}
	if s, err := c.GetSettings(); err == nil {
		_ = s.PutIsStatusBarEnabled(false)
		_ = s.PutIsZoomControlEnabled(true)
		// Keep right-click Cut/Copy/Paste so keys and addon links can be pasted (DevTools stay off).
		_ = s.PutAreDefaultContextMenusEnabled(true)
	}

	var pageFull, keyFull bool
	apply := func() { setFullscreen(hwnd, pageFull || keyFull) }
	c.OnFullScreenChanged(func(full bool) { pageFull = full; apply() })
	c.AcceleratorKeyCallback = func(vk uint) bool {
		if vk == 0x7A { // F11
			keyFull = !keyFull
			if !keyFull {
				pageFull = false
				c.Eval("document.fullscreenElement&&document.exitFullscreen().catch(()=>{})")
			}
			apply()
			return true
		}
		return false
	}

	// Links that open a new window (YouTube, GitHub, help pages) go to the default browser.
	c.OnNewWindow(func(uri string) bool {
		u, err := url.Parse(uri)
		if err != nil {
			return true
		}
		switch strings.ToLower(u.Scheme) {
		case "http", "https":
			if origins.AppHost(u.Hostname()) {
				c.Navigate(atHome(u))
				return true
			}
			openExternal(uri)
			return true
		case "mailto":
			openExternal(uri)
			return true
		}
		return false // other schemes (external players) keep WebView2's own handling and prompt
	})

	// The window itself only shows MKCinema. Other sites the page tries to open in place go to the default browser,
	// except sign-in pages the app sends people to on purpose (MyAnimeList) and the redirects that follow them.
	inApp := true
	c.OnNavigationStarting(func(uri string, redirected bool) bool {
		u, err := url.Parse(uri)
		if err != nil {
			return false
		}
		switch strings.ToLower(u.Scheme) {
		case "http", "https":
		default:
			return true // about:, data:, blob: and player hand-offs keep WebView2's own handling
		}
		host := strings.ToLower(u.Hostname())
		if origins.AppHost(host) {
			if hh, _ := url.Parse(home); host != hh.Hostname() || !strings.EqualFold(u.Scheme, "https") {
				to := atHome(u)
				// app.mkcinema.app links open on the installed app's own origin, where the user is signed in
				later(func() { c.Navigate(to) })
				return false
			}
			inApp = true
			return true
		}
		if redirected || !inApp || signInHost(host) {
			inApp = false
			return true
		}
		log.Printf("opening %s in the browser", u.Host)
		openExternal(uri)
		return false
	})

	c.OnProcessFailed(func(kind int32) {
		log.Printf("web engine process failed, kind %d", kind)
		switch kind {
		case 1: // the page's renderer exited
			c.Reload()
		case 0: // the whole browser process exited; it can't be revived in place
			if ask("MKCinema's web engine stopped unexpectedly.\n\nRestart MKCinema now?") {
				relaunch(hwnd)
			}
			os.Exit(1)
		}
	})
}

// startFailed explains a WebView2 start-up failure instead of closing silently.
func startFailed(hr uint32) {
	log.Printf("WebView2 failed to start: %08x", hr)
	switch hr {
	case 0x80070002, 0x80070003, 0x8007007E, 0x80070490: // file/path/module/element not found
		offerRuntime(fmt.Sprintf("Microsoft Edge WebView2 looks damaged or incomplete on this PC (error 0x%08X).\n\nReinstalling it from Microsoft usually fixes this. Open the download page now?", hr))
	case 0x80070005, 0x8007139F, 0x800700AA, 0x80070020: // access denied, invalid state, busy, sharing violation
		msg(fmt.Sprintf("MKCinema couldn't open its data folder (error 0x%08X):\n%s\n\nClose any other MKCinema windows and try again. If it keeps happening, restart your PC, or check that your antivirus isn't blocking MKCinema.\n\nDetails: %s", hr, dataDir, logPath()), 0x30)
	case 0x800704C7: // closed while loading
	default:
		offerRuntime(fmt.Sprintf("MKCinema couldn't start Microsoft Edge WebView2 (error 0x%08X).\n\nReinstalling the WebView2 Runtime usually fixes this. Open the download page now?\n\nDetails: %s", hr, logPath()))
	}
}

func offerRuntime(text string) {
	if ask(text) {
		openExternal(runtimeLink)
	}
}

// singleInstance returns false (after bringing the open window forward) when
// MKCinema is already running.
func singleInstance() bool {
	name, _ := windows.UTF16PtrFromString("Local\\MKCinema.SingleInstance")
	h, _, err := pCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(name)))
	instanceLock = windows.Handle(h)
	if h == 0 || err != windows.ERROR_ALREADY_EXISTS {
		return true // first instance (or the mutex failed, in which case just run)
	}
	cls, _ := windows.UTF16PtrFromString("webview")
	ttl, _ := windows.UTF16PtrFromString(title)
	for i := 0; i < 30; i++ {
		if w, _, _ := pFindWindowW.Call(uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(ttl))); w != 0 {
			if r, _, _ := pIsIconic.Call(w); r != 0 {
				_, _, _ = pShowWindow.Call(w, 9) // SW_RESTORE
			}
			_, _, _ = pSetForegroundWindow.Call(w)
			return false
		}
		time.Sleep(100 * time.Millisecond) // the other copy may still be opening
	}
	log.Printf("another instance holds the lock but has no window; starting anyway")
	return true
}

func pickDataDir() string {
	var bases []string
	if v := os.Getenv("LOCALAPPDATA"); v != "" {
		bases = append(bases, v)
	}
	if v, err := os.UserCacheDir(); err == nil {
		bases = append(bases, v)
	}
	bases = append(bases, os.TempDir())
	for _, b := range bases {
		d := filepath.Join(b, "MKCinema")
		if os.MkdirAll(d, 0o755) != nil {
			continue
		}
		probe := filepath.Join(d, ".write-test")
		if os.WriteFile(probe, []byte("ok"), 0o644) == nil {
			os.Remove(probe)
			return d
		}
	}
	return filepath.Join(os.TempDir(), "MKCinema")
}

func logPath() string { return filepath.Join(dataDir, "mkcinema.log") }

func startLog() *os.File {
	p := logPath()
	if st, err := os.Stat(p); err == nil && st.Size() > 512*1024 {
		_ = os.Rename(p, p+".old")
	}
	f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		log.SetOutput(nopWriter{})
		return nil
	}
	log.SetOutput(f)
	log.SetFlags(log.LstdFlags)
	return f
}

type nopWriter struct{}

func (nopWriter) Write(p []byte) (int, error) { return len(p), nil }

func loadLoaderFromDisk() {
	dir := filepath.Join(dataDir, "runtime")
	p := filepath.Join(dir, "WebView2Loader.dll")
	if old, err := os.ReadFile(p); err != nil || !bytes.Equal(old, webviewloader.WebView2Loader) {
		if os.MkdirAll(dir, 0o755) != nil || os.WriteFile(p, webviewloader.WebView2Loader, 0o644) != nil {
			log.Printf("could not write %s; using the built-in loader", p)
			return
		}
	}
	pp, _ := windows.UTF16PtrFromString(p)
	// LOAD_WITH_ALTERED_SEARCH_PATH; once loaded, the library's LoadLibrary("WebView2Loader") finds this module.
	if h, _, err := pLoadLibraryExW.Call(uintptr(unsafe.Pointer(pp)), 0, 0x8); h == 0 {
		log.Printf("could not load %s: %v; using the built-in loader", p, err)
	}
}

// defaultSize picks a window that fits the screen at the current display scale.
func defaultSize() (w, h, minW, minH int, maximize bool) {
	var work rect
	_, _, _ = pSystemParametersInfoW.Call(0x30, 0, uintptr(unsafe.Pointer(&work)), 0) // SPI_GETWORKAREA
	ww, wh := int(work.Right-work.Left), int(work.Bottom-work.Top)
	if ww <= 0 || wh <= 0 {
		ww, wh = 1280, 720
	}
	scale := 1.0
	if pGetDpiForSystem.Find() == nil {
		if dpi, _, _ := pGetDpiForSystem.Call(); dpi >= 96 {
			scale = float64(dpi) / 96
		}
	}
	w, h = int(1440*scale), int(900*scale)
	if w > ww*9/10 {
		w = ww * 9 / 10
	}
	if h > wh*9/10 {
		h = wh * 9 / 10
	}
	minW, minH = int(800*scale), int(500*scale)
	if minW > ww {
		minW = ww
	}
	if minH > wh {
		minH = wh
	}
	// Small laptop screens: start maximized so the app isn't cramped.
	maximize = float64(ww)/scale < 1300 || float64(wh)/scale < 760
	return
}

func placementFile() string { return filepath.Join(dataDir, "window.dat") }

var (
	isFull       bool
	savedStyle   uintptr
	savedWindowP windowPlacement
)

func savePlacement(hwnd uintptr) {
	wp := windowPlacement{Length: uint32(unsafe.Sizeof(windowPlacement{}))}
	if isFull {
		wp = savedWindowP
	} else if r, _, _ := pGetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&wp))); r == 0 {
		return
	}
	if wp.ShowCmd == 2 { // minimized: reopen normally
		wp.ShowCmd = 1
	}
	b := (*[unsafe.Sizeof(windowPlacement{})]byte)(unsafe.Pointer(&wp))[:]
	_ = os.WriteFile(placementFile(), b, 0o644)
}

func restorePlacement(hwnd uintptr) bool {
	b, err := os.ReadFile(placementFile())
	if err != nil || len(b) != int(unsafe.Sizeof(windowPlacement{})) {
		return false
	}
	var wp windowPlacement
	copy((*[unsafe.Sizeof(windowPlacement{})]byte)(unsafe.Pointer(&wp))[:], b)
	r := wp.NormalPosition
	if wp.Length != uint32(len(b)) || r.Right-r.Left < 200 || r.Bottom-r.Top < 150 {
		return false
	}
	// Only restore onto a monitor that is still connected.
	if m, _, _ := pMonitorFromRect.Call(uintptr(unsafe.Pointer(&r)), 0); m == 0 {
		return false
	}
	if wp.ShowCmd != 3 {
		wp.ShowCmd = 1
	}
	wp.Flags = 0
	ok, _, _ := pSetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&wp)))
	return ok != 0
}

// setFullscreen switches the window between borderless fullscreen and its normal frame.
func setFullscreen(hwnd uintptr, full bool) {
	const gwlStyle = ^uintptr(15)             // GWL_STYLE (-16)
	const wsOverlapped = 0x00CF0000           // WS_OVERLAPPEDWINDOW
	const swpFrame = 0x0020 | 0x0200 | 0x0004 // FRAMECHANGED | NOOWNERZORDER | NOZORDER
	if full == isFull {
		return
	}
	if full {
		style, _, _ := pGetWindowLongPtrW.Call(hwnd, gwlStyle)
		savedStyle = style
		savedWindowP = windowPlacement{Length: uint32(unsafe.Sizeof(windowPlacement{}))}
		_, _, _ = pGetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&savedWindowP)))
		mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
		mon, _, _ := pMonitorFromWindow.Call(hwnd, 2) // MONITOR_DEFAULTTONEAREST
		if r, _, _ := pGetMonitorInfoW.Call(mon, uintptr(unsafe.Pointer(&mi))); r == 0 {
			return
		}
		_, _, _ = pSetWindowLongPtrW.Call(hwnd, gwlStyle, style&^wsOverlapped)
		m := mi.Monitor
		_, _, _ = pSetWindowPos.Call(hwnd, 0, uintptr(m.Left), uintptr(m.Top),
			uintptr(m.Right-m.Left), uintptr(m.Bottom-m.Top), swpFrame)
		isFull = true
		return
	}
	_, _, _ = pSetWindowLongPtrW.Call(hwnd, gwlStyle, savedStyle)
	_, _, _ = pSetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&savedWindowP)))
	_, _, _ = pSetWindowPos.Call(hwnd, 0, 0, 0, 0, 0, swpFrame|0x0001|0x0002) // NOSIZE | NOMOVE
	isFull = false
}

func darkTitleBar(hwnd uintptr) {
	if pDwmSetWindowAttribute.Find() != nil {
		return
	}
	on := int32(1)
	// DWMWA_USE_IMMERSIVE_DARK_MODE is 20 on current Windows, 19 on early Windows 10 builds.
	if r, _, _ := pDwmSetWindowAttribute.Call(hwnd, 20, uintptr(unsafe.Pointer(&on)), 4); r != 0 {
		_, _, _ = pDwmSetWindowAttribute.Call(hwnd, 19, uintptr(unsafe.Pointer(&on)), 4)
	}
}

// pageGuardJS is true only on MKCinema's own https pages; the bridge scripts do nothing anywhere else.
const pageGuardJS = `location.protocol==='https:'&&/^(mkcinema\.pages\.dev|app\.mkcinema\.app)$/.test(location.hostname)`

// atHome moves an address on any of the app's hosts to the home host over https, keeping path, query and #link.
func atHome(u *url.URL) string {
	h, _ := url.Parse(home)
	v := *u
	v.Scheme, v.Host, v.User = "https", h.Host, nil
	return v.String()
}

// signInHost lists sites the app deliberately opens in its own window to sign in (MyAnimeList can only send people
// back to mkcinema.pages.dev).
func signInHost(h string) bool {
	return h == "myanimelist.net" || strings.HasSuffix(h, ".myanimelist.net")
}

// openExternal hands an address or a file to Windows. It may run on any thread, so it sets up COM for itself as
// ShellExecute requires.
func openExternal(uri string) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := windows.CoInitializeEx(0, windows.COINIT_APARTMENTTHREADED|0x4); err == nil { // 0x4: COINIT_DISABLE_OLE1DDE
		defer windows.CoUninitialize()
	}
	verb, _ := windows.UTF16PtrFromString("open")
	u, _ := windows.UTF16PtrFromString(uri)
	_, _, _ = pShellExecuteW.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(u)), 0, 0, 1)
}

// relaunch starts a fresh copy. It first lets go of the single-instance lock and
// renames this window, so the new copy doesn't just bring this dying one forward.
func relaunch(hwnd uintptr) {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	t, _ := windows.UTF16PtrFromString(title + " (closing)")
	_, _, _ = pSetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(t)))
	_, _, _ = pShowWindow.Call(hwnd, 0) // SW_HIDE
	if instanceLock != 0 {
		_ = windows.CloseHandle(instanceLock)
		instanceLock = 0
	}
	_ = exec.Command(exe).Start()
}

func msg(text string, flags uintptr) uintptr {
	t, _ := windows.UTF16PtrFromString(title)
	m, _ := windows.UTF16PtrFromString(text)
	r, _, _ := pMessageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), flags|0x10000) // MB_SETFOREGROUND
	return r
}

func ask(text string) bool { return msg(text, 0x4|0x30) == 6 } // MB_YESNO | MB_ICONWARNING → IDYES
