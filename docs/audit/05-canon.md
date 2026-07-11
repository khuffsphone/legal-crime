# Report 5 — Canon-Drift Check

Audit target: Brassmere / `legal-crime` @ commit `7e3ddae`. Source of truth: `CANON.md` (rewritten 2026-06-23). Every row below is checked against live source; verdicts are ✅ MATCH / ⚠ DRIFT / ❓ UNVERIFIED.

## Summary verdict table

| # | Locked constant / rule | Canon says | Source reality | Verdict |
|---|---|---|---|---|
| 1 | `fixedOrthoScale` = 2.8284 | Shared locked kit scale 2.8284 | Not a `/src` constant — defined in render-job tooling `tools/blender/render_jobs/cop.json:27` & `thug_gangster.json:29` (`"fixedOrthoScale": 2.8284`), emitted into unit manifests as `orthoScale: 2.8284`, locked by tests | ✅ MATCH |
| 2 | Tile 128×64 | 2:1 dimetric diamond | `src/sim/iso.ts:10,12` = 128/64; `src/scenes/isoAssets.ts:19,20` = 128/64 — agree | ✅ MATCH |
| 3 | `FIGURE_PX` = 56 | 56 px standing figure | `src/scenes/env/facadeKit.ts:20` = 56; `src/scenes/gait.ts:16` = 56 — comment claim verified | ✅ MATCH |
| 4 | Anchor (0.5, 1.0) | Feet-anchored bottom-center | `unitSpriteView.ts:44` `setOrigin(0.5,1.0)`; `spriteManifest.ts:79,90` enforces exact (0.5,1.0); `isoAssets.ts:48,51` `anchorY:1.0` | ✅ MATCH |
| 5 | `/src/sim` Phaser-free | Invariant test enforces | Two invariant tests: `tests/adapter.test.ts:123-134`, `tests/theme.test.ts:106-124`. No real phaser import in `src/sim` | ✅ MATCH |
| 6 | Faction color on base-plate ONLY, not body | No figure-body faction tint | Split verdict — `figureStyle.ts` cel path is plate-only, but `rigDraw.ts` + `cityArt.ts` RICH paths tint the body (hatband + pocket-square). Both are LIVE | ⚠ DRIFT |
| 7 | Fixed HUD camera | HUD never zoom/pan-transformed | `IsoScene.ts:4205-4224` second fixed `uiCam`; `main.ignore(hud)`/`ui.ignore(world)` split on `scrollFactor===0` | ✅ MATCH |
| 8 | Four bribery channels | Beat/Bench/City Hall/Bureau = police/judges/politicians/feds | `sim/types.ts:19` `BribeChannel = 'police'|'judges'|'politicians'|'feds'`; `sim/bribery.ts:8` lists exactly those four | ✅ MATCH |
| 9 | No Army / Savings / GPO channels | Retired / anti-drift | Word-boundary grep `\barmy\b|\bsavings\b|\bGPO\b` over `src` → zero live channels | ✅ MATCH |
| 10 | Federal exposure ladder 50/70/85 | NOTICE / WATCH / RAID | `sim/constants.ts:123-125` `FED_WARN_TIER_1=50`, `_2=70`, `_3=85` | ✅ MATCH |
| 11 | Ambient life neutral greys only | Never brass/red | `cityArt.ts:73,79` ambient/static dressing "faction-NEUTRAL … never brass/red" | ✅ MATCH |

## Detail on each finding

### 1. `fixedOrthoScale = 2.8284` — MATCH (with a location nuance)
There is **no hardcoded `2.8284` or `fixedOrthoScale` constant anywhere under `/src`** (`grep -rn '2.8284|OrthoScale|orthoScale' src` returns only the optional `orthoScale?` *type field* at `src/scenes/render/spriteManifest.ts:38,45`). The value lives in the Blender render-job tooling and flows into the shipped manifests that the loader consumes:
- Defined: `tools/blender/render_jobs/cop.json:27` and `tools/blender/render_jobs/thug_gangster.json:29` → `"output": { … "fixedOrthoScale": 2.8284 }`.
- Emitted into assets: `public/assets/sprites/units/cop_manifest.json:11` and `thug_manifest.json:11` (`"orthoScale": 2.8284`, repeated per-clip).
- Locked by tests: `tests/renderJobCop.test.ts:41` and `tests/renderJobThugGangster.test.ts:30` assert `toBeCloseTo(2.8284, 4)`.
- Derivation confirmed in docs: `docs/env-kit/DECISION_KIT_RENDER_SCALE.md:11-14` — `2.8284 = 2√2`, density `canvas/ortho_scale = 64·√2 ≈ 90.5097 px/BU`.

It equals 2.8284 and is CI-locked. Verdict MATCH; note the constant is a tooling/asset value threaded via manifest JSON, not a render-side TS constant.

### 2–3. Tile 128×64 and FIGURE_PX 56 — MATCH
`src/sim/iso.ts:10,12` `ISO_TILE_WIDTH=128` / `ISO_TILE_HEIGHT=64`; the scene-side mirror agrees at `src/scenes/isoAssets.ts:19,20` (`ISO_TILE_PX_WIDTH/HEIGHT`). `FIGURE_PX=56` at `src/scenes/env/facadeKit.ts:20` and independently at `src/scenes/gait.ts:16` — the "matches gait.ts" comment on `facadeKit.ts:20` is accurate.

