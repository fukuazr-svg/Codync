//! Chrome native-messaging relay for the Codync Browser extension.
//!
//! Chrome owns stdin/stdout in the native-messaging protocol. This process reads the same-user
//! loopback token, opens the authenticated WebSocket, and relays only protocol frames. The token
//! never crosses into extension JavaScript.

use anyhow::{Context as _, Result, bail, ensure};
use futures::{SinkExt as _, StreamExt as _};
use serde_json::{Value, json};
use std::io::{Read, Write as _};
use std::path::PathBuf;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::{Message, http::header};

const MAX_FRAME: usize = 32 * 1024 * 1024;
const INSTALL_COMMAND: &str = "--install-native-messaging";
const UNINSTALL_COMMAND: &str = "--uninstall-native-messaging";
const NATIVE_HOST: &str = "dev.codync.browser";
const EXTENSION_ID: &str = "dgejialhpalhoigbkmgeabgpphlipiek";
const CHROME_REGISTRY: &str = r"HKCU\Software\Google\Chrome\NativeMessagingHosts\dev.codync.browser";
const EDGE_REGISTRY: &str = r"HKCU\Software\Microsoft\Edge\NativeMessagingHosts\dev.codync.browser";

#[tokio::main]
async fn main() {
    match std::env::args().nth(1).as_deref() {
        Some(INSTALL_COMMAND) => {
            if let Err(error) = install_native_messaging() {
                eprintln!("codync-browser-native-host: {error:#}");
                std::process::exit(1);
            }
            std::process::exit(0);
        }
        Some(UNINSTALL_COMMAND) => {
            if let Err(error) = uninstall_native_messaging() {
                eprintln!("codync-browser-native-host: {error:#}");
                std::process::exit(1);
            }
            std::process::exit(0);
        }
        _ => {}
    }
    if let Err(error) = run().await {
        let _ = write_native(&json!({
            "type": "bridgeError",
            "error": format!("{error:#}")
        }));
        eprintln!("codync-browser-native-host: {error:#}");
        std::process::exit(1);
    }
    // Chrome owns stdin. If Chrome remains open after the host WebSocket closes, aborting a
    // spawn_blocking stdin read does not interrupt the blocked read and Tokio waits for it while
    // dropping the runtime. Exit the helper so Chrome sees the native port close and reconnects
    // when Codync is available again.
    std::process::exit(0);
}

async fn run() -> Result<()> {
    let url = host_url()?;
    let token = std::fs::read_to_string(token_path()?).context("reading the Codync loopback token")?.trim().to_owned();
    if token.is_empty() {
        bail!("The Codync loopback token is empty");
    }

    let mut request = url.into_client_request()?;
    request.headers_mut().insert(header::AUTHORIZATION, format!("Bearer {token}").parse()?);
    let (socket, _) = tokio::time::timeout(Duration::from_secs(5), tokio_tungstenite::connect_async(request))
        .await
        .context("Connecting to Codync timed out")?
        .context("Connecting to Codync")?;
    let (mut sink, mut stream) = socket.split();

    let (from_chrome, mut chrome) = mpsc::channel::<String>(32);
    let reader = tokio::task::spawn_blocking(move || {
        let stdin = std::io::stdin();
        let mut input = stdin.lock();
        loop {
            let Some(message) = read_native(&mut input)? else {
                return Ok::<_, anyhow::Error>(());
            };
            if from_chrome.blocking_send(message).is_err() {
                return Ok(());
            }
        }
    });

    loop {
        tokio::select! {
            message = chrome.recv() => {
                let Some(message) = message else { break };
                sink.send(Message::Text(message.into())).await?;
            }
            message = stream.next() => {
                match message {
                    Some(Ok(Message::Text(text))) => write_native_text(text.as_str())?,
                    Some(Ok(Message::Binary(bytes))) => {
                        write_native_text(std::str::from_utf8(&bytes).context("Codync sent non-UTF-8 browser JSON")?)?;
                    }
                    Some(Ok(Message::Ping(_) | Message::Pong(_) | Message::Frame(_))) => {}
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(error)) => return Err(error).context("Codync browser WebSocket"),
                }
            }
        }
    }
    drop(chrome);
    reader.abort();
    Ok(())
}

fn host_url() -> Result<String> {
    if let Some(url) = std::env::var_os("CODYNC_BROWSER_HOST_URL") {
        let url = url.into_string().map_err(|_| anyhow::anyhow!("CODYNC_BROWSER_HOST_URL is not UTF-8"))?;
        return checked_host_url(&url);
    }
    let port = match option_env!("CODYNC_ENV") {
        Some("main") => 19222,
        _ => 19223,
    };
    Ok(format!("ws://127.0.0.1:{port}/browser-extension"))
}

