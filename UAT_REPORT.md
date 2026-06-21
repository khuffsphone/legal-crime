# UAT REPORT — RTS-21 (Economy & Pacing Balance)

- **Branch / commit:** `rts/isometric-conversion` @ `5d26eb0` (rts21, on top of rts20 verbs)
- **Suite:** `npm test` → **555 passing** (45 files), `npm run typecheck` + `npm run build` clean.
- **Method:** the Phaser UI can't be driven headlessly here, so the match was driven through the
  **pure sim** with a scripted *competent, un-armed* player (NO `?arm`): real economy only —
  `extort → weekly accrual → collect → launder → spend` on the build verbs, the four bribe channels,
  and the offence ladder; rivals advance via their strategic pulses + weekly AI. `?debug` was used
  only to seed board states for the raid experiment, never to skip the economy. Three player policies
  were run (a "balanced" bot, a lean "economist" saver, and a flush "raid-spammer") across seeds
  1/3/7/11/21. Evidence tables below are verbatim harness output.
- **Injectors:** confirmed present in `src/scenes/IsoScene.ts` `applyDebugScenario()` at HEAD —
  `?arm=1`, `?debug=win`, `?debug=lose`, `?debug=turf|mutiny|all`. Committed (matches f07667d).

---

## Verdict — FUNCTIONAL, NOT YET FUN

RTS-21 **fixed the opening** decisively, but a normal un-armed match **does not walk the full arc**
and is **not yet winnable by design**. A competent player gets a strong establish phase (holds home,
reaches 3 crew + assassination-grade muscle by ~wk2, rivals are paced early, sabotage is reachable),
then **plateaus at one block** and is **death-spiralled by the law**: the rackets that grow income
throw heat the player can't afford to suppress on a single low-wealth block, so **police raids seize
the cash and raze the rackets (boss busted by ~wk9)** while rivals run to 8–9 of 9 districts. The
intended *mid turf-war → late decapitation* never materialises — the match dies after the opening.

It is **functional** (every system works, nothing crashes, the verbs land) but **stalled**, not fun.

---

## Watchlist — answered with evidence

### 1. Can the player reach ~2 blocks + ~3 crew by wk2–3? (does RECRUIT land?)
**Crew: YES. Blocks: NO (stuck at 1).** Recruit now lands — crew grows 2→3 and strength clears the
assassination gate (≥12) by wk2 in nearly every seed. But the player **never holds a 2nd block** — a
2nd district from scratch costs ~$1000 (4 expands), unaffordable alongside everything else.

```
MACRO (competent bot)        wk2                         wk5                    wk12
seed  1 | P1 rivals 1 crew 3 str 11 $306 | P1 rivals 8 $253 net 554 | P1 rivals 8 $349 contest
seed  3 | P1 rivals 2 crew 3 str 17 $343 | P1 rivals 7 $539 net 255 | P1 rivals 8 $99  endgame
seed  7 | P1 rivals 3 crew 3 str 16 $422 | P1 rivals 8 $237 net 504 | P1 rivals 8 $113 endgame
seed 11 | P1 rivals 4 crew 3 str 16 $446 | P1 rivals 7 $233 net 268 | P1 rivals 8 $295 endgame
seed 21 | P1 rivals 2 crew 3 str 10 $418 | P1 rivals 7 $489 net 173 | P1 rivals 8 $330 contest
```
Player blocks = **1 at wk2, wk5, AND wk12 across all five seeds.**

### 2. Are rivals paced (≈2–3 by wk2, not 5), then a real fight by wk5?
**YES early, but the mid ramp overshoots.** By wk2 rivals hold **1–4 blocks** (the rts21 dampener
works — no 5-block runaway). By wk5 they hold **7–8 of 9** and entrench there. The "real fight"
became a near-total takeover because the *plateaued player can't contest it* (see #1/#5), so the
ramp that's correct in principle reads as a rout in practice.

### 3. Is tier-1 offence reachable before the player is buried? When does each tier unlock?
**Only SABOTAGE is reachable in real play.**
- **Sabotage** (`$350`, 1 crew): unlocks **wk2**, used wk3–5 to wreck rival rackets. ✅ early & useful.
- **Raid** (`$500`, held base): the gate opens (held home by wk1) but it is **almost never affordable**
  — total cash hovers $100–450 after the economy/bribe sinks; the offence board correctly shows the
  cash ETA, but the ETA never arrives. The one early raid (wk1) was **REPELLED**.
- **Lockout** (`$800`) and **Assassinate** (`$1500`): **never funded** by the balanced bot; the lean
  saver managed at most 1 hit + a lockout, never a clean campaign.

### 4. ⭐ IS RAID DOMINANT? — **No. The anti-steamroll measures hold (arguably too well).**
A *flush* ($8000) raid-spammer chaining raids as fast as the 14s cooldown allows:
```
#1 disrupted | -$500 +14heat | rivalAggro 40 | holder neutral
#2 disrupted | -$500 +14heat | rivalAggro 80 | holder neutral
#3 REPELLED  | -$500 +14heat | rivalAggro 120| holder neutral   ← repel costs a man
#4..#12 BLOCKED: need 2 crew                                     ← crew fell below the gate
SUMMARY: 3 raids · 0 SEIZES · 1 repel · $1500 spent · 0 blocks taken · heat 42
```
Force-14 **disrupt-vs-seize** means a single raid only knocks a holder to neutral (never seizes);
the rival re-holds via pulses; a repel **costs a crew member**, which dropped the spammer below
`RAID_MIN_CREW` and **hard-stopped the chain**; aggro spiked to 120 (→ HQ-strike retaliation). Raid
is a *costed, risky softening tool*, **not** a win button. If anything it is **too weak to take a
block on its own** — it needs sustained pressure + crew depth + cash the economy can't provide.

### 5. Does the match reach MID turf war before LATE decapitation, with a satisfying arc?
**No — it stalls after the opening.** The player hits the **ENDGAME phase label by wk1–2** (muscle ≥12),
which is *misleading*: they have the muscle but neither the turf nor the war chest to act. From ~wk4
the law dismantles them:
```
PLAYER FEDERAL/POLICE LOG (economist, seed 3):
 w4 raid-operation: Police shut down Player Family's numbers operation
 w6 raid-cash:      Police seized $856 from Player Family
 w7 raid-cash:      Police seized $749 from Player Family
 w8 raid-cash:      Police seized $745 from Player Family
 w9 raid-bust:      Player Family's boss was busted in a raid (heat 91)
```
The rackets that grow income generate heat → police raids seize cash & raze rackets → income
collapses (`net` goes negative once `ops`→0) → the run death-spirals. Seed 3 technically reached
`status: won` — but as a **chaotic last-family-standing fluke** (both rival bosses self-destructed via
heat/federal busts/being crushed out) while the player sat at **0 blocks**, not via a designed arc.

---

## Single biggest remaining issue

> **The mid-game is a poverty/heat trap.** One low-wealth home block's income (~$400–620/wk) cannot
> simultaneously fund (a) expansion to a 2nd block, (b) the offence ladder ($500→$800→$1500), AND
> (c) enough Police/City-Hall bribes + laundering to keep the rackets' heat under the police/federal
> raid threshold. So the player can't break out of the home corner, and around wk4–9 a police/federal
> bust razes their rackets and the economy death-spirals — while rivals snowball to 8–9 blocks.

**Direction for the NEXT balance pass (not changed here — this is a verification round):**
1. **Make turf income scale** — holding/ contesting more districts must pay enough to outgrow one
   block (and a cheaper path to a 2nd/3rd block: lower expand-to-50 from scratch, or income-per-held-
   district), so reinvestment compounds instead of plateauing.
2. **Ease the heat/running-cost squeeze on a small operation** — early rackets shouldn't push a
   1-block player past the police raid threshold faster than they can afford to suppress it; the
   federal/police clock should bite the *over-extended*, not the *establishing*.
3. **Re-examine raid's block-taking power** — it currently can't seize on its own even when flush;
   consider letting sustained/while-locked-out raids convert, or pairing it with a cheaper way to
   build your own control in a contested block.
4. **Fix the misleading ENDGAME phase label** — "muscle-ready" ≠ "able to decapitate"; gate the
   endgame read on a war chest / turf, not just strength ≥12.

---

## Confirmations
- ✅ `git pull` clean; baseline `npm test` **555 green**; typecheck + build green.
- ✅ QA injectors `?arm=1` / `?debug=win` / `?debug=lose` (and `?debug=turf|mutiny|all`) present and
  committed in `applyDebugScenario()`.
- ✅ rts21's **pacing** changes verified working: the verbs land (crew→3, muscle→12 by wk2), rivals
  are dampened early (≤~3 blocks by wk2, not 5), sabotage is reachable early, the offence/build
  boards surface the affordability ETA.
- ❌ rts21 does **not** make a normal match walk the full arc or be winnable-by-design — the mid-game
  economy wall is the blocker.
