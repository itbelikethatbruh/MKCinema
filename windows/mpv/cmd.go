// Package mpv drives libmpv for MKCinema's native player (Windows 1.6.0): the video plays in a native window under
// the app's web page, and the page's own player controls, subtitles tools and features drive it through
// MKDesktop.player. This file is the portable part: it checks every command the page sends and turns it into mpv
// commands, so the page can never pass raw mpv options, local file paths or scripts. It is tested on any system.
package mpv

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Op is one thing to tell mpv: a property to set (Prop != "") or a command (Args).
type Op struct {
	Prop, Val string
	Args      []string
}

func set(p, v string) Op              { return Op{Prop: p, Val: v} }
func cmd(a ...string) Op              { return Op{Args: a} }
func num(f float64) string            { return strconv.FormatFloat(f, 'f', -1, 64) }
func clamp(f, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, f)) }

var ErrBad = errors.New("not allowed")

// OpenReq is what the page sends to start a film.
type OpenReq struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
	Start   float64           `json:"start"` // seconds
	ALang   string            `json:"alang"` // preferred audio languages, "en,eng"
	SLang   string            `json:"slang"` // preferred subtitle languages ("" = subtitles off until the page picks)
	Title   string            `json:"title"`
}

// SubReq adds a subtitle file: from an address, or its text (downloaded, converted or translated by the page).
type SubReq struct {
	URL   string `json:"url"`
	Text  string `json:"text"`
	Title string `json:"title"`
	Lang  string `json:"lang"`
}

var (
	langRe   = regexp.MustCompile(`^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$`)
	hdrKeyRe = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)
	aspectRe = regexp.MustCompile(`^(-1|no|\d{1,2}(\.\d{1,3})?(:\d{1,2})?)$`)
)

