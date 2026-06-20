# Isometric art drop-in (RTS-7)

The iso scene (`src/scenes/IsoScene.ts`) loads every texture below and falls back to a
labeled colored placeholder for anything missing — so the scene **always renders**. Drop a
real PNG at the matching path (filename **exactly** as listed, no version suffix) and it
appears automatically; no code change is needed. The manifest is `src/scenes/isoAssets.ts`.

## Projection spec (locked by RTS-1 — generate art against these)
- 2:1 dimetric. Ground tile diamond = **128 × 64 px** (`ISO_TILE_PX_WIDTH × ISO_TILE_PX_HEIGHT`).
- Grid +X goes down-right on screen; +Y goes down-left.
- Placement: a sprite is drawn at the tile **center** (`gridToScreen(gx, gy)`).
- Anchoring:
  - **tiles** → origin (0.5, 0.5): the 128×64 diamond covers the tile exactly.
  - **buildings / units** → origin (0.5, 1.0) = **bottom-center**: the base sits on the tile
    center and the body rises upward (−y), overlapping tiles/objects behind it correctly.
- Sizing: a 1×1-footprint building base is **128 px** wide; taller art extends upward. An N×N
  building scales the base width by N (a 2×2 ≈ 256 px). Units use a ~64 px base. Trim
  transparent margins so the footprint aligns to the diamond.

## Expected files
### `tile/` (128×64 diamonds, origin 0.5/0.5)
- `LCR_iso_tile_cobble.png`
- `LCR_iso_tile_street.png`

### `building/` (128 px base, origin 0.5/1.0)
- `LCR_iso_bldg_hq.png`
- `LCR_iso_bldg_storefront.png`
- `LCR_iso_bldg_speakeasy.png`
- `LCR_iso_bldg_gamblinghall.png`
- `LCR_iso_bldg_warehouse.png`

### `unit/` (~64 px base, origin 0.5/1.0)
- `LCR_iso_unit_collector.png`
- `LCR_iso_unit_enforcer.png`
- `LCR_iso_unit_thug.png`
