# DECISION — Env Kit render scale: tile-calibrated FIXED scale for ALL kit pieces

**Question (env-kit-p1 dispatch, Step 2):** do the modular building kit pieces render at the
tile-calibrated fixed scale (`fixedOrthoScale 2.8284`) or via the character pipeline's
frame-to-fit bbox-prepass?

## Ruling

**FIXED SCALE for every kit piece. Frame-to-fit is BANNED for anything that recombines.**
The prior is CONFIRMED, with one precision upgrade: the canon invariant is not the number
`2.8284` — it is the **pixel density** `canvas / ortho_scale = 64·√2 ≈ 90.5097 px per Blender
unit`, with **1 BU = 1 tile edge**. `2.8284 (= 2√2)` is that density at the unit pipeline's
256-px canvas; a kit piece rendered on a different canvas keeps the density by setting
`ortho_scale = canvas / (64·√2)` (e.g. 512 canvas → 5.6569). Locking the *number* instead of
the *density* would silently halve every piece rendered on a larger canvas.

## Evidence (verified against the shipped pipeline first, per dispatch)

1. **Anchors.** `render_iso_unit.py` writes `anchorX 0.5 / anchorY 1.0` on every frame and
   `frame_camera()` places the subject's lowest projected point on the canvas bottom edge —
   the foot/base baseline. `spriteManifest.validateManifest` hard-fails any other anchor.
   Both shipped manifests (`thug_manifest.json`, `cop_manifest.json`) carry it. Buildings
   share the contract: base-centre on the tile, body rises −y (`isoAssets.ts`, research §A5).
2. **Atlas packing.** The unit packer is uniform-cell `8 dirs × N frames` with cell = canvas —
   structurally wrong for static, single-view, variable-size kit pieces (confirmed in
   `docs/env-kit/PHASE1_RENDER_MODE.md`, #53). The kit therefore uses a separate single-view
   packer (`render_iso_kit.py`) that reuses `render_iso_common`'s camera/toon/Freestyle/lights
   — exactly the split #53 pre-authorised ("a separate render_iso_building.py could bake
   single pieces at a tile-calibrated ortho scale").
3. **The fixed-scale hook already ships.** `render_iso_common.frame_camera(force_ortho_scale=)`
   (#56/#59) bypasses bbox auto-fit while keeping the bbox for horizontal centring + foot
   anchor; both the thug and cop jobs lock `output.fixedOrthoScale: 2.8284`. The master plan
   (PLAN — 25-Asset Batch, 2026-07-01) locks the whole batch to this shared scale.
4. **Calibration cube (empirical, this container, bpy 5.0.1 headless EEVEE).** A 1×1×1 BU cube
   through the exact character camera (dimetric2to1 → X 60°, Z 45°, ortho) at
   `force_ortho_scale 2.8284`, 256 canvas:
   - `px_per_bu` measured **90.5105** (predict 90.5097 = 64√2) ✓
   - projected + **pixel-measured** sprite width **128 px** (1 BU plan edge → one tile width) ✓
   - measured height **142 px** = 64 (top diamond) + **78.38** (vertical edge = 90.51·sin 60°) ✓
   - top face a perfect 2:1 diamond, Z edges dead-vertical, base on the bottom canvas edge ✓
   (Research §2.3's unit test, passed on the first live run.)

## Root cause — why frame-to-fit drifts recombined modules

`frame_camera`'s auto-fit computes `ortho_scale` from the **subject's own bounds**
(`max(scale_by_h, scale_by_w)`), so px-per-BU varies per piece: a 1-floor storefront and a
2-floor facade body would render at *different* densities, and any two pieces meant to butt
or stack (bay next to bay, floor band on floor band) would disagree on the px height of the
same world edge — 1-px-plus seams, storey misalignment, and door/figure clearance breaks
(the corrected 76 px commercial door only clears the 56 px thug if the door actually renders
at 76 px). Characters get away with auto-fit because each unit is a *standalone* subject whose
manifest carries its own `figurePxH` and the loader display-scales it; kit pieces have **no
runtime rescale** — the sheet pixel IS the screen pixel. Frame-to-fit remains acceptable
**only** for standalone one-off props that never share an edge with another piece — and even
Track A props lock 2.8284 for cross-asset size coherence, so in practice: fixed scale, always.

## Authoring conversions (corrected constants are canon — facadeKit.ts)

All corrected constants are **screen px**. At the locked density:

| Axis | Conversion | Notes |
|---|---|---|
| Plan (frontage/depth) | **1 tile = 1 BU** (→ 128 px projected diamond width; a frontage tile runs +64 px screen-x) | matches `gridToScreen` |
| Vertical (heights) | **1 BU = 78.3846 px** screen (90.5097·sin 60°), i.e. **authored BU = px / 78.3846** | FLOOR_GROUND 132 px = 1.6840 BU · FLOOR_UPPER 116 px = 1.4799 BU · door 76 px = 0.9696 BU · parapet 40 px = 0.5103 BU |
| ft (reference only) | vertical **9.3 px/ft** (corrected canon) → 1 ft = 0.11864 BU | the research doc's "8 px/ft" tile-frontage label is a *horizontal* mapping and is superseded for all vertical dimensioning |

Piece canvases are sized per piece (smallest 4-px-snapped canvas that fits the projection +
pad) with `ortho_scale = canvas / 90.5097`; the manifest records both plus the density so a
mismatch is machine-checkable.

## Consequences

- `tools/blender/render_iso_kit.py` — kit entry: single view, fixed density, per-piece canvas,
  foot-baseline anchor (0.5, 1.0), toon+Freestyle from `render_iso_common`, one PNG + manifest
  per piece. No 8-dir rows, no animation frames, no bbox-driven zoom.
- Kit piece manifests carry `pxPerBu: 90.5097`, `orthoScale`, `canvas`, px dims, tile
  footprint, and snap rules; a repo test pins the density relation.
- RAW PNG only (pngquant banned — flat toon bands survive it, but the ban is canon since 9858dcf).
