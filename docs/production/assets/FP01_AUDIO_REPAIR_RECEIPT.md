# FP-01 Audio Repair Receipt

Generated **2026-08-30** with `scripts/generate-fp01-audio.ts` at 48 kHz, stereo, 16-bit PCM.
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
| `public/audio/sfx_step_pavement_v2.wav` | 0.330s | 63404 | `ff5964cd928f5f56c199fe993f7265b27ddfc7095952ed302224f3e4a467ff11` |
| `public/audio/sfx_step_gravel_v2.wav` | 0.360s | 69164 | `248fbe38df86809f2060cf88e8ddb83753bbd2272bc06b404b5af1ac9ef40644` |
| `public/audio/sfx_down_body.wav` | 0.520s | 99884 | `30ac57f0ced46553aa8439eb1c93ee795d2e37e05793d53518bef369ccc11370` |
| `public/audio/sfx_phase_establish_v2.wav` | 1.250s | 240044 | `cd445532545a163e75124a927e11d67ab1d71710ca4dc07a0654b9be72dc1ad5` |
| `public/audio/sfx_phase_first_blood_v2.wav` | 1.080s | 207404 | `d97b5a80ab3bf683fb8452d1cc6bc7988ad221dd65eeb8e04a91a93d4f6f9969` |
| `public/audio/sfx_phase_contest_v2.wav` | 1.500s | 288044 | `2a5eb2c4070f520ac6cf1b1d174ae8e9a8303d306b119c3aade8904677cbc3aa` |
| `public/audio/sfx_phase_decapitate_v2.wav` | 1.720s | 330284 | `730ffad2b451597a7f128202163add545a53ad79a98202d9fe6a66018b58d5e0` |
| `public/audio/sfx_victory_you_took_the_city_v2.wav` | 2.100s | 403244 | `a220f8c339e42435754f84e3eb4917fcb18c43187f2e8a0a87e2bc6cd64a8954` |
| `public/audio/sfx_defeat_the_city_took_you_v2.wav` | 2.350s | 451244 | `b3caeb7ea1b9ba095aa94c2ddb4bd592a4f5f4d5e98ed3d50ec2c2077cfed37d` |

The seven superseded 29–145 second tracks are quarantined under
`docs/production/assets/quarantine/legacy-long-audio/` and no longer ship through Vite. The generic
`warning` asset was retired because it had no live trigger and duplicated the federal rung cues.

The v2 filenames deliberately invalidate any browser cache holding the earlier click-like footstep files or
the duplicated milestone stings. The nine shipped VO files were losslessly renamed from `.m4a` to `.wav`
after header inspection confirmed they were PCM WAV containers; no voice content was re-encoded.
