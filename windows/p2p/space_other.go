//go:build !linux && !android && !darwin

package p2p

func freeBytes(string) int64 { return -1 }
