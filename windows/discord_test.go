package main

import "testing"

// the page sends fractional milliseconds; they must not make the status fail.
func TestParseActivityFractionalTimes(t *testing.T) {
	a, err := parseActivity(`{"title":"Film","start":1762430000000.678,"end":1762437200000.2,"paused":false}`)
	if err != nil {
		t.Fatal(err)
	}
	if a.Start != 1762430000001 || a.End != 1762437200000 || a.Title != "Film" {
		t.Fatalf("got %+v", a)
	}
	if _, err := parseActivity(`{"start":1.5,"end":2.5}`); err != nil {
		t.Fatal(err)
	}
	a, err = parseActivity(`{"title":"Paused film","start":0,"paused":true}`)
	if err != nil || a.Start != 0 || a.End != 0 || !a.Paused {
		t.Fatalf("paused: %+v %v", a, err)
	}
	a, err = parseActivity(`{"title":"x","start":-5,"end":1e300}`)
	if err != nil || a.Start != 0 || a.End != 0 {
		t.Fatalf("out of range: %+v %v", a, err)
	}
	if _, err := parseActivity(`{"start":"soon"}`); err == nil {
		t.Fatal("a string time was accepted")
	}
}
