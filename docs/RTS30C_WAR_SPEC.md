# RTS30C_WAR_SPEC — Turf War (the mid/late-game depth)

> Committed to the repo so RTS-30c-2 / 30c-3 read it from `/docs` instead of a paste. The RTS-30c-1
> CORE portion below is what the `rts30c-1` commit builds to.

TURF WAR is the mid/late-game depth that gives the game teeth.

## CANON ANCHORS
- **CONTROL = DISTRICT STATUS** — you HOLD a district at ≥ ~60% of its businesses; held districts gate
  expansion + turf-war eligibility.
- **INTERCEPTION is the RE-TIMED pillar** — collectors are safe EARLY (rivals dormant ~3 weeks, beyond
  the fog) and become vulnerable on RIVAL INVASION (mid-game); the hook is BUILT-BUT-DORMANT
  (`collectorsVulnerable === !rivalsDormant`) and this slice switches it ON, scoped to contested
  districts.
- **ADJACENCY** — war happens at the BORDERS of held districts (push into / pushed in adjacent
  districts).
- **THE FOUR CHANNELS** gate specialist/equipment upgrades ("military" = equipment, NOT a 5th channel).
- **WIN PATHS** — Domination (last family / ≥60% blocks) is fed by turf war.
- **RED DISCIPLINE** — rival muscle = STATIC blood-red `#9E1B1B` (identity); an ACTIVE threat
  (attacking, intercepting) = PULSING danger-red `#E11D1D` / `#FF5A2C` (motion). PACE is still carried
  by SPACE; war adds the mid-game spike, not constant churn.

## RTS-30c-1 CORE (this slice)
1. **RIVAL ACTIVATION** — dormancy lifts ~wk3 → a rival contests a border district (moves muscle in),
   escalating gradually.
2. **CONTESTED STATUS** — amber, 1.6s pulse, on the map (district wash/pulse + nameplate badge) + the
   roster.
3. **CONTEST MECHANIC** — presence-based: more rival muscle than yours erodes your hold %; reinforce to
   push back; cross the threshold → flip. Hold % is the inspectable truth; no dice-mystery.
4. **ATTACK / DEFEND** — defend by holding muscle in your contested district; attack by sending muscle
   into a rival/contested adjacent one. Use the existing offensive slots where they fit.
5. **INTERCEPTION SWITCH-ON** — flip `collectorsVulnerable` PER-DISTRICT from contest state; a collector
   routing through a contested district can be robbed → cash to the rival; uncontested = safe;
   endangered collector reads via danger-red MOTION; player can escort / re-route / accept.
6. **READABILITY load-bearing** — contested obvious, attack/defend obvious, endangered collectors
   obvious, who's-winning obvious; hold the red discipline.

## NOT in 30c-1 (later slices)
- **30c-2** — raids / demolitions / training / specializations via the four channels.
- **30c-3** — 2–4 scripted events + 30–60 min arc tuning + the slack-20–40 check + the Go-Straight
  threshold.

These come AFTER this core is proven by a human play-test.
