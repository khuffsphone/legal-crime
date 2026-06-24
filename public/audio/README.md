# public/audio — drop the audio clips here (RTS-27 wiring · RTS-30e-audio reconciliation)

Vite serves `public/` at the site root, so the AudioManager loads each clip from
`audio/<filename>`. Drop your asset files here with the EXACT names below. A missing
file simply 404s and that seam stays silent — the wiring is complete, so each clip
lights up the moment it lands here. The key→file map lives in `src/scenes/audio.ts`
(`LIBRARY`); the seam→key logic lives in `src/scenes/audioMap.ts`.

RTS-30e-audio reconciled these names to the user's ACTUAL asset filenames, so the
files can be copied in AS-IS (no rename) for everything below except the two ⚠ groups.

## Core SFX (.m4a)
- LCR_sfx_extort.m4a        — extort lands
- LCR_sfx_cashdrop.m4a      — money banked / collector pickup
- LCR_sfx_tommygun.m4a      — raid / attack / ambush (Tommy loom-rattle)
- LCR_sfx_pistol.m4a        — sabotage / assassinate (dry slap)
- LCR_sfx_siren.m4a         — a federal lockout
- LCR_sfx_warning.m4a       — (generic teletype; currently no seam — optional)
- LCR_sfx_mutiny.m4a        — crew defection stinger

## Channel grease + Wire + extras (.wav)
- sfx_the_beat_whistle.wav             — grease The Beat (police)
- sfx_the_bench_gavel.wav              — grease The Bench (judges)
- sfx_city_hall_stamp.wav              — grease City Hall (politicians)
- sfx_the_bureau_receiver_click.wav    — grease The Bureau (feds)
- sfx_the_wire_soft_ring.wav           — Wire routine tick
- sfx_the_wire_crisis_double_ring.wav  — Wire needs-you ring (📞)
- sfx_door_slam.wav                    — door (optional)
- sfx_typewriter_log.wav               — typewriter (optional)

## Federal ladder — DISTINCT cue per rung (.wav)
- sfx_federal_50_notice.wav   — crossing 50 (NOTICE)
- sfx_federal_70_watch.wav    — crossing 70 (WATCH)
- sfx_federal_85_raid.wav     — crossing 85 (RAID / hand-cranked siren)

## Win / lose stings (.wav)
- sfx_victory_you_took_the_city.wav    — win
- sfx_defeat_the_city_took_you.wav     — defeat

## ⚠ Phase stings — names ASSUMED (confirm or rename)
The wiring expects these; if your `sfx_phase_*` files use different suffixes,
either rename them to these or tell us the real suffixes:
- sfx_phase_establish.wav · sfx_phase_first_blood.wav · sfx_phase_contest.wav · sfx_phase_decapitate.wav

## ⚠ VO — names NOT yet reconciled (optional flavor)
The map still expects the LCR_vo_* names; map your `voice_*` files to these (rename
table in the RTS-30e-audio receipt) when you want them — all optional, none gate a beat:
- LCR_vo_confirm_1.m4a · _2 · _3   (crew-order confirm, rotated)
- LCR_vo_tip_extort/_grease/_launder/_war.m4a   · LCR_vo_win.m4a · LCR_vo_lose.m4a

## Music + ambience (.m4a, looped)
- LCR_music_theme.m4a        — TITLE / default bed
- LCR_music_menu.m4a         — menus
- LCR_est_calm_build_v1.m4a  — ESTABLISH bed
- LCR_contest_tension_v1.m4a — FIRST BLOOD / CONTEST bed
- LCR_war_high_stakes_v1.m4a — DECAPITATE bed
- LCR_music_gameover.m4a     — defeat swell
- LCR_city_ambience_night.m4a— ambience bed (under everything)

(Extra alternates you may have — LCR_music_tension.m4a, the *_v2 beds, sfx_ui_click.wav,
sfx_cash_pickup.wav — are not referenced by any seam; harmless to leave out.)
