#!/bin/sh
# Usage: tests/rules-budget/run.sh [rules-file]
export JAVA_HOME=${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}
export PATH=$JAVA_HOME/bin:$PATH
RULES=${1:-firestore.rules} npx firebase emulators:exec --only firestore --project demo-yabby-budget "node tests/rules-budget/probe.mjs" 2>&1 | grep -E "^(full|minimal)"
