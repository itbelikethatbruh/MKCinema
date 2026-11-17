# go-webview2, MKCinema copy

A copy of github.com/jchv/go-webview2 (v0.0.0-20260205173254-56598839c808, MIT, see LICENSE) with fixes
for crashes that made the Windows app close on launch with no message. Only the x64 loader DLL is kept.

- `pkg/edge/chromium.go`: HRESULT failures were tested with `int64(res) < 0`, which is never true for a
  32-bit HRESULT on 64-bit Windows, so a failed WebView2 start crashed later on a nil pointer. Failures are
  now caught (`int32`), stored in `edge.LastError` and returned, instead of `log.Fatal` (a silent exit in a
  GUI app). `PermissionRequested` passed the permission kind by value instead of by pointer.
- `webview.go`: no `log.Fatal`; a failed start destroys the window without posting WM_QUIT (which closed the
  error dialog); `WindowOptions.BeforeShow`, `OnClose`, `OnSize`, `Chromium()` hooks; black window background.
- `pkg/edge/mkcinema_ext.go`: video fullscreen, new-window and process-failed events, `Reload`.
