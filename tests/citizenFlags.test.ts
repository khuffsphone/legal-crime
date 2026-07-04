// Citizen Life P0 — flag-parse tests (Rider R2/R4 + spec §11.2/§11.5). ?citizens is OFF by default (absent →
// current ambient behaviour, byte-identical); debug occupation letters require ?citizens=1 AND the named
// subflag ?citizenletters=1 (letters are debug-only, never production UI).
import { describe, it, expect } from 'vitest';
import { parseCitizensEnabled, parseCitizenLetters } from '../src/scenes/citizens/flags';

describe('?citizens — default OFF (spec §11.2)', () => {
  it('is off with no query string and off for unrelated flags', () => {
    expect(parseCitizensEnabled('')).toBe(false);
    expect(parseCitizensEnabled('?life=high')).toBe(false);
    expect(parseCitizensEnabled('?citizens=0')).toBe(false);
    expect(parseCitizensEnabled('?citizens=off')).toBe(false);
  });

  it('is on for ?citizens=1 / on / true (and composes with other flags)', () => {
    expect(parseCitizensEnabled('?citizens=1')).toBe(true);
    expect(parseCitizensEnabled('?citizens=on')).toBe(true);
    expect(parseCitizensEnabled('?citizens=true')).toBe(true);
    expect(parseCitizensEnabled('?life=med&citizens=1')).toBe(true);
  });

  it('tolerates a malformed search string without throwing', () => {
    expect(parseCitizensEnabled('%%%not-a-query')).toBe(false);
  });
});

describe('?citizenletters — debug subflag requires BOTH gates (Rider R4)', () => {
  it('letters are off unless ?citizens=1 AND ?citizenletters=1 are both present', () => {
    expect(parseCitizenLetters('?citizenletters=1')).toBe(false);            // citizens missing
    expect(parseCitizenLetters('?citizens=1')).toBe(false);                  // subflag missing
    expect(parseCitizenLetters('?citizens=1&citizenletters=1')).toBe(true);  // both
    expect(parseCitizenLetters('')).toBe(false);
  });
});
