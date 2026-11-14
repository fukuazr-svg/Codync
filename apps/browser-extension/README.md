# Codync Browser

Codync Browser is a Manifest V3 extension that lets a bot operate a dedicated background tab on
the Windows computer it is running on. The host remains the authority: every request carries the
exact host, bot, user message, browser tab and generation, and a missing host never selects a
different computer.

## Permissions

- `nativeMessaging`: connects to the local, same-user `dev.codync.browser` helper. The helper reads
  the normal loopback token and transfers protocol messages; the bearer token never enters the
  extension.
- `debugger`: sends real mouse and keyboard input and captures the page from the dedicated tab.
- `tabs`: creates, navigates, identifies and closes the one tab bound to a user message.
- `storage`: remembers the current bridge status and tab binding across service-worker restarts.

The extension requests no web-origin host permission. It opens only `http` and `https` URLs.

## Local installation

For a development build, install the native helper first:

```powershell
$repo = (Resolve-Path .).Path # Run this from the repository root.
Push-Location "$repo\host"
cargo build --release --bin codync-browser-native-host
Pop-Location
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$repo\apps\browser-extension\install-native-host.ps1" `
  -Executable "$repo\host\target\release\codync-browser-native-host.exe"
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this
folder. The manifest's fixed public key gives the extension ID
`dgejialhpalhoigbkmgeabgpphlipiek`. Open the extension popup after Codync is running and confirm it
says **Connected to Codync**.

The native helper manifest is written under the current user's local app data and registered with
both Chrome and Edge. To remove those registrations, run the same helper with
`--uninstall-native-messaging`, then remove the extension from `chrome://extensions`.

## Safety behavior

- A bot gets one dedicated background tab per user message. Existing signed-in tabs are never
  selected implicitly.
- A stale generation or a different host, bot, message or tab is rejected.
- A click or text insertion requires a selector that matches exactly one element. Every action runs
  once. Timeouts are reported and never replayed.
- Stopping the bot, ending the turn or calling `browser_stop` closes the dedicated tab.
- With no native connection, browser tools fail explicitly. There is no alternate-profile,
  alternate-browser or cross-computer fallback.
