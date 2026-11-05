package main

// Desktop-only extras the web app can use through window.MKDesktop:
//   - p2p: a torrent engine on this computer. Off until the user turns it on in Settings, never uploads,
//     and deletes what it downloaded when it stops or the app closes.
//   - presence: Discord "Now watching" status, only when the user turns it on and Discord is running.

import (
	"encoding/json"
	"log"
	"sync"

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

// mkPresence(json) sets the Discord activity; an empty string clears it.
func mkPresence(raw string) (bool, error) {
	if raw == "" {
		presenceClear()
		return true, nil
	}
	var a activity
	if err := json.Unmarshal([]byte(raw), &a); err != nil {
		return false, err
	}
	return presenceSet(a), nil
}

func desktopInit() string {
	b, _ := json.Marshal(map[string]any{"platform": "windows", "version": version, "presence": discordAppID != ""})
	return `(function(){var d=` + string(b) + `;
d.p2p={start:function(){return window.mkP2P('start')},stop:function(){return window.mkP2P('stop')}};
if(d.presence)d.setPresence=function(a){return window.mkPresence(a?JSON.stringify(a):'')};
window.MKDesktop=d;})();`
}