fn checked_host_url(raw: &str) -> Result<String> {
    let url = url::Url::parse(raw).context("CODYNC_BROWSER_HOST_URL is invalid")?;
    ensure!(url.scheme() == "ws", "CODYNC_BROWSER_HOST_URL must use ws");
    ensure!(
        url.host_str() == Some("127.0.0.1"),
        "CODYNC_BROWSER_HOST_URL must use the IPv4 loopback address 127.0.0.1"
    );
    ensure!(url.path() == "/browser-extension", "CODYNC_BROWSER_HOST_URL must use /browser-extension");
    ensure!(
        url.username().is_empty() && url.password().is_none(),
        "CODYNC_BROWSER_HOST_URL cannot contain credentials"
    );
    ensure!(
        url.query().is_none() && url.fragment().is_none(),
        "CODYNC_BROWSER_HOST_URL cannot contain a query or fragment"
    );
    Ok(url.to_string())
}

fn token_path() -> Result<PathBuf> {
    if let Some(home) = std::env::var_os("CODYNC_HOME") {
        return Ok(PathBuf::from(home).join("token"));
    }
    let folder = match option_env!("CODYNC_ENV") {
        Some("main") => ".codync",
        _ => ".codync-dev",
    };
    let home = dirs::home_dir().context("finding the user's home directory")?;
    Ok(home.join(folder).join("token"))
}

