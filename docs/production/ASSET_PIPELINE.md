# Brassmere Asset Production Pipeline

## Tool roles

| Provider / tool | Approved role | Do not use it for |
|---|---|---|
| Meshy AI | Original props, buildings and base character meshes; remesh, texture and rigging inputs | Directly dropping inconsistent raw generations into the game |
| Blender | Scale, camera, lighting, material normalization, animation cleanup and deterministic sprite rendering | Manual one-off exports without manifests |
| Mixamo or Meshy AI rigging | Rapid locomotion/action prototyping when licensing permits | Final animation approval without foot-contact and silhouette review |
| Google — `Flow` product, selected Veo model/version | Short original chapter transitions, newspaper reveals, title cards and marketing footage | Core interactive movement or clips copied frame-for-frame from another game or film |
| Google — `Flow Music` product, selected Lyria model/version | Original adaptive music stems and phase-specific beds | Shipping one long track with no loop, stem or intensity plan |
| ElevenLabs | Original cast voices, barks, radio/news delivery and tightly prompted sound effects | Cloning real actors, celebrities or recognizable performers |
| Phaser 3 | Runtime composition, input, simulation presentation, animation, audio mixing and effects | Serving as the source-asset generator |

## Visual contract

- Fixed 2:1 dimetric camera and deterministic render rig.
- One controlled palette and material response across all generated sources.
- Eight directions for gameplay characters.
- Minimum actions for FP-01: idle, walk, shakedown, melee, firearm attack, hit reaction and downed.
- Animation timing is authored against gameplay events, not merely played decoratively.
- Source GLB, processed blend/GLB, sprite sheets and manifests are retained.

## Audio contract

### Runtime buses and content groups

Brassmere's Phaser audio layer exposes four runtime buses. The seven production content categories map to those buses as follows; weapons, impacts, movement, and interface are SFX subgroups, not separate buses.

| Content category | Runtime bus |
|---|---|
| music | `music` |
| ambience | `ambience` |
| voice | `vo` |
| weapons | `sfx` |
| impacts | `sfx` |
| movement | `sfx` |
| interface | `sfx` |

### Required metadata

Every clip records:

- stable game key
- provider and model/tool
- prompt or recording script
- generation date
- commercial-use basis
- source filename and SHA-256
- edited filename and SHA-256
- duration, sample rate, channels and loudness target
- loop points when applicable
- triggering gameplay event
- replacement/variation group

### FP-01 minimum library

- 3 selection/confirmation barks per primary crew voice
- 3 move barks
- 3 shakedown barks
- 3 combat barks
- 2 wounded/downed reactions
- 1 collector pickup and 1 collector deposit reward sequence
- 2 rival warnings
- 3 federal/law warnings
- pavement and gravel footstep families with multiple variations
- distinct pistol, shotgun, rifle/Thompson, melee and demolition families
- body/coat fall and environment contact layers
- menu, establish, tension and fight music stems
- district night bed with sparse randomized one-shots

## Generated cinematic policy

Video clips are punctuation, not a substitute for gameplay. FP-01 may use:

- a 4-8 second opening city reveal
- a 2-4 second newspaper/federal transition
- a short win/loss sting

All cinematics require a skip control, must not conceal loading failure, and must match the interactive art direction closely enough that returning to gameplay is not a visual downgrade.

## Import gates

An asset is rejected if it lacks provenance, has uncertain commercial rights, imitates a protected performer or franchise, breaks the scale/camera contract, contains visible generation defects, or has no defined in-game trigger.

The core catalog gate requires `ffprobe` from FFmpeg and runs with:

```sh
npm run validate:audio-assets
```

It intentionally exits `1` while a referenced file is missing, an event SFX exceeds five seconds, a catalog
key is duplicated, a non-synth entry has no file, or policy contains a stale key. FP-01 initially found 16
media blockers; `scripts/generate-fp01-audio.ts` now creates the provisional repair pack and the gate exits
`0`. Production classification may exempt a clip from the event-SFX limit as music, ambience, cinematic
audio, or VO only when that is its genuine content role; runtime audio still routes through `music`,
`ambience`, `vo`, or `sfx`. The long legacy cues were quarantined, not relabeled.
