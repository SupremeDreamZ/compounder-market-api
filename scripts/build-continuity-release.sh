#!/bin/bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${1:-$HOME/Documents/_Projects/Backups}"
BUNDLE="$BACKUP_DIR/compounder-market-api.bundle"
ARCHIVE="$BACKUP_DIR/compounder-market-api-standalone.tar.gz"
CHECKSUMS="$BACKUP_DIR/compounder-market-api-SHA256SUMS"
STAGE="$(mktemp -d)"

cleanup() {
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
