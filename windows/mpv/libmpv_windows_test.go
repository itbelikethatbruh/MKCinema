//go:build windows

package mpv

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

// TestNativeLibmpv runs only where libmpv-2.dll is present (the windows-native workflow sets MKC_LIBMPV_DIR). It checks
// the parts that can't be checked anywhere else: the DLL calls, the float timeout, the event layout, and that
// track-list arrives as JSON. The picture goes nowhere (vo=null): no screen on the test machine.
func TestNativeLibmpv(t *testing.T) {
	dir := os.Getenv("MKC_LIBMPV_DIR")
	if dir == "" {
		t.Skip("MKC_LIBMPV_DIR not set")
	}
	if err := Load(dir); err != nil {
		t.Fatal(err)
	}
	t.Logf("libmpv client API %d.%d", Version()>>16, Version()&0xffff)
	c, err := New(0, [][2]string{{"config", "no"}, {"vo", "null"}, {"ao", "null"}, {"idle", "yes"}, {"keep-open", "yes"}, {"load-scripts", "no"}, {"ytdl", "no"}})
	if err != nil {
		t.Fatal(err)
	}
	c.Observe()
	st := NewState()
	st.Opened()
	if err := c.Do(Op{Args: []string{"loadfile", "av://lavfi:testsrc=duration=4:size=320x240:rate=24,format=yuv420p", "replace"}}); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	var loaded, eof bool
	var maxT float64
	for time.Since(start) < 20*time.Second && !eof {
		ev := c.Wait(0.25)
		switch ev.Kind {
		case EvFileLoaded:
			loaded = true
		case EvPropChange:
			st.Set(ev.Name, ev.Val, ev.HasVal)
			if ev.Name == "time-pos" && ev.HasVal {
				var f float64
				_ = json.Unmarshal([]byte(strings.TrimSpace(ev.Val)), &f)
				if f > maxT {
					maxT = f
				}
			}
			if ev.Name == "eof-reached" && ev.Val == "yes" {
				eof = true
			}
		}
	}
	j := st.Flush(nil)
	t.Logf("state: %.400s", j)
	var m map[string]any
	if err := json.Unmarshal([]byte(j), &m); err != nil {
		t.Fatal(err)
	}
	if !loaded || !eof || maxT < 3 {
		t.Fatalf("loaded %v, eof %v, max time %.2f", loaded, eof, maxT)
	}
	if d, _ := m["dur"].(float64); d < 3.9 || d > 4.1 {
		t.Errorf("duration %v", m["dur"])
	}
	tr, ok := m["tracks"].([]any)
	if !ok || len(tr) == 0 {
		t.Fatalf("track-list did not arrive as JSON: %#v", m["tracks"])
	}
	if w, _ := m["w"].(float64); w != 320 {
		t.Errorf("width %v", m["w"])
	}
	// a checked command and a seek back work while paused at the end
	ops, _ := Translate("seek", "1")
	if err := c.Do(ops[0]); err != nil {
		t.Errorf("seek: %v", err)
	}
	if v, ok := c.Get("duration"); !ok || !strings.HasPrefix(v, "4") {
		t.Errorf("get duration %q %v", v, ok)
	}
	c.Close()
	if ev := c.Wait(0.1); ev.Kind != EvShutdown {
		t.Errorf("after Close: %v", ev.Kind)
	}
	c.Destroy()
}
