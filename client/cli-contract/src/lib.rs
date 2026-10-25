//! Public CLI transport/contract adaptation shared with the desktop shell.
//! Account state, decryption and recovery remain owned by the CLI.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{ffi::OsStr, process::Command};

pub const RECOVERY_GUIDANCE: &str = "保留原账号和密钥材料。使用原 A3 恢复码，或在仍能解锁同一库的可信设备上取得恢复资料。需要 TOTP、旧版密钥或交互恢复时，请在宿主终端运行 rsrs login --interactive，或使用 rsrs login 的浏览器授权。离线新钥匙不能恢复原云端数据。";
pub const RERANK_RETIRED: &str = "此客户端不再提供已退役的精排模型安装；不会运行旧 install-rerank 命令。";

#[derive(Debug, Clone, Serialize)]
pub struct CliFailure {
    pub code: &'static str,
    pub message: String,
    pub exit_code: Option<i32>,
    pub status: Option<String>,
    pub reason: Option<String>,
    pub error_type: Option<String>,
}
impl CliFailure {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), exit_code: None, status: None, reason: None, error_type: None }
    }
}
impl std::fmt::Display for CliFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(&self.message) }
}
impl std::error::Error for CliFailure {}

pub fn hidden_command(program: impl AsRef<OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000 | 0x0000_0200);
    }
    command
}

pub struct CliOutput {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}
impl CliOutput { pub fn success(&self) -> bool { self.exit_code == Some(0) } }

/// No shell expansion, inherited stdin prompts, or credential-bearing logging.
pub fn capture_json(program: impl AsRef<OsStr>, args: &[&str]) -> Result<CliOutput, CliFailure> {
    let output = hidden_command(program).arg("--json").args(args).env("RSRS_JSON", "1")
        .stdin(std::process::Stdio::null()).output()
        .map_err(|_| CliFailure::new("cli_unavailable", "无法启动 rsrs CLI，请先安装或更新 CLI。"))?;
    Ok(CliOutput { exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned() })
}

fn redact(text: &str, secrets: &[&str]) -> String {
    let mut value = text.to_owned();
    for secret in secrets.iter().filter(|secret| !secret.is_empty()) { value = value.replace(secret, "[已隐藏]"); }
    // Recovery material unexpectedly emitted in an error must not reach UI/logs.
    while let Some(start) = value.find("A3-") {
        let end = start + value[start..].bytes().take_while(|b| b.is_ascii_alphanumeric() || *b == b'-').count();
        value.replace_range(start..end, "[恢复码已隐藏]");
    }
    value.chars().take(400).collect()
}

fn read_envelope(output: &CliOutput) -> Result<Value, CliFailure> {
    // Never include malformed stdout in diagnostics: it may contain key material.
    let value: Value = serde_json::from_str(output.stdout.trim())
        .map_err(|_| CliFailure::new("cli_protocol_error", "CLI 未返回有效的单一 JSON 包络，请更新 CLI。"))?;
    if !value.is_object() || !value["command"].is_string() || !value["summary"].is_object()
        || !value["errors"].is_array()
        || !matches!(value["status"].as_str(), Some("ok" | "skip" | "warn" | "pending" | "fail")) {
        return Err(CliFailure::new("cli_protocol_error", "CLI 包络字段或状态无效，请更新 CLI。"));
    }
    Ok(value)
}

fn failure(output: &CliOutput, envelope: &Value, secrets: &[&str]) -> CliFailure {
    let diagnostic = envelope["errors"].as_array().into_iter().flatten().filter_map(Value::as_str)
        .find(|value| !value.trim().is_empty())
        .or_else(|| output.stderr.lines().find(|line| !line.trim().is_empty()))
        .unwrap_or("CLI 未完成操作，请检查宿主终端中的状态。");
    let terminal = diagnostic.contains("interactive terminal") || diagnostic.contains("TOTP verification requires");
    let mut result = CliFailure::new(if terminal { "terminal_required" } else { "cli_failed" },
        redact(diagnostic.lines().next().unwrap_or(diagnostic), secrets));
    if terminal { result.message.push_str(" 请在真实宿主终端交互登录或使用浏览器授权；--interactive 不会给桌面子进程创建 TTY。"); }
    result.exit_code = output.exit_code;
    result.status = envelope["status"].as_str().map(str::to_owned);
    result.reason = envelope["summary"]["reason"].as_str()
        .filter(|s| matches!(*s, "invalid_input" | "runtime_error" | "client_only" | "unauthorized" | "unavailable" | "busy"))
        .map(str::to_owned);
    result.error_type = envelope["details"]["error_type"].as_str()
        .filter(|s| matches!(*s, "user" | "runtime" | "network" | "auth" | "internal"))
        .map(str::to_owned);
    result
}

