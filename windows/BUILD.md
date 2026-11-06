# MKCinema for Windows

A small Go program that opens https://mkcinema.pages.dev in its own window through Microsoft Edge WebView2
(built into Windows 10 and 11). Data and a log file (`mkcinema.log`) are kept in `%LOCALAPPDATA%\MKCinema`.

Build (from Linux or Windows, Go 1.24+):

    go install github.com/akavel/rsrc@v0.10.2
    rsrc -arch amd64 -ico mkcinema.ico -manifest app.manifest -o rsrc_windows_amd64.syso
    GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o MKCinema.exe .

`webview2/` is a patched copy of go-webview2 (see `webview2/MKCINEMA.md`); `go.mod` points at it.

What the app does on start:

- Opens one window only. Starting it again brings the open window to the front.
- Checks for the WebView2 Runtime and offers Microsoft's download page when it is missing or broken.
- Loads WebView2Loader.dll from `%LOCALAPPDATA%\MKCinema\runtime` rather than from memory.
- Shows a message for every start-up failure and writes details to `mkcinema.log`. Go crashes are written there too.
- Sizes the window to the screen and display scale, starts maximized on small screens, and remembers its size and position.
- Video fullscreen fills the screen; F11 toggles fullscreen. Links that open a new window go to the default browser.
- Reloads the page if it crashes, and offers a restart if the web engine stops.

Requires Windows 10 or 11, 64-bit (Go 1.21+ doesn't run on Windows 7/8).

The exe is not code-signed, so Windows SmartScreen shows "Windows protected your PC" on first run (More info > Run anyway). A code-signing certificate removes that.

## 1.3.0: offline downloads

`dl/` keeps downloads in `Videos\MKCinema` (the index is `downloads.json` in the data folder). The page reaches it as
`window.MKDesktop.dl` (start, list, remove, url, open, folder) through the bound `mkDL` function. At most two run at once.
They resume after a dropped connection or a restart while the link still allows it. Finished files are served to the
in-app player on 127.0.0.1 with a random token, and "Open in my player" hands the file to Windows' default video app.
Subtitles are saved next to the film as .srt or .vtt, so VLC picks them up.

## 1.3.1: security fixes (audit 2.37.0)

- Torrent engine (`p2p/`, also `mkp2p` on Android, Mac and Linux): each torrent lives in `p2p/<info hash>` and only
  those hash folders are ever deleted, so a torrent's own name can't point a delete outside the cache. Torrents whose
  names or file paths try to leave their folder are dropped. `go test ./p2p` covers a torrent named `../../..`.
- The bound functions (`mkP2P`, `mkPresence`, `mkDL`) and `window.MKDesktop` exist and answer only on
  https://mkcinema.pages.dev and https://app.mkcinema.app (the page address behind every call is checked), and they
  run off the window's thread. The window itself stays on MKCinema: other sites open in the default browser (the
  MyAnimeList sign-in still opens in the window), and app.mkcinema.app links open on mkcinema.pages.dev, where the
  user is signed in.
- Downloads are always saved as video files (.mkv .mp4 .m4v .webm .avi .mov .ts .m2ts; anything else becomes .mkv)
  with the Mark of the Web (Zone.Identifier, Internet zone). "Open in my player" opens only finished films inside the
  downloads folder. Cookie, Host and connection headers from the page are dropped.
- The local p2p and download servers answer only exact origins (the two app hosts, and http://localhost or
  http://127.0.0.1 for testing); Pages preview branches and look-alike hosts are refused.
- Discord status accepts the page's fractional timestamps (it used to fail while a film played).

`go vet ./...` and `go test ./...` run on Linux too (the Windows-only files are build-tagged; `origins/`, `p2p/`,
`dl/` and the Discord status parsing have tests).
