# Legal Crime — Enhancement Plan (Phases 11–17)

> Authoritative, strictly-ordered sequence for the enhancement run. Executed one phase at
> a time, never reordered. Each phase ends behind the full gate; on green, append a
> Completion Receipt to `RUN_LOG.md` and commit `phaseN: <name> — green`. Serves CANON.md.
> Authored at enhancement-run start (no prior plan existed); canonical henceforth.

## Gate (run after every phase)
```
npm run typecheck   # tsc --noEmit, zero errors
npm run build       # vite build succeeds
npm test            # vitest run, all tests green
```
Proceed only on full green. Tests must assert real output values. The `/src/sim`
Phaser-free invariant test must stay green every phase.

## Carried invariants
- `/src/sim` pure (no Phaser / DOM); `/src/scenes` renders via the pure adapter.
- Seeded-RNG determinism, asserted per phase.
- New systems are added as new tick steps / commands / fields — additive, not rebuilds.
- When a new mechanic legitimately changes an earlier-asserted number, update those
  assertions in this phase and record it in the receipt.

## Phases

### Phase 11 — Dual Economy  (S1)
Add `dirtyCash` to Family (invariant 0 ≤ dirtyCash ≤ cash; clean = cash − dirtyCash).
Crime income is classed dirty as it arrives. A standing dirty hoard radiates per-tick
heat (`heatFromDirty`, scaled so only large hoards matter). New `launder` command runs
dirty→clean through extorted fronts: capacity = #extorted-fronts × cap, paying a fee.
Pure helpers: cleanCash, clampDirty, creditCrimeIncome, heatFromDirty, launderFee,
launderCapacity. Adapter exposes clean/dirty. **Tests:** invariant, exact helper math,
launder conversion/cap/fee/denial, dirty-heat applied in tick, determinism.

### Phase 12 — Collector Units  (S2, THE signature mechanic)
Income stops auto-crediting families; it accrues at each earning business as
`uncollected` (dirty takings). New `collect` command dispatches a collection run on a
district: gathers the family's uncollected funds there, with a seeded risk (skim/robbery)
scaled by police presence + heat and mitigated by guarding muscle; collected money enters
the family as dirty cash. Pure helpers: collectionRisk/collectionYield. **Tests:** accrual
at businesses, collection moves funds (exact yields), risk reduces take at high heat/low
muscle, determinism. Updates earlier income-timing assertions (income now requires
collection) — recorded.

### Phase 13 — Bribery Sliders  (S3)
Replace the single bribe with a `bribes` allocation across channels: police, judges,
politicians, feds. `bribeLevel` retained as the total (cost + legacy raid mitigation).
New `setBribe{channel, amount}` command. Channel effects in law: police → raid chance,
judges → bust survivability, politicians → faster heat decay, feds → (hook for Phase 16
shock shielding). **Tests:** allocation math, total = sum, each channel's distinct effect,
determinism. Keeps `bribe` command working (maps to police).

### Phase 14 — Illegal Business Tiers  (S4)
Add `tier` to Business (default 1, max TIER_MAX). `upgradeOperation{businessId}` command
costs cash scaling with tier; effective operation income and heat scale by tier
multiplier (tier 1 = ×1 so existing values hold). Raid loss scales with tier. **Tests:**
upgrade cost/cap, income & heat scale per tier, tier-1 unchanged, determinism.

### Phase 15 — Mutiny & Auto-Loan  (S5)
Mutiny: when a critical mass of a family's crew is below desertion loyalty in a tick, a
coordinated mutiny removes a cohort at once (and may skim cash), distinct from solo
desertion. Auto-Loan: when a family's cash would go negative, a loan shark covers the
shortfall into `debt` with per-tick compounding interest; bankruptcy is redefined as debt
exceeding a ceiling (replaces the raw cash floor). **Tests:** mutiny trigger threshold &
cohort removal, auto-loan covers shortfall and accrues debt+interest, debt-ceiling
bankruptcy, determinism. Updates the Phase 9 bankruptcy assertion — recorded.

### Phase 16 — Systemic Shocks  (S-world)
Seeded shock system as a tick step: each tick a small chance triggers a time-boxed shock
from a table — Police Crackdown (heat/raid up), Market Boom/Bust (income ×), Federal Audit
(seizes dirty cash; Feds bribe shields), Gang War (rivals aggress), Speakeasy Raid (lose
an operation). `activeShocks` on state with durations. **Tests:** each shock's effect with
exact values from a forced trigger, duration expiry, fed-bribe shielding of the audit,
determinism, no-shock cursor stability.

### Phase 17 — Fedora Noir Reskin  (presentation)
Noir theme module + flavored adapter labels (district/business/event flavor, status
narration, money framed clean/dirty, bribery channels, tiers) and a restyled BootScene
(palette, typography, layout) showing the new systems. No sim logic change; sim stays
Phaser-free. **Tests:** adapter exposes themed/flavor strings and the enriched view model
(clean/dirty, bribes, tiers, collectors, shocks); invariant test stays green; build
includes the scene.

## Completion Receipt template (append to RUN_LOG.md)
```
## Phase N — <name> — GREEN  (YYYY-MM-DD)
- Summary: <what was built>
- Files: <key files added/changed>
- Decisions: <judgment calls / chosen values / earlier tests updated & why>
- Gate: typecheck ✅  build ✅  test ✅ (<n> tests; <what real values asserted>)
- Commit: <message>
```

## Blocker Receipt template
```
## Phase N — <name> — BLOCKER  (YYYY-MM-DD)
- Gate that failed: <typecheck|build|test>
- Exact error: <paste>
- Fix attempts (3): <1> / <2> / <3>
- WIP isolated on branch: blocker/phaseN ; last green commit: <hash>
```
