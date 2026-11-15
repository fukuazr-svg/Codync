//! Test-only native entry point for the model acceptance harness.
//! Install as `host/examples/acceptance_api_driver.rs` in the final candidate, then build the example.
//! Authentication is the project's unchanged `local_api` client, not a second credential implementation.

#[path = "../src/local_api.rs"]
mod local_api;

use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static DATA_HOME: OnceLock<PathBuf> = OnceLock::new();

mod service {
    pub fn data_dir() -> std::path::PathBuf {
        super::DATA_HOME.get().expect("validated isolated data home").clone()
    }
}

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("local HTTP client")
    })
}

fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    v[key].as_str().context("missing acceptance binding field")
}

fn physical(path: &Path) -> Result<PathBuf> {
    for ancestor in path.ancestors() {
        let metadata = std::fs::symlink_metadata(ancestor)?;
        ensure!(!metadata.file_type().is_symlink(), "symlink in acceptance path");
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            ensure!(metadata.file_attributes() & 0x400 == 0, "reparse point in acceptance path");
        }
    }
    Ok(std::fs::canonicalize(path)?)
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    bytes.iter().fold(String::new(), |mut out, byte| {
        let _ = write!(out, "{byte:02x}");
        out
    })
}

async fn run() -> Result<Value> {
    let binding_path = physical(Path::new(&std::env::var("CODYNC_ACCEPTANCE_BINDING")?))?;
    ensure!(binding_path.file_name().is_some_and(|n| n == "launch-binding.json"), "wrong binding file");
    let binding: Value = serde_json::from_slice(&std::fs::read(&binding_path)?)?;
    ensure!(binding["purpose"] == "lead410-synthetic-model-acceptance", "not an acceptance launch");
    ensure!(binding["freshDataHome"] == true, "home was not created for this acceptance run");
    let workspace = physical(Path::new(text(&binding, "workspace")?))?;
    let output = binding_path.parent().context("missing output directory")?;
    let home = physical(Path::new(text(&binding, "dataHome")?))?;
    let binary = physical(Path::new(text(&binding, "binary")?))?;
    ensure!(output.starts_with(&workspace) && home.starts_with(output), "outside acceptance workspace");
    ensure!(binary.starts_with(&workspace), "candidate binary outside workspace");
    let port = binding["port"].as_u64().context("missing port")?;
    ensure!((19300..=19999).contains(&port), "not an isolation port");
    let port = u16::try_from(port)?;
    let base = format!("http://127.0.0.1:{port}");
    let mut input = String::new();
    std::io::stdin().take(1_048_577).read_to_string(&mut input)?;
    ensure!(input.len() <= 1_048_576, "request too large");
    let request: Value = serde_json::from_str(&input)?;
    ensure!(request["base"] == base, "base mismatch");
    ensure!(physical(Path::new(text(&request, "dataHome")?))? == home, "home mismatch");
    let health: Value = http()
        .get(format!("{base}/health"))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    ensure!(health["ok"] == true && health["binaryHash"] == binding["binarySha256"], "candidate health mismatch");
    ensure!(physical(Path::new(text(&health, "binaryPath")?))? == binary, "candidate path mismatch");
    DATA_HOME.set(home).map_err(|_| anyhow::anyhow!("data home already set"))?;
    let method = text(&request, "method")?;
    if method == "capabilities" {
        return Ok(json!({
            "protocol": "codync-acceptance-api-v1", "authentication": "project local_api::local_call",
            "clientSourceSha256": hex(&Sha256::digest(include_bytes!("../src/local_api.rs"))),
            "driverSourceSha256": hex(&Sha256::digest(include_bytes!("acceptance_api_driver.rs"))),
            "methods": ["createBot", "send", "history"], "sourceTree": binding["sourceTree"],
        }));
    }
    ensure!(["createBot", "send", "history"].contains(&method), "method outside acceptance scope");
    let body = &request["body"];
    let state_path = output.join("api-driver-created-bots.json");
    let mut bots: Vec<String> = if state_path.exists() {
        ensure!(physical(&state_path)?.starts_with(output), "invalid state path");
        serde_json::from_slice(&std::fs::read(&state_path)?)?
    } else {
        vec![]
    };
    if method == "createBot" {
        ensure!(bots.len() < 2 && body["backend"] == "custom", "only two synthetic bots are allowed");
        ensure!(
            body.get("permission").is_none() && body.get("mode").is_none() && body.get("cwd").is_none(),
            "keep default permissions and isolated workspace"
        );
        ensure!(
            body["connectors"] == json!([]) && body["notify"] == false,
            "synthetic bots must have no connectors or notifications"
        );
        ensure!(
            ["Synthetic inspection target", "Real Codex MCP reader"].contains(&text(body, "name")?),
            "not a synthetic test bot"
        );
    } else {
        ensure!(bots.iter().any(|id| body["botId"] == *id), "bot was not created by this acceptance driver");
    }
    // The only authenticated operation: use the same client as the native host commands.
    // Do not expose Client::token(), duplicate credential reads, or print transport diagnostics.
    let answer = local_api::local_call(port, method, body.clone()).await?;
    if method == "createBot" {
        bots.push(text(&answer["bot"], "id")?.to_owned());
        std::fs::write(state_path, serde_json::to_vec(&bots)?)?;
    }
    if answer.get("token").is_some() || answer.get("Authorization").is_some() {
        bail!("unexpected credential field in public response");
    }
    Ok(answer)
}

#[tokio::main]
async fn main() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    if let Ok(value) = run().await {
        println!("{value}");
    } else {
        eprintln!("Acceptance API driver refused the request; no credentials or transport diagnostics emitted.");
        std::process::exit(2);
    }
}
