//go:build windows

package main

// Desktop-only extras the web app can use through window.MKDesktop:
//   - p2p: a torrent engine on this computer. Off until the user turns it on in Settings, never uploads,
//     and deletes what it downloaded when it stops or the app closes.
//   - presence: Discord "Now watching" status, only when the user turns it on and Discord is running.
//   - dl (1.3.0): offline downloads into Videos\MKCinema, played in MKCinema or in the user's own video player.

import (
	"encoding/json"
	"errors"
	"log"
	"path/filepath"
	"sync"

	"mkcinema/dl"
	engine "mkcinema/p2p"
)

var (
	p2pMu  sync.Mutex
	p2pEng *engine.Engine
)

// mkP2P("start") returns the local base URL; mkP2P("stop") stops the engine and deletes its cache.
func mkP2P(cmd string) (string, error) {
	p2pMu.Lock()
	defer p2pMu.Unlock()
	switch cmd {
	case "start":
		if p2pEng == nil {
			e, err := engine.Start(dataDir)
			if err != nil {
				log.Printf("p2p: start failed: %v", err)
				return "", err
			}
			p2pEng = e
		}
		return p2pEng.Base, nil
	case "stop":
		if p2pEng != nil {
			p2pEng.Close()
			p2pEng = nil
		}
		return "", nil
	}
	return "", nil
}

func stopP2P() { _, _ = mkP2P("stop") }

var (
	dlMu  sync.Mutex
	dlMgr *dl.Manager
)

func downloads() (*dl.Manager, error) {
	dlMu.Lock()
	defer dlMu.Unlock()
	if dlMgr == nil {
		m, err := dl.New("", filepath.Join(dataDir, "downloads.json"))
		if err != nil {
			log.Printf("dl: %v", err)
			return nil, err
		}
		dlMgr = m
	}
	return dlMgr, nil
}

// mkDL(cmd, arg): start (json) → id, list → json, remove/url/open (id), folder.
func mkDL(cmd, arg string) (string, error) {
	m, err := downloads()
	if err != nil {
		return "", err
	}
	switch cmd {
	case "start":
		return m.Start(arg)
	case "list":
		return m.List(), nil
	case "remove":
		return "", m.Remove(arg)
	case "url":
		return m.URL(arg)
	case "open":
		p, err := m.MediaPath(arg) // only a finished film inside the downloads folder, never a program
		if err != nil {
			return "", err
		}
		openExternal(p) // the user's default video player
		return "", nil
	case "folder":
		return "", dl.Reveal(m.Dir)
	}
	return "", errors.New("unknown command")
}

func stopDL() {
	dlMu.Lock()
	defer dlMu.Unlock()
	if dlMgr != nil {
		dlMgr.Close()
	}
}

// mkPresence(json) sets the Discord activity; an empty string clears it.
func mkPresence(raw string) (bool, error) {
	if raw == "" {
		presenceClear()
		return true, nil
	}
	a, err := parseActivity(raw)
	if err != nil {
		log.Printf("discord: %v", err)
		return false, err
	}
	return presenceSet(a), nil
}

func desktopInit() string {
	b, _ := json.Marshal(map[string]any{"platform": "windows", "version": version, "presence": discordAppID != ""})
	return `(function(){if(!(` + pageGuardJS + `))return;var d=` + string(b) + `;
d.p2p={start:function(){return window.mkP2P('start')},stop:function(){return window.mkP2P('stop')}};
if(d.presence)d.setPresence=function(a){return window.mkPresence(a?JSON.stringify(a):'')};
d.dl={start:function(o){return window.mkDL('start',JSON.stringify(o))},list:function(){return window.mkDL('list','').then(function(s){return JSON.parse(s||'[]')})},
remove:function(id){return window.mkDL('remove',String(id))},url:function(id){return window.mkDL('url',String(id))},open:function(id){return window.mkDL('open',String(id))},folder:function(){return window.mkDL('folder','')}};
window.MKDesktop=d;})();`
}
