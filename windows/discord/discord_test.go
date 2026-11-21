package discord

import "testing"

// the page sends fractional milliseconds; they must not make the status fail.
func TestParseFractionalTimes(t *testing.T) {
	a, err := Parse(`{"title":"Film","start":1762430000000.678,"end":1762437200000.2,"paused":false}`)
	if err != nil {
		t.Fatal(err)
	}
	if a.Start != 1762430000001 || a.End != 1762437200000 || a.Title != "Film" {
		t.Fatalf("got %+v", a)
	}
	if _, err := Parse(`{"start":1.5,"end":2.5}`); err != nil {
		t.Fatal(err)
	}
	a, err = Parse(`{"title":"Paused film","start":0,"paused":true}`)
	if err != nil || a.Start != 0 || a.End != 0 || !a.Paused {
		t.Fatalf("paused: %+v %v", a, err)
	}
	a, err = Parse(`{"title":"x","start":-5,"end":1e300}`)
	if err != nil || a.Start != 0 || a.End != 0 {
		t.Fatalf("out of range: %+v %v", a, err)
	}
	if _, err := Parse(`{"start":"soon"}`); err == nil {
		t.Fatal("a string time was accepted")
	}
}
