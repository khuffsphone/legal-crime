# public/audio — drop the .m4a clips here (RTS-27 audio wiring)

Vite serves `public/` at the site root, so the AudioManager loads each clip from
`audio/<filename>.m4a`. Drop the files from the Drive **Gemini Foundry** folder here
with these EXACT names. A missing file simply 404s and that seam stays silent — the
wiring is already complete, so each clip lights up the moment it lands here.

## Provided in the current drop (wire up immediately)
SFX:
- LCR_sfx_extort.m4a        — extort lands (🥃)
- LCR_sfx_cashdrop.m4a      — money banked / collector pickup (🪙)
- LCR_sfx_tommygun.m4a      — violence / ambush (🔫)
- LCR_sfx_pistol.m4a        — a single hit (assassinate / sabotage)
- LCR_sfx_siren.m4a         — the law at exposure 85 / a federal lockout
- LCR_sfx_warning.m4a       — teletype federal escalation (50 / 70 / 85) (🔔)
- LCR_sfx_mutiny.m4a        — crew defection stinger
Music (looped beds, adaptive by phase):
- LCR_music_theme.m4a       — TITLE / default bed
- LCR_music_menu.m4a        — menus
- LCR_est_calm_build_v1.m4a — ESTABLISH bed
- LCR_contest_tension_v1.m4a— FIRST BLOOD / CONTEST bed
- LCR_war_high_stakes_v1.m4a— DECAPITATE bed
- LCR_music_gameover.m4a    — defeat swell
Ambience (looped under everything):
- LCR_city_ambience_night.m4a

## Expected by the wiring but not in this drop (silent until added)
- Grease level-ups: LCR_sfx_grease_beat / _bench / _cityhall / _bureau .m4a
- LCR_sfx_door.m4a · LCR_sfx_typewriter.m4a
- Wire rings: LCR_sfx_wire_routine.m4a (soft tick) · LCR_sfx_wire_crisis.m4a (📞 needs-you)
- Phase stings: LCR_sting_establish / _first_blood / _contest / _decapitate .m4a
- Win/lose stings: LCR_sting_win.m4a · LCR_sting_lose.m4a
- VO confirms: LCR_vo_confirm_1..3.m4a  · VO tips: LCR_vo_tip_extort / _grease / _launder / _war .m4a
- VO win/lose one-liners: LCR_vo_win.m4a · LCR_vo_lose.m4a

The key→file map and per-bus volumes live in `src/scenes/audio.ts` (LIBRARY).
