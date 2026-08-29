# FP-01 Audio Repair Receipt

Generated **2026-08-29** with `scripts/generate-fp01-audio.ts` at 48 kHz, stereo, 16-bit PCM.
These are original deterministic procedural candidates, not ElevenLabs outputs. They are integrated and
technically validated but remain **provisional until in-game listening UAT**. A selected vendor master may
replace a file at the same runtime path after its own provenance and rights review.

| Runtime file | Duration | Bytes | SHA-256 |
|---|---:|---:|---|
| `public/audio/sfx_extort.wav` | 1.350s | 259244 | `b8b422bb0f492691543f4838694d9b9116a08b960e81908d4953dd82bc69ef7c` |
| `public/audio/sfx_cashpickup.wav` | 0.680s | 130604 | `498777eb13e122772783609a808581aad50751b6d073c564edd5c7057bf9ef88` |
| `public/audio/sfx_cashdrop.wav` | 1.050s | 201644 | `44470be5578a67d2429341e0d9d234912e6020ccd8b8b0c5d15b9e84a234be47` |
| `public/audio/sfx_tommygun.wav` | 1.080s | 207404 | `19df6ab15f05e0a8203adab2a711a25934b387e357ecf42833c70597f1fa99ff` |
| `public/audio/sfx_pistol.wav` | 0.720s | 138284 | `666c8cf4c41225d14b4ad4f59ea9909087c9d0a272c058c4256a4930488494ed` |
| `public/audio/sfx_siren.wav` | 3.800s | 729644 | `28ec44a5e570f7e29a1fb306c72ee667de711f4497d580a3b1fe665102c91ec9` |
| `public/audio/sfx_mutiny.wav` | 2.250s | 432044 | `568a065b5eb543a16235f70ebab802d28f37142ae3da67adfc3fb71777277b2f` |
| `public/audio/sfx_hit_fists.wav` | 0.160s | 30764 | `238dfde9225973c5cd5cab3a2bf1e418fb5d4b769730146d92cd29cfaf38d8e3` |
| `public/audio/sfx_hit_pistol.wav` | 0.120s | 23084 | `cb7414207c824b19cdf39ddd4d2e51e365571405e36b81742bfc8a057b0f88a3` |
| `public/audio/sfx_hit_shotgun.wav` | 0.280s | 53804 | `f263559a7db03e38376ac602cd08f2106709414b346edaa2def5fb6a2e57f340` |
| `public/audio/sfx_hit_rifle.wav` | 0.300s | 57644 | `bcf3499133394524ff42d31f0f38ed0419a7e8489a3a6bf7fb9f22c55cd3f6ca` |
| `public/audio/sfx_hit_hitman.wav` | 0.110s | 21164 | `6c8490ada5da9b62eda5a98f6a7edd953318ee6c6f4e096b41241f17cc69c760` |
| `public/audio/sfx_hit_demolitions.wav` | 0.660s | 126764 | `514c9d09a60046b6fb58a5c3d145267bf7ac3748afa11b1233557b03602410c2` |
| `public/audio/sfx_step_pavement.wav` | 0.100s | 19244 | `160e5eae2052a667d8dbadced7d59e382aac9eb15bacca06b2df20aada0ca807` |
| `public/audio/sfx_step_gravel.wav` | 0.130s | 25004 | `c6ae9efc410f0c6c641d7a0c8ec9e4f395bd7cbc75377550b07b78f7f0c11608` |
| `public/audio/sfx_down_body.wav` | 0.520s | 99884 | `30ac57f0ced46553aa8439eb1c93ee795d2e37e05793d53518bef369ccc11370` |

The seven superseded 29–145 second tracks are quarantined under
`docs/production/assets/quarantine/legacy-long-audio/` and no longer ship through Vite. The generic
`warning` asset was retired because it had no live trigger and duplicated the federal rung cues.