pub fn response(output: &CliOutput, secrets: &[&str]) -> Result<Value, CliFailure> {
    let value = read_envelope(output)?;
    if !output.success() || !matches!(value["status"].as_str(), Some("ok" | "skip")) {
        return Err(failure(output, &value, secrets));
    }
    Ok(value)
}

pub fn capabilities(output: &CliOutput) -> Result<Value, CliFailure> {
    let value = response(output, &[])?;
    let summary = &value["summary"];
    if value["command"] != "capabilities" || value["status"] != "ok"
        || summary["schema_version"].as_u64() != Some(1)
        || summary["cli_version"].as_str().is_none_or(str::is_empty)
        || !summary["capabilities"]["rerank"].is_boolean()
        || !summary["capabilities"]["model"]["install"].is_boolean()
        || !summary["capabilities"]["model"]["install_rerank"].is_boolean() {
        return Err(CliFailure::new("unknown_capabilities", "无法确认此 CLI 的能力；不会启用精排安装，请更新 CLI。"));
    }
    Ok(summary.clone())
}

// Deliberately not Debug/Serialize: requests contain user-supplied secrets.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginRequest {
    pub addr: Option<String>, pub user: String, pub pass: String,
    pub super_pass: Option<String>, pub secret_key: Option<String>, pub reset_vault: Option<bool>,
}

pub fn login_args(request: &LoginRequest) -> Result<Vec<String>, CliFailure> {
    if request.reset_vault == Some(true) || request.secret_key.as_ref().is_some_and(|s| !s.trim().is_empty()) {
        return Err(CliFailure::new("unsupported_recovery", RECOVERY_GUIDANCE));
    }
    if request.user.trim().is_empty() || request.pass.is_empty() {
        return Err(CliFailure::new("invalid_login_input", "请填写账号和登录密码。"));
    }
    let factor = request.super_pass.as_deref().filter(|value| !value.trim().is_empty())
        .ok_or_else(|| CliFailure::new("terminal_required", format!("非交互桌面子进程需要显式原恢复材料，不能假定密钥环会补齐。{RECOVERY_GUIDANCE}")))?;
    let mut args = vec!["login".into(), "--interactive".into(), "--user".into(), request.user.trim().into(),
        "--pass".into(), request.pass.clone(), "--super".into(), factor.into()];
    if let Some(addr) = request.addr.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        args.extend(["--addr".into(), addr.into()]);
    }
    Ok(args)
}

pub fn login_response(output: &CliOutput, secrets: &[&str]) -> Result<Value, CliFailure> {
    let mut value = read_envelope(output)?;
    if value["command"] != "login" || value["summary"]["ok"] != true {
        return Err(failure(output, &value, secrets));
    }
    let normal = output.success() && value["status"] == "ok";
    // Preserve a committed warning for explicit UI handling/material confirmation.
    let warning = output.exit_code == Some(2) && value["status"] == "warn";
    if !normal && !warning { return Err(failure(output, &value, secrets)); }
    if !value["summary"]["super_issued"].is_null() && !value["summary"]["super_issued"].is_string() {
        return Err(CliFailure::new("cli_protocol_error", "CLI 恢复材料字段类型无效，请在宿主核对账号状态。"));
    }
    if warning {
        value["errors"] = Value::Array(value["errors"].as_array().into_iter().flatten()
            .filter_map(Value::as_str).map(|message| Value::String(redact(message, secrets))).collect());
    }
    Ok(value)
}

pub fn run_login(program: impl AsRef<OsStr>, request: &LoginRequest) -> Result<Value, CliFailure> {
    let args = login_args(request)?;
    let output = capture_json(program, &args.iter().map(String::as_str).collect::<Vec<_>>())?;
    login_response(&output, &[&request.pass, request.super_pass.as_deref().unwrap_or("")])
}

pub fn retired_rerank_install() -> Result<Value, CliFailure> { Err(CliFailure::new("retired_feature", RERANK_RETIRED)) }
