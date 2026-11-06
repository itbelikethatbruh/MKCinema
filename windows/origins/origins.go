// Package origins is the one list of web addresses MKCinema's desktop code trusts. The installed apps
// open mkcinema.pages.dev (their saved sign-in and settings live on that origin); the web app's public home is
// app.mkcinema.app. Both are accepted everywhere a page is checked: the local p2p and download servers and the
// Windows bridge.
package origins

import (
	"net/url"
	"strconv"
	"strings"
)

// Hosts are the app's own host names, the first being the one the installed apps open.
var Hosts = []string{"mkcinema.pages.dev", "app.mkcinema.app"}

// AppHost reports whether host (no port) is one of the app's own hosts.
func AppHost(host string) bool {
	host = strings.ToLower(host)
	for _, h := range Hosts {
		if host == h {
			return true
		}
	}
	return false
}

// AppURL reports whether a page address is an https page on one of the app's own hosts (default port only).
func AppURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.User != nil || u.Port() != "" {
		return false
	}
	return AppHost(u.Hostname())
}

// Allowed reports whether a request's Origin header may read from the local servers. Origins are compared exactly:
// https on the app's own hosts, and plain http on localhost / 127.0.0.1 (any port) for local testing. Pages preview
// branches (*.mkcinema.pages.dev) and look-alikes such as http://localhost.evil.com are refused.
func Allowed(o string) bool {
	for _, h := range Hosts {
		if o == "https://"+h {
			return true
		}
	}
	if !strings.HasPrefix(o, "http://") {
		return false
	}
	u, err := url.Parse(o)
	if err != nil || u.Scheme != "http" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	if p := u.Port(); p != "" {
		if n, err := strconv.Atoi(p); err != nil || n <= 0 || n > 65535 {
			return false
		}
	}
	h := u.Hostname()
	return h == "localhost" || h == "127.0.0.1"
}
