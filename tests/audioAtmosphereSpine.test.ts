// Ticket A — the audio metadata spine. Guards that EVERY MVP cue key carries complete, valid metadata
// (category / priority 1–5 / spatial class), that the district bed keys cover every canonical district
// archetype, and that the opt-in flags default OFF. Pure data; no Phaser, no playback.
import { describe, it, expect } from 'vitest';
import {
  AUDIO_EVENT_CATEGORIES, AMBIENT_BED_BASE, CUE_META, DISTRICT_BED_KEYS, MVP_CUE_KEYS,
  cueMeta, isMvpCueKey, type SpatialClass,
} from '../src/scenes/audio/atmosphereSpine';
import {
  atmosphereAudioRequested, ambienceRequested, sfxCuesRequested, debugAudioRequested,
} from '../src/scenes/audio/audioFlags';
import { WEAPON_HIT_SFX } from '../src/scenes/weaponFeedback';
import { districtIdentityFor } from '../src/scenes/art/districtIdentity';

const SPATIALS: readonly SpatialClass[] = ['local', 'global', 'hud'];

describe('audio atmosphere spine — Ticket A metadata completeness', () => {
  it('every MVP cue key has a complete category / priority(1–5) / spatial class', () => {
    expect(MVP_CUE_KEYS.length).toBeGreaterThan(0);
    for (const key of MVP_CUE_KEYS) {
      const meta = CUE_META[key];
      expect(AUDIO_EVENT_CATEGORIES, `${key} category`).toContain(meta.category);
      expect(Number.isInteger(meta.priority), `${key} priority int`).toBe(true);
      expect(meta.priority, `${key} priority ≥1`).toBeGreaterThanOrEqual(1);
      expect(meta.priority, `${key} priority ≤5`).toBeLessThanOrEqual(5);
      expect(SPATIALS, `${key} spatial`).toContain(meta.spatial);
    }
  });

  it('covers the shipped per-weapon hit-SFX contract keys, all LOCAL (positional)', () => {
    for (const key of Object.values(WEAPON_HIT_SFX)) {
      expect(isMvpCueKey(key), `${key} in MVP vocabulary`).toBe(true);
      expect(cueMeta(key)?.spatial, `${key} is local`).toBe('local');
    }
    expect(cueMeta('sfx_down_thud')?.spatial).toBe('local'); // the downed thud is tile-tied too
  });

  it('every LOCAL cue is combat (world-positional texture); global/hud carry no tile by design', () => {
    for (const key of MVP_CUE_KEYS) {
      if (CUE_META[key].spatial === 'local') expect(CUE_META[key].category, key).toBe('combat');
    }
  });

  it('the critical alarms are priority 1 (never load-shed)', () => {
    for (const key of ['sting_win', 'sting_lose', 'federal_raid', 'mutiny', 'siren'] as const) {
      expect(CUE_META[key].priority, key).toBe(1);
    }
  });

  it('district bed keys cover ALL canonical district archetypes with unique ambience_* keys', () => {
    // rebuild the canonical archetype set from districtIdentity (it wraps mod 9)
    const archetypes = new Set(Array.from({ length: 9 }, (_, i) => districtIdentityFor(i).archetype));
    expect(Object.keys(DISTRICT_BED_KEYS).sort()).toEqual([...archetypes].sort());
    const keys = Object.values(DISTRICT_BED_KEYS);
    expect(new Set(keys).size).toBe(keys.length); // no shared bed
    for (const k of keys) expect(k).toMatch(/^ambience_[a-z]+$/); // shipped naming convention
    expect(keys).not.toContain(AMBIENT_BED_BASE); // district beds never collide with the base city bed
  });

  it('cueMeta / isMvpCueKey are safe on unknown keys', () => {
    expect(cueMeta('sfx_nonexistent')).toBeUndefined();
    expect(isMvpCueKey('sfx_nonexistent')).toBe(false);
    expect(isMvpCueKey('extort')).toBe(true);
  });
});

describe('audio atmosphere flags — OFF by default', () => {
  it('all four flags default OFF (absent / empty / malformed)', () => {
    for (const fn of [atmosphereAudioRequested, ambienceRequested, sfxCuesRequested, debugAudioRequested]) {
      expect(fn('')).toBe(false);
      expect(fn('?other=1')).toBe(false);
      expect(fn('%%%')).toBe(false);
    }
  });

  it('each flag opts in on its own name and respects falsy values', () => {
    expect(atmosphereAudioRequested('?audio')).toBe(true);
    expect(atmosphereAudioRequested('?audio=0')).toBe(false);
    expect(ambienceRequested('?ambience=1')).toBe(true);
    expect(ambienceRequested('?ambience=off')).toBe(false);
    expect(sfxCuesRequested('?sfx=yes')).toBe(true);
    expect(sfxCuesRequested('?sfx=false')).toBe(false);
    expect(debugAudioRequested('?debugaudio')).toBe(true);
    expect(debugAudioRequested('?audio&ambience&sfx')).toBe(false); // debug needs its OWN flag
  });
});
