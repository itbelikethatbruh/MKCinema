# MKCinema for Windows

A small Go program that opens https://mkcinema.pages.dev in its own window through Microsoft Edge WebView2 (built into Windows 10 and 11). Data is kept in %LOCALAPPDATA%\MKCinema.

Build (from Linux or Windows, Go 1.24+):

    go install github.com/akavel/rsrc@latest
    rsrc -arch amd64 -ico mkcinema.ico -manifest app.manifest -o rsrc_windows_amd64.syso
    GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o MKCinema.exe .

The exe is not code-signed, so Windows SmartScreen shows "Windows protected your PC" on first run (More info > Run anyway). A code-signing certificate removes that.
