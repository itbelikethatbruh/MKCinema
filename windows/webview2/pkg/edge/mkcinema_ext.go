//go:build windows
// +build windows

package edge

// Extra WebView2 events MKCinema needs: video fullscreen, links that open a
// new window, and recovering when the web engine crashes.

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// eventHandler is a minimal COM object with an Invoke(sender, args) method.
type eventHandler struct {
	vtbl *eventHandlerVtbl
	fn   func(sender, args uintptr) uintptr
}

type eventHandlerVtbl struct {
	QueryInterface uintptr
	AddRef         uintptr
	Release        uintptr
	Invoke         uintptr
}

var sharedEventVtbl = &eventHandlerVtbl{
	QueryInterface: windows.NewCallback(func(this, _, out uintptr) uintptr {
		if out != 0 {
			*(*uintptr)(unsafe.Pointer(out)) = this
		}
		return 0
	}),
	AddRef:  windows.NewCallback(func(this uintptr) uintptr { return 1 }),
	Release: windows.NewCallback(func(this uintptr) uintptr { return 1 }),
	Invoke: windows.NewCallback(func(this, sender, args uintptr) uintptr {
		h := (*eventHandler)(unsafe.Pointer(this))
		if h.fn != nil {
			return h.fn(sender, args)
		}
		return 0
	}),
}

// Handlers live for the whole process; keep them reachable so the GC never frees them.
var keepHandlers []*eventHandler

func (e *Chromium) addEvent(add ComProc, fn func(sender, args uintptr) uintptr) bool {
	if e.webview == nil {
		return false
	}
	h := &eventHandler{vtbl: sharedEventVtbl, fn: fn}
	keepHandlers = append(keepHandlers, h)
	var token _EventRegistrationToken
	r, _, _ := add.Call(
		uintptr(unsafe.Pointer(e.webview)),
		uintptr(unsafe.Pointer(h)),
		uintptr(unsafe.Pointer(&token)),
	)
	return int32(r) >= 0
}

// OnFullScreenChanged calls fn with true when a page element (the video
// player) enters fullscreen and false when it leaves.
func (e *Chromium) OnFullScreenChanged(fn func(full bool)) bool {
	return e.addEvent(e.webview.vtbl.AddContainsFullScreenElementChanged, func(sender, _ uintptr) uintptr {
		var v int32
		_, _, _ = e.webview.vtbl.GetContainsFullScreenElement.Call(
			uintptr(unsafe.Pointer(e.webview)),
			uintptr(unsafe.Pointer(&v)),
		)
		fn(v != 0)
		return 0
	})
}

// OnNewWindow calls fn with the address a page wants to open in a new window.
// When fn returns true the popup is cancelled (the caller handled it).
func (e *Chromium) OnNewWindow(fn func(uri string) bool) bool {
	return e.addEvent(e.webview.vtbl.AddNewWindowRequested, func(_, args uintptr) uintptr {
		if args == 0 {
			return 0
		}
		// ICoreWebView2NewWindowRequestedEventArgs: IUnknown(3), get_Uri, put_NewWindow,
		// get_NewWindow, put_Handled, ...
		vt := *(*[7]uintptr)(unsafe.Pointer(*(*uintptr)(unsafe.Pointer(args))))
		var p *uint16
		_, _, _ = ComProc(vt[3]).Call(args, uintptr(unsafe.Pointer(&p)))
		uri := ""
		if p != nil {
			uri = windows.UTF16PtrToString(p)
			windows.CoTaskMemFree(unsafe.Pointer(p))
		}
		if fn(uri) {
			_, _, _ = ComProc(vt[6]).Call(args, 1)
		}
		return 0
	})
}

// OnProcessFailed calls fn with the COREWEBVIEW2_PROCESS_FAILED_KIND
// (0 browser exited, 1 page renderer exited, 2 page unresponsive, ...).
func (e *Chromium) OnProcessFailed(fn func(kind int32)) bool {
	return e.addEvent(e.webview.vtbl.AddProcessFailed, func(_, args uintptr) uintptr {
		var kind int32 = -1
		if args != 0 {
			vt := *(*[4]uintptr)(unsafe.Pointer(*(*uintptr)(unsafe.Pointer(args))))
			_, _, _ = ComProc(vt[3]).Call(args, uintptr(unsafe.Pointer(&kind)))
		}
		fn(kind)
		return 0
	})
}

// Reload reloads the current page.
func (e *Chromium) Reload() {
	if e.webview != nil {
		_, _, _ = e.webview.vtbl.Reload.Call(uintptr(unsafe.Pointer(e.webview)))
	}
}
