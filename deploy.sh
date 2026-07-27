#!/bin/bash
set -e

REPO=/yabbyville/Yabby
LOG=/yabbyville/logs/deploy.log

exec >> "$LOG" 2>&1
echo "=== Deploy started at $(date) ==="

export PATH="$HOME/.local/bin:$PATH"
cd "$REPO"

git fetch origin main
git reset --hard origin/main

npm ci
npm run build

echo "=== Deploy finished at $(date) ==="