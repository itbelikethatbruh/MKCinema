package mpv

import (
	"encoding/json"
	"strconv"
	"strings"
	"sync"
)

// Watched lists the mpv properties the page hears about, all read as text. track-list and chapter-list come as JSON.
var Watched = []string{
	"time-pos", "duration", "pause", "paused-for-cache", "seeking", "eof-reached", "idle-active",
	"volume", "mute", "speed", "aid", "sid", "secondary-sid", "track-list", "chapter-list",
	"demuxer-cache-time", "video-params/w", "video-params/h", "video-params/gamma", "video-params/primaries",
	"hwdec-current", "video-codec", "audio-codec-name", "audio-params/channel-count", "container-fps",
	"sub-delay", "audio-delay",
}

// State keeps the latest value of every watched property and which ones changed since the page last heard.
type State struct {
	mu    sync.Mutex
	vals  map[string]any
	dirty map[string]bool
	gen   int // which film: bumped on each open, so the page can ignore late news from the previous one
}

func NewState() *State { return &State{vals: map[string]any{}, dirty: map[string]bool{}} }

// key names the page sees (time-pos → t ...); unlisted ones keep their mpv name.
var keys = map[string]string{
	"time-pos": "t", "duration": "dur", "pause": "paused", "paused-for-cache": "buffering", "eof-reached": "ended",
	"idle-active": "idle", "demuxer-cache-time": "cached", "video-params/w": "w", "video-params/h": "h",
	"video-params/gamma": "gamma", "video-params/primaries": "prim", "track-list": "tracks", "chapter-list": "chapters",
	"hwdec-current": "hwdec", "audio-params/channel-count": "channels", "container-fps": "fps",
}

func parse(name, raw string, ok bool) any {
	if !ok {
		return nil
	}
	switch name {
	case "track-list", "chapter-list":
		var v any
		if json.Unmarshal([]byte(raw), &v) == nil {
			return v
		}
		return nil
	case "pause", "paused-for-cache", "seeking", "eof-reached", "idle-active", "mute":
		return raw == "yes"
	case "aid", "sid", "secondary-sid", "video-codec", "audio-codec-name", "hwdec-current", "video-params/gamma", "video-params/primaries":
		return raw
	}
	if f, err := strconv.ParseFloat(strings.TrimSpace(raw), 64); err == nil {
		return f
	}
	return raw
}

// Set records a property change (ok false: the property has no value now, such as duration before a film loads).
func (s *State) Set(name, raw string, ok bool) {
	k := keys[name]
	if k == "" {
		k = name
	}
	s.mu.Lock()
	s.vals[k] = parse(name, raw, ok)
	s.dirty[k] = true
	s.mu.Unlock()
}

// Opened starts a new film: old values are dropped.
func (s *State) Opened() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.gen++
	s.vals = map[string]any{}
	s.dirty = map[string]bool{}
	return s.gen
}

// Flush returns the changed values as JSON ({"gen":n,...}), or "" when nothing changed.
func (s *State) Flush(extra map[string]any) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.dirty) == 0 && len(extra) == 0 {
		return ""
	}
	out := map[string]any{"gen": s.gen}
	for k := range s.dirty {
		out[k] = s.vals[k]
	}
	for k, v := range extra {
		out[k] = v
	}
	s.dirty = map[string]bool{}
	b, _ := json.Marshal(out)
	return string(b)
}
