# Legal Crime — Art Drop Folder (Phase 20)

Drop processed PNGs here and they appear in the game automatically — **no code change
needed**. Until a file exists, the scene renders a labeled colored placeholder in its place,
so the game always runs.

Use these **exact filenames** (the `LCR_` convention WITHOUT the `_v<N>` version suffix).
The scene loads each from `public/assets/<category>/<file>` (served at `/assets/...`).

## env/  (district backdrops)
- `LCR_env_industrial.png`
- `LCR_env_downtown.png`
- `LCR_env_waterfront.png`
- `LCR_env_alley.png`

## buildings/  (rackets, HQ, collection centers)
- `LCR_bldg_hq.png`
- `LCR_bldg_speakeasy.png`
- `LCR_bldg_gamblinghall.png`
- `LCR_bldg_collectioncenter.png`
- `LCR_bldg_storefront.png`

## units/  (crew)
- `LCR_unit_thug.png`
- `LCR_unit_thompsonman.png`
- `LCR_unit_collector.png`
- `LCR_unit_cadillac.png`

## screens/  (full-screen art)
- `LCR_screen_title.png`
- `LCR_screen_gameover.png`

The authoritative list lives in code at `src/scenes/assets.ts` (`ASSET_MANIFEST`).
Recommended sprite size: buildings/units ~128–256px square with transparency; env/screens
sized for the canvas (≈960×600 or larger). Style per CANON.md (Fedora Noir).
