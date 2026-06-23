# HUD_SPEC.md — Legal Crime: Fedora Noir HUD/GUI Specification

> PROVENANCE: the rts23 brief referenced an authoritative HUD_SPEC.md "in the brain", but no spec
> file was pasted and none existed in the repo. This document is the in-repo RECORD, distilled from
> the brief's §-references + CANON.md + UX_UI_DIRECTION.md, and is what the rts23 HUD is built to.
> Replace verbatim if Design's master is provided. Companion to docs/VISUAL_DIRECTION.md.

## §0 — Foundations (the law)
1. **Every number is LABELED, DIRECTION-AWARE, and INSPECTABLE.** It names its unit + meaning,
   shows which way it's moving, and explains itself on hover in plain mob English. Never guess.
2. **Red discipline.** rival-red `#9E1B1B` = rival identity (static); danger-red `#E11D1D` = danger
   MOTION only (never a static fill); the two reds never share a role. Brass = you/value; cash-green
   = money in motion; blood `#8A2B22` for a static threat marker.
3. **Motion budget.** Only danger loops may run fast (≤1.1s); calm idles ≥1.3s.
4. **Audio seams.** Every major beat emits a discrete VISUAL signal a future SFX/VO can hook (📞🪙🔫🔔).
- Camera: zoom-TO-CURSOR (clamped), one-press FRAME-CITY, iso clicks hit a building's BASE tile.

## §1 — Top bar (the empire at a glance)
- `CLEAN $` (brass) · `DIRTY $` (smudged/warns when fat) · `NET /wk` with sign + colour (green up,
  danger down) · **§1D LADDERED HEAT METER**: fill = federal exposure, ENGRAVED ticks at **50/70/85**
  labelled **NOTICE / WATCH / RAID**, a ▲/▼ direction arrow, and a named caption ("WATCH · exp 72/100
  ▲ · raid at 85") · `CREW` (+loyalty) · `WEEK` + countdown · a **PHASE chip** (ESTABLISH → FIRST
  BLOOD → CONTEST → DECAPITATE) + a week-progress sliver.

## §2 — The four channels (grease panel)
Labeled **DIALS**, not sliders. Each: name (**THE BEAT / THE BENCH / CITY HALL / THE BUREAU**), a
named **bracket** pip-ladder (**NONE → GREASED → ON THE TAKE → IN POCKET → IRON GRIP**), `$X/wk`,
the **plain-English payoff** (fewer raids / survive a bust −raid heat / heat cools + hit cover / fed
shield + unlocks lockout), the **next-bracket cost** (→NAME@$N), and a cause→effect hover. **The
Bureau reads federal-green** with a heat-preview note (greasing it lowers federal exposure directly).

## §3 — Context panel (bottom-left)
- **The Rap Sheet** (a selected thug): name · skill · loyalty/status · traits, and its orders.
- **The Books** (a hovered business): name · state (yours/rival/shut/un-shaken, colour-coded) ·
  yield $/wk · heat/wk · uncollected.
- **§3C action-verb chips**: `verb · cost · heat · ETA` with a **READY / CONDITIONAL / LOCKED** state
  (CONDITIONAL = only cash/cooldown away; LOCKED = a structural prerequisite) + the plain reason.

## §4 — The Wire (the single alert feed)
One place for "what just happened / what needs me": a **category dot** per line (money / threat /
law / turf / crew), severity colour, an **unread "NEEDS YOU" count** in the title with a left-edge
tab on each unread priority item, a title pulse on a fresh alert, and focus-to-mark-read ([L]).
*(Per-line click-to-focus on the related world thing is noted but partial.)*

## §6 — Routes
- **§6A** a prominent ROUTE line: `◆ ROUTE · N stops · BANKING $X · ⚠ ROB-RISK / route clear`,
  reddening + pulsing (motion) when the collector is in danger.
- **§6B** the drawn route overlay (brass polyline + stop pips) on the map.

## §7 — Win/lose & transitions
- A **win/loss proximity** readout: `WIN n% · LOSE n%` + who leads and how far from taking the city.
- **Phase-transition overlay**: a centred banner on each stage change (a beat for audio/VO).
- The end-state overlay ("YOU TOOK THE CITY" / "THE CITY TOOK YOU").

## §9 — Cross-cutting checklist
Labeled ✓ · direction-aware ✓ · hover-inspectable ✓ · red discipline ✓ · motion budget ✓ · the
four channels + 50/70/85 ladder kept ✓ · no Gangsters conflations ✓ · procedural/vector (no raster) ✓.

## Deferred (NOT this batch)
- **§5 Trade/Market panel** — needs new pure sim logic; deferred to RTS-24.
