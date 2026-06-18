# CANON — Legal Crime: "Fedora Noir"

> LOCKED creative direction. This document is law. Every enhancement (Phases 11–17)
> serves the direction and the five signature mechanics defined here. Authored at the
> start of the enhancement run because no prior CANON.md existed in the repo; treated as
> canonical from this point forward (decision recorded in RUN_LOG.md).

## 1. The Direction — Fedora Noir

A Prohibition-era (late 1920s–early 1930s) organized-crime power fantasy rendered in
**hard-boiled noir**: rain-slick cobblestones, gaslight and neon bleeding through fog,
jazz from a basement speakeasy, fedoras and trench coats, cigarette smoke. Chiaroscuro
light — deep charcoal shadow, sepia midtones, a single warm **brass/amber** accent.
Tone is terse and fatalistic; the city is a living thing that does not care if you make
it. You are a rising boss turning a single street corner into an empire while the law,
your rivals, and your own men all wait for you to slip.

Palette: ink `#14110f`, charcoal `#26211c`, fog grey `#9a8f80`, brass `#c79a4b`,
blood `#8a2b22`, bone `#e8e2d4`. Typography: a typewriter/serif mono feel. Voice:
clipped noir narration ("The Heights paid this week. They always do — eventually.").

This direction is **presentation and framing**. The simulation (`/src/sim`) stays a pure,
deterministic, Phaser-free engine; the noir lives in `/src/scenes` and in flavor text /
naming exposed through the adapter. The Phase 17 reskin must not alter sim logic.

## 2. The Five Signature Mechanics (the soul of the game)

These five systems are what make Legal Crime *this* game and not a generic tycoon. They
are implemented in Phases 11–15. Phase 16 (Shocks) keeps them under pressure; Phase 17
dresses them in noir.

### S1 — Dual Economy (clean vs. dirty money)  [Phase 11]
Money has a conscience. Every dollar a family holds is partly **dirty** (proceeds of
crime) and partly **clean** (laundered, safe, respectable). Crime income arrives dirty.
A hoard of dirty money is a liability — it radiates **heat** (the more you sit on, the
more attention) and it is what the law and the Treasury come for. **Laundering** runs
dirty money through the legitimate fronts you control, paying a fee to make it clean and
safe. The tension — get rich fast (dirty, exposed) vs. get respectable slow (clean,
safe) — underlies everything.

### S2 — Collector Units (THE signature mechanic)  [Phase 12]
Money does not teleport into your account. It **piles up at the businesses** that earn
it, week after week, as uncollected takings. You must send **Collectors** — your men —
on rounds to physically gather it. A collection run is a risk: heavy police presence and
high heat mean a run can be **skimmed, robbed, or busted**, and the take lost; muscle
(guards) escorting the round makes it safer and more complete. Forget to collect and a
fat business is just a pile of money you don't have while your upkeep bleeds you dry.
This is the tactile heartbeat of the game: *who do I send, where, and when.*

### S3 — Bribery Sliders (granular corruption)  [Phase 13]
Corruption is not one number. You allocate standing bribes across the pillars of the
city — **Police** (fewer raids), **Judges** (a bust is survivable, not fatal),
**Politicians** (heat cools faster), and **Feds** (shield against federal shocks). Each
slider is an ongoing retainer; together they are your insurance policy, and balancing
them against income is a constant squeeze.

### S4 — Illegal Business Tiers (the growth curve)  [Phase 14]
An illegal operation is not static. You **upgrade** it through tiers — a back-alley
numbers game becomes a bank; a still becomes a distribution network. Each tier multiplies
income but also the heat it throws and the prize it offers the law in a raid. Tiers are
the risk/reward ladder of the criminal economy.

### S5 — Mutiny & Auto-Loan (the human/financial brink)  [Phase 15]
Your crew is not furniture. When loyalty rots — unpaid wages, unbearable heat — the men
don't just quietly desert; they **mutiny**, a coordinated walkout that can rob your safe
or defect to a rival. And when the money runs out, the game does not simply end: a
**loan shark** floats you an **auto-loan** to cover the shortfall, buying you time at a
brutal, compounding interest — a debt spiral that is its own way to die. Both mechanics
make the brink of failure a place you *operate in*, not a wall you hit.

## 3. Systemic Shocks  [Phase 16]
The city throws events: police crackdowns, market booms and busts, federal audits (which
come for dirty money — paying off S1), gang wars, speakeasy raids. Shocks are seeded and
deterministic, time-boxed, and they stress every signature mechanic at once.

## 4. Non-negotiable engineering constraints (carried from the 0–10 run)
- `/src/sim` is pure: no Phaser, no browser globals. Enforced by an invariant test.
- Seeded-RNG determinism: same seed + same commands ⇒ identical state.
- The command reducer (`applyCommand`) and `tick` (fixed step order) are the only
  mutation paths. New systems insert as new tick steps without reordering existing ones.
- Tests assert real values, never vacuity.
- Enhancements **enrich**; they do not rebuild. When a new signature mechanic legitimately
  changes a number an earlier test asserted (e.g., income realization under Collectors),
  the affected earlier assertions are updated in the owning phase and the change is
  recorded in the receipt — never silently.
