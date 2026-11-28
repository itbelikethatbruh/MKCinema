package mpv

import (
	"embed"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
)

// Sharp upscaling in the native player (Windows 1.6.3, Android 1.17.18): the web player's Settings › Playback ›
// Sharp upscaling, done by mpv. The page names a mode, never a filter or a file:
//
//	off    mpv's own scaler (lanczos), as before
//	soft   Natural: light contrast-adaptive sharpening at the film's own size, then mpv upscales
//	crisp  Crisp: stronger sharpening, then a sharper polar scaler (ewa_lanczossharp)
//	vsr    the graphics card's own AI upscaler (NVIDIA RTX Video Super Resolution, Intel VSR) through Direct3D 11's
//	       video processor, by f (1 to 4). Only offered when VSR names the card's maker.
//
// The sharpening shader has a WHEN line, so it only runs when the picture is shown clearly bigger than the file.

//go:embed shaders/*.glsl
var shaderFS embed.FS

// VSR is "nvidia" or "intel" when the PC's main graphics card can do video super resolution ("" = it can't).
var VSR string

var shaderDir string

// WriteShaders puts the sharpening shaders into dir (mpv reads shaders from files). Call once before "upscale".
func WriteShaders(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	ents, _ := shaderFS.ReadDir("shaders")
	for _, e := range ents {
		b, _ := shaderFS.ReadFile("shaders/" + e.Name())
		if err := os.WriteFile(filepath.Join(dir, e.Name()), b, 0o644); err != nil {
			return err
		}
	}
	shaderDir = dir
	return nil
}

// UpReq is what the page sends: {"mode":"crisp"} or {"mode":"vsr","f":2}.
type UpReq struct {
	Mode string  `json:"mode"`
	F    float64 `json:"f"`
}

// Upscale returns the mpv steps for one upscaling mode. Every mode first undoes the others.
func Upscale(raw string) ([]Op, error) {
	var r UpReq
	if json.Unmarshal([]byte(raw), &r) != nil {
		r.Mode = raw // a bare mode name works too
	}
	ops := []Op{cmd("vf", "remove", "@mkvsr"), cmd("change-list", "glsl-shaders", "clr", "")}
	switch r.Mode {
	case "off":
		return append(ops, set("scale", "lanczos")), nil
	case "soft", "crisp":
		if shaderDir == "" {
			return nil, ErrBad
		}
		sc := map[string]string{"soft": "lanczos", "crisp": "ewa_lanczossharp"}[r.Mode]
		return append(ops, set("scale", sc), cmd("change-list", "glsl-shaders", "append", filepath.Join(shaderDir, "mk-sharpen-"+r.Mode+".glsl"))), nil
	case "vsr":
		if VSR != "nvidia" && VSR != "intel" {
			return nil, ErrBad
		}
		v, err := f(strconv.FormatFloat(r.F, 'f', -1, 64), 1, 4)
		if err != nil {
			return nil, err
		}
		// two decimals are plenty; mpv's d3d11vpp takes the factor and the maker's mode
		x, _ := strconv.ParseFloat(v, 64)
		v = strconv.FormatFloat(float64(int(x*100+0.5))/100, 'f', -1, 64)
		return append(ops, set("scale", "lanczos"), cmd("vf", "append", "@mkvsr:d3d11vpp=scale="+v+":scaling-mode="+VSR)), nil
	}
	return nil, ErrBad
}
