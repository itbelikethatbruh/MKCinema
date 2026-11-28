package mpv

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUpscaleModes(t *testing.T) {
	dir := t.TempDir()
	if err := WriteShaders(dir); err != nil {
		t.Fatal(err)
	}
	for _, m := range []string{"soft", "crisp"} {
		b, err := os.ReadFile(filepath.Join(dir, "mk-sharpen-"+m+".glsl"))
		if err != nil || !strings.Contains(string(b), "//!HOOK MAIN") || !strings.Contains(string(b), "//!WHEN") {
			t.Fatalf("%s shader: %v", m, err)
		}
		ops, err := Translate("upscale", `{"mode":"`+m+`"}`)
		if err != nil {
			t.Fatal(err)
		}
		if ops[0].Args[0] != "vf" || ops[0].Args[1] != "remove" || ops[1].Args[2] != "clr" {
			t.Errorf("%s does not undo the others first: %v", m, ops)
		}
		l := last(ops)
		if l.Args[0] != "change-list" || l.Args[2] != "append" || l.Args[3] != filepath.Join(dir, "mk-sharpen-"+m+".glsl") {
			t.Errorf("%s last %v", m, l)
		}
	}
	if ops, err := Translate("upscale", "off"); err != nil || last(ops).Prop != "scale" || last(ops).Val != "lanczos" {
		t.Errorf("off: %v %v", ops, err)
	}
	VSR = ""
	if _, err := Translate("upscale", `{"mode":"vsr","f":2}`); err == nil {
		t.Error("vsr offered without a card that has it")
	}
	VSR = "nvidia"
	defer func() { VSR = "" }()
	ops, err := Translate("upscale", `{"mode":"vsr","f":1.98765}`)
	if err != nil || strings.Join(last(ops).Args, " ") != "vf append @mkvsr:d3d11vpp=scale=1.99:scaling-mode=nvidia" {
		t.Errorf("vsr: %v %v", ops, err)
	}
	ops, _ = Translate("upscale", `{"mode":"vsr","f":40}`)
	if !strings.Contains(last(ops).Args[2], "scale=4:") {
		t.Errorf("vsr factor not clamped: %v", ops)
	}
	for _, bad := range []string{`{"mode":"x"}`, `{"mode":"../../evil"}`, `lavfi=[x]`, ``} {
		if _, err := Translate("upscale", bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}
