# Audio Atmosphere — H3 wire-up (the single IsoScene touch point)

**Ticket H3** of GPT-Pro's Audio E–H spec: the final, isolated scene wire-up. It serialized behind the
combat IsoScene lane (merged as #67) and lights up the pure E–H modules (beds, event cues, prop emitters,
mix governance) inside the live scene. Everything is behind **`?audio`** (default **OFF**); `/src/sim` is
untouched; there is exactly **one** per-frame hook.

## Where it plugs in

| Concern | Site | Note |
|---|---|---|
| Flag | `IsoScene.atmosphereAudioEnabled` | `?audio`, default OFF (mirrors `?cops`/`?combat`). Gates every path below. |
| F2 registration | `preload()` — **before** `AudioManager.preload(this)` | `registerAtmosphereClips()`. Register-after-preload would catalogue the keys but never queue the files (silent + a loud warn). |
| Bridge + state | `create()` — after `this.audio.ready()` | Builds `AtmosphereSceneAdapter(seed, audioSink())`; verify runs in **report mode** (a not-yet-shipped `.wav` stays silent, never dev-throws); R1 legacy scatter props cached as emitter sources; the log cursor is seeded to `state.log.length`. |
| **The one hook** | `updateUnits()` — after `observeWorld` + `harvestIncidents`, inside the un-paused gate | `this.atmosphere.step(this.buildAtmosphereFrame(obs, collectorDeposits))`. Consumes `ObserveResult { result, strategy, endgame, state }`. |
| Teardown | `resetRestartCaches()` | Drops the bridge + cursors so a quickload/restart never steps a coordinator seeded from the prior match. |

## The canon knots (spec H.5)

- **One eligibility closure.** `isAudioFeedbackEligible(gx, gy) → { revealed, onScreen }` is an *adapter* over the
  existing `weaponFeedback.shouldEmitFeedback(revealed, onScreen)` — **not** a parallel LOS/visibility rule.
  `revealed` rides `isVisibleTile` (so `?reveal`/`debugRevealAll` lifts the audio veil exactly as the render's);
  `onScreen` is pure camera bounds. **`debugRevealAll` touches `revealed` only, never `onScreen`** — a `?reveal`
  board can hear a revealed off-map district's bed, but never makes an off-screen positional cue audible.
- **Collector cues from `processCollectorArrivals`**, never the wrapper's `arrivedUnitIds` (which carries rival
  arrivals → x-ray). Player deposits only.
- **`districtAt` is fog-gated**: unexplored ⇒ `null` ⇒ zero weight (a bed never switches on a district the camera
  only panned over unrevealed). It translates the sim district **instance id → ordinal → ART archetype**
  (the bed catalog is keyed by archetype), memoized per id.
- **The adapter owns the AudioManager calls.** The coordinator + adapter stay Phaser-free; the sink
  (`AtmosphereSink`, injected — never imports `../audio`) binds intents to `this.audio`. Loop intents route
  through a minimal mute/bus-aware **loop-voice seam** added to `AudioManager` (`loopVoice`/`setVoiceGain`/
  `stopVoice`) so district beds + anchor loops can actually sound; pan/positional are dropped (stereo-flat).

## Intent → AudioManager map

| Coordinator intent | Sink | AudioManager |
|---|---|---|
| `playOneShot(key, gain, [tile], [pan])` | `playOneShot(key, gain)` | `play(key, { volScale: gain })` — tile/pan dropped |
| `playLoop(voiceId, key, gain, fadeInMs)` | `startLoop(...)` | `loopVoice(voiceId, key, { volScale, fadeInMs })` |
| `setLoop(voiceId, gain)` | `setLoopGain(...)` | `setVoiceGain(voiceId, volScale)` — retrim, no restart |
| `stopLoop(voiceId, fadeOutMs)` | `stopLoop(...)` | `stopVoice(voiceId, fadeOutMs)` |
| `duck(targetsDb, …, holdMs)` | `duck(holdMs)` | `duck(ms)` — ducks the beds (lossy: no per-group dB) |

Unknown/unloaded keys no-op (F2 graceful degradation) — the 53-clip manifest ships silent until K's mixer
drops the `.wav`s, so `?audio` is wire-complete now and audible the moment assets land.

## Proof — deterministic intent trace (seed 42)

Captured by driving `AtmosphereSceneAdapter` through a scripted scenario (the generator was a throwaway;
this is its output). Same inputs → byte-identical trace (asserted in `tests/audioSceneAdapter.test.ts`).

```
    t=0.00s  MARKET, NEAR zoom — first sample arms the bed + fountain anchor
      startLoop    emitter:src:fountain#1  key=prop_fountain_loop  gain=1.000  fadeIn=700ms

    t=0.75s  bed candidate ripens → MARKET bed pair fades in
      startLoop    bed:MARKET:base#1  key=bed_market_base  gain=0.089  fadeIn=1500ms
      startLoop    bed:MARKET:color#1  key=bed_market_color  gain=0.045  fadeIn=1500ms

    t=1.00s  a police RAID-BUST lands (HUD cue, ducks beds)
      duck         hold=400ms
      playOneShot  police_raid_bust  gain=1.000

    t=1.50s  a player collector banks — collector cue
      duck         hold=200ms
      playOneShot  collector_deposit  gain=1.000

    t=2.00s  a fogged extortion front converts → NON-positional (no leak)
      playOneShot  extortion_shakedown_converted  gain=1.000
      stopLoop     emitter:src:fountain#1  fadeOut=900ms          ← its tile went hidden: NO-X-RAY

    t=2.10s  fast zoom-out MID→FAR (LOD crossing forces the emitter re-plan now)
      (no intents this frame)

    t=3.00s  federal WATCH crossing (tier 2) — never rate-dropped
      duck         hold=650ms
      playOneShot  federal_watch  gain=1.000
      setLoopGain  bed:MARKET:base#1  gain=0.126                  ← beds re-trim on the zoom change
      setLoopGain  bed:MARKET:color#1  gain=0.063
```

Reading it: beds fade in only after the 750 ms hysteresis; every event cue ducks the beds first; the
collector beat comes from a *player* deposit; the fogged extortion outcome plays but **without position**,
and the fountain **stops the instant its tile is unrevealed** — the NO-X-RAY gate holds on both the event and
emitter paths; the federal tier crossing is never rate-dropped.

## Gate

`tsc` clean · full suite **1777 tests** (157 files; +18 H3 — pure adapter + the H3 mutation table) · `vite build`
clean. Mutation-verified teeth: deleting the hook, leaking `debugRevealAll` onto `onScreen`, using
`arrivedUnitIds`, adding a second hook, or registering after preload each fails CI. **Acceptance is this proof
+ K's ears on `?audio=1` post-merge** — CI-green alone is insufficient (the clips are silent until the mixer
delivers the 50 `.wav`s).
