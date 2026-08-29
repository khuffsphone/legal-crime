# Hybrid Art Decision

Status: locked for FP-01 on 2026-08-29

Brassmere uses a hybrid presentation pipeline:

- 3D-rendered sprite atlases for named characters, specialists and approved hero props.
- Procedural/vector rendering for the city fabric, ground, lighting, HUD and high-volume variation.
- Procedural unit art as a permanent fallback and visual QA reference.

Every authored asset must preserve the fixed 2:1 dimetric camera, feet/depth anchor, gameplay footprint, faction readability and Fedora Noir palette. Raw provider output is never a runtime asset. Meshy generation is normalized and rendered through Blender; Google is reserved for music/cinematic production; ElevenLabs is used for original voices and sound families. Every output requires a provenance manifest and human listening/visual approval.

This ruling resolves the stale “no raster sprites” sentence without discarding the procedural system that makes the game robust.
