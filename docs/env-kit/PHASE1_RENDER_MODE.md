# Environment Modular Kit — Phase 1: render-mode decision (Task 1)

**Question:** should modular building pieces use a *tile-calibrated fixed-scale* render mode (deterministic
128×64px/tile, explicit floor/door/cornice px baked in) instead of the character pipeline's frame-to-fit +
bbox-prepass approach?

## Decision

**Yes to tile-calibrated fixed-scale — but built as a PROCEDURAL-VECTOR TypeScript module, not the Blender
atlas pipeline, and not frame-to-fit.** A **new** module (`src/scenes/env/facadeKit.ts`), **not** an
extension of `tools/blender/render_iso_unit.py`. No Blender is required for the flat low-tier pieces.

## Why (what the code actually does)

Inspected on `rts/isometric-conversion` @ `95185de`:

1. **Buildings are already tile-calibrated procedural iso *volumes*.** `src/scenes/cityArt.ts::drawIsoBuilding`
   draws each building live into a Phaser `Graphics`: a base diamond footprint (`hw≈54`, `hh≈27`), a **left
   (dark) wall + right (lit) wall** extruded up by `height`, a roof diamond, then `drawFacade(...)` paints
   storefront detail onto the **lit wall**. `IsoScene` holds them in `bizBuildings: Map<id, {gfx: Graphics,…}>`.
   Vertical massing already scales in **screen pixels** (`height * ENV_HEIGHT_SCALE`) — exactly the axis the
   corrected floor/door/cornice constants live on.
2. **The tile-calibration contract already exists.** `src/scenes/isoAssets.ts`: building sprites use origin
   **(0.5, 1.0)** (bottom-centre, base on the tile centre, body rises −y); a **1×1 footprint = 128px wide**;
   an N×N scales the base ×N. That IS "tile-calibrated fixed-scale."
3. **The character Blender atlas is the wrong shape for buildings.** `render_iso_unit.py` +
   `unitSpriteLoader` assume a **uniform-cell** sheet (`dirs×256 × cols×256`, `load.spritesheet` with a fixed
   `frameWidth/Height`), **8 directions**, **animation frames**, and **frame-to-fit** ortho scaling
   (`bbox_prepass` → per-render `ortho_scale`). Buildings are **static, single-view, variable-size** — none
   of those axes apply. Reusing it would fight every assumption and still need per-asset runtime scaling.

So the cleanest, lowest-risk, and canon-consistent path is a procedural-vector kit that emits a
**deterministic, 4px-snapped, tile-calibrated facade PLAN** (the corrected px as hard targets), painted by a
renderer. Phase 1 ships the plan engine + a flat **SVG elevation** preview; **Phase 2** skews the plan onto
the iso lit-wall (composing with / replacing `drawFacade`).

### Does it need a new Blender script?

**No — not for the low-tier flat pieces.** If a *landmark* later needs genuine 3-D relief (a deep stepped
Deco cornice, sculpted terra-cotta), a **separate** `render_iso_building.py` could bake single pieces at a
**tile-calibrated** ortho scale (10ft→128px), reusing `render_iso_common.py`'s camera/toon/Freestyle — but
that is optional, out of Phase-1 scope, and must NOT reuse the character entry's uniform-cell/8-dir/frame-fit
packer.

## Conflicts flagged (tile-calibrated math vs. what the renderer can produce)

1. **Flat facade (spec) vs. iso volume (renderer).** GPT-Pro models buildings as flat front elevations; the
   engine draws **extruded masses with two receding walls**. **Vertical** px map 1:1 (they are the extrusion
   height in screen px — clean). **Frontage** does NOT: a building's street width runs along the **screen
   diagonal** of the lit wall (`+64,+32` per tile), so a facade of `N` bays tiles along that diagonal, not a
   flat horizontal run. `facadeKit` keeps frontage in **tiles** (`widthPx = frontageTiles × 64`) so Phase-2
   drawing can skew it onto the wall basis; the SVG preview shows the un-skewed elevation for measurement.
2. **Footprint width mismatch.** `isoAssets` says 1×1 = **128px** wide; `drawIsoBuilding` actually draws an
   inset footprint (`hw=54` ⇒ **108px**). The kit parameterises frontage in tiles rather than hard-coding a
   half-width, but Phase-2 wall-drawing must read the real `hw/hh` (or a chosen footprint inset), not assume 64.
3. **Roofline choice shifts the tier range.** The doc's "low 160–276px" is computed with the **default
   cornice (28)**. The MVP ships a **plain parapet (40)**, so composed heights are **172 / 288** (1 / 2
   floors) = the doc range + (40−28). `facadeKit` asserts this tie-back explicitly.
4. **`fasciaSign` height is not in the corrected set.** Kept at the doc's un-corrected 20–32 band (28), framed
   by a 36px host band. Flagged for a future correction pass.

## What Phase 1 ships

- `src/scenes/env/facadeKit.ts` — corrected constants (hard targets) + the 7 MVP low-tier pieces +
  `composeLowTierFacade()` → a seamless, tile-calibrated plan.
- `src/scenes/env/facadeElevationSvg.ts` — pure plan → SVG elevation (px ruler + 56px character for the
  door-clearance read).
- `scripts/emit-facade-preview.ts` + `docs/env-kit/preview/*.svg` — reproducible visual proof.
- `tests/facadeKit.test.ts` — the corrected px are pinned; the stack is seamless; tier-range ties back; doors
  clear the 56px character.

**Not** shipped in Phase 1 (deliberately): in-engine iso-wall drawing, the other 21 kit pieces, mid/large
tiers, Blender building renders.
