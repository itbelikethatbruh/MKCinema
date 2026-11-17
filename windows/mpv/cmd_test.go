package mpv

import (
	"strings"
	"testing"
)

func last(ops []Op) Op { return ops[len(ops)-1] }

func TestOpenOnlyWebAddresses(t *testing.T) {
	for _, u := range []string{"file:///C:/Windows/win.ini", "C:\\x.mkv", "edl://a", "smb://pc/x", "https://a.b/x\nfoo", "ytdl://x", "memory://x", ""} {
		if _, err := Open(`{"url":` + quote(u) + `}`); err == nil {
			t.Errorf("accepted %q", u)
		}
	}
	ops, err := Open(`{"url":"https://cdn.example/film.mkv","start":90.5,"alang":"en,eng,<x>","slang":"","headers":{"Referer":"https://r/","User-Agent":"UA","X-Ok":"1","Bad Key":"x","X-Inj":"a\r\nb"}}`)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	var hdrs []string
	for _, o := range ops {
		if o.Prop != "" {
			got[o.Prop] = o.Val
		} else if o.Args[0] == "change-list" && o.Args[2] == "append" {
			hdrs = append(hdrs, o.Args[3])
		}
	}
	if got["start"] != "90.5" || got["alang"] != "en,eng" || got["sid"] != "no" || got["referrer"] != "https://r/" || got["user-agent"] != "UA" {
		t.Errorf("props %v", got)
	}
	if len(hdrs) != 1 || hdrs[0] != "X-Ok: 1" {
		t.Errorf("headers %v", hdrs)
	}
	if l := last(ops); l.Args[0] != "loadfile" || l.Args[1] != "https://cdn.example/film.mkv" {
		t.Errorf("last %v", l)
	}
}

func quote(s string) string {
	return `"` + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), "\n", `\n`) + `"`
}

func TestSubs(t *testing.T) {
	ops, err := AddSub(`{"text":"1\n00:00:01,000 --> 00:00:02,000\nHi","title":"English · OpenSubtitles","lang":"en"}`)
	if err != nil || !strings.HasPrefix(ops[0].Args[1], "memory://1") || ops[0].Args[4] != "en" {
		t.Fatalf("%v %v", ops, err)
	}
	if _, err := AddSub(`{"url":"file:///etc/passwd"}`); err == nil {
		t.Error("file subtitle accepted")
	}
}

func TestTranslateClampsAndRejects(t *testing.T) {
	cases := map[[2]string]string{
		{"volume", "500"}: "200", {"volume", "-3"}: "0", {"speed", "9"}: "4", {"aid", "2"}: "2", {"sid", "no"}: "no",
		{"subscale", "1.25"}: "1.25", {"aspect", "16:9"}: "16:9", {"zoom", "2"}: "1",
	}
	for in, want := range cases {
		ops, err := Translate(in[0], in[1])
		if err != nil || ops[0].Val != want {
			t.Errorf("%v → %v %v, want %s", in, ops, err, want)
		}
	}
	for _, in := range [][2]string{{"aid", "1;quit"}, {"seek", "NaN"}, {"aspect", "1:1,vf=x"}, {"sound", "lavfi=[x]"}, {"run", "calc"}, {"subremove", "auto"}, {"eq", "nope"}} {
		if _, err := Translate(in[0], in[1]); err == nil {
			t.Errorf("accepted %v", in)
		}
	}
	ops, _ := Translate("eq", `{"brightness":150,"contrast":-20,"evil":5}`)
	if len(ops) != 2 || ops[0].Val != "100" || ops[1].Val != "-20" {
		t.Errorf("eq %v", ops)
	}
}

func TestState(t *testing.T) {
	s := NewState()
	g := s.Opened()
	s.Set("time-pos", "12.500000", true)
	s.Set("pause", "no", true)
	s.Set("duration", "", false)
	s.Set("track-list", `[{"id":1,"type":"audio","lang":"eng"}]`, true)
	j := s.Flush(nil)
	for _, w := range []string{`"t":12.5`, `"paused":false`, `"dur":null`, `"lang":"eng"`, `"gen":` + string(rune('0'+g))} {
		if !strings.Contains(j, w) {
			t.Errorf("%s missing %s", j, w)
		}
	}
	if s.Flush(nil) != "" {
		t.Error("second flush not empty")
	}
}
