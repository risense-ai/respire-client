#!/usr/bin/env bash
# Stage a CLI build/release directory including its Core runtime manifest.
# Usage: bash sync-cli-bin.sh <CLI-binary-directory> [desktop-target]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/sync-cli-bin.mjs" "$@"
