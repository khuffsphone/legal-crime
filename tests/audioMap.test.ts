// RTS-27 — pure audio mapping/rotation helpers (the testable half of the audio wiring).
import { describe, it, expect } from 'vitest';
import {
  musicBedForPhase, stingForPhase, wireCueForSeverity, wireShouldRing, greaseCueKey,
  federalCueKey, combatCueKey, nextTakeIndex, pickTake, cycleVolume, clampVolume,
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
