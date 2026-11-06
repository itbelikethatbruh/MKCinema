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

## 1.4.0: share downloads with a TV

`Manager.Share` (dl/dl.go) serves finished downloads on all network adapters at port 47990 (another free port if
that one is taken), under a secret key kept in `share.key` in the data folder: `/<key>/f/<id>` (Range supported) and
`/<key>/list`. The page turns it on with `MKDesktop.dl.share(true)` and gets `{on, base, name}`; base uses the PC's
home network address. The web app puts that address and the list of finished films in the user's synced settings
(`CFG.pcShare`), and the TV plays `base/f/<id>` in its own player. Windows Firewall asks once the first time.
