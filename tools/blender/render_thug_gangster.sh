#!/usr/bin/env bash
# Render the REAL Mixamo "Chicago_Gangster" thug sprite sheets (idle/walk/run/hurt) headlessly.
# Offline tooling — NOT part of the app build. Local render (run on a machine with Blender + the FBX inputs).
#
#   1) put the 4 Mixamo clip FBX at assets/raw/thug/ (gitignored):
#        Breathing Idle.fbx, Walking.fbx, Running.fbx, Injured Walking.fbx   (Walking/Running exported In-Place)
#   2) BLENDER_PATH=/path/to/blender tools/blender/render_thug_gangster.sh
#
# Emits public/assets/sprites/units/thug_{idle,walk,run,hurt}.png + thug_manifest.json (overwrites placeholder).
# Windows: see tools/blender/README.md for the equivalent PowerShell one-liner (no xvfb needed there).
set -euo pipefail

BLENDER="${BLENDER_PATH:-blender}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
JOB="$HERE/render_jobs/thug_gangster.json"
SCRIPT="$HERE/render_iso_unit.py"

run() { # engine
  local engine="$1"; shift
  echo ">> rendering gangster with $engine"
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
