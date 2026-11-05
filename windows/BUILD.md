# MKCinema for Windows

A small Go program that opens https://mkcinema.pages.dev in its own window through Microsoft Edge WebView2
(built into Windows 10 and 11). Data and a log file (`mkcinema.log`) are kept in `%LOCALAPPDATA%\MKCinema`.

Build (from Linux or Windows, Go 1.24+):

    go install github.com/akavel/rsrc@v0.10.2
    rsrc -arch amd64 -ico mkcinema.ico -manifest app.manifest -o rsrc_windows_amd64.syso
    GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o MKCinema.exe .

Discord status uses MKCinema's Discord application (id 1567818702479425586, set in `discord.go`). A fork can use its own
with `-ldflags "-s -w -H windowsgui -X main.discordAppID=<id>"`, or turn it off with an empty id.

`webview2/` is a patched copy of go-webview2 (see `webview2/MKCINEMA.md`); `go.mod` points at it.

What the app does on start:

- Opens one window only. Starting it again brings the open window to the front.
- Checks for the WebView2 Runtime and offers Microsoft's download page when it is missing or broken.
- Loads WebView2Loader.dll from `%LOCALAPPDATA%\MKCinema\runtime` rather than from memory.
- Shows a message for every start-up failure and writes details to `mkcinema.log`. Go crashes are written there too.
- Sizes the window to the screen and display scale, starts maximized on small screens, and remembers its size and position.
- Video fullscreen fills the screen; F11 toggles fullscreen. Links that open a new window go to the default browser.
- Reloads the page if it crashes, and offers a restart if the web engine stops.

Desktop extras (1.2.0), both off until the user turns them on in Settings › Desktop app:

- Torrent sources play on this PC (`p2p/`, anacrolix/torrent). Download only: no uploading, no seeding, no port
  forwarding. It serves the file to the app on 127.0.0.1 with a random port and token, keeps at most two torrents,
  and deletes `%LOCALAPPDATA%\MKCinema\p2p` when it is turned off or the app closes. Peers can see the user's IP,
  and Settings says so before it can be turned on.
- Discord status ("Watching" and the title) through Discord's local pipe (`discord.go`).

Requires Windows 10 or 11, 64-bit (Go 1.21+ doesn't run on Windows 7/8).

The exe is not code-signed, so Windows SmartScreen shows "Windows protected your PC" on first run (More info > Run anyway). A code-signing certificate removes that.
