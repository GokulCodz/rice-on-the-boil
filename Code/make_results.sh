#!/bin/sh
# Regenerate Results/ (SVG figures + CSV tables) with macOS JavaScriptCore.
# Usage:  sh Code/make_results.sh        (from anywhere)
# Override the engine with  JSC=/path/to/jsc sh Code/make_results.sh
set -e
cd "$(dirname "$0")/.."
JSC="${JSC:-/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc}"
if [ ! -x "$JSC" ]; then JSC="$(command -v jsc || true)"; fi
if [ -z "$JSC" ]; then echo "jsc (JavaScriptCore) not found; set JSC=/path/to/jsc" >&2; exit 1; fi
mkdir -p Results
"$JSC" Model/physics.js Model/plots.js Code/checks.js Code/make_results.js -- --quiet | awk '
  /^@@FILE / { if (f) close(f); f = "Results/" $2; printf "" > f; n++; next }
  /^@@LOG /  { print "  " substr($0, 7); next }
  f          { print >> f }
  END        { print "  wrote " n " files to Results/" }'
