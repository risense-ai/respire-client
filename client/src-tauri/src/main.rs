//! The desktop shell translates frontend invokes into rsrs CLI subprocess calls.
//! Return stdout JSON unchanged; memory business logic stays in the CLI.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod memory_args;

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

/// Resolve the CLI through ONEMEMORY_CLI, the executable directory, PATH, then /usr/bin/rsrs.
/// Prefer the matching bundled CLI to avoid command-contract mismatches.
fn cli_path() -> String {
    static CLI: OnceLock<String> = OnceLock::new();
    CLI.get_or_init(|| {
        if let Ok(p) = std::env::var("ONEMEMORY_CLI") {
            if !p.trim().is_empty() {
                return p;
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let name = if cfg!(windows) { "rsrs.exe" } else { "rsrs" };
                let p = dir.join(name);
                if p.exists() {
                    return p.to_string_lossy().into_owned();
                }
                // Check the externalBin sidecar candidate with its target suffix.
                let triple = sidecar_triple();
                if !triple.is_empty() {
                    let suffix = if cfg!(windows) { ".exe" } else { "" };
                    let p = dir.join(format!("rsrs-{triple}{suffix}"));
                    if p.exists() {
                        return p.to_string_lossy().into_owned();
                    }
                }
            }
        }
        let which = if cfg!(windows) { "where" } else { "which" };
        if hidden_command(which)
            .arg("rsrs")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return "rsrs".to_owned();
        }
        if PathBuf::from("/usr/bin/rsrs").exists() {
            return "/usr/bin/rsrs".to_owned();
        }
        "rsrs".to_owned()
    })
    .clone()
}

fn last_nonempty_line(s: &str) -> &str {
    s.lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .map(str::trim)
        .unwrap_or("")
}

/// Create a command without a visible Windows console.
///
/// Frequent CLI subprocesses should not flash console windows during UI operations.
/// Windows commands use CREATE_NO_WINDOW.
/// Keep stdout and stderr connected to the existing pipes.
/// These flags affect presentation rather than subprocess output.
/// Other platforms use the default Command behavior.
fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[cfg_attr(not(windows), allow(unused_mut))]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }
    cmd
}

fn cli_output(args: &[&str]) -> Result<(bool, String, String), String> {
    let out = hidden_command(cli_path())
        .args(args)
        .env("ONEMEMORY_JSON", "1")
        .output()
        .map_err(|_| {
            "无法启动 rsrs CLI——请先安装：客户端「工作区设置 → 安装 CLI」或 npm i -g @rsrsai/cli"
                .to_owned()
        })?;
    Ok((
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    ))
}

/// Run the CLI in JSON mode and parse the last nonempty stdout line.
/// Use stderr for nonzero exits and show installation guidance when the CLI cannot start.
fn cli(args: &[&str]) -> Result<serde_json::Value, String> {
    let (ok, stdout, stderr) = cli_output(args)?;
    if !ok {
        let msg = last_nonempty_line(&stderr);
        return Err(if msg.is_empty() {
            "命令执行失败".to_owned()
        } else {
            msg.to_owned()
        });
    }
    let line = last_nonempty_line(&stdout);
    serde_json::from_str(line).map_err(|e| {
        format!(
            "CLI 输出解析失败（{e}）：{}",
            line.chars().take(200).collect::<String>()
        )
    })
}

/// Serialize CLI calls to avoid contention on the database lock.
/// Run one subprocess at a time while keeping the UI responsive.
static CLI_GATE: tauri::async_runtime::Mutex<()> = tauri::async_runtime::Mutex::const_new(());

/// Move blocking CLI operations to the background executor.
/// Acquire the shared gate before accessing the store.
async fn cli_bg(args: &[&str]) -> Result<serde_json::Value, String> {
    let _gate = CLI_GATE.lock().await;
    let owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    tauri::async_runtime::spawn_blocking(move || {
        let refs: Vec<&str> = owned.iter().map(String::as_str).collect();
        cli(&refs)
    })
    .await
    .map_err(|e| format!("后台任务失败：{e}"))?
}

/// Respect the process ONEMEMORY_ADDR override when displaying configuration.
fn overlay_process_addr(mut v: serde_json::Value) -> Result<serde_json::Value, String> {
    let config = v.as_object_mut().ok_or("CLI 配置输出必须是 JSON 对象")?;
    if let Ok(addr) = std::env::var("ONEMEMORY_ADDR") {
        let addr = addr.trim();
        if !addr.is_empty() {
            config.insert("addr".to_owned(), serde_json::Value::String(addr.to_owned()));
        }
    }
    Ok(v)
}

// Memory queries.

#[tauri::command]
async fn status() -> Result<serde_json::Value, String> {
    cli_bg(&["status"]).await
}

