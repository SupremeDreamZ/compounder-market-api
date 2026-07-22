#!/bin/bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${1:-$HOME/Documents/_Projects/Backups}"
BUNDLE="$BACKUP_DIR/compounder-market-api.bundle"
ARCHIVE="$BACKUP_DIR/compounder-market-api-standalone.tar.gz"
CHECKSUMS="$BACKUP_DIR/compounder-market-api-SHA256SUMS"
STAGE="$(mktemp -d)"
TEST_PID=""

cleanup() {
  if [ -n "$TEST_PID" ]; then
    kill "$TEST_PID" 2>/dev/null || true
    wait "$TEST_PID" 2>/dev/null || true
  fi
  rm -rf "$STAGE"
}
trap cleanup EXIT

cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to package an uncommitted worktree. Commit and verify first." >&2
  exit 65
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

npm run verify
npm run verify:production

git bundle create "$BUNDLE.tmp" --all
git bundle verify "$BUNDLE.tmp"
mv "$BUNDLE.tmp" "$BUNDLE"
chmod 600 "$BUNDLE"

if [ ! -f ".next/standalone/server.js" ]; then
  echo "Standalone server was not generated." >&2
  exit 66
fi

cp -R .next/standalone/. "$STAGE/"
# The x402 Next wrapper validates Bazaar through a webpack-ignored runtime
# import. Static tracing cannot see that dependency closure, so package the
# installed production tree and prune development-only modules in isolation.
rm -rf "$STAGE/node_modules"
cp -R node_modules "$STAGE/node_modules"
cp package.json package-lock.json "$STAGE/"
(
  cd "$STAGE"
  npm prune --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
)
mkdir -p "$STAGE/.next"
cp -R .next/static "$STAGE/.next/static"
if [ -d public ]; then
  cp -R public "$STAGE/public"
fi
mkdir -p "$STAGE/scripts"
cp scripts/verify-production.mjs "$STAGE/scripts/verify-production.mjs"
cp OPERATIONS.md STATUS.json README.md "$STAGE/"

REVISION="$(git rev-parse HEAD)"
CREATED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf '%s\n' \
  "Compounder Market API offline runtime" \
  "Created: $CREATED_AT" \
  "Git revision: $REVISION" \
  "Start: HOSTNAME=127.0.0.1 PORT=4021 node server.js" \
  "Verify from another shell: COMPOUNDER_BASE_URL=http://127.0.0.1:4021 node scripts/verify-production.mjs" \
  > "$STAGE/OFFLINE-START.txt"

# Clean-room self-test before archiving. This catches dynamically loaded
# packages that a normal source-tree test would accidentally satisfy.
HOSTNAME=127.0.0.1 PORT=44021 node "$STAGE/server.js" > "$STAGE/runtime-self-test.log" 2>&1 &
TEST_PID=$!
READY=0
for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:44021/api/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.2
done
if [ "$READY" -ne 1 ]; then
  echo "Standalone runtime did not become ready." >&2
  node -e 'const fs=require("fs"); console.error(fs.readFileSync(process.argv[1],"utf8").split("\n").slice(0,120).join("\n"))' "$STAGE/runtime-self-test.log"
  exit 67
fi
COMPOUNDER_BASE_URL=http://127.0.0.1:44021 node "$STAGE/scripts/verify-production.mjs" >/dev/null
if node -e 'const fs=require("fs"); const s=fs.readFileSync(process.argv[1],"utf8"); process.exit(s.includes("Failed to load bazaar extension") ? 0 : 1)' "$STAGE/runtime-self-test.log"; then
  echo "Standalone runtime could not load the Bazaar extension package." >&2
  node -e 'const fs=require("fs"); console.error(fs.readFileSync(process.argv[1],"utf8").split("\n").slice(0,120).join("\n"))' "$STAGE/runtime-self-test.log"
  exit 68
fi
kill "$TEST_PID"
wait "$TEST_PID" 2>/dev/null || true
TEST_PID=""
rm -f "$STAGE/runtime-self-test.log"

tar -czf "$ARCHIVE.tmp" -C "$STAGE" .
mv "$ARCHIVE.tmp" "$ARCHIVE"
chmod 600 "$ARCHIVE"

(
  cd "$BACKUP_DIR"
  shasum -a 256 "$(basename "$BUNDLE")" "$(basename "$ARCHIVE")" > "$(basename "$CHECKSUMS")"
  shasum -a 256 -c "$(basename "$CHECKSUMS")"
)
chmod 600 "$CHECKSUMS"

printf 'bundle=%s\narchive=%s\nchecksums=%s\nrevision=%s\n' \
  "$BUNDLE" "$ARCHIVE" "$CHECKSUMS" "$REVISION"
