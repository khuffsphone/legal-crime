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

**1. Stage the clip FBX here (gitignored — inputs, never shipped).** Rename the 5 'Chicago Gangster A Po'
per-clip exports to short names — no ambiguity, no long-filename typing:

```
assets/raw/thug/idle.fbx     <- ..._Short_Breathe_and_Look_Around_withSkin.fbx
assets/raw/thug/walk.fbx     <- ..._Walking_withSkin.fbx
assets/raw/thug/run.fbx      <- ..._Running_withSkin.fbx
assets/raw/thug/hurt.fbx     <- ..._Slap_Reaction_withSkin.fbx
assets/raw/thug/attack.fbx   <- ..._Boxing_Guard_Prep_Straight_Punch_withSkin.fbx   (non-loop)
```

**Remove any OTHER `.fbx` from this folder first** — a stale file (e.g. an old `Walking.fbx`) makes the
keyword fallback ambiguous and the renderer aborts by design. With the exact short names above the job matches
directly; the keyword fallback (`idle`/`walk`/`run`/`hurt`/`attack` + synonyms) is just a backstop.

`attack` is a **non-loop** clip — it plays once; the others loop. The ingest knows `attack` and falls back to
**idle** only if its sheet is absent.

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

Emits `public/assets/sprites/units/thug_{idle,walk,run,hurt,attack}.png` + `thug_manifest.json` (**overwrites
the placeholder**; the manifest's `placeholder` flips to `false`). **Eyeball the sheets in-browser BEFORE you
squeeze (step 4).** Then squeeze with `pngquant` (flat toon art → ~95% smaller, identical at on-screen size),
and commit the PNGs + manifest. The Phaser ingest (`?sprites`) reads them with **no code change**.

**3. Facing calibration.** `modelForwardDeg` (in the job) yaws the rig so its front matches `dir0`. If the
gangster faces the wrong way in-game, set it to `180` (Mixamo's forward axis commonly flips on FBX import) —
or nudge the runtime `dirOffset` in `unitSpriteView`. Verify against `unitFacingQuantize.FACING_TO_DIR`.

**4. Eyeball in-browser (`?sprites`) — the actual animation smoke-check.** The tests validate the manifest
*data*; only this confirms the clips *look* right. The render output lives under `public/`, so the dev server
serves it with no rebuild.

```powershell
npm run dev
# open the printed URL with the opt-in flag, e.g.:
#   http://localhost:5173/?sprites
```

- `?sprites` (any non-falsy value) swaps the thug's procedural figure for the rendered atlas. The flag is
  **off by default**; without it you see the primitive figure. `?sprites=0` / `false` / `no` force it off.
- If the manifest or the **idle** sheet fails to load, the view **silently falls back** to the procedural
  figure (no crash). So *if you still see boxes, the sheets didn't load* — check the browser Network tab for
  404s on `assets/sprites/units/thug_*.png` / `thug_manifest.json` and confirm `placeholder:false`.
- Optional `?spritescale=N` (0.25–6, e.g. `?sprites&spritescale=2`) enlarges the on-screen unit so you can
  scrutinise frames; it's a display zoom only, not a re-render.

## Textured GLB render — colour (`source: "glb"`)

The FBX pass renders **flat grey** because FBX export dropped the Meshy texture. The GLB pass keeps it: a
`source: "glb"` job imports via `import_scene.gltf` and — with `shader.keepSourceMaterial: true` — renders the
GLB's own PBR material (its 4096² base-colour texture) instead of the toon-grey override. Everything else
(camera 60/45, 256 canvas, 8 dirs, anchors, `inPlace` root-strip, the bbox scale-lock, the manifest schema)
is identical to the FBX pass, so it drops into the loader unchanged.

**FULL 5-clip render (the final colour set): `render_jobs/thug_glb.json`.** All five clips (idle/walk/run/
hurt/attack) in ONE job — that single job is the **shared-scale** precondition (below). Stage the five
textured GLBs (gitignored inputs) at the exact paths in the job, then:

```powershell
# Windows PowerShell — SPLIT STREAMS (Meshy meshes throw heavy edge-warning spam on stderr; keep it OFF the
# gate stream so it can't abort a *> capture). ErrorActionPreference Continue keeps going past the warnings.
$ErrorActionPreference='Continue'
& $env:BLENDER_PATH -b -P tools\blender\render_iso_unit.py -- --job tools\blender\render_jobs\thug_glb.json --engine BLENDER_EEVEE 1> thug_glb.out 2> thug_glb.err
# then paste thug_glb.out (the gate log). thug_glb.err is just the mesh-warning noise.
```

Expect in `thug_glb.out`: **5×** (`IMPORTED <action> <- …withSkin.glb`, a `DROP non-character mesh … 'Icosphere'`
line, `KEEP source material`, a `MATERIAL 'Material_1': principled=True images=[…4096x4096]` diagnostic,
`TEXTURE downscaled … 4096 -> 1024`); one `ROOT-STRIP applied (in-place)`; a `LOCKED-SCALE …` line naming the
clip/frame that drove the widest span; a `SHARED-SCALE OK: ONE figurePxH=… locked across 5 clips` line; **5×**
`SHEET …/thug_<action>.png rows=8`; and `RENDER_OK unit=thug actions=5 dirs=8 figurePxH=… orthoScale=…`.

### ★ Shared scale (the load-bearing item)

The bbox pre-pass **unions all five clips' full frame ranges** into ONE `ortho_scale`/`figurePxH`, so every
action renders at the SAME size — attack's wide arm-throw can't shrink the normalised figure vs a compact
idle (the resize-on-action bug we killed on the grey render). This only holds because all five are in **one
job**; do **not** render them as five separate jobs. The render logs the single locked scale + which
clip/frame/dir drove the widest span + each clip's own extent, and **`RENDER_FAIL`s** if any clip escapes the
shared union. `spriteManifest.test.ts` guards the emitted manifest (one top-level `figurePxH`; no per-action
scale key), and the loader normalises on-screen size by that one `figurePxH` (`spriteDisplayScale`).

### pngquant squeeze (K approved — but eyeball banding)

Local `pngquant` isn't on PATH, so use the bundled bin via `npx`. After the render, squeeze all five in place:

```powershell
foreach ($a in 'idle','walk','run','hurt','attack') {
  npx pngquant-bin --force --speed 1 --output "public\assets\sprites\units\thug_$a.png" "public\assets\sprites\units\thug_$a.png"
}
```

⚠ These are **photoreal** (pinstripe / skin / two-tone-shoe gradients) — 256-colour bands *much* harder than
the flat-grey sheets did. **Eyeball at least one squeezed sheet for banding before trusting the setting**; if
it bands, re-run at a higher colour count (`--quality=80-100`, or drop `pngquant` for the gradient-heavy
clips). Report before/after sizes. Do not treat "it ran" as "it's clean" — banding is a human call.

### Other colour-pass notes
- `output.viewTransform: "Standard"` renders true texture colour (EEVEE's default AgX tone-maps what you're
  judging). Override in the job if you want the filmic look.
- **PBR-through-EEVEE.** If a sheet renders black/untextured, read that clip's `MATERIAL …` diagnostic in
  `.out` (is a base-colour image wired to the Principled BSDF?) and report it — don't force a pass.

**What to verify (the things automated tests can't — the human gate):**
1. **Colour reads on all 5** — navy suit, skin tone, two-tone shoes (as the walk pilot confirmed), on idle/
   run/hurt/attack too.
2. **NO resize between actions** in-game — the thug is the SAME size whether idling, running, or attacking
   (the whole point of the shared scale). Watch a unit cycle idle→walk→run→attack.
3. **Facing** — the thug faces its travel direction in all 8 dirs. Camera keeps `modelForwardDeg:0` like the
   grey render, so `THUG_FACING_OFFSET` (+4) is applied unchanged — **but the GLB imports via a different path
   than the FBX**, so if it moonwalks, set `THUG_FACING_OFFSET=0` in `unitFacingQuantize.ts` (or re-render
   with `modelForwardDeg:180`).
4. **Banding acceptable** post-`pngquant` (see above).
5. **Clips read right** — idle breathes / looks around, run reads as a run, **attack plays once and holds**
   (doesn't loop); **feet planted** (foot anchor 0.5,1.0).

If these look right, commit the sheets + manifest. If colour/facing/scale is off, it's a **render** fix
(clip, `modelForwardDeg`, or the job), not a code change.

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
