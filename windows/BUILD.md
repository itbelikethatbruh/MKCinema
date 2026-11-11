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

## 1.3.1

- Torrent engine (`p2p/`, also `mkp2p` on Android, Mac and Linux): each torrent lives in its own `p2p/<info hash>`
  folder, and cleanup only ever removes those folders.
- The bound functions (`mkP2P`, `mkPresence`, `mkDL`) and `window.MKDesktop` are available on
  https://mkcinema.pages.dev and https://app.mkcinema.app, and run off the window's thread so a slow call can't
  freeze it. Other sites open in the default browser (the MyAnimeList sign-in still opens in the window), and
  app.mkcinema.app links open on mkcinema.pages.dev, where the user is signed in.
- Downloads are saved as video files (.mkv .mp4 .m4v .webm .avi .mov .ts .m2ts; anything else becomes .mkv).
  "Open in my player" opens finished films from the downloads folder.
- The local p2p and download servers answer the two app hosts, plus http://localhost and http://127.0.0.1 for testing.
- Discord status accepts the page's fractional timestamps (it used to fail while a film played).

`go vet ./...` and `go test ./...` run on Linux too (the Windows-only files are build-tagged; `origins/`, `p2p/`,
`dl/` and the Discord status parsing have tests).

## 1.3.2

- Pass server (`pass/`): for hosts that do not let web pages read their files, the in-app engine asks a small local
  server (127.0.0.1, random token, public hosts only, GET and HEAD with Range only, answers readable only by
  MKCinema's own pages) to make the Range requests. Dolby, DTS and TrueHD sound is converted to AAC and HEVC decoded
  on those hosts too, so they play in the app without VLC.
