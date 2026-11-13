//go:build windows

package mpv

import (
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"runtime"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Client is one libmpv player, loaded from libmpv-2.dll at run time (the app itself builds with CGO off).
// Float arguments: Go's Windows call path copies the first four integer arguments into XMM0-XMM3 too, so a double
// passed as its bit pattern reaches mpv_wait_event's timeout correctly.
type Client struct {
	h    uintptr
	mu   sync.Mutex
	dead bool
}

var (
	dll                                                                       *windows.DLL
	pCreate, pInit, pSetOpt, pCmd, pSetProp, pGetProp, pObserve, pWait, pFree *windows.Proc
	pDestroy, pErrStr, pRequestLog, pClientAPI, pWakeup                       *windows.Proc
	loadOnce                                                                  sync.Once
	loadErr                                                                   error
)

// Load finds libmpv-2.dll: next to MKCinema.exe first, then in dir (the app's data folder\mpv).
func Load(dirs ...string) error {
	loadOnce.Do(func() {
		var tried []string
		for _, d := range dirs {
			p := filepath.Join(d, "libmpv-2.dll")
			tried = append(tried, p)
			// LOAD_WITH_ALTERED_SEARCH_PATH: the DLL's own folder is searched for anything it needs
			h, err := windows.LoadLibraryEx(p, 0, windows.LOAD_WITH_ALTERED_SEARCH_PATH)
			if err == nil {
				dll = &windows.DLL{Name: p, Handle: h}
				break
			}
		}
		if dll == nil {
			loadErr = fmt.Errorf("libmpv-2.dll not found (looked in %v)", tried)
			return
		}
		get := func(n string) *windows.Proc {
			p, err := dll.FindProc(n)
			if err != nil && loadErr == nil {
				loadErr = err
			}
			return p
		}
		pCreate, pInit, pSetOpt = get("mpv_create"), get("mpv_initialize"), get("mpv_set_option_string")
		pCmd, pSetProp, pGetProp = get("mpv_command"), get("mpv_set_property_string"), get("mpv_get_property_string")
		pObserve, pWait, pFree = get("mpv_observe_property"), get("mpv_wait_event"), get("mpv_free")
		pDestroy, pErrStr, pRequestLog = get("mpv_terminate_destroy"), get("mpv_error_string"), get("mpv_request_log_messages")
		pClientAPI, pWakeup = get("mpv_client_api_version"), get("mpv_wakeup")
	})
	return loadErr
}

// Version is the libmpv client API version (major<<16 | minor), or 0.
func Version() uint32 {
	if loadErr != nil || pClientAPI == nil {
		return 0
	}
	r, _, _ := pClientAPI.Call()
	return uint32(r)
}

func cstr(s string) *byte { b, _ := windows.BytePtrFromString(s); return b }

// at turns an address libmpv handed back (C memory, never moved by Go) into a pointer.
func at(u uintptr) unsafe.Pointer { return *(*unsafe.Pointer)(unsafe.Pointer(&u)) }

func gostr(p uintptr) string {
	if p == 0 {
		return ""
	}
	return windows.BytePtrToString((*byte)(at(p)))
}

func errOf(r uintptr) error {
	if int32(r) >= 0 {
		return nil
	}
	e, _, _ := pErrStr.Call(r)
	return errors.New(gostr(e))
}

// New creates and starts a player drawing into window wid. opts are mpv options applied before start.
func New(wid uintptr, opts [][2]string) (*Client, error) {
	if dll == nil || loadErr != nil {
		return nil, fmt.Errorf("libmpv not loaded: %v", loadErr)
	}
	h, _, _ := pCreate.Call()
	if h == 0 {
		return nil, errors.New("mpv_create failed")
	}
	c := &Client{h: h}
	all := append([][2]string{{"wid", fmt.Sprint(wid)}}, opts...)
	for _, o := range all {
		k, v := cstr(o[0]), cstr(o[1])
		// an option this libmpv build doesn't know is not fatal
		_, _, _ = pSetOpt.Call(h, uintptr(unsafe.Pointer(k)), uintptr(unsafe.Pointer(v)))
		runtime.KeepAlive(k)
		runtime.KeepAlive(v)
	}
	if r, _, _ := pInit.Call(h); errOf(r) != nil {
		pDestroy.Call(h)
		return nil, fmt.Errorf("mpv_initialize: %v", errOf(r))
	}
	lv := cstr("warn")
	pRequestLog.Call(h, uintptr(unsafe.Pointer(lv)))
	runtime.KeepAlive(lv)
	return c, nil
}

// Do runs one checked step from Translate.
func (c *Client) Do(o Op) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.dead {
		return errors.New("player closed")
	}
	if o.Prop != "" {
		k, v := cstr(o.Prop), cstr(o.Val)
		r, _, _ := pSetProp.Call(c.h, uintptr(unsafe.Pointer(k)), uintptr(unsafe.Pointer(v)))
		runtime.KeepAlive(k)
		runtime.KeepAlive(v)
		return errOf(r)
	}
	ptrs := make([]*byte, len(o.Args)+1)
	for i, a := range o.Args {
		ptrs[i] = cstr(a)
	}
	r, _, _ := pCmd.Call(c.h, uintptr(unsafe.Pointer(&ptrs[0])))
	runtime.KeepAlive(ptrs)
	return errOf(r)
}