// WebURL: films and subtitles come over http(s) only, never file:, smb:, edl:// or other mpv protocols.
func WebURL(s string) bool {
	if len(s) > 8000 || strings.ContainsAny(s, "\r\n\x00") {
		return false
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

func langs(s string) string {
	var out []string
	for _, l := range strings.Split(s, ",") {
		if l = strings.TrimSpace(l); langRe.MatchString(l) && len(out) < 8 {
			out = append(out, strings.ToLower(l))
		}
	}
	return strings.Join(out, ",")
}

func clean(s string, n int) string {
	s = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, s)
	if len(s) > n {
		s = s[:n]
	}
	return s
}

// Open turns an open request into the mpv steps that start the film.
func Open(raw string) ([]Op, error) {
	var r OpenReq
	if err := json.Unmarshal([]byte(raw), &r); err != nil || !WebURL(r.URL) {
		return nil, ErrBad
	}
	ops := []Op{
		cmd("change-list", "http-header-fields", "clr", ""),
		set("user-agent", "libmpv"),
		set("referrer", ""),
		set("start", num(clamp(r.Start, 0, 1e7))),
		set("alang", langs(r.ALang)),
		set("slang", langs(r.SLang)),
		set("force-media-title", clean(r.Title, 300)),
	}
	if r.SLang == "" {
		ops = append(ops, set("sid", "no"))
	} else {
		ops = append(ops, set("sid", "auto"))
	}
	ops = append(ops, set("aid", "auto"), set("pause", "no"))
	n := 0
	for k, v := range r.Headers {
		if !hdrKeyRe.MatchString(k) || strings.ContainsAny(v, "\r\n\x00") || len(v) > 2000 || n >= 16 {
			continue
		}
		n++
		switch strings.ToLower(k) {
		case "user-agent":
			ops[1] = set("user-agent", v)
		case "referer":
			ops[2] = set("referrer", v)
		default:
			ops = append(ops, cmd("change-list", "http-header-fields", "append", k+": "+v))
		}
	}
	return append(ops, cmd("loadfile", r.URL, "replace")), nil
}

// AddSub turns a subtitle request into an mpv sub-add (the new track is selected).
func AddSub(raw string) ([]Op, error) {
	var r SubReq
	if err := json.Unmarshal([]byte(raw), &r); err != nil {
		return nil, ErrBad
	}
	title, lang := clean(r.Title, 200), ""
	if langRe.MatchString(r.Lang) {
		lang = strings.ToLower(r.Lang)
	}
	src := r.URL
	if r.Text != "" {
		if len(r.Text) > 8<<20 {
			return nil, ErrBad
		}
		// memory:// hands mpv the text itself; mpv recognises SRT, WebVTT and ASS from the text
		src = "memory://" + r.Text
	} else if !WebURL(src) {
		return nil, ErrBad
	}
	args := []string{"sub-add", src, "select", title}
	if lang != "" {
		args = append(args, lang)
	}
	return []Op{cmd(args...)}, nil
}

func f(arg string, lo, hi float64) (string, error) {
	v, err := strconv.ParseFloat(strings.TrimSpace(arg), 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return "", ErrBad
	}
	return num(clamp(v, lo, hi)), nil
}

func track(arg string) (string, error) {
	if arg == "no" || arg == "auto" {
		return arg, nil
	}
	n, err := strconv.Atoi(arg)
	if err != nil || n < 1 || n > 999 {
		return "", ErrBad
	}
	return strconv.Itoa(n), nil
}

// Sound modes from the player's Audio tab, as fixed mpv audio filters (the page names a mode, never a filter).
var soundModes = map[string]string{
	"off":   "",
	"voice": "lavfi=[highpass=f=120,equalizer=f=2500:t=q:w=1.2:g=5,acompressor=threshold=-20dB:ratio=3:attack=10:release=200]",
	"night": "lavfi=[acompressor=threshold=-28dB:ratio=6:attack=5:release=250:makeup=6dB,alimiter=limit=0.9]",
}

// Translate checks one page command and returns the mpv steps for it.
func Translate(c, arg string) ([]Op, error) {
	var v string
	var err error
	switch c {
	case "open":
		return Open(arg)
	case "subadd":
		return AddSub(arg)
	case "play":
		return []Op{set("pause", "no")}, nil
	case "pause":
		return []Op{set("pause", "yes")}, nil
	case "stop":
		return []Op{cmd("stop")}, nil
	case "seek":
		if v, err = f(arg, 0, 1e7); err == nil {
			return []Op{cmd("seek", v, "absolute+exact")}, nil
		}
	case "volume": // 0 to 200 %, the web player's Volume to 200 %
		if v, err = f(arg, 0, 200); err == nil {
			return []Op{set("volume", v)}, nil
		}
	case "mute":
		return []Op{set("mute", map[bool]string{true: "yes", false: "no"}[arg == "1" || arg == "true"])}, nil
	case "speed":
		if v, err = f(arg, 0.1, 4); err == nil {
			return []Op{set("speed", v)}, nil
		}
	case "aid", "sid", "secondary-sid":
		if v, err = track(arg); err == nil {
			return []Op{set(c, v)}, nil
		}
	case "subremove":
		if v, err = track(arg); err == nil && v != "no" && v != "auto" {
			return []Op{cmd("sub-remove", v)}, nil
		}
		return nil, ErrBad
	case "subdelay", "audiodelay": // seconds
		if v, err = f(arg, -600, 600); err == nil {
			return []Op{set(map[string]string{"subdelay": "sub-delay", "audiodelay": "audio-delay"}[c], v)}, nil
		}
	case "subscale":
		if v, err = f(arg, 0.3, 4); err == nil {
			return []Op{set("sub-scale", v)}, nil
		}
	case "subpos": // 0 top, 100 bottom
		if v, err = f(arg, 0, 150); err == nil {
			return []Op{set("sub-pos", v)}, nil
		}
	case "aspect":
		if !aspectRe.MatchString(arg) {
			return nil, ErrBad
		}
		return []Op{set("video-aspect-override", arg)}, nil
	case "fill": // fill the screen by cropping (the player's Fill / Zoom)
		return []Op{set("panscan", map[bool]string{true: "1.0", false: "0.0"}[arg == "1"])}, nil
	case "zoom": // 1 = 100 %
		if v, err = f(arg, 0.25, 4); err == nil {
			z, _ := strconv.ParseFloat(v, 64)
			return []Op{set("video-zoom", num(math.Log2(z)))}, nil
		}
	case "eq": // picture adjustments, each -100..100
		var m map[string]float64
		if json.Unmarshal([]byte(arg), &m) != nil {
			return nil, ErrBad
		}
		var ops []Op
		for _, k := range []string{"brightness", "contrast", "saturation", "gamma", "hue"} {
			if x, ok := m[k]; ok && !math.IsNaN(x) {
				ops = append(ops, set(k, fmt.Sprintf("%d", int(clamp(x, -100, 100)))))
			}
		}
		return ops, nil
	case "sound":
		af, ok := soundModes[arg]
		if !ok {
			return nil, ErrBad
		}
		return []Op{set("af", af)}, nil
	case "frame":
		if arg == "prev" {
			return []Op{cmd("frame-back-step")}, nil
		}
		return []Op{cmd("frame-step")}, nil
	case "chapter":
		var n int
		if n, err = strconv.Atoi(arg); err == nil && n >= 0 && n < 1000 {
			return []Op{set("chapter", strconv.Itoa(n))}, nil
		}
	case "deband":
		return []Op{set("deband", map[bool]string{true: "yes", false: "no"}[arg == "1"])}, nil
	default:
		return nil, fmt.Errorf("unknown command %q", c)
	}
	if err == nil {
		err = ErrBad
	}
	return nil, err
}