#[cfg(windows)]
fn install_native_messaging() -> Result<()> {
    use std::process::{Command, Stdio};

    let executable = std::env::current_exe()
        .context("finding the Codync Browser native host")?
        .canonicalize()
        .context("resolving the Codync Browser native host")?;
    let manifest_dir = dirs::data_local_dir()
        .context("finding the local application data directory")?
        .join("Codync")
        .join("BrowserExtension");
    std::fs::create_dir_all(&manifest_dir)?;
    let manifest_path = manifest_dir.join(format!("{NATIVE_HOST}.json"));
    let manifest = native_manifest(&executable, EXTENSION_ID);
    std::fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest)?)
        .with_context(|| format!("writing {}", manifest_path.display()))?;

    for key in [CHROME_REGISTRY, EDGE_REGISTRY] {
        let output = Command::new("reg.exe")
            .args(["add", key, "/ve", "/t", "REG_SZ", "/d", manifest_path.to_string_lossy().as_ref(), "/f"])
            .stdin(Stdio::null())
            .output()
            .context("starting reg.exe to register the Codync Browser bridge")?;
        ensure!(
            output.status.success(),
            "reg.exe could not register {key}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

#[cfg(not(windows))]
fn install_native_messaging() -> Result<()> {
    bail!("the Codync Browser native host is available on Windows only")
}

#[cfg(windows)]
fn uninstall_native_messaging() -> Result<()> {
    use std::process::{Command, Stdio};

    for key in [CHROME_REGISTRY, EDGE_REGISTRY] {
        // A missing key already represents the requested state.
        let _ = Command::new("reg.exe")
            .args(["delete", key, "/f"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let manifest_dir = dirs::data_local_dir()
        .context("finding the local application data directory")?
        .join("Codync")
        .join("BrowserExtension");
    let manifest_path = manifest_dir.join(format!("{NATIVE_HOST}.json"));
    match std::fs::remove_file(&manifest_path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error).with_context(|| format!("removing {}", manifest_path.display())),
    }
    match std::fs::remove_dir(&manifest_dir) {
        Ok(()) => {}
        Err(error) if matches!(error.kind(), std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty) => {}
        Err(error) => return Err(error).with_context(|| format!("removing {}", manifest_dir.display())),
    }
    Ok(())
}

#[cfg(not(windows))]
fn uninstall_native_messaging() -> Result<()> {
    bail!("the Codync Browser native host is available on Windows only")
}

fn native_manifest(executable: &std::path::Path, extension_id: &str) -> Value {
    json!({
        "name": NATIVE_HOST,
        "description": "Codync Browser native-messaging bridge",
        "path": native_manifest_path(executable),
        "type": "stdio",
        "allowed_origins": [format!("chrome-extension://{extension_id}/")]
    })
}

fn native_manifest_path(executable: &std::path::Path) -> String {
    // Chrome's Windows native-messaging launcher rejects the `\\?\` NT namespace prefix that
    // `canonicalize` adds, even though the same path opens normally in Rust and Explorer.
    let path = executable.to_string_lossy();
    if let Some(path) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{path}")
    } else if let Some(path) = path.strip_prefix(r"\\?\") {
        path.to_owned()
    } else {
        path.into_owned()
    }
}

fn read_native(input: &mut impl Read) -> Result<Option<String>> {
    let mut header = [0_u8; 4];
    match input.read_exact(&mut header) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error).context("reading Chrome's native-message header"),
    }
    let length = u32::from_le_bytes(header) as usize;
    if length == 0 || length > MAX_FRAME {
        bail!("Chrome sent a browser bridge frame larger than {MAX_FRAME} bytes");
    }
    let mut body = vec![0; length];
    input.read_exact(&mut body).context("reading Chrome's native-message body")?;
    Ok(Some(String::from_utf8(body).context("Chrome sent non-UTF-8 browser JSON")?))
}

fn write_native_text(text: &str) -> Result<()> {
    write_native_raw(text.as_bytes())
}

fn write_native(value: &Value) -> Result<()> {
    write_native_raw(value.to_string().as_bytes())
}

fn write_native_raw(bytes: &[u8]) -> Result<()> {
    if bytes.is_empty() || bytes.len() > MAX_FRAME {
        bail!("native browser message is empty or too large");
    }
    let length = u32::try_from(bytes.len()).context("native browser message length")?;
    let stdout = std::io::stdout();
    let mut output = stdout.lock();
    output.write_all(&length.to_le_bytes())?;
    output.write_all(bytes)?;
    output.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use super::*;
    use std::ffi::OsStr;
    use std::io::Cursor;

    #[test]
    fn reads_a_chrome_length_prefixed_message() {
        let body = br#"{"type":"hello"}"#;
        let mut framed = u32::try_from(body.len()).unwrap().to_le_bytes().to_vec();
        framed.extend_from_slice(body);
        assert_eq!(read_native(&mut Cursor::new(framed)).unwrap().as_deref(), Some(r#"{"type":"hello"}"#));
    }

    #[test]
    fn eof_is_a_clean_shutdown() {
        assert!(read_native(&mut Cursor::new(Vec::<u8>::new())).unwrap().is_none());
    }

    #[test]
    fn rejects_an_oversized_frame() {
        let mut framed = u32::try_from(MAX_FRAME + 1).unwrap().to_le_bytes().to_vec();
        framed.extend_from_slice(OsStr::new("ignored").as_encoded_bytes());
        assert!(read_native(&mut Cursor::new(framed)).is_err());
    }

    #[test]
    fn native_manifest_serializes_windows_paths_as_json() {
        let manifest = native_manifest(
            std::path::Path::new(r"C:\Users\Example User\Codync\codync-browser-native-host.exe"),
            EXTENSION_ID,
        );
        let encoded = serde_json::to_vec(&manifest).unwrap();
        let decoded: Value = serde_json::from_slice(&encoded).unwrap();
        assert_eq!(decoded["name"], NATIVE_HOST);
        assert_eq!(decoded["path"], r"C:\Users\Example User\Codync\codync-browser-native-host.exe");
        assert_eq!(decoded["allowed_origins"][0], format!("chrome-extension://{EXTENSION_ID}/"));
    }

    #[test]
    fn native_manifest_removes_windows_verbatim_path_prefixes() {
        let drive_path = native_manifest_path(std::path::Path::new(
            r"\\?\C:\Users\Example User\Codync\codync-browser-native-host.exe",
        ));
        assert_eq!(drive_path, r"C:\Users\Example User\Codync\codync-browser-native-host.exe");

        let unc_path =
            native_manifest_path(std::path::Path::new(r"\\?\UNC\server\share\Codync\codync-browser-native-host.exe"));
        assert_eq!(unc_path, r"\\server\share\Codync\codync-browser-native-host.exe");
    }

    #[test]
    fn browser_host_override_must_be_authenticated_loopback() {
        assert_eq!(
            checked_host_url("ws://127.0.0.1:19333/browser-extension").unwrap(),
            "ws://127.0.0.1:19333/browser-extension"
        );
        for invalid in [
            "wss://127.0.0.1:19333/browser-extension",
            "ws://localhost:19333/browser-extension",
            "ws://192.0.2.1:19333/browser-extension",
            "ws://127.0.0.1:19333/other",
            "ws://token@127.0.0.1:19333/browser-extension",
        ] {
            assert!(checked_host_url(invalid).is_err(), "{invalid}");
        }
    }
}