// Get reads a property as text.
func (c *Client) Get(name string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.dead {
		return "", false
	}
	k := cstr(name)
	p, _, _ := pGetProp.Call(c.h, uintptr(unsafe.Pointer(k)))
	runtime.KeepAlive(k)
	if p == 0 {
		return "", false
	}
	s := gostr(p)
	pFree.Call(p)
	return s, true
}

const fmtString = 1

// Observe asks for change events of the Watched properties (reply id = index + 1).
func (c *Client) Observe() {
	for i, n := range Watched {
		k := cstr(n)
		pObserve.Call(c.h, uintptr(i+1), uintptr(unsafe.Pointer(k)), fmtString)
		runtime.KeepAlive(k)
	}
}

// Event kinds the app uses.
const (
	EvNone       = 0
	EvShutdown   = 1
	EvLog        = 2
	EvEndFile    = 7
	EvFileLoaded = 8
	EvPropChange = 22
	EndEOF       = 0
	EndError     = 4
)

type event struct {
	id    int32
	err   int32
	reply uint64
	data  uintptr
}

type eventProp struct {
	name   uintptr
	format int32
	_      int32
	data   uintptr
}

type eventEnd struct {
	reason int32
	err    int32
}

type eventLog struct {
	prefix, level, text uintptr
}

// Event is one thing that happened in the player.
type Event struct {
	Kind      int
	Name, Val string // property changes; Val is "" with HasVal false when the property has no value
	HasVal    bool
	EndReason int
	Err       string
}

// Wait blocks up to timeout seconds for the next event (Kind EvNone when none came).
func (c *Client) Wait(timeout float64) Event {
	if c.Dead() {
		return Event{Kind: EvShutdown}
	}
	r, _, _ := pWait.Call(c.h, uintptr(math.Float64bits(timeout)))
	if r == 0 {
		return Event{}
	}
	e := (*event)(at(r))
	ev := Event{Kind: int(e.id)}
	switch e.id {
	case EvPropChange:
		p := (*eventProp)(at(e.data))
		ev.Name = gostr(p.name)
		if p.format == fmtString && p.data != 0 {
			ev.Val, ev.HasVal = gostr(*(*uintptr)(at(p.data))), true
		}
	case EvEndFile:
		end := (*eventEnd)(at(e.data))
		ev.EndReason = int(end.reason)
		if end.err < 0 {
			es, _, _ := pErrStr.Call(uintptr(end.err))
			ev.Err = gostr(es)
		}
	case EvLog:
		l := (*eventLog)(at(e.data))
		ev.Name, ev.Val = gostr(l.prefix), gostr(l.text)
	}
	return ev
}

// Close asks the event loop to free the player: Wait returns EvShutdown, and Destroy then runs on the loop's own
// goroutine, because libmpv must not be freed while another thread is inside mpv_wait_event.
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.dead {
		return
	}
	c.dead = true
	pWakeup.Call(c.h)
}

// Dead is true once Close was called.
func (c *Client) Dead() bool { c.mu.Lock(); defer c.mu.Unlock(); return c.dead }

// Destroy frees the player; only the event loop calls it, after Dead turns true.
func (c *Client) Destroy() { c.mu.Lock(); defer c.mu.Unlock(); pDestroy.Call(c.h) }
