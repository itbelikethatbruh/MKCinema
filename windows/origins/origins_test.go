package origins

import "testing"

func TestAllowedOrigin(t *testing.T) {
	for o, want := range map[string]bool{
		"https://mkcinema.pages.dev":          true,
		"https://app.mkcinema.app":            true,
		"http://localhost":                    true,
		"http://localhost:8080":               true,
		"http://127.0.0.1:5173":               true,
		"":                                    false,
		"null":                                false,
		"http://localhost.evil.com":           false,
		"http://127.0.0.1.evil.com":           false,
		"http://localhost:80@evil.com":        false,
		"http://localhost:99999":              false,
		"https://evil.mkcinema.pages.dev":     false,
		"https://x.mkcinema.pages.dev":        false,
		"https://mkcinema.pages.dev.evil.com": false,
		"http://mkcinema.pages.dev":           false,
		"https://app.mkcinema.app:444":        false,
		"https://evil.com":                    false,
	} {
		if got := Allowed(o); got != want {
			t.Errorf("Allowed(%q) = %v, want %v", o, got, want)
		}
	}
}

func TestAppURL(t *testing.T) {
	for u, want := range map[string]bool{
		"https://mkcinema.pages.dev/":                true,
		"https://app.mkcinema.app/#title?x=1":        true,
		"https://APP.mkcinema.app/":                  true,
		"http://mkcinema.pages.dev/":                 false,
		"https://mkcinema.pages.dev:8443/":           false,
		"https://evil.com/?https://app.mkcinema.app": false,
		"https://x.mkcinema.pages.dev/":              false,
		"https://user@mkcinema.pages.dev/":           false,
		"about:blank":                                false,
		"":                                           false,
	} {
		if got := AppURL(u); got != want {
			t.Errorf("AppURL(%q) = %v, want %v", u, got, want)
		}
	}
}
