// RTS-27 — pure audio mapping/rotation helpers (the testable half of the audio wiring).
import { describe, it, expect } from 'vitest';
import {
  musicBedForPhase, stingForPhase, wireCueForSeverity, wireShouldRing, greaseCueKey,
  federalCueKey, combatCueKey, nextTakeIndex, pickTake, cycleVolume, clampVolume, orphanCueKey,
  softSfxPriority, admitSoftSfx, softBurstActive,
  SOFT_SFX_MAX, SOFT_SFX_DEFAULT_PRIORITY, SOFT_BURST_WINDOW_MS, SOFT_BURST_THRESHOLD,
  type SoftVoice,
} from '../src/scenes/audioMap';

describe('music state machine — bed per phase', () => {
  it('maps each phase to its adaptive bed; FIRST BLOOD + CONTEST share the conflict bed', () => {
    expect(musicBedForPhase('TITLE')).toBe('music_theme');
    expect(musicBedForPhase('ESTABLISH')).toBe('music_establish');
    expect(musicBedForPhase('FIRST BLOOD')).toBe('music_contest');
    expect(musicBedForPhase('CONTEST')).toBe('music_contest');
    expect(musicBedForPhase('DECAPITATE')).toBe('music_war');
    expect(musicBedForPhase('GAMEOVER')).toBe('music_gameover');
  });

  it('phase sting keys are derived from the phase name', () => {
    expect(stingForPhase('ESTABLISH')).toBe('sting_establish');
    expect(stingForPhase('FIRST BLOOD')).toBe('sting_first_blood');
    expect(stingForPhase('DECAPITATE')).toBe('sting_decapitate');
  });
});

describe('progressive disclosure for the ears — only needs-you rings', () => {
  it('danger/warning ring (crisis); info/gain are routine', () => {
    expect(wireCueForSeverity('danger')).toBe('crisis');
    expect(wireCueForSeverity('warning')).toBe('crisis');
    expect(wireCueForSeverity('info')).toBe('routine');
    expect(wireCueForSeverity('gain')).toBe('routine');
  });
  it('only needs-you slips actually ring', () => {
    expect(wireShouldRing('danger')).toBe(true);
    expect(wireShouldRing('warning')).toBe(true);
    expect(wireShouldRing('info')).toBe(false);
    expect(wireShouldRing('gain')).toBe(false);
  });
});

describe('seam → clip mappings', () => {
  it('each grease channel has a distinct cue', () => {
    const cues = ['police', 'judges', 'politicians', 'feds'].map(greaseCueKey);
    expect(new Set(cues).size).toBe(4); // all distinct
    expect(greaseCueKey('police')).toBe('grease_beat');
    expect(greaseCueKey('feds')).toBe('grease_bureau');
  });
  it('federal cue rings a DISTINCT clip per rung (NOTICE 50 / WATCH 70 / RAID 85)', () => {
    expect(federalCueKey(1)).toBe('federal_notice');
    expect(federalCueKey(2)).toBe('federal_watch');
    expect(federalCueKey(3)).toBe('federal_raid');
    expect(new Set([federalCueKey(1), federalCueKey(2), federalCueKey(3)]).size).toBe(3); // all distinct
  });
  it('combat cues: tommy-gun for raids/ambush, pistol for a hit, siren for a lockout', () => {
    expect(combatCueKey('raid')).toBe('tommygun');
    expect(combatCueKey('ambush')).toBe('tommygun');
    expect(combatCueKey('assassinate')).toBe('pistol');
    expect(combatCueKey('lockout')).toBe('siren');
  });
});

describe('VO take-rotation — no immediate repeat', () => {
  it('nextTakeIndex round-robins', () => {
    expect(nextTakeIndex(0, 3)).toBe(1);
    expect(nextTakeIndex(2, 3)).toBe(0);
    expect(nextTakeIndex(-1, 3)).toBe(0);
    expect(nextTakeIndex(0, 0)).toBe(0); // empty-safe
  });
  it('pickTake cycles through takes and never repeats back-to-back', () => {
    const takes = ['a', 'b', 'c'];
    let idx = -1; const seen: string[] = [];
    for (let i = 0; i < 4; i++) { const p = pickTake(takes, idx)!; seen.push(p.key); idx = p.index; }
    expect(seen).toEqual(['a', 'b', 'c', 'a']);
    expect(pickTake([], 0)).toBeNull();
  });
});

