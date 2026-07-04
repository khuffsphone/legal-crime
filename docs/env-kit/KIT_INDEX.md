# Environment Modular Kit — Phase 1 index (28 rendered pieces)

Every piece: single-view RAW PNG + manifest in `public/assets/sprites/env/`, rendered by
`tools/blender/render_iso_kit.py` from `tools/blender/render_jobs/kit_batch_phase1.json` (the proof
piece has its own job, `kit_storefront_low.json` — its K-approved pixels are never re-batched).
Contact sheet: `docs/env-kit/preview/kit_contact_sheet.png`. Batch log: `docs/env-kit/kit_batch_phase1.render.out`.

**Shared contract (the ruling — `DECISION_KIT_RENDER_SCALE.md`):** camera dimetric2to1 (X 60° / Z 45°,
ortho); density `canvas/ortho = 64·√2 ≈ 90.5097 px/BU`, 1 BU = 1 tile edge; vertical `78.3846 px/BU`;
anchor **(0.5, 1.0)** — base on the bottom canvas edge, horizontally centred; per-piece 4-px-snapped
canvas. All heights below are **corrected canon screen px** (`facadeKit.ts`); all are V_SNAP(4) multiples.

**Snap rules (assembly):**
- Frontage pieces butt along whole **bays** (1 bay = 1 tile = +64 screen-x / +32 screen-y along the
  lit-wall diagonal); `baseEdgePx` in each manifest gives the exact ground line relative to the anchor.
- Vertical stacking is by whole floor bands: ground 132 → upper 116 × N → cap (cornice/parapet).
  Because the camera is orthographic, floors stack by pure integer screen-y offsets — no re-skew.
- `overlay: true` pieces composite anchor-aligned OVER a host piece (no own wall); they never change
  the footprint. Corner-return walls are yawed +90° at construction (the dark screen-left face).

## Inventory (research spec §4 2026-06-30 + corrected-canon completions)

| pieceId | source | tier | plan | height (px, corrected) | role / notes |
|---|---|---|---|---|---|
| `body_brick_plain` | research #1 · facadeKit `brickUpper` | all | 2 tiles | **116** (FLOOR_UPPER) + 4px string course | the workhorse upper-floor wall band; stackable |
| `body_brick_pilastered` | research #2 | mid/large | 2 tiles | 116 | body B — 3 pilasters |
| `body_limestone` | research #3 | large | 2 tiles | 116 | body C — limestone/terra-cotta, double courses |
| `body_warehouse` | research #18 | large | 2 tiles | 116 | industrial: recessed spandrel + clerestory strip |
| `wall_alley_service` | research #15 | all | 2 tiles | 116 | blank dark brick + downpipe; non-street faces |
| `wall_corner_return` | research #24 | mid/large | 2 tiles | 116 | +90° yaw — the dark screen-left wall; wraps corners |
| `storefront_low_2bay` | research #4 · `storefrontGlass` | low/mid | 2 tiles | **132** = 20 bulkhead + 56 glass + 20 transom + 36 sign band | **the K-approved proof piece**; 76px commercial door |
| `storefront_recessed` | research #5 | mid | 2 tiles | 132 | centre-bay deep-set entry, flanking display glass |
| `storefront_speakeasy` | research #6 | all | 2 tiles | 132 | boarded/soaped panes, blank door + peephole, NO sign |
| `storefront_bar` | facadeKit `storefrontBar` (new) | low/mid | 2 tiles | 132 | opaque panelled front + high clerestory panes |
| `window_single` | research #7 | all | 1 tile | 116 band; window 20×40 | tiles horizontally per bay |
| `window_paired` | research #8 | mid/large | 1 tile | 116 band; 2× 20×40, shared sill | wealthier rhythm |
| `door_stair_residential` | research #9 · `doorResidential` | low/mid | 1 tile | **68** door + 20 transom (+8 lintel) | the taxpayer-block transom-lit stairwell |
| `door_commercial_76` | facadeKit `doorCommercial` (new) | all | 1 tile | **76** door | clears the 56px figure (doc §9.3) |
| `door_residential_68` | facadeKit `doorResidential` (new) | low/mid | 1 tile | **68** door + stoop | |
| `cornice_simple_28` | research #10 · `CORNICE_DEFAULT` | all | 2 tiles | **28** | fascia + projecting lip |
| `cornice_deco_40` | research #11 · `CORNICE_LARGE` | large | 2 tiles | **40** | stepped deco crown + dentils |
| `parapet_plain_40` | facadeKit `parapet` (new) | low/mid | 2 tiles | **40** (PARAPET_DEFAULT) | brick band + stone coping — the MVP roofline |
| `parapet_tall_56` | facadeKit `PARAPET_TALL` (new) | mid/large | 2 tiles | **56** | recessed centre panel |
| `sign_painted_wall` | research #12 · `fasciaSign` | all | overlay 96×48 | 48 | painted board — sepia, never brass |
| `sign_blade` | research #13 | mid/large | overlay ~48 proj × 64 | 64 | projecting blade on iron bracket; glow is a Phase-2 pass |
| `awning_canvas` | research #14 | low/mid | 2 tiles, ≤24px projection | mounts at 96 (transom top) | sloped weathered canvas + valance |
| `door_loading` | research #16 | mid/large | 1 tile | 96 | plank leaves, steel lintel, ramp sill |
| `fire_escape` | research #17 | mid/large | overlay 48×128 | 128 | iron stringers/platform/ladder silhouette |
| `roof_clutter_tank` | research #19 | mid/large | 1×1 tile | tank ~58 + chimney 32 | wood-stave tank, conical cap, brick chimney |
| `overlay_damage_boarded` | research #20 | all | overlay 2 tiles × 132 | — | growth state 1: X-planks, soaped glass, peeling patch |
| `overlay_wealth_trim` | research #21 | all | overlay 2 tiles × 132 | — | growth state 3: lit transom, trim course, valance — sepia, no brass |
| `overlay_fortified_bars` | research #22 | all | overlay 2 tiles × 132 | — | growth state 4: window bars, steel door shutter, sandbags |

**Research #23 (ownership base-plate tint) is deliberately NOT rendered:** faction ownership already
ships as the live vector base-plate path (`IsoScene.bizPlates` + canon plate colours) — re-rendering it
as a sheet would fork the single faction-colour source of truth. The dispatch's 28-piece count is met by
the five corrected-canon completions above (bar storefront, both door heights, both parapet heights),
which give every `facadeKit.ts` piece role a rendered piece.

**Not in Phase 1** (per research §4): interiors, bespoke per-building meshes, animated facades,
destructibles, autotiling, >4 growth states, seasonal variants.
