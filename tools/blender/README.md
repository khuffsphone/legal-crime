# Blender → iso sprite-sheet pipeline (offline tooling)

Scriptable, headless Blender pipeline that renders a 3D unit to 2D **isometric sprite sheets** framed to the
game's exact tile projection, plus a manifest the Phaser ingest consumes behind `?sprites`. This proves the
pipeline **end-to-end with a throwaway placeholder** so the real Meshy/Mixamo thug FBX later only has to
**swap the model** — same render script, same manifest schema, same Phaser ingest.

> **Not shipped.** The placeholder thug (boxes + cylinders + a 6-bone rig) is a stand-in, not art. The
> emitted sheets are flagged `"placeholder": true` in the manifest. The browser bundle never imports
> anything in `tools/`.

## Files

| File | Role |
|------|------|
| `blockout_thug.py` | Builds the crude primitive thug (coat/head/fedora/legs/arms/bat) + armature + 3 baked clips (idle/walk/attack). Importable (`build_thug()`) or standalone (`-- --save out.blend`). |
| `render_iso_common.py` | Camera math (the tile-locked angle), toon/Freestyle look, lights, bbox pre-pass, sheet packer, manifest helpers. |
| `render_iso_unit.py` | Headless entry: build/import → camera → bbox pre-pass → render each action sheet (rows=8 dirs × cols=frames) → write PNG + manifest. |
| `render_jobs/thug_placeholder.json` | The placeholder job (camera/actions/shader/light/framing knobs). |
| `render_thug_placeholder.sh` | Wrapper: EEVEE under `xvfb` with a CYCLES fallback. |

## Run

```bash
tools/blender/render_thug_placeholder.sh
# emits public/assets/sprites/units/thug_{idle,walk,attack}.png + thug_manifest.json
```

Needs Blender 4.x. Set `BLENDER_PATH` to override the binary. EEVEE needs a GL context — the wrapper uses
`xvfb-run` (+ mesa) and falls back to CYCLES (CPU, no GL) if that fails. Blender uses the **system** Python,
so `numpy` must be importable there (`apt install python3-numpy`). The committed PNGs were squeezed with
`pngquant` after rendering (flat toon art → ~95% smaller, visually identical at the on-screen ~56px size).

## The camera lock (grounded against the live render code)

`src/sim/iso.ts` uses `ISO_TILE_WIDTH=128`, `ISO_TILE_HEIGHT=64` → a **2:1 dimetric** ground tile. A flat
unit tile viewed orthographically from elevation `α` projects to `height/width = sin(α)`. For 2:1
(`H/W=0.5`): `sin α = 0.5` → `α = 30°` elevation = **60° from top-down**. So the camera is locked to:

- **`dimetric2to1` — 60° from top-down, Z (azimuth) = 45°.** Exact match for 128×64 tiles.

Rejected alternatives:
- `trueIso` = 54.7356° from top (35.264° elevation) → `sin = 0.577` → 1.73:1 tiles — does **not** match.
- The spec's check formula `90 − atan(tileH/tileW) = 90 − atan(0.5) = 63.435°` is a **coarse proxy** (~3.4°
  off the exact 60°); used as a sanity check, never as the lock.

8 facings = even 45° **model-yaw** steps (the model rotates, the camera + NW key light stay fixed for board
coherence). Foot anchor = bottom-centre; Phaser origin `(0.5, 1.0)`. Frames are 256² with the figure ≤224px
tall and the feet on the cell's bottom edge.

## Swapping in the real model later

Point the job's `source` at an `fbx`/`glb` path instead of `"blockout"`, set `modelForwardDeg` if the rig's
forward axis differs from the placeholder's (+Y), and map Mixamo action names in `actions[]`. Everything
downstream — sheet layout, manifest schema, Phaser ingest — is unchanged.
