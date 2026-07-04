// Citizen Life P0 — Rider R4 mutation-verified tests: the citizen marker palette is PED_COATS-family warm
// neutrals ONLY — never the cop blue-grey, never player brass, never rival/danger/cash colours. Mirrors the
// districtIdentity colour-law test. The bake itself lives in cityArt.ts (Phaser); the DATA is pure here.
import { describe, it, expect } from 'vitest';
import {
  CITIZEN_MARKER_TONES, FORBIDDEN_MARKER_COLOURS, citizenMarkerTone, citizenMarkerTexKey, roleIndex,
} from '../src/scenes/citizens/markers';
import { CITIZEN_ROLES } from '../src/scenes/citizens/roles';

// The four PED_COATS (cityArt.ts:507) — cityArt imports Phaser so it can't load in the node test env; these
// literals are the recon-verified values the marker family must be grounded in.
const PED_COATS_REF = [0x3a3733, 0x4a4036, 0x3a2c20, 0x5a5043];

describe('R4 — marker palette is warm-neutral, never cop blue-grey / brass / red', () => {
  it('one tone per role (13), all warm (red channel ≥ blue channel)', () => {
    expect(CITIZEN_MARKER_TONES.length).toBe(CITIZEN_ROLES.length);
    for (const tone of CITIZEN_MARKER_TONES) {
      const r = (tone >> 16) & 0xff, g = (tone >> 8) & 0xff, b = tone & 0xff;
      expect(r).toBeGreaterThanOrEqual(b);        // warm — never a cool blue-grey
      expect(g).toBeLessThanOrEqual(r);           // never green-dominant
    }
  });

  it('MUTATION: no marker tone is a forbidden colour (cop blue-grey / brass / blood / danger / cash)', () => {
    for (const tone of CITIZEN_MARKER_TONES) {
      expect(FORBIDDEN_MARKER_COLOURS).not.toContain(tone);
    }
  });

  it('the four PED_COATS anchor the family (the palette is grounded in the existing ped tones)', () => {
    for (const coat of PED_COATS_REF) expect(CITIZEN_MARKER_TONES).toContain(coat);
  });

  it('citizenMarkerTone maps each role to its slot tone; roleIndex is stable', () => {
    for (const role of CITIZEN_ROLES) {
      expect(citizenMarkerTone(role)).toBe(CITIZEN_MARKER_TONES[roleIndex(role)]);
    }
  });

  it('marker texture keys are stable and the lettered variant is distinct', () => {
    expect(citizenMarkerTexKey(0, false)).toBe('lcr_citizen_0');
    expect(citizenMarkerTexKey(0, true)).toBe('lcr_citizen_0_L');
    expect(citizenMarkerTexKey(5, false)).not.toBe(citizenMarkerTexKey(5, true));
  });
});