/// Ask the CLI for its profile-scoped revision; never guess storage paths or WAL state.
#[tauri::command]
async fn memory_revision() -> Result<serde_json::Value, String> {
    cli_bg(&["memory-revision"]).await
}

#[tauri::command]
async fn list(limit: Option<usize>) -> Result<serde_json::Value, String> {
    cli_bg(&["list", "--limit", &limit.unwrap_or(20).to_string()]).await
}

#[tauri::command]
async fn search(q: String, limit: Option<usize>, kind: Option<String>) -> Result<serde_json::Value, String> {
    let mut args = vec!["recall".to_owned(), q, "--limit".to_owned(), limit.unwrap_or(20).to_string()];
    if let Some(k) = kind.filter(|s| !s.is_empty()) {
        args.push("--type".into());
        args.push(k);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    cli(&refs)
}

#[tauri::command]
async fn show(id: String) -> Result<serde_json::Value, String> {
    cli_bg(&["show", &id]).await
}

#[tauri::command]
async fn tree(from: Option<String>, depth: Option<usize>) -> Result<serde_json::Value, String> {
    let mut args = vec!["tree".to_owned(), "--depth".to_owned(), depth.unwrap_or(3).to_string()];
    if let Some(f) = from.filter(|s| !s.is_empty()) {
        args.push("--from".into());
        args.push(f);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    cli(&refs)
}

// Memory writes, edits, deletion, and causal links.

#[tauri::command]
async fn candidates(content: String) -> Result<serde_json::Value, String> {
    cli_bg(&["candidates", &content]).await
}

#[tauri::command]
async fn create(
    content: String,
    title: Option<String>,
    tags: Option<String>,
    kind: Option<String>,
    project: Option<String>,
    parent: Option<String>,
    merge_ids: Option<Vec<String>>,
    force: Option<bool>,
    importance: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut args: Vec<String> = vec![
        "remember".into(),
        content,
        "--type".into(),
        kind.unwrap_or_else(|| "context".into()),
    ];
    if let Some(t) = title.filter(|s| !s.is_empty()) {
        args.extend(["--title".into(), t]);
    }
    if let Some(tg) = tags.filter(|s| !s.is_empty()) {
        args.extend(["--tags".into(), tg]);
    }
    if let Some(p) = project.filter(|s| !s.is_empty()) {
        args.extend(["--project".into(), p]);
    }
    if let Some(imp) = importance.filter(|s| !s.is_empty()) {
        args.extend(["--importance".into(), imp]);
    }
    if let Some(p) = parent.filter(|s| !s.is_empty()) {
        args.extend(["--parent".into(), p]);
    }
    if let Some(ids) = merge_ids.filter(|v| !v.is_empty()) {
        args.extend(["--merge-ids".into(), ids.join(",")]);
    }
    if force.unwrap_or(false) {
        args.push("--force".into());
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    cli(&refs)
}

#[tauri::command]
async fn update(
    id: String,
    title: Option<String>,
    content: Option<String>,
    tags: Option<String>,
    kind: Option<String>,
    importance: Option<String>,
) -> Result<serde_json::Value, String> {
    let args = memory_args::update_args(id, title, content, tags, kind, importance);
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    cli(&refs)
}

#[tauri::command]
async fn delete(id: String) -> Result<serde_json::Value, String> {
    cli_bg(&["forget", &id]).await
}

#[tauri::command]
async fn purge(id: String) -> Result<serde_json::Value, String> {
    cli_bg(&["purge", &id]).await
}

#[tauri::command]
async fn attach(id: String, parent: String) -> Result<serde_json::Value, String> {
    cli_bg(&["attach", &id, "--parent", &parent]).await
}

#[tauri::command]
async fn restore(id: String) -> Result<serde_json::Value, String> {
    cli_bg(&["restore", &id]).await
}

#[tauri::command]
async fn promote(id: String) -> Result<serde_json::Value, String> {
    cli_bg(&["promote", &id]).await
}

// Synchronization.

#[tauri::command]
async fn sync() -> Result<serde_json::Value, String> {
    cli_bg(&["sync"]).await
}

// Account operations.

/// Vault v4 registration authenticates with the login password and returns a generated super password.
/// Display the returned super password for the user to save.
#[tauri::command]
async fn register(addr: Option<String>, user: String, pass: String) -> Result<serde_json::Value, String> {
    // Let the CLI select its default address unless a self-hosted address is supplied.
    let mut args: Vec<String> = vec!["register".into(), "--user".into(), user, "--pass".into(), pass];
    if let Some(a) = addr.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()) {
        args.extend(["--addr".to_owned(), a]);
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cli_bg(&refs).await
}

/// Without super_pass, login uses the local keyring or environment.
/// reset_vault explicitly abandons inaccessible remote data and requires confirmation.
#[tauri::command]
async fn login(
    addr: Option<String>,
    user: String,
    pass: String,
    super_pass: Option<String>,
    secret_key: Option<String>,
    reset_vault: Option<bool>,
) -> Result<serde_json::Value, String> {
    let mut args = vec!["login".to_owned(), "--user".to_owned(), user, "--pass".to_owned(), pass];
    if let Some(a) = addr.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()) {
        args.extend_from_slice(&["--addr".to_owned(), a]);
    }
    if let Some(s) = super_pass.filter(|s| !s.is_empty()) {
        args.push("--super".to_owned());
        args.push(s);
    }
    if let Some(s) = secret_key.filter(|s| !s.is_empty()) {
        args.push("--secret-key".to_owned());
        args.push(s);
    }
    if reset_vault.unwrap_or(false) {
        args.push("--reset-vault".to_owned());
    }
    cli(&args.iter().map(|s| s.as_str()).collect::<Vec<&str>>())
}

#[tauri::command]
async fn logout(full: bool) -> Result<serde_json::Value, String> {
    // Logout prints human-readable text even in JSON mode.
    let mut args = vec!["logout"];
    if full {
        args.push("--full");
    }
    let (ok, stdout, stderr) = cli_output(&args)?;
    if !ok {
        let msg = last_nonempty_line(&stderr);
        return Err(if msg.is_empty() {
            "命令执行失败".to_owned()
        } else {
            msg.to_owned()
        });
    }
    let line = last_nonempty_line(&stdout);
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
        return Ok(v);
    }
    Ok(serde_json::json!({ "ok": true, "full": full }))
}

/// Generate local keys offline; vault v4 encryption uses a generated super password.
/// Existing cloud key material requires explicit force confirmation before replacement.
#[tauri::command]
async fn keygen(force: Option<bool>) -> Result<serde_json::Value, String> {
    if force.unwrap_or(false) {
        cli_bg(&["keygen", "--force"]).await
    } else {
        cli_bg(&["keygen"]).await
    }
}

/// Reset the super password by unlocking the existing user root key; memory data is unchanged.
/// Display the newly issued super password for the user to save.
#[tauri::command]
async fn super_reset(super_pass: Option<String>) -> Result<serde_json::Value, String> {
    let owned = super_pass.filter(|s| !s.is_empty());
    let mut args: Vec<&str> = vec!["super-reset"];
    if let Some(s) = owned.as_deref() {
        args.push("--super");
        args.push(s);
    }
    cli_bg(&args).await
}

/// Export recovery material to a file or stdout and explain that it must be saved securely.
#[tauri::command]
async fn keys_export(out: Option<String>) -> Result<serde_json::Value, String> {
    // Read the full text because keys-export has no JSON result contract.
    let mut args = vec!["keys-export"];
    let owned = out.filter(|s| !s.trim().is_empty());
    if let Some(p) = owned.as_deref() {
        args.push("--out");
        args.push(p);
    }
    let (ok, stdout, stderr) = cli_output(&args)?;
    if !ok {
        let msg = last_nonempty_line(&stderr);
        return Err(if msg.is_empty() { "导出失败".to_owned() } else { msg.to_owned() });
    }
    Ok(serde_json::json!({ "ok": true, "path": owned, "text": stdout.trim_end() }))
}

// Configuration is read through the same CLI as other client operations.

#[tauri::command]
async fn config_get() -> Result<serde_json::Value, String> {
    overlay_process_addr(cli_bg(&["config"]).await?)
}

#[tauri::command]
async fn server_addr_get() -> Result<serde_json::Value, String> {
    let v = overlay_process_addr(cli_bg(&["config"]).await?)?;
    Ok(serde_json::json!({
        "addr": v.get("addr").cloned().unwrap_or(serde_json::json!("")),
        "default": v.get("default_addr").cloned().unwrap_or(serde_json::json!("")),
        "autosync": v.get("autosync").cloned().unwrap_or(serde_json::json!(true)),
    }))
}

#[tauri::command]
async fn server_addr_set(addr: String) -> Result<serde_json::Value, String> {
    cli_bg(&["config", "--addr", &addr]).await
}

#[tauri::command]
async fn sync_config_set(autosync: bool) -> Result<serde_json::Value, String> {
    cli_bg(&["config", "--autosync", if autosync { "true" } else { "false" }]).await
}

#[tauri::command]
async fn cure_config_set(on: bool) -> Result<serde_json::Value, String> {
    cli_bg(&["config", "--cure-auto", if on { "true" } else { "false" }]).await
}

#[tauri::command]
async fn diary_mode_get() -> Result<serde_json::Value, String> {
    let v = cli_bg(&["agent-config"]).await?;
    Ok(serde_json::json!({
        "diary_mode": v.get("diary_mode").cloned().unwrap_or(serde_json::json!("concise")),
    }))
}

#[tauri::command]
async fn diary_mode_set(mode: String) -> Result<serde_json::Value, String> {
    cli_bg(&["agent-config", "--set", &format!("diary_mode={mode}")]).await
}

#[tauri::command]
async fn data_dir_set(dir: String) -> Result<serde_json::Value, String> {
    cli_bg(&["config", "--data-dir", &dir]).await
}

/// Enumerate system fonts through fontconfig, the Windows registry, or macOS AppKit.
/// Use fallback candidates when platform enumeration is unavailable.
/// Return unique sorted families together with the localized system-default sentinel.
#[tauri::command]
async fn list_system_fonts() -> Result<serde_json::Value, String> {
    let mut raw: Vec<String> = Vec::new();
    let mut source = "fallback";

    #[cfg(unix)]
    {
        if let Ok(out) = hidden_command("fc-list").args([":", "family"]).output() {
            if out.status.success() {
                source = "fc-list";
                for line in String::from_utf8_lossy(&out.stdout).lines() {
                    for part in line.split(',') {
                        raw.push(part.trim().to_owned());
                    }
                }
            }
        }
    }

    // Windows font registry labels contain actual family names.
    // A font filename does not necessarily identify a usable CSS font-family.
    // Use family labels to avoid silent CSS fallback.
    #[cfg(windows)]
    {
        if let Ok(out) = hidden_command("reg").args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts",
        ]).output() {
            if out.status.success() {
                source = "win-registry";
                for line in String::from_utf8_lossy(&out.stdout).lines() {
                    let name = line.trim();
                    // Read the display name before the registry value's first tab separator.
                    let disp = name.split('\t').next().unwrap_or("");
                    let disp = disp.strip_suffix(" (TrueType)")
                        .or_else(|| disp.strip_suffix(" (OpenType)"))
                        .or_else(|| disp.strip_suffix(" (TrueType italic)"))
                        .unwrap_or(disp);
                    // Preserve style suffixes for platform family matching.
                    if !disp.is_empty() {
                        raw.push(disp.to_owned());
                    }
                }
            }
        }
    }

    // macOS AppKit returns the families used by WKWebView.
    // Font filenames such as PingFang.ttc differ from CSS family names.
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = hidden_command("osascript").args([
            "-l", "JavaScript", "-e",
            "ObjC.import('AppKit'); JSON.stringify(ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFontFamilies))",
        ]).output() {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                if let Ok(arr) = serde_json::from_str::<Vec<String>>(text.trim()) {
                    source = "macos-nsfontmanager";
                    raw.extend(arr);
                }
            }
        }
        // If AppKit enumeration fails, fall back to font-directory names.
        if source == "fallback" {
            source = "macos-fonts-dir";
            for dir in ["/System/Library/Fonts", "/Library/Fonts", "/System/Library/Fonts/Supplemental"] {
                if let Ok(rd) = std::fs::read_dir(dir) {
                    for entry in rd.flatten() {
                        if let Some(stem) = entry.path().file_stem().and_then(|s| s.to_str()) {
                            raw.push(stem.to_owned());
                        }
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({ "source": source, "fonts": collect_font_families(raw) }))
}

/// Remove empty families, deduplicate case-insensitively, and sort while preserving the first spelling.
fn collect_font_families(raw: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<String> = vec!["系统默认".to_owned()];
    seen.insert("系统默认".to_lowercase());
    for name in raw {
        let name = name.trim();
        if name.is_empty() {
            continue;
        }
        if seen.insert(name.to_lowercase()) {
            out.push(name.to_owned());
        }
    }
    out[1..].sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    out
}

#[tauri::command]
async fn scope_material(root: String) -> Result<serde_json::Value, String> {
    // Keep the frontend command name stable while exporting through tree --material.
    cli_bg(&["tree", "--material", &root]).await
}

// Shared spaces, invitations, membership, and removal.

#[tauri::command]
async fn space_list() -> Result<serde_json::Value, String> {
    cli_bg(&["space", "list"]).await
}

#[tauri::command]
async fn space_create(name: String) -> Result<serde_json::Value, String> {
    cli_bg(&["space", "create", &name]).await
}

#[tauri::command]
async fn space_use(name: String) -> Result<serde_json::Value, String> {
    cli_bg(&["space", "use", &name]).await
}

#[tauri::command]
async fn space_invite(note: Option<String>, readonly: Option<bool>) -> Result<serde_json::Value, String> {
    let mut args: Vec<String> = vec!["space".into(), "invite".into()];
    if readonly.unwrap_or(false) {
        args.push("--readonly".into());
    }
    if let Some(n) = note.filter(|n| !n.trim().is_empty()) {
        args.push("--note".into());
        args.push(n);
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    cli_bg(&refs).await
}

#[tauri::command]
async fn space_join(code: String) -> Result<serde_json::Value, String> {
    cli_bg(&["space", "join", &code]).await
}

#[tauri::command]
async fn space_members(name: Option<String>) -> Result<serde_json::Value, String> {
    match name.filter(|n| !n.trim().is_empty()) {
        Some(n) => cli_bg(&["space", "members", &n]).await,
        None => cli_bg(&["space", "members"]).await,
    }
}

#[tauri::command]
async fn space_kick(session: Option<String>, all: bool) -> Result<serde_json::Value, String> {
    let mut args: Vec<&str> = vec!["space", "kick"];
    if all {
        args.push("--all");
    } else if let Some(s) = session.as_deref().filter(|s| !s.trim().is_empty()) {
        args.push("--session");
        args.push(s);
    } else {
        return Err("kick 须给 session 或 all".to_owned());
    }
    cli_bg(&args).await
}

#[tauri::command]
async fn space_remove(name: String, yes: bool) -> Result<serde_json::Value, String> {
    if !yes {
        return Err("删空间档不可恢复——须显式确认".to_owned());
    }
    cli_bg(&["space", "remove", &name, "--yes"]).await
}

#[tauri::command]
async fn doctor() -> Result<serde_json::Value, String> {
    cli_bg(&["doctor"]).await
}

/// Check reranker files in the configured user model directory.
/// Return installation status, path, size, and optional-model metadata.
#[tauri::command]
async fn rerank_model_status() -> Result<serde_json::Value, String> {
    let dir = rerank_model_dir();
    let tok = dir.join("tokenizer.json");
    let onnx_q = dir.join("onnx").join("model_quantized.onnx");
    let onnx_f = dir.join("onnx").join("model.onnx");
    let installed = tok.is_file() && (onnx_q.is_file() || onnx_f.is_file());
    let size_mb = if installed {
        let a = std::fs::metadata(&onnx_q).or_else(|_| std::fs::metadata(&onnx_f));
        a.map(|m| m.len() / 1024 / 1024).unwrap_or(0)
    } else {
        0
    };
    // The CLI applies the reranking environment switch; this response only describes installed files.
    Ok(serde_json::json!({
        "installed": installed,
        "dir": dir.to_string_lossy(),
        "size_mb": size_mb,
        "optional": true,
    }))
}

/// Resolve the reranker directory from explicit overrides or the user model root.
fn rerank_model_dir() -> PathBuf {
    if let Ok(p) = std::env::var("ONEMEMORY_RERANKER_DIR") {
        let p = p.trim();
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    if let Ok(p) = std::env::var("ONEMEMORY_MODEL_DIR") {
        let p = p.trim();
        if !p.is_empty() {
            // ONEMEMORY_MODEL_DIR names the embedding model directory; use its parent as the model root.
            let b = PathBuf::from(p);
            if let Some(parent) = b.parent() {
                return parent.join("bge-reranker-base");
            }
        }
    }
    let home = dirs_home();
    home.join(".local/share/yishi/models/bge-reranker-base")
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/root"))
}

/// Install the optional reranker through the CLI and stream progress.
/// Emit rerank-install://progress events for the frontend.
#[tauri::command]
async fn rerank_model_install(app: tauri::AppHandle, source: Option<String>, mirror: Option<String>) -> Result<serde_json::Value, String> {
    use std::io::{BufRead, BufReader};
    use tauri::Emitter;

    let mut args: Vec<String> = vec!["model".into(), "install-rerank".into()];
    // A custom source URL takes precedence over mirrors.
    if let Some(s) = source.filter(|s| !s.trim().is_empty()) {
        args.push("--source".into());
        args.push(s);
    } else {
        // Without a custom source, resolve the mirror argument or environment override.
        let m = mirror
            .filter(|s| !s.trim().is_empty())
            .or_else(|| std::env::var("ONEMEMORY_MIRROR").ok().filter(|s| !s.trim().is_empty()));
        if let Some(m) = m {
            args.push("--mirror".into());
            args.push(m);
        }
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let mut child = hidden_command(cli_path())
        .args(&arg_refs)
        .env("ONEMEMORY_JSON", "1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|_| "无法启动 rsrs CLI——请先安装 CLI".to_owned())?;

    // Stream stderr download progress line by line.
    if let Some(err) = child.stderr.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                let _ = app2.emit("rerank-install://progress", line);
            }
        });
    }
    // Read the JSON result from stdout.
    let mut stdout = String::new();
    if let Some(mut out) = child.stdout.take() {
        use std::io::Read;
        let _ = out.read_to_string(&mut stdout);
    }
    let status = child.wait().map_err(|e| format!("等待安装进程失败：{e}"))?;
    let last = last_nonempty_line(&stdout);
    if !status.success() {
        return Err(if last.is_empty() {
            "安装失败（CLI 无输出）".to_owned()
        } else {
            last.to_owned()
        });
    }
    let _ = app.emit("rerank-install://progress", "完成");
    if last.is_empty() {
        Ok(serde_json::json!({ "installed": true }))
    } else {
        serde_json::from_str(last).map_err(|e| format!("CLI 输出解析失败（{e}）"))
    }
}

#[tauri::command]
async fn cli_install(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    let which = if cfg!(windows) { "where" } else { "which" };
    let found = hidden_command(which)
        .arg("rsrs")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if found {
        return Ok(serde_json::json!({ "installed": true, "action": "already" }));
    }
    // Install the bundled CLI into the user's PATH directory when available.
    if let Some(src) = bundled_cli() {
        let resources = app.path().resource_dir()
            .map_err(|e| format!("无法定位包内 CLI 运行库目录: {e}"))?;
        install_cli_to_path(&src, &resources)?;
        return Ok(serde_json::json!({ "installed": true, "action": "installed" }));
    }
    // Use npm when no CLI is bundled.
    let npm = if cfg!(windows) { "npm.cmd" } else { "npm" };
    let scope = "@rsrsai/cli";
    let out = hidden_command(npm)
        .args(["install", "-g", scope])
        .output()
        .map_err(|e| format!("npm 不可用（{e}）——请先安装 Node.js/npm"))?;
    let ok = if out.status.success() {
        true
    } else if cfg!(unix) {
        let home = std::env::var("HOME").unwrap_or_default();
        hidden_command(npm)
            .args(["install", "-g", "--prefix", &format!("{home}/.local"), scope])
            .output()
            .map(|r| r.status.success())
            .unwrap_or(false)
    } else {
        false
    };
    if !ok {
        return Err(format!(
            "npm 安装失败：{}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(serde_json::json!({ "installed": true, "action": "installed" }))
}

/// Locate the bundled CLI beside the executable or in the cli resource directory.
fn bundled_cli() -> Option<PathBuf> {
    let name = if cfg!(windows) { "rsrs.exe" } else { "rsrs" };
    // Check externalBin output beside the application executable.
    let triple = sidecar_triple();
    if let Ok(p) = std::env::current_exe() {
        if let Some(dir) = p.parent() {
            let mut cands = vec![
                dir.join("cli").join(name),
                dir.join(name),
            ];
            if !triple.is_empty() {
                let suffix = if cfg!(windows) { ".exe" } else { "" };
                cands.push(dir.join(format!("rsrs-{triple}{suffix}")));
            }
            for c in &cands {
                if c.exists() {
                    return Some(c.clone());
                }
            }
        }
    }
    None
}

/// Return the current supported target triple or skip target-specific candidates.
/// Supported desktop targets are listed in the compatibility matrix.
fn sidecar_triple() -> String {
    let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);
    match (os, arch) {
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu".to_owned(),
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu".to_owned(),
        ("macos", "aarch64") => "aarch64-apple-darwin".to_owned(),
        ("windows", "x86_64") => "x86_64-pc-windows-msvc".to_owned(),
        ("windows", "aarch64") => "aarch64-pc-windows-msvc".to_owned(),
        _ => String::new(),
    }
}

/// Copy the bundled CLI to the user's bin directory and update PATH when required.
fn install_cli_to_path(src: &PathBuf, source_dir: &PathBuf) -> Result<(), String> {
    let home = std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map_err(|_| "无法确定用户目录".to_owned())?;
    let bin_dir = PathBuf::from(&home).join(if cfg!(windows) { "bin" } else { ".local/bin" });
    // Copy only the runtime files declared by the trusted bundled manifest.
    let manifest_path = source_dir.join("core-runtime.json");
    let manifest_text = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("无法读取包内 CLI 运行库清单 {}: {e}", manifest_path.display()))?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_text)
        .map_err(|e| format!("包内 CLI 运行库清单格式无效: {e}"))?;
    if manifest.get("schema_version").and_then(serde_json::Value::as_u64) != Some(1) {
        return Err("包内 CLI 运行库清单版本不支持".to_owned());
    }
    let files = manifest.get("files").and_then(serde_json::Value::as_array)
        .ok_or("包内 CLI 运行库清单缺少 files 数组")?;
    let mut runtime_paths = Vec::new();
    for file in files {
        let name = file.get("path").and_then(serde_json::Value::as_str)
            .ok_or("包内 CLI 运行库清单缺少文件路径")?;
        let relative = std::path::Path::new(name);
        if name.is_empty() || name.contains('\\') || !relative.components().all(|c| matches!(c, std::path::Component::Normal(_))) {
            return Err(format!("包内 CLI 运行库路径无效: {name}"));
        }
        if !source_dir.join(relative).is_file() {
            return Err(format!("包内 CLI 运行库文件缺失: {name}"));
        }
        runtime_paths.push(relative);
    }
    std::fs::create_dir_all(&bin_dir).map_err(|e| format!("建目录失败: {e}"))?;
    for relative in runtime_paths {
        let target = bin_dir.join(relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建 CLI 运行库目录失败: {e}"))?;
        }
        std::fs::copy(source_dir.join(relative), &target)
            .map_err(|e| format!("复制 CLI 运行库 {} 失败: {e}", relative.display()))?;
    }
    std::fs::copy(&manifest_path, bin_dir.join("core-runtime.json"))
        .map_err(|e| format!("复制 CLI 运行库清单失败: {e}"))?;
    let dest = bin_dir.join(if cfg!(windows) { "rsrs.exe" } else { "rsrs" });
    std::fs::copy(src, &dest).map_err(|e| format!("复制 CLI 失败: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("授权失败: {e}"))?;
    }
    #[cfg(windows)]
    {
        // Append the user bin directory to the Windows registry PATH only if absent.
        let reg = hidden_command("reg")
            .args(["query", "HKCU\\Environment", "/v", "Path"])
            .output();
        let cur = reg.ok().and_then(|o| String::from_utf8(o.stdout).ok()).unwrap_or_default();
        let dir_str = bin_dir.to_string_lossy().into_owned();
        if !cur.contains(&dir_str) {
            let new_val = cur
                .lines()
                .find(|l| l.contains("REG_EXPAND_SZ") || l.contains("REG_SZ"))
                .and_then(|l| l.split_once("    "))
                .map(|(_, v)| v.trim().to_owned())
                .unwrap_or_default();
            let combined = if new_val.is_empty() { dir_str } else { format!("{new_val};{dir_str}") };
            let ok = hidden_command("reg")
                .args(["add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", &combined, "/f"])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            if !ok {
                return Err("写用户 PATH 失败——请手动把 ~/.local/bin 加进 PATH".to_owned());
            }
        }
    }
    #[cfg(unix)]
    {
        // Append PATH setup to ~/.profile if absent; it takes effect at the next login.
        let profile = PathBuf::from(&home).join(".profile");
        if profile.exists() {
            let text = std::fs::read_to_string(&profile).unwrap_or_default();
            if !text.contains(".local/bin") {
                let mut t = text;
                t.push_str("\n# added by respire client\nexport PATH=\"$HOME/.local/bin:$PATH\"\n");
                let _ = std::fs::write(&profile, t);
            }
        }
    }
    Ok(())
}

// Context injection.

#[tauri::command]
async fn inject_targets() -> Result<serde_json::Value, String> {
    cli_bg(&["inject", "--targets"]).await
}

#[tauri::command]
async fn inject(id: Option<String>) -> Result<serde_json::Value, String> {
    match id.filter(|s| !s.is_empty()) {
        Some(id) => cli_bg(&["inject", "--id", &id]).await,
        None => cli_bg(&["inject"]).await,
    }
}

#[tauri::command]
async fn inject_remove(id: String) -> Result<serde_json::Value, String> {
    cli_bg(&["inject", "--remove", "--id", &id]).await
}

#[tauri::command]
async fn inject_preview(remove: bool) -> Result<serde_json::Value, String> {
    let mut args = vec!["inject", "--id", "codex", "--preview"];
    if remove { args.push("--remove"); }
    cli(&args)
}

#[tauri::command]
async fn inject_apply(remove: bool, revision: String) -> Result<serde_json::Value, String> {
    let mut args = vec!["inject", "--id", "codex", "--expected", &revision];
    if remove { args.push("--remove"); }
    cli(&args)
}

// Utilities.

#[tauri::command]
async fn export_memories(path: String) -> Result<serde_json::Value, String> {
    cli_bg(&["export", &path]).await
}

#[tauri::command]
async fn import_memories(path: String) -> Result<serde_json::Value, String> {
    cli_bg(&["import", &path]).await
}

#[tauri::command]
async fn backup_db(path: String) -> Result<serde_json::Value, String> {
    cli_bg(&["backup", &path]).await
}

#[tauri::command]
async fn book_material(root: String) -> Result<serde_json::Value, String> {
    cli_bg(&["book-material", &root]).await
}

#[tauri::command]
async fn portrait_material(limit: Option<usize>) -> Result<serde_json::Value, String> {
    cli_bg(&["portrait-material", "--limit", &limit.unwrap_or(40).to_string()]).await
}

/// Export a shared subtree as a prompt containing plaintext memory content.
#[tauri::command]
async fn share_subtree(root: Option<String>, out: Option<String>) -> Result<serde_json::Value, String> {
    let mut args: Vec<String> = vec!["share".into()];
    if let Some(r) = root.filter(|s| !s.trim().is_empty()) {
        args.push("--root".into());
        args.push(r);
    }
    if let Some(o) = out.filter(|s| !s.trim().is_empty()) {
        args.push("--out".into());
        args.push(o);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    cli_bg(&refs).await
}

/// Preview import placement unless go is set; force bypasses the explicit conflict gate.
#[tauri::command]
async fn share_import(
    path: String,
    parent: Option<String>,
    title: Option<String>,
    go: Option<bool>,
    force: Option<bool>,
) -> Result<serde_json::Value, String> {
    let mut args: Vec<String> = vec!["share-import".into(), path];
    if let Some(p) = parent.filter(|s| !s.trim().is_empty()) {
        args.push("--parent".into());
        args.push(p);
    }
    if let Some(t) = title.filter(|s| !s.trim().is_empty()) {
        args.push("--title".into());
        args.push(t);
    }
    if go.unwrap_or(false) {
        args.push("--go".into());
    }
    if force.unwrap_or(false) {
        args.push("--force".into());
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    cli_bg(&refs).await
}

#[tauri::command]
async fn tree_cure(top: Option<usize>) -> Result<serde_json::Value, String> {
    cli_bg(&["tree-cure", "--top", &top.unwrap_or(20).to_string()]).await
}

#[tauri::command]
async fn defrag(min: Option<f64>, top: Option<usize>) -> Result<serde_json::Value, String> {
    cli_bg(&[
        "defrag",
        "--min",
        &min.unwrap_or(0.60).to_string(),
        "--top",
        &top.unwrap_or(20).to_string(),
    ]).await
}

#[tauri::command]
async fn reembed() -> Result<serde_json::Value, String> {
    cli_bg(&["reembed"]).await
}

/// Run automatic tree maintenance every ten minutes; the CLI manages locking and iteration.
fn spawn_cure_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(120));
        loop {
            let enabled = cli(&["config"])
                .ok()
                .and_then(|v| v.get("cure_auto").and_then(|b| b.as_bool()))
                .unwrap_or(true);
            if enabled {
                if let Ok(r) = cli(&["tree-cure", "--auto", "--top", "60"]) {
                    let attached = r.get("attached").and_then(|n| n.as_u64()).unwrap_or(0);
                    if attached > 0 {
                        use tauri::Emitter;
                        let _ = app.emit("cure-done", serde_json::json!({ "attached": attached }));
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(600));
        }
    });
}

/// Show a directory picker; cancellation returns null.
#[tauri::command]
async fn pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .blocking_pick_folder();
    Ok(picked.and_then(|p| p.as_path().map(|x| x.to_string_lossy().into_owned())))
}

/// Show a save-file picker with a default filename; cancellation returns null.
#[tauri::command]
async fn pick_save_file(
    app: tauri::AppHandle,
    default_name: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = app.dialog().file();
    if let Some(name) = default_name.filter(|s| !s.trim().is_empty()) {
        builder = builder.set_file_name(name.trim());
    }
    let picked = builder.blocking_pick_file();
    Ok(picked.and_then(|p| p.as_path().map(|x| x.to_string_lossy().into_owned())))
}

/// Show an open-file picker; cancellation returns null.
#[tauri::command]
async fn pick_open_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .add_filter("记忆 JSON", &["json"])
        .blocking_pick_file();
    Ok(picked.and_then(|p| p.as_path().map(|x| x.to_string_lossy().into_owned())))
}

fn webview_data_dir() -> Option<PathBuf> {
    match std::env::var("ONEMEMORY_WEBVIEW_DIR") {
        Ok(dir) => {
            let dir = dir.trim();
            if dir.is_empty() {
                None
            } else {
                Some(PathBuf::from(dir))
            }
        }
        Err(_) => None,
    }
}

fn open_main_window(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let cfg = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or("tauri.conf.json 缺少 windows[0]")?;
    let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?;
    if let Some(dir) = webview_data_dir() {
        builder = builder.data_directory(dir);
    }
    builder.build()?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            open_main_window(app)?;
            spawn_cure_loop(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            status, list, search, show, tree, memory_revision,
            candidates, create, update, delete, purge, restore, attach, promote,
            sync,
            logout,
            register, login, keygen,
            super_reset, keys_export, list_system_fonts,
            config_get, server_addr_get, server_addr_set, sync_config_set, cure_config_set,
            diary_mode_get, diary_mode_set,
            data_dir_set, scope_material,
            space_list, space_create, space_use, space_invite, space_join, space_members, space_kick, space_remove,
            cli_install, inject_targets, inject, inject_remove, inject_preview, inject_apply, doctor,
            rerank_model_status, rerank_model_install,
            export_memories, import_memories, backup_db, defrag, reembed, tree_cure,
            pick_directory, pick_save_file, pick_open_file,
            book_material, portrait_material, share_subtree, share_import,
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}
