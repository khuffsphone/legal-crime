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
| `inspect_fbx.py` | Diagnostic (no render): prints each FBX's objects/meshes(skin status)/armature bones+root/actions, and whether each clip's root **travels vs in-place**. Run this first on a new clip set to confirm the job map. |
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

## Real model render — the animated thug (#5)

The real pass uses `source: "fbx"`. Each animation is **one FBX** (a rigged+skinned mesh); the job lists a
per-clip `fbx` path; the renderer imports each, applies the toon look, and the bbox pre-pass locks **one
shared scale + foot anchor across all clips** so idle/walk/run/hurt line up in-game. Works for Mixamo and
**Meshy-native** exports alike.

**0. Inspect first (Meshy-native filenames are unknown to the repo).** Before touching the job, dump the real
structure — this answers "is each clip its own FBX?", "what are the bone/root names?", and "does walk/run
travel or stay in place?":

```powershell
# Windows
& $env:BLENDER_PATH -b -P tools\blender\inspect_fbx.py -- --dir assets\raw\thug
```
```bash
# macOS/Linux
"$BLENDER_PATH" -b -P tools/blender/inspect_fbx.py -- --dir assets/raw/thug
```

**1. Put the clip FBX here (gitignored — inputs, never shipped).** The job's literal paths are the actual
Meshy-native export filenames:

```
assets/raw/thug/Meshy_AI_biped_Animation_Short_Breathe_and_Look_Around_withSkin.fbx  -> idle    (loop)
assets/raw/thug/Meshy_AI_biped_Animation_Walking_withSkin.fbx                         -> walk    (loop)
assets/raw/thug/Meshy_AI_biped_Animation_Running_withSkin.fbx                         -> run     (loop)
assets/raw/thug/Meshy_AI_biped_Animation_Hit_Reaction_withSkin.fbx                    -> hurt    (loop)
assets/raw/thug/Meshy_AI_biped_Animation_Punch_Combo_1_withSkin.fbx                   -> attack  (once)
```

If a literal path is missing, the renderer **keyword-resolves** it from the same folder (`idle`/`walk`/`run`/
`hurt`/`attack`, plus `breath/stand`, `jog/sprint`, `injured/hit/reaction`, `punch/melee`). It logs the file
it picked (`FBX_RESOLVE …`) and errors clearly if a clip is ambiguous or missing. To pin exact paths, edit
the `actions[].fbx` entries in the job.

`attack` (Punch_Combo_1) is a **non-loop** clip — it plays once; the others loop. The ingest knows `attack`
and falls back to **idle** only if its sheet is absent.

> **Multiple actions in one FBX / contaminating baselayers.** Some exports ship a baked
> `…Right_Upper_Hook_from_Guard|baselayer` action *alongside* the real clip — that stray guard pose was the
> "boxing-stance walk" bug. The importer now **drops any action whose name contains `baselayer`/`Guard`/`Hook`**
> and selects the intended one: a per-clip `"actionName"` hint in the job wins, else `mixamo.com|Layer0` (the
> real Mixamo clip layer), else a keyword match on the action name. It logs the pick per file
> (`ACTION_PICK file=… -> '…'`), so a wrong choice is visible in the render output. Set `"actionName"` on an
> `actions[]` entry to pin an exact take if the auto-pick ever guesses wrong. Run `inspect_fbx.py` first — it
> lists every take and tags the contaminants.

**2. Render (local).** The job is `render_jobs/thug_gangster.json`.

- **Windows (PowerShell)** — your verified `BLENDER_PATH`, no xvfb needed (desktop GL is present):
  ```powershell
  & $env:BLENDER_PATH -b -P tools\blender\render_iso_unit.py -- --job tools\blender\render_jobs\thug_gangster.json --engine BLENDER_EEVEE
  # if EEVEE errors headless, retry the same line with: --engine CYCLES
  ```
- **macOS/Linux:** `BLENDER_PATH=/path/to/blender tools/blender/render_thug_gangster.sh`

Emits `public/assets/sprites/units/thug_{idle,walk,run,hurt}.png` + `thug_manifest.json` (**overwrites the
placeholder**). Squeeze them after with `pngquant` (flat toon art → ~95% smaller, identical at on-screen size),
then commit the PNGs + manifest. The Phaser ingest (`?sprites`) reads them with **no code change**.

**3. Facing calibration.** `modelForwardDeg` (in the job) yaws the rig so its front matches `dir0`. If the
gangster faces the wrong way in-game, set it to `180` (Mixamo's forward axis commonly flips on FBX import) —
or nudge the runtime `dirOffset` in `unitSpriteView`. Verify against `unitFacingQuantize.FACING_TO_DIR`.

> **Root-motion strip (source-agnostic).** `inPlace: true` re-centres the figure each frame so locomotion
> that **travels** still renders in place — and it does **not** shrink `orthoScale` to compensate. For real
> FBX it translates the import pivot so the **root/hips bone sits over world origin in XY** every frame
> (`center_root_world_xy`), preserving the vertical (Z) bob; for the blockout it zeroes the rig's own root
> XY. This handles Meshy-native clips (which have no "In Place" export option) and Mixamo alike. If
> `inspect_fbx.py` reports a clip as `IN-PLACE` the strip is a harmless no-op; if it `TRAVELS`, the strip is
> what keeps the figure from sliding out of the cell.

### Generic swap (any future unit)

Point a job's `source` at `fbx` with per-clip paths, set `modelForwardDeg` if the rig's forward differs, map
the clip names in `actions[]` (or rely on keyword auto-resolve). Sheet layout, manifest schema, and the
Phaser ingest are unchanged.