describe('settings volume helpers', () => {
  it('clampVolume bounds to 0..1', () => {
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(0.6)).toBe(0.6);
  });
  it('cycleVolume steps 100→75→50→25→0→100', () => {
    expect(cycleVolume(1)).toBe(0.75);
    expect(cycleVolume(0.75)).toBe(0.5);
    expect(cycleVolume(0.25)).toBe(0);
    expect(cycleVolume(0)).toBe(1);
  });
});

describe('RTS-34 orphan-clip wiring — the no-seam clips fire on real beats', () => {
  it('a LOCKOUT plays the door-slam (forced entry); LAUNDERING plays the typewriter', () => {
    expect(orphanCueKey('lockout')).toBe('door');
    expect(orphanCueKey('launder')).toBe('typewriter');
  });
});

// ── SOFT-SFX / VO GOVERNOR (pure decisions) — cap, priority-drop order, burst detection ──
const voice = (key: string, startedMs: number): SoftVoice => ({ key, startedMs });

describe('soft-sfx priority table — info-critical > economy > texture', () => {
  it('wire_routine outranks cash/extort/grease, which outrank door/typewriter', () => {
    expect(softSfxPriority('wire_routine')).toBeGreaterThan(softSfxPriority('cashdrop'));
    expect(softSfxPriority('extort')).toBeGreaterThan(softSfxPriority('door'));
    expect(softSfxPriority('grease_beat')).toBeGreaterThan(softSfxPriority('typewriter'));
    expect(softSfxPriority('cashdrop')).toBe(softSfxPriority('extort')); // economy tier ties
  });
  it('an unlisted soft cue falls back to the economy-tier default', () => {
    expect(softSfxPriority('something_new')).toBe(SOFT_SFX_DEFAULT_PRIORITY);
  });
});

describe('soft-sfx cap — admit under the cap, drop/evict the lowest priority at the cap', () => {
  it('always admits while under the cap (no eviction)', () => {
    expect(admitSoftSfx([], 'door')).toEqual({ admit: true, evict: null });
    expect(admitSoftSfx([voice('door', 0), voice('extort', 1)], 'cashdrop', SOFT_SFX_MAX))
      .toEqual({ admit: true, evict: null }); // 2 < 3
  });
  it('at the cap, a higher-priority incoming EVICTS the weakest active voice', () => {
    const active = [voice('door', 0), voice('typewriter', 1), voice('cashdrop', 2)]; // priorities 1,1,2
    const d = admitSoftSfx(active, 'wire_routine', 3); // priority 3 beats the weakest (a 1)
    expect(d.admit).toBe(true);
    expect(d.evict).not.toBeNull();
    expect(softSfxPriority(d.evict!.key)).toBe(1); // a texture cue is dropped, not the cash
  });
  it('on a priority tie among the weakest, the OLDEST voice is evicted', () => {
    const active = [voice('door', 10), voice('typewriter', 2), voice('cashdrop', 5)]; // two 1s: door@10, tw@2
    const d = admitSoftSfx(active, 'wire_routine', 3);
    expect(d.evict).toEqual(voice('typewriter', 2)); // older of the two priority-1 voices
  });
  it('at the cap, an incoming that ties or is weaker than the weakest is DROPPED (no stacking)', () => {
    const active = [voice('extort', 0), voice('cashdrop', 1), voice('grease_beat', 2)]; // all priority 2
    expect(admitSoftSfx(active, 'cashdrop', 3)).toEqual({ admit: false, evict: null }); // tie → drop incoming
    expect(admitSoftSfx(active, 'door', 3)).toEqual({ admit: false, evict: null }); // weaker → drop incoming
  });
});

describe('soft-burst detection — duck when enough soft cues land in the window', () => {
  it('fewer than the threshold in the window is NOT a burst; reaching it IS', () => {
    expect(softBurstActive([0, 100], 100, SOFT_BURST_WINDOW_MS, SOFT_BURST_THRESHOLD)).toBe(false); // 2 < 3
    expect(softBurstActive([0, 100, 200], 200, SOFT_BURST_WINDOW_MS, SOFT_BURST_THRESHOLD)).toBe(true); // 3
  });
  it('starts older than the window do not count toward the burst', () => {
    // two cues just landed, one is ancient — only the recent pair is inside the window
    expect(softBurstActive([0, 5000, 5100], 5100, SOFT_BURST_WINDOW_MS, 3)).toBe(false);
    expect(softBurstActive([5000, 5100, 5200], 5200, SOFT_BURST_WINDOW_MS, 3)).toBe(true);
  });
});
