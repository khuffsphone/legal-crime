# FP-01 Opening-Loop Audit

Baseline: `rts/isometric-conversion` at `0d4581c`

This is the production reading of the repository, not a feature inventory. It follows what a new player actually encounters at normal speed and separates working simulation from a fun, legible experience.

## What the repository already contains

Brassmere is not an empty prototype. It already has a deterministic Phaser simulation, a 96×96 isometric city, storefront extortion, autonomous and rushed collection, crew recruitment and specialists, rival strategy, territorial combat, four bribery channels, heat and federal escalation, three win paths, save/load, fog-safe information surfaces, extensive automated tests, generated isometric unit sheets, Meshy AI-derived street props, music, voices, effects, and an expanded atmosphere system.

The production failure was integration and direction: many of the most visible layers were opt-in, the opening taught contradictory controls, simulation continued behind instruction overlays, payoff events bypassed feedback, and several files labelled as one-shot effects were actually minute-long tracks.

## The opening before FP-01

| Approximate time at 1× | Player experience |
|---|---|
| Menu | A visually styled but silent front door. The shipped menu score was never used. |
| 0:00 | New Game starts seed 1 with $3,500, Sal and Vito in the roster, two generic map units, one protected collection, two rivals, and a nine-district city. |
| 0:00 | A large, partly stale control legend covers the board while the simulation, payroll, rival economy, and unit movement continue. |
| First input | The click dismisses the legend but performs no selection. The player must click a crew unit, right-click the highlighted Garage, and choose EXTORT. |
| About 10.5 seconds after the order | The crewman reaches the first Garage, engages, and completes the embodied four-second shakedown. The order itself previously had no acknowledgement. |
| Conversion | $320 backpay appears and a fixed collector immediately races the tutorial's requested `[C]` rush. |
| Next ~6.3 seconds | If the player reads the coach card, the fixed collector can drain the pile first. `[C]` then does nothing and the promised protected collection remains unused. |
| After the first bank | The tutorial asks the player to grease The Beat, but bare `[G]` selected the mathematically hottest channel—usually The Bureau—so the next Pistol Man instruction remained locked. |
| 0:55 | First weekly settlement and $30 base crew upkeep. Rival economic AI recruits even during territorial dormancy. |
| 2:45 | Territorial rivals wake. A four-front extortion opening can already be near the federal raid threshold. |
| 10:00 | Ten settlements have fired; the documented early heat/cash arc is still not safe enough to call balanced. |

## Why it failed the fun test

1. **The best presentation was not the product.** Unit atlases, street props, facades, citizens, and advanced combat controls required a private query-string recipe.
2. **Instruction competed with consequence.** The game charged time while the player read, exposed the whole command wall at once, and taught controls that no longer matched the live bindings.
3. **The first payoff was not guaranteed.** Autonomous collection could beat the explicitly taught rush to the same money.
4. **The progression contract contradicted itself.** The coach asked for The Beat; the key chose another channel; the next specialist required The Beat.
5. **Audio routing exceeded source quality.** Seven event effects run 29–145 seconds and nine physical clips are absent. Governors cannot turn those files into synchronized feedback.
6. **Important feedback paths are bypassed.** Fixed-route banking does not use the same deposit presentation as a manual collector; footsteps are registered but never triggered; rival intent is visually telegraphed but not directly sounded; a turf loss could play a positive confirmation bark.
7. **The economy communicates gross, not felt net.** One Dockside front grosses $34/week against $30 base crew upkeep before collection skim. Four fronts generate enough combined heat to undermine the advertised quiet-builder opening.

## FP-01 foundation decisions

The first integration slice makes these changes without claiming the ten-minute milestone is finished:

- A typed `showcase` profile is the normal launch. Unit sprites, Meshy AI street props, facades, citizens, and advanced combat controls are on without URL flags.
- `?profile=legacy` and per-layer overrides remain as rollback valves.
- Beat cops remain off because their witness heat needs balance UAT. The disabled layer freezes any older saved patrol data without rendering or simulating it.
- Expanded atmosphere remains off because roughly 50 of its 53 manifest entries do not yet have shipped media.
- Cop atlases are not preloaded while cops are disabled, avoiding unnecessary startup memory.
- The menu has a deliberate audio-unlock entrance, the shipped score, and restrained hover/click feedback.
- Successful move and shakedown orders receive immediate, concurrency-governed voice acknowledgement.
- The opening/help overlay freezes the simulation and now teaches only the first job.
- The fixed collector waits while the protected tutorial rush is available, guaranteeing the first payday.
- The first grease instruction and bare `[G]` now target The Beat until its $10/week unlock is funded.
- Tutorial voice tips are marked complete only when playback starts, retry after browser unlock, and reset with the run.
- Turf loss uses crisis feedback; a successful defense receives the positive confirmation.
- A runnable audio gate separately identifies 16 existing-catalog repair blockers: nine missing physical files and seven overlong event SFX.
- A provider-neutral schema and four-brief generation queue are ready to record Meshy AI, ElevenLabs, and Google jobs, rights evidence, file hashes, runtime mappings, and approval gates as production occurs. The Google briefs target the `Flow Music` product and Lyria model family, and the `Flow` product and Veo model family; their job, exact model/version, rights, and file fields remain intentionally null or unapproved until generation.

## One-shot verdict

Codex can one-shot a coherent technical foundation and a reviewable first vertical-slice pass from this repository. It cannot honestly one-shot a finished, superior remake with final art direction, cast performance, music, balance, and proof of fun. Those require generated candidates, editorial selection, in-context mixing, browser/device UAT, and repeated playtests.

The practical target is narrower and stronger: make the first shakedown, first payday, first threat, and first street fight feel final; prove that ten-minute loop with players; then scale the same production contract across the city.

## Remaining FP-01 blockers

- Repair the 16 audio-catalog blockers, separate from the four starter generation briefs: replace seven malformed long event effects and deliver the nine missing physical clips.
- Wire cadence- and distance-governed footsteps, fixed-route bank feedback, a body-down cue, and rival-warning audio.
- Bind Sal and Vito's identities to the actual map units and expand the voice cast/variation contract.
- Resolve the gross-versus-realized-income display and rebalance early extortion/deposit heat.
- Reconcile the two definitions of a held district before relying on the RAID/onboarding arc.
- Run desktop browser visual/audio UAT, capture the complete sequence, and conduct fresh-player tests.
