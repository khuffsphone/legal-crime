#!/usr/bin/env bash
# Render the PLACEHOLDER thug sprite sheets headlessly. NOT part of the app build — offline tooling.
# Tries EEVEE (toon cel + Freestyle, per spec) under xvfb; falls back to CYCLES if the GL context fails.
#
#   tools/blender/render_thug_placeholder.sh
#
# Requires: blender (4.x), and for EEVEE a GL context (xvfb-run + mesa, or EGL). Set BLENDER_PATH to override.
set -euo pipefail

BLENDER="${BLENDER_PATH:-blender}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
JOB="$HERE/render_jobs/thug_placeholder.json"
SCRIPT="$HERE/render_iso_unit.py"

run() { # engine
  local engine="$1"; shift
  echo ">> rendering with $engine"
  if command -v xvfb-run >/dev/null 2>&1; then
    xvfb-run -a -s "-screen 0 512x512x24" "$BLENDER" -b -P "$SCRIPT" -- --job "$JOB" --engine "$engine"
  else
    "$BLENDER" -b -P "$SCRIPT" -- --job "$JOB" --engine "$engine"
  fi
}

cd "$ROOT"
if run "BLENDER_EEVEE"; then
  echo "DONE (EEVEE)"
else
  echo "EEVEE failed; retrying with CYCLES (CPU, no GL needed)"
  run "CYCLES"
  echo "DONE (CYCLES fallback)"
fi
