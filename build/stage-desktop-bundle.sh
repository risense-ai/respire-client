#!/usr/bin/env bash
# Verify bundled BGE hashes and stage the CLI as a Tauri sidecar.
# Usage:
#   bash build/stage-desktop-bundle.sh verify-model
#   bash build/stage-desktop-bundle.sh stage-sidecar <CLI-binary-directory> <target-triple>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="$ROOT/models/bge-base-zh-v1.5"
TOK_EXPECT="7dfbf1966ebf99d471c3796e9b457329d2b2182b817e144f1e904b957745c839"
ONNX_EXPECT="5e5619f7cca7380b824d329c157dba10bee7cc00d0c139e82fdb7906051b8e4f"
MATRIX="$ROOT/contracts/compatibility-matrix.json"

hash_of() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
  elif command -v certutil >/dev/null 2>&1; then
    certutil -hashfile "$f" SHA256 | awk 'NR==2 {print tolower($0)}' | tr -d '\r'
  else
    echo "::error::no SHA256 tool (sha256sum/shasum/certutil)" >&2
    exit 1
  fi
}

verify_model() {
  local tok="$MODEL_DIR/tokenizer.json"
  local onnx="$MODEL_DIR/onnx/model.onnx"
  if [[ ! -f "$tok" ]]; then
    echo "::error::missing $tok" >&2
    exit 1
  fi
  if [[ ! -f "$onnx" ]]; then
    echo "::error::missing $onnx" >&2
    exit 1
  fi
  local tok_hash onnx_hash
  tok_hash="$(hash_of "$tok")"
  onnx_hash="$(hash_of "$onnx")"
  if [[ "$tok_hash" != "$TOK_EXPECT" ]]; then
    echo "::error::tokenizer.json SHA256 mismatch ($tok_hash)" >&2
    exit 1
  fi
  if [[ "$onnx_hash" != "$ONNX_EXPECT" ]]; then
    echo "::error::model.onnx SHA256 mismatch ($onnx_hash)" >&2
    exit 1
  fi
  echo "model ok: $MODEL_DIR"
  if command -v du >/dev/null 2>&1; then
    du -sh "$MODEL_DIR"
  fi
}

stage_sidecar() {
  local src_arg="${1:-}"
  local target="${2:-}"
  if [[ -z "$src_arg" || -z "$target" ]]; then
    echo "usage: $0 stage-sidecar <CLI binary directory with core-runtime.json> <target-triple>" >&2
    exit 1
  fi
  node "$ROOT/client/src-tauri/binaries/sync-cli-bin.mjs" "$src_arg" "$target"
}

cmd="${1:-}"
case "$cmd" in
  verify-model)
    verify_model
    ;;
  stage-sidecar)
    stage_sidecar "${2:-}" "${3:-}"
    ;;
  *)
    echo "usage: $0 verify-model | stage-sidecar <CLI-binary-directory> <target-triple>" >&2
    exit 1
    ;;
esac
