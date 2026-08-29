# Brassmere Asset Readiness — 2026-08-29

This is a runtime audit, not an asset-counting exercise. An asset is **live** only when the normal showcase profile loads it, displays or plays it from a real gameplay trigger, and retains a working fallback. Presence in Git, Drive, a manifest, or a provider brief does not make it integrated.

## Runtime inventory

| Class | Present | Live in the normal build | Status |
|---|---:|---:|---|
| Meshy streetscape prop PNGs | 24 | 24 | Live, but placement still cycles files across open tiles without the intended district/zone taxonomy |
| Thug action sheets | 5 | 5 | Idle, walk, run, and attack are live; hurt is provisionally wired into the casualty fall and is not a final death take |
| Cop action sheets | 3 | 0 | Present; cops are disabled in the showcase profile pending balance UAT; no idle, hurt, or down sheet |
| Modular facade-kit PNGs | 28 | 0 | Valid files and manifests, but nothing preloads or renders them; `facadeKit=true` currently selects procedural vector facades |
| Physical audio files | 49 | 49 catalogued | Core catalog is wired and validation-green; 45 unique payloads because several stings share identical media |
| Expanded atmosphere clips | 53 requested keys | 3 reused federal cues | Feature remains disabled; 50 requested clips have no physical file |
| Video/cinematics | 0 | 0 | No runtime video exists |
| Provider production records | 4 briefs | 0 | Meshy proprietor, ElevenLabs voice, Google music, and Google cinematic entries contain no jobs, files, rights evidence, approval, or runtime path |

The public tree currently holds **60 decodable PNGs** and **49 physical audio files**. The normal build visibly consumes 24 props plus five thug sheets, with hurt used only as a provisional casualty bridge. File presence must not be reported as integration completion.

## Visual gaps

The current 24-prop set covers 20 of 28 planned taxonomy families. The missing runtime sprite families are:

- sandwich board
- street tree
- fountain
- parked car
- delivery truck
- barrel/drum
- pallet stack
- puddle/stain

The available `thug_hurt` sheet is an upright gunshot reaction, not a true death animation. A real death pass still needs a non-looping `down` action that holds its final frame. Until that exists, the runtime may use the hurt reaction followed by a deliberately flattened, desaturated body.

## External Drive inventory

The connected `assets-visual` folder contains raw production/reference material, not approved runtime finals:

- four cop GLBs and two gangster GLBs;
- one Mixamo walk sheet;
- 102 Google Flow still-image candidates;
- 22 interface/reference screenshots;
- 47 NotebookLM/reference files;
- archived thug sheets already represented in the repository.

The `selected-finals` and `audio-candidates` folders are empty. The raw Flow stills do not meet the deterministic eight-direction sprite/runtime contract. The source GLBs are useful for Blender rendering, but they are not browser runtime assets.

## Integration order

1. Human-UAT the provisional hurt-to-corpse casualty lifecycle; keep it only as a bridge until a true death take is approved.
2. Produce and approve three original nonverbal casualty voice reactions plus one nearby-crew reaction family in ElevenLabs.
3. Render a true eight-direction non-looping `down` sheet from the approved Meshy/Blender character source.
4. Integrate the 28 modular facade PNGs behind an isolated visual A/B gate; do not confuse the current procedural facade switch with this work.
5. Enable cops only after their idle/hurt/down coverage and heat/balance UAT are complete.
6. Fill the eight missing prop families and replace random prop cycling with district/zone-aware placement.
7. Complete and approve the 50 missing atmosphere clips before enabling the expanded atmosphere coordinator.
8. Select any Flow material only for chapter transitions or marketing after rights/provenance review; never use concept stills as world sprites.

## Required evidence for every new asset

- source/provider job and generation date;
- exact account plan and commercial-use evidence;
- original prompt/script and identity-safety declaration;
- source and runtime derivative hashes;
- measured dimensions, duration, codec, loop points, or animation metadata;
- runtime key, trigger, fallback, and preload behavior;
- in-game screenshot/audio review and approval state.
