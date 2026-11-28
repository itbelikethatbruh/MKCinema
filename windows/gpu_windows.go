//go:build windows

package main

// 1.6.3: which graphics card the PC has, for Sharp upscaling's "graphics card AI" choice. NVIDIA RTX cards (RTX Video
// Super Resolution) and Intel Arc / Iris Xe (Intel Video Super Resolution) upscale films themselves through
// Direct3D 11's video processor; on any other card that option is not offered.

import (
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var pCreateDXGIFactory1 = windows.NewLazySystemDLL("dxgi.dll").NewProc("CreateDXGIFactory1")

// IID_IDXGIFactory1 {770aae78-f26f-4dba-a829-253c83d1b387}
var iidFactory1 = windows.GUID{Data1: 0x770aae78, Data2: 0xf26f, Data3: 0x4dba, Data4: [8]byte{0xa8, 0x29, 0x25, 0x3c, 0x83, 0xd1, 0xb3, 0x87}}

// DXGI_ADAPTER_DESC1
type adapterDesc1 struct {
	Description           [128]uint16
	VendorID              uint32
	DeviceID              uint32
	SubSysID              uint32
	Revision              uint32
	DedicatedVideoMemory  uintptr
	DedicatedSystemMemory uintptr
	SharedSystemMemory    uintptr
	LUID                  [2]uint32
	Flags                 uint32
}

func vcall(obj unsafe.Pointer, index int, args ...uintptr) uintptr {
	vt := *(**[32]uintptr)(obj)
	r, _, _ := syscall.SyscallN(vt[index], append([]uintptr{uintptr(obj)}, args...)...)
	return r
}

// gpuName returns the main graphics card's maker id and name (adapter 0, the one Windows draws the desktop with).
func gpuName() (vendor uint32, name string) {
	defer func() { _ = recover() }()
	if pCreateDXGIFactory1.Find() != nil {
		return 0, ""
	}
	var f unsafe.Pointer
	if r, _, _ := pCreateDXGIFactory1.Call(uintptr(unsafe.Pointer(&iidFactory1)), uintptr(unsafe.Pointer(&f))); r != 0 || f == nil {
		return 0, ""
	}
	defer vcall(f, 2) // Release
	var a unsafe.Pointer
	if vcall(f, 12, 0, uintptr(unsafe.Pointer(&a))) != 0 || a == nil { // IDXGIFactory1::EnumAdapters1(0)
		return 0, ""
	}
	defer vcall(a, 2)
	var d adapterDesc1
	if vcall(a, 10, uintptr(unsafe.Pointer(&d))) != 0 { // IDXGIAdapter1::GetDesc1
		return 0, ""
	}
	return d.VendorID, windows.UTF16ToString(d.Description[:])
}

// vsrMaker is the scaling mode mpv's d3d11vpp takes for this PC's card, or "" when the card has no video super resolution.
func vsrMaker(vendor uint32, name string) string {
	n := strings.ToLower(name)
	switch {
	case vendor == 0x10de && strings.Contains(n, "rtx"):
		return "nvidia"
	case vendor == 0x8086 && (strings.Contains(n, "arc") || strings.Contains(n, "iris")):
		return "intel"
	}
	return ""
}
