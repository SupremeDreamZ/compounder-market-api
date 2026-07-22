#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${COMPOUNDER_BACKUP_DIR:-$HOME/Documents/_Projects/Backups}"
BUNDLE="$BACKUP_DIR/compounder-market-api.bundle"
STATE_DIR="$ROOT/.state"
LOG="$STATE_DIR/continuity-refresh.log"

cd "$ROOT"
mkdir -p "$STATE_DIR"

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️ Compounder continuity refresh skipped: the project worktree is not clean."
  exit 0
fi

HEAD_REV="$(git rev-parse HEAD)"
BUNDLE_REV=""
if [ -f "$BUNDLE" ]; then
  while read -r revision reference; do
    if [ "$reference" = "refs/heads/main" ]; then
      BUNDLE_REV="$revision"
      break
    fi
  done < <(git bundle list-heads "$BUNDLE" 2>/dev/null || true)
fi

if [ "$HEAD_REV" = "$BUNDLE_REV" ]; then
  exit 0
fi

if bash scripts/build-continuity-release.sh > "$LOG" 2>&1; then
  echo "📦 Compounder continuity artifacts refreshed to Git revision $HEAD_REV."
  exit 0
fi

echo "Compounder continuity refresh failed. Recent log output:" >&2
node -e 'const fs=require("fs"); const s=fs.readFileSync(process.argv[1],"utf8").split("\n"); console.error(s.slice(-40).join("\n"))' "$LOG" >&2
exit 1
