//! Interop harness for the same production transport/contract functions used by Tauri.
use respire_client_cli_contract as contract;
use serde_json::json;
fn main() {
    let mut args = std::env::args().skip(1);
    let operation = args.next().unwrap_or_default();
    let program = args.next().unwrap_or_default();
    let result = match operation.as_str() {
        "capabilities" => contract::capture_json(program, &["capabilities"])
            .and_then(|output| contract::capabilities(&output)),
        "login" => {
            match serde_json::from_reader::<_, contract::LoginRequest>(std::io::stdin()) {
                Ok(request) => contract::run_login(program, &request),
                Err(_) => Err(contract::CliFailure::new("invalid_request", "测试请求格式无效。")),
            }
        }
        "retired-installer" => contract::retired_rerank_install(),
        _ => Err(contract::CliFailure::new("invalid_operation", "未知测试操作。")),
    };
    match result {
        Ok(value) => println!("{}", json!({"ok":true,"value":value})),
        Err(error) => {
            println!("{}", json!({"ok":false,"error":error}));
            std::process::exit(1);
        }
    }
}