### 4. Anchor (0.5, 1.0) — MATCH
Sprites are feet-anchored bottom-center: `src/scenes/render/unitSpriteView.ts:44` `setOrigin(0.5, 1.0)`, and `src/scenes/render/spriteManifest.ts:79,90` validates the manifest anchor is exactly `(0.5, 1.0)`. The procedural iso baseline agrees (`isoAssets.ts:48,51`, `anchorY: 1.0`).

### 5. `/src/sim` Phaser-free — MATCH
Enforced by two invariant scans: `tests/adapter.test.ts:123-134` (fails on any `from 'phaser'` under `src/sim`) and a second at `tests/theme.test.ts:106-124`. No real phaser import exists in the sim tree (word "Phaser" appears only in purity-asserting comments). See report 1 §1.

### 6. Faction-color-on-base-plate-only — ⚠ DRIFT (figure-body faction tint found in two live paths)
The strict canon reading ("faction color applied only to a base plate/nameplate, NOT the figure body") holds for ONE renderer but is contradicted by two others that are wired into `IsoScene`:

- **Compliant path** — `src/scenes/figureStyle.ts`: `PLATE = { player:0xb8862b, playerHi:0xe3c36a, rival:0x9e1b1b, downed:0x4a443c }` (`figureStyle.ts:36`), body tones are soot/sepia only (`figureStyle.ts:15-32`, `BODY_TONES` has no faction color), and the hatband is explicitly kept noir: `figureStyle.ts:175` `hatband: FIG2_BODY.coatShadow // noir — faction is the plate, never the body`. Used by `drawThugFig2` (`IsoScene.ts:2114`).
- **Drifting path A — `rigDraw.ts` (RTS-32), LIVE at `IsoScene.ts:2118`** (`drawThugRig(g, pose, v.faction==='player' ? PLAYER_RIG : RIVAL_RIG …)`): `RigStyle.accent` is the faction read (`rigDraw.ts:17`), `PLAYER_RIG.accent = PAL.brass`, `RIVAL_RIG.accent = PAL.blood` (`rigDraw.ts:23-24`), painted **onto the body** — the hatband `rigDraw.ts:141` (`fillStyle(st.accent,1) … // HATBAND — the faction read`) and the chest pocket-square triangle `rigDraw.ts:143`.
- **Drifting path B — `cityArt.ts` RICH figures (RTS-26)**, baked via `figureKeyFor()` (`cityArt.ts:95`, called at `IsoScene.ts:1534,2188,3625`): comment states the intent outright — `cityArt.ts:63-64` "faction-specific figure keys (player = brass accents, rival = blood-red accents) so the silhouette ITSELF reads the faction, not just the foot-ring", placing a saturated faction read at hatband `cityArt.ts:157-158` and pocket-square `cityArt.ts:294`.

So faction identity is NOT plate-only: the two silhouette renderers deliberately place a small brass/blood accent (hatband + pocket-square) on the figure body. This is internally inconsistent with `figureStyle.ts`'s plate-only contract and contradicts the audited plate-only rule. (Note: it is *arguably* consistent with the broader `CANON.md:12` "silhouette reads faction / red discipline" palette intent — but as a literal "plate-only, no body tint" check it is a DRIFT.) The correct-side facts still hold: player uses #B8862B/#E3C36A, rival uses #9E1B1B, ambient life is neutral. **This is a canon-clarification item, not a bug: either amend CANON to permit a small body accent, or bring `rigDraw`/`cityArt` in line with `figureStyle`.**

### 7. Fixed HUD camera — MATCH
`IsoScene.ts:4205-4224` `setupUiCamera()` adds a second full-screen camera (`uiCam`), partitions the display list by `scrollFactorX===0` into `hud`/`world`, then `main.ignore(hud)` (`:4220`) and `ui.ignore(world)` (`:4221`) — "the HUD never zooms/pans with the world." HUD elements mount with `.setScrollFactor(0)` (e.g. `IsoScene.ts:1079-1080,1155`); screen-shake nudges the WORLD camera only, "fixed HUD camera is never touched" (`IsoScene.ts:557`); noir grain/vignette ride the fixed UI camera (`IsoScene.ts:4226-4241`); screen-resize keeps the UI camera full-screen (`:4222`).

### 8–9. Bribery channels — MATCH
`sim/types.ts:19` `export type BribeChannel = 'police' | 'judges' | 'politicians' | 'feds';` and `sim/bribery.ts:8` `BRIBE_CHANNELS = ['police','judges','politicians','feds']` — exactly the four canon channels (Beat/Bench/City Hall/Bureau). `bribes: Record<BribeChannel, number>` at `sim/types.ts:63`. Word-boundary grep for `army`/`savings`/`GPO` over `src` returns no live channels (only false-positive substrings like `gpoint`, `RigPose`, `POSTURE`).

### 10. Federal exposure ladder — MATCH (values), labels reworded
`sim/constants.ts:123-125`: `FED_WARN_TIER_1 = 50`, `FED_WARN_TIER_2 = 70`, `FED_WARN_TIER_3 = 85`. Values match canon's 50/70/85 exactly. In-source labels are "asking questions" / "agents near your fronts" / "a bust is imminent" (canon names them NOTICE / WATCH / RAID) — semantically equivalent, values authoritative. No "GPO" terminology in source.

## Notes / limits
- No `/src` file contradicts the four-channel, ladder, tile, anchor, FIGURE_PX, or sim-purity canon. The single substantive drift is the faction-on-body accent (finding 6), a real internal inconsistency between `figureStyle.ts` (plate-only) and the `rigDraw.ts` / `cityArt.ts` silhouette renderers, both of which are live.
- Federal tier *labels* differ in wording from canon's NOTICE/WATCH/RAID but the thresholds are correct — not flagged as drift.
