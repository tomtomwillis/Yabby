#!/bin/bash
set -e

REPO=/yabbyville/Yabby
LOG=/yabbyville/logs/deploy.log

exec >> "$LOG" 2>&1
echo "=== Deploy started at $(date) ==="

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use default
cd "$REPO"

git fetch origin main
git reset --hard origin/main

npm ci

# Built beside the live copy and swapped in whole, so the site is never served
# half-written and a build that fails leaves the last good one in place.
rm -rf dist.next
npx tsc -b
npx vite build --outDir dist.next

# Tabs opened before this deploy still ask for the last build's files. Carry
# the recent ones over so those tabs keep working; -p keeps each file's age,
# so anything older than a week is left behind.
if [ -d dist/assets ]; then
  (cd dist/assets && find . -type f -mtime -7 | while IFS= read -r file; do
    [ -e "../../dist.next/assets/$file" ] || cp -p --parents "$file" ../../dist.next/assets/
  done)
fi

rm -rf dist.prev
if [ -d dist ]; then mv dist dist.prev; fi
mv dist.next dist

echo "=== Deploy finished at $(date) ==="