# VISUAL_DIRECTION.md — Legal Crime: Fedora Noir Visual Bible

> NOTE ON PROVENANCE: the RTS-15 brief intended to paste a full VISUAL_DIRECTION.md here but
> the paste placeholder arrived empty. This document is distilled VERBATIM-IN-INTENT from the
> detailed visual spec embedded in that brief (palette roles, the six juice beats, crew/loyalty
> animations, state indicators, geometry/motion discipline). It is the canonical render spec the
> code targets; refine it as the art direction firms up. Companion to CANON.md §1.

## 1. The look
A living 1930s Prohibition-Chicago crime map, hard-boiled noir: rain-slick soot, brick, gaslight
and neon bleeding through fog. The screen is ~90% **soot + brick** — muted, heavy, fatalistic.
Colour is EARNED: the few saturated colours mean something. Chiaroscuro: two flat tones per
face, hard edges, deep shadow. The city idles slow; motion is meaning.

## 2. The palette — named hex ROLES (apply everywhere)
World / structure (~90% of the frame):
- `soot`        #16130F — ground, deep shadow, the dominant tone
- `brickDark`   #5A241B — building walls (shadow face)
- `brickLight`  #7E3326 — building walls (lit face)
- `fog`         #9A8F80 — haze, sidewalks, neutral text
- `bone`        #E8E2D4 — highlights, primary text

State / identity colours — **STATE-ONLY, never decoration**:
- `brass`       #B8862B — the PLAYER and MONEY/value (selection, HQ, your protection %)
- `rival`       #9E1B1B — the RIVAL faction IDENTITY (their figures, HQ, rings)
- `danger`      #E11D1D — DANGER MOTION ONLY (muzzle flash, ambush, klaxon) — never static fill
- `cashGreen`   #4E8B5A — CASH in motion (greenback trail, banked coins)

RULES (enforced):
- brass / rival / danger / cashGreen are **state-only** — they never appear as decoration.
- The **two reds never share a role**: `rival` (#9E1B1B) is identity/static; `danger` (#E11D1D)
  is motion/threat. A thing is one or the other, never both.
- Glows are **soft radial alpha**, never hard fills. No per-tile gradients.

## 3. The six juice beats (event-driven, to these timings)
1. **The Lean** (extort lands): target building shudders, brick-dust puffs, a "NOW PAYING" stamp
   thumps on, and the protection coin bursts into being. ~600–900ms.
2. **Banked** (deposit at HQ): coins arc from the collector to the HQ vault, a 90ms **1.04×**
   camera punch, and the cash satchel deflates. ~700ms.
3. **Cash Trail**: a carrying collector drops faint **greenback** breadcrumbs that fade over ~2s.
4. **Ambush** (interception): **muzzle flash**, **6px screen shake ×3**, and grab-able banknotes
   scatter from the robbed collector. ~600–900ms.
5. **Federal Ladder**: the exposure bar reddens by tier at **50 / 70 / 85**; at 85 a **klaxon
   vignette** pulses red at the screen edge.
6. **Day↔Night**: a slow veil drifts the city from dusk to night and back (event-free idle).

## 4. Crew / loyalty visuals ([K] roster)
Each member animates by loyalty band (one loop each, all idle-slow ≥1.3s):
- `loyaltyBob`    2.4s — loyal (steady, content bob)
- `waverRoll`     3.2s — wavering (uneasy roll)
- `disloyalPulse` 1.8s — disloyal (agitated pulse)
Events:
- `wrongedFlash`  1.2s — a crimson-border beat on a member when their loyalty drops.
- **Mutiny telegraph** — when a member is ready to betray, a "MEMBER READY TO BETRAY — ACT NOW"
  banner with a **countdown** to the moment a defection can fire (legible and earned, like the
  run-2 threat telegraph; the defection resolves at the next week settlement).

## 5. State indicators (spec colours + motion)
- **Selection**: a brass ring / corner brackets under the selected unit (pulse ≥1.3s).
- **Protection "%"**: a brass coin that **spins** slowly above an extorted front.
- **Cash satchel**: grows in **3 tiers** with the carried amount (small/medium/fat).
- **Danger ring**: **two stages** — amber (a rival is near / threatened) → blood-red danger
  motion (ambush imminent).
- **Move / attack markers**: a brass diamond on a valid move; a danger mark on a rejected/attack.

## 6. Geometry & motion discipline
- Geometry: **two flat tones per face**, hard edges, no per-tile gradients. Glows = soft radial
  alpha only.
- **Motion budget**: at most ONE fast loop (**≤1.1s**) on screen, and it MEANS danger. Everything
  else idles **≥1.3s** or is event-driven. Calm city, loud threats.
- **Legibility test**: silhouette + faction + state must read even with the mid-tones collapsed to
  flat soot — i.e. shape, brass-vs-rival, and the active state are legible in pure shadow.
