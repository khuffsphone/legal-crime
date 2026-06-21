# UX_UI_DIRECTION.md — Legal Crime: HUD & Interface Bible

> PROVENANCE: the rts23 brief referenced this file, but no HUD spec was pasted and the file did
> not exist in the repo. This document is distilled from that brief's inline anatomy + CANON's
> Fedora-Noir direction, and is the spec the rts23 HUD targets. Refine as Design firms it up.
> Companion to docs/VISUAL_DIRECTION.md and CANON.md.

## Thesis
**Gangsters' depth + City of Gangsters' clarity + Legal Crime's 1920s character.** The interface
must make a mechanically deep sim *legible at a glance* and *characterful*, in hard-boiled
Prohibition-Chicago noir.

## The Core Rule (the anti-Gangsters fix)
**Every number is LABELED, DIRECTION-AWARE, and INSPECTABLE.** No abstract sliders or bare digits:
each value says what it is, which way it's moving, and — on hover — explains itself in plain mob
English. If the player can't tell what a number means or what an action costs, the HUD has failed.

## Palette & styling
- Soot world (~90%) with **brass = you / value**, **rival-red #9E1B1B = rivals (static)**,
  **danger-red #E11D1D = danger MOTION only**, cash-green for money in motion, fog/bone for text.
- Panels: **art-deco brass frames** — dark fill, thin brass border, corner ticks, a hairline rule.
  Typewriter/serif-mono type. Motion budget: only danger loops may run fast (≤1100ms).
- Keep the four channels (**The Beat / The Bench / City Hall / The Bureau**) and the federal ladder
  (**50 / 70 / 85**). NO Gangsters conflations (no accountant / collection-center / 16:1 / soup
  kitchens).

## HUD anatomy
1. **TOP BAR** — a coherent labeled strip: `CLEAN $` · `DIRTY $` · `NET /wk` (green/red by sign) ·
   a **labeled HEAT METER vs the 50/70/85 ladder** (filled to exposure, threshold ticks, a ▲/▼/◆
   direction arrow, and a "raid at 85" caption) · `CREW` · `WEEK` + countdown, with a **PHASE chip**
   (ESTABLISH / CONTEST / ENDGAME) and a week-progress sliver.
2. **THE FOUR CHANNELS** — labeled DIALS, not sliders: each shows its name, level `$X/wk`, a pip
   ladder, **what it concretely buys** (The Beat → fewer raids; The Bench → survive a bust / −raid
   heat; City Hall → heat cools / hit cover; The Bureau → fed shield / unlocks lockout), and the
   `[G]` bump. Hover explains.
3. **THE ROUTE PILL** — prominent automated-collection status: `stops · banking $X · rob-risk`
   (reddens + pulses when a collector on the route is in danger).
4. **THE CONTEXT CARD** — the selected thug's card (name · skill · loyalty/status · traits) and its
   valid verbs (right-click a shop → EXTORT / ATTACK; right-click street → move).
5. **THE WIRE** — the single clear alert feed, severity-coloured, framed; its title **pulses on a
   fresh alert**. Build/offence boards (with cost / ETA / why-locked) live under the standings.
6. **BANNERS** — objective (top-centre), rival-pressure & mutiny telegraphs, federal warning, the
   klaxon vignette at tier 3.

## Camera
- Pan: **WASD / arrows / drag**. Zoom: **wheel, zoom-TO-CURSOR**, eased, clamped. **[F]** follows
  the selection; **[Z]** frames the whole 9-district city in one press. Iso clicks hit a building's
  **base tile** (roof-aware), not the tile up-left of the roof.

## Audio-feedback seams
Every major beat (extort confirm, cash banked, route ambush, federal warning, crew unrest, phase
change, attack, capture) emits a **discrete signal** (`signalBeat`) + a visual beat (Wire pulse,
phase banner, klaxon, coin/ambush animation) that a future SFX/VO layer can hook — even though no
audio ships yet.
