# CANON.md — Legal Crime Remake / "Fedora Noir": Canonical Direction (REWRITTEN 2026-06-23)

THIS IS THE SINGLE SOURCE OF TRUTH. Every workstream (Code, Design, art, audio, writing, research) reads from this file; no track invents anything that contradicts it. ⚠ FULL REWRITE 2026-06-23 — the prior CANON.md was badly stale (predated the entire RTS reshape; it still listed Army/Savings bribery sliders, an interceptable-collector "bottleneck" as a fixed pillar, 156 tests on the frozen branch). Those are WRONG. This version reflects the shipped reality. Supersedes ALL prior CANON.md copies.

Repo: github.com/khuffsphone/legal-crime
ACTIVE branch: rts/isometric-conversion (tip ~d27f578). FROZEN fallback: claude/legal-crime-remake-qeiy87 (274 tests; ~9 RTS passes + 500 commits behind — do NOT treat as current).
Build status: RTS-0 → RTS-30b + living-city Pass 1 COMPLETE, 661 tests green, building on Windows.
Stack: TypeScript + Phaser 3 + Vite + Vitest.

## LOCKED CREATIVE DIRECTION: "Fedora Noir"
- Setting: interwar American industrial city (Chicago-inspired), 1920s–30s Prohibition. Satirical-but-menacing.
- Palette: ~90% weathered brick / soot-stained masonry / charcoal asphalt; art-deco trim. PLAYER = brass/gold (#B8862B body / #E3C36A highlight). RIVAL = blood-red #9E1B1B (STATIC identity). DANGER = #E11D1D / muzzle #FF5A2C (MOTION only). RED DISCIPLINE: a red that sits still is a rival; a red that pulses/moves is a threat. Civic blue-grey #586B82 (Mayor/police). Federal green #4E8B5A. Ambient life = muted greys/browns ONLY (never brass, never red — so a civilian can't be mistaken for a unit).
- Type: Anton (deco display) / Oswald (subheads) / JetBrains Mono (numbers) / Barlow (body).
- Audio: adaptive noir-jazz + brass; sharp firearm pops; escalating sirens. (Library COMPLETE; see asset manifests. RTS-27 wired the audio but the repo ships SILENT — the .m4a/.wav must be dropped into public/audio/.)
- Render: PROCEDURAL / vector — the game draws itself; NO raster sprites in-engine.

## ARCHITECTURE LAW (held every pass — non-negotiable)
/src/sim is PURE & Phaser-free (an invariant test enforces it). tick/applyCommand core math is WRAPPED, never modified — new systems settle AROUND the existing tick. Render/camera/input/art are Phaser-side in /src/scenes. The CAMERA is split into a WORLD layer (pans/zooms) + a fixed HUD layer (never transformed) — the HUD must never drift on zoom/pan.

## THE FOUR BRIBERY CHANNELS (EXACTLY FOUR — this is the corrected canon)
The Beat (police) · The Bench (judges) · City Hall (politicians) · The Bureau (feds). There is NO Army channel and NO Savings slider (the old CANON's "Police/Army/FBI/Politicians/Savings" is RETIRED). "Military" = crew EQUIPMENT / SPECIALIST upgrades routed THROUGH these four channels — NOT a fifth channel/army. Federal pressure = the EXPOSURE ladder 50 / 70 / 85 (NOTICE / WATCH / RAID). NOT "GPO" (Spark/GPT drift — always ignore).

## CONTROL = DISTRICT STATUS (re-scoped — corrected canon)
CONTROL is NO LONGER a spend-to-extort budget (that meter is RETIRED). Control = DISTRICT STATUS: you HOLD a district at ≥~60% of its businesses; held districts are the board state for expansion + the future TURF WAR (holding a district makes it turf-war-eligible). Surfaced as the "THE CITY — WHAT'S YOURS" district roster (HELD / ESTABLISHING / NEUTRAL / RIVAL / CONTESTED). Extortion is gated ONLY by walking time/distance + thug availability — NOT by control. PACE is carried by SPACE (slow movement + the large sparse map) + political-favor unlocks.

## THE COLLECTOR (re-timed — corrected canon)
One collector per extorted business on a FIXED HQ↔business route (a [%] extortable front → [$] paying front + an auto-spawned route; walk → collect → return → bank → wait the week → repeat). MANY businesses → MANY collectors = a rewarding "sea of collectors." Collectors ARE interceptable/robbable — but that risk is a CONSEQUENCE OF RIVAL INVASION (mid-game), NOT a constant early chore. EARLY = safe (rivals dormant ~3 weeks, beyond the fog); MID/LATE = collectors become vulnerable (the re-timed signature tension — switched ON in RTS-30c). The old "interceptable-collector bottleneck as a from-minute-one pillar" is RETIRED in favor of this re-timing.

## THREE WIN PATHS (the 30–60 min spine)
DOMINATION (last family / ≥60% blocks) · GO STRAIGHT (clean-money retire — target is a balance number, Code shipped ~$25k vs Design $1M vs GPT $50k, tune on data) · GET ELECTED MAYOR (City Hall + a scandal ceiling; abstract, no election sim; civic blue-grey #586B82). All three confirmed working (a human won via Mayor at wk11).

## VICE BRANCHES (four)
Bootlegging · Gambling · Entertainment (clubs/dance halls — NOT "Adult Club") · Troubleshooting (the original's term — KEPT over GPT's "Fixer Fronts"). Vice upgrades are themed, channel-gated; Troubleshooting cools heat.

## UNIT ROSTER (procedural, period silhouettes)
- Thug: double-breasted suit + fedora, broad planted silhouette. Recruit: t-line (see controls).
- Thompson Man (the "enforcer" role): suited + a Tommy gun across the body (drum-magazine = the recognition key).
- Collector: unassuming courier + cash satchel (3 size tiers by carried cash). Auto-spawns on extortion.
- Cadillac: 1930s sedan; shipped as parked set-dressing (no car UNIT in the sim — adding one is a logic change).

## THE WORLD (sparse city + districts — current canon)
A large ~96² sparse iso map: wide avenues/streets/alleys, deep building setbacks (min-gap between footprints), parks/plazas/fountains as breathing room + landmarks — buildings stand alone + readable; the DISTANCE between them is the pacing clock. 9 districts (a 3–6 vs 9 count decision is OPEN) partition the map; each reads via a faint ownership wash + a deco nameplate. Ground + static dressing + ambient life (pedestrians/cars, faction-neutral, pooled, FAR-culled) are drawn. Fog-of-war shrouds the unexplored map (?reveal=1 lifts it for inspection). The MARKET standing system is CUT (dormant behind ?market, default off); events de-emphasized to a few scripted shocks (the old §5 Market + §6 Route HUD specs are DEPRECATED).

## EXPLICITLY NOT IN OUR GAME (anti-drift list)
Army channel · Savings slider · Accountant · Collection Center · 16:1 ratio · a separate Suspicion Meter · soup-kitchens · "Adult Club" · "GPO" (use "federal exposure") · a standing Market mini-game (cut) · a car as a controllable unit.

## CONTROLS (current)
[E]xtort · [C]ollect · [R]einvest · [G]rease · [K]rew · [L] wire · [H]elp · [T] · [Z] frame-city · [F]ollow · [M]arket (off by default) · [U] vice-upgrade · [O] audio panel · [0] mute · [Space] fast-forward (1×/2×/4×) · [>] skip-week · [P] perf overlay. Offensive: [1] Raid · [2] Sabotage · [3] Assassinate · [4] Lockout · [5] Expand · [6] Recruit. Camera: zoom +/- + wheel, WASD/edge/drag pan, 3 zoom stops (CLOSE/MID/FAR). Debug/QA: ?debug=turf|mutiny|win|lose · ?arm=1 · ?art=rich/lean · ?market=on/off · ?reveal=1 · ?life=low|med|high · ?fig2=on/off (high-fidelity procedural thug drawer A/B; default off, current renderer stays default) · ?figscale=<px> (figure height knob, ~56/72/80, default 56).

## CANON DELTAS FOLDED IN THIS REWRITE (the drift that's now corrected)
Bribery channels: 5-with-Army/Savings → FOUR (Beat/Bench/City Hall/Bureau). Heat: "GPO" → federal exposure 50/70/85. Collector: from-minute-one interceptable bottleneck → RE-TIMED (safe early, vulnerable on invasion). Control: spend-to-extort budget → DISTRICT STATUS. Added: the three win paths, the sparse 96² world + districts + fog, the cut Market, procedural art, the audio library, the camera world/HUD split, the architecture law. Build/branch: 156 tests on the frozen branch → 661 on rts/isometric-conversion. "Military" clarified = equipment/specialist upgrades via the four channels (NOT an army).

## ============ REPO SYNC & CONCURRENCY RULES (ALL AGENTS READ — STILL ACTIVE) ============
⚠ The local Windows scheduled task "LegalCrimeSync" is CONFIRMED STILL RUNNING (never turned off). It auto-commits brain/docs files to GitHub every ~10 minutes. ⚠ KNOWN ISSUE: it has been auto-committing the STALE CANON.md — so this rewrite must REACH THE REPO's CANON.md to stick (update the repo copy, not just Drive), or the scheduler will keep re-pushing the old one from its scoped file list. RULES (unchanged, branch separation is the law):
1. BRANCH SEPARATION: the auto-sync + human local edits commit ONLY brain/docs files. Claude Code owns ALL /src commits on its own working branch. No other agent/script commits code.
2. The sync script is SCOPED — it stages only CANON.md, ENHANCEMENT_PLAN.md, ASSET_SPEC.md, RUN_LOG.md, docs/. It cannot push /src. (⚠ NOTE: RUN_LOG.md is in BOTH the sync scope AND is written by Code — confirm Code's RUN_LOG commits and the scheduler's don't collide; if they do, that's a real concurrency bug to resolve.)
3. LOCK FILE: a ".sync-lock" in the repo root makes the auto-sync skip its cycle. Before a long unattended local Code run, create .sync-lock; delete it after. (Moot in sandbox/desktop-app runs — separate filesystem.)
4. NEVER run a competing auto-committer against Code's live branch mid-run.
5. WHERE CODE RUNS MATTERS: Code in the desktop app/sandbox pushes via its own session creds to its own branch; the local scheduler only mirrors the personal-PC local clone.
Violating branch separation is the one thing that corrupts this pipeline.

## WORKSTREAM OUTPUT LOCATIONS
Code: github.com/khuffsphone/legal-crime (branches + RUN_LOG.md). Brain (model-agnostic source of truth): Drive "Legal Crime Remake - Brain" (1kO2ToKWZUX6HSvY-Ba4EtMLyTa-g3tpu). Build-critical specs SHOULD also be committed to the repo /docs so Code reads them on git pull (no paste). Generated assets: the Drive asset folder. Design output lives in its canvas → user bridges via paste → Claude catalogues.
