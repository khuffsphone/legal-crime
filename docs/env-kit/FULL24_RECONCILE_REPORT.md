# Environment Modular Kit — 24-Core Reconciliation + Render-Mode Verdict

**Branch:** `claude/env-modular-kit` off `origin/rts/isometric-conversion @ 5a8c640` (post-#82).
**Materiality:** MEDIUM, Rubric B (render-only, no gameplay wiring). Render-only pass; **no IsoScene wiring**.
**Spec:** *Brassmere Environment Kit Research — Modular Building & Ground-Plane Spec · 2026-06-30*, Section 4.

---

## STEP 0 — count delta + gap list

### Count delta (24 spec vs. 28 brief) — RESOLVED
- Brief said **28**; spec Section 4 says **"Recommended kit = 24 core pieces."**
- K directive (2026-07-14): **24 is authoritative.** The extra 5 corrected-canon completions
  (`storefront_bar`, `door_commercial_76`, `door_residential_68`, `parapet_plain_40`,
  `parapet_tall_56`) are **deferred to a follow-on ticket**.
- The repo already documents the arithmetic (`kit_batch_phase1.json._inputs`): the committed kit =
  spec rows 1–22 + 24 (23 pieces) − row #23 (base-plate, vector) + those 5 completions = 28. Removing
  the 5 completions returns exactly the **24-core spec** (23 rendered + 1 vector).

### Gap list — against the 24 spec pieces
**Result: zero missing builders, zero missing renders.** All 24 spec pieces are accounted for by the
existing 11 `BUILDERS` in `render_iso_kit.py`, and all 23 renderable pieces are already committed under
`public/assets/sprites/env/`.

| # | Spec piece | Builder (`render_iso_kit.py`) | pieceId | State |
|---|---|---|---|---|
| 1 | Brick facade body A (plain) | `facade_body` brickField | `body_brick_plain` | committed |
| 2 | Brick facade body B (pilastered) | `facade_body` +pilasters | `body_brick_pilastered` | committed |
| 3 | Limestone/terra-cotta body C | `facade_body` limestone | `body_limestone` | committed |
| 4 | Storefront window+bulkhead+transom | `storefront_low` glass | `storefront_low_2bay` | committed (proof) |
| 5 | Storefront recessed entry | `storefront_low` recessed | `storefront_recessed` | committed |
| 6 | Storefront speakeasy (blank) | `storefront_low` speakeasy | `storefront_speakeasy` | committed |
| 7 | Upper window single | `window_module` single | `window_single` | committed |
| 8 | Upper window paired/bay | `window_module` paired | `window_paired` | committed |
| 9 | Door residential stair | `door_module` stairResidential | `door_stair_residential` | committed |
| 10 | Cornice/parapet simple | `cap` cornice28 | `cornice_simple_28` | committed |
| 11 | Cornice deco stepped crown | `cap` corniceDeco40 | `cornice_deco_40` | committed |
| 12 | Signage painted wall | `sign` painted | `sign_painted_wall` | committed |
| 13 | Signage projecting blade/neon | `sign` blade | `sign_blade` | committed |
| 14 | Awning/canopy | `awning` | `awning_canvas` | committed |
| 15 | Alley/service wall (+downpipe) | `facade_body` blank+downpipe | `wall_alley_service` | committed |
| 16 | Loading door (service side) | `loading_door` | `door_loading` | committed |
| 17 | Fire escape | `fire_escape` | `fire_escape` | committed |
| 18 | Warehouse facade body | `facade_body` warehouseBrick+banded | `body_warehouse` | committed |
| 19 | Roof clutter (tank/chimney) | `roof_clutter` | `roof_clutter_tank` | committed |
| 20 | Damage/decay overlay | `overlay` damage | `overlay_damage_boarded` | committed |
| 21 | Wealth overlay | `overlay` wealth | `overlay_wealth_trim` | committed |
| 22 | Fortification overlay | `overlay` fortified | `overlay_fortified_bars` | committed |
| **23** | **Ownership base-plate tint** | **— (none)** | **— vector `bizPlates`** | **in-engine vector, not a mesh** |
| 24 | Corner-lot return wall | `facade_body` yawDeg=90 | `wall_corner_return` | committed |

**Row #23 evidence:** `src/scenes/IsoScene.ts:540` —
`private bizPlates = new Map<string, Phaser.GameObjects.Polygon>() // RTS-22 allegiance plate per business`.
Spec Section 4 calls it a "tile diamond" and Section 7 rules the ground plane is procedural/vector, not a
modular mesh. So it is deliberately **not** a Blender kit piece; excluding it from the render batch is
correct. **24 spec pieces = 23 rendered + 1 vector-in-engine.**

No builder exists that is absent from the 24 spec set (the 5 non-spec completions are extra *variants* of
existing builders — `cap`/`door_module`/`storefront_low` kinds — not new builders).

---

## STEP 1 — render-mode verdict (frame-to-fit vs. tile-calibrated)

**Verdict: the question is MOOT BY CONSTRUCTION — CONFIRMED with one nuance.** The kit entry cannot
frame-to-fit; it locks a single canon density on every render, and procedural builders author every height
directly from the corrected px constants. Empirically, all 23 pieces rendered at **exactly one** density
(`90.5097 px/BU`), with `canvas/orthoScale == 90.5097` for every piece (see render log below).

Code evidence (`tools/blender/render_iso_kit.py`):
1. **Heights come straight from constants, never from a measure→rescale.** `v_bu(px)=px/V_PX_PER_BU`
   (`:62-64`), `V_PX_PER_BU=PX_PER_BU·sin60` (`:46`). Builders set heights directly, e.g. `H=v_bu(FLOOR_UPPER)`
   (`:232`), storefront `zB/zG/zT/zS` (`:158-161`), `cap` (`:309`), `door_module` (`:283-286`). No builder
   measures geometry.
2. **Density is FORCED, not fit.** `render_piece` computes `ortho = canvas / PX_PER_BU` (`:549`) and passes
   `force_ortho_scale=ortho` into `frame_camera` (`:553-554`). In `render_iso_common.py:94`,
   `force_ortho_scale` **bypasses** the `max(scale_by_h, scale_by_w)` auto-fit — so density is identical
   across pieces by construction.
3. **The nuance (flagged honestly):** `render_iso_kit.py` *does* run a per-piece bbox loop (`:534-546`).
   But it does **not** feed scale — it only sizes the 4px-snapped canvas (`:548`) and centers the anchor.
   Contrast `render_iso_unit.py:306` (`bbox_prepass` → derived `ortho_scale` = genuine frame-to-fit for the
   8-dir character sheets). So K's "no bbox-measure-rescale loop needed" is exactly right about the
   *rescale*: there is a measure, but never a rescale.
4. **A machine gate already enforces zero drift.** The VERIFY-STACK block (`:564-586`) re-measures the
   rendered PNG's alpha-column height in pixels and `RENDER_FAIL`s if it leaves `[expect-2, expect+slack]`.
   All 23 pieces passed.

This was also pre-decided and documented: `render_iso_kit.py:10-20` header, plus
`docs/env-kit/DECISION_KIT_RENDER_SCALE.md` and `docs/env-kit/PHASE1_RENDER_MODE.md`.

---

## STEP 3 — render log + stack test

### Verification render (RAW PNG, pngquant BANNED; `--outdir uat/kit_full24_verify` so committed bytes never churn)
```
BATCH_OK pieces=23  outdir=uat/kit_full24_verify
```
- 23/23 `RENDER_OK` at `density=90.5097`.
- **Density invariance:** distinct `pxPerBu` across all 23 pieces = `{90.5097}` (single value); every
  piece's `canvas/orthoScale == 90.5097`. No frame-to-fit drift.
- VERIFY-STACK columns all inside canon+slack (e.g. `body_brick_plain` 120px vs 116 expect;
  `storefront_low_2bay` 137px vs 132; `cornice_deco_40` 47px vs 40). Gate passed on every nominating piece.
- Benign: stderr shows a shutdown `Traceback` from the unrelated `meshy-blender-plugin` `unregister()` at
  "Blender quit" — not a render error (exit 0).

### Stack test — 3 sample buildings recombined from real manifest `bandsPx`
| Sample | Composition | Height | Spec range | Result |
|---|---|---|---|---|
| LOW | `storefront_low_2bay`(132) + `cornice_simple_28`(28) | **160px** | 160–276 | in-range |
| MID | `storefront_low_2bay`(132) + `body_brick_plain`(116) + `cornice_deco_40`(40) | **288px** | 276–508 | in-range |
| LARGE | `storefront_low_2bay`(132) + 3×upper body(116) + `cornice_deco_40`(40) | **520px** | 508–856 | in-range |

- **Vertical seams:** composed heights are the exact sum of per-piece `bandsPx`; because every piece renders
  at one density with anchor (0.5, 1.0), stacking piece B's base on piece A's top edge produces **zero height
  drift**.
- **Horizontal seams:** every 2-tile piece reports a base run of `dx=128.00px, dy=64.00px` (2 bays × 64px,
  2 tiles × 32px drop) — pixel-identical bay pitch, so pieces butt with no seam drift.

---

## STEP 4 — disposition
- **No builder additions were required** (all 24 spec pieces already have builders / committed renders).
- New artifacts only: `tools/blender/render_jobs/kit_batch_full24.json` (the clean 24-core job) + this report.
- Committed K-approved PNGs/manifests under `public/assets/sprites/env/` are **untouched** (verification
  render went to a throwaway dir).
- **Not done (out of scope):** IsoScene placement wiring; the 5 deferred completions; any base-plate mesh.

### Open question for K
- The 24-core kit is already fully rendered & committed. `kit_batch_full24.json` is a *documentation +
  reproducibility* artifact (a clean, spec-ordered job that regenerates exactly the 24-core set). Confirm
  that's the intended deliverable, or say if you want the 5 deferred completions pulled from the committed
  set as well (they currently remain committed from the phase-1 batch).
