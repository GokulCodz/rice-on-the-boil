#!/bin/sh
# Regenerate every figure and table in Results/ (macOS; uses the built-in JavaScriptCore, no installs).
# Usage, from the project folder:   sh Code/make_results.sh
set -e
cd "$(dirname "$0")/.."
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
mkdir -p Results
"$JSC" Model/physics.js Model/plots.js Code/checks.js Code/make_results.js -- --quiet \
  | awk '/^@@FILE /{ if (f) close(f); f = "Results/" $2; printf "" > f; next } { print >> f }'
echo "Results written:"; ls -1 Results
