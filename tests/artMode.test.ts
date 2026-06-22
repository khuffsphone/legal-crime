// RTS-26 — the art-mode flag parser (pure helper extracted for the procedural-art elevation pass).
import { describe, it, expect } from 'vitest';
import { parseArtMode } from '../src/scenes/artMode';

describe('parseArtMode — the procedural-art feature flag', () => {
  it('defaults to rich when no flag is present', () => {
    expect(parseArtMode('')).toBe('rich');
    expect(parseArtMode('?debug=turf')).toBe('rich');
  });

  it('selects rich explicitly', () => {
    expect(parseArtMode('?art=rich')).toBe('rich');
    expect(parseArtMode('?art=RICH')).toBe('rich'); // case-insensitive
  });

  it('selects the lean (pre-rts26) path on the recognised opt-outs', () => {
    for (const v of ['lean', 'basic', 'off', '0', 'false', 'LEAN']) {
      expect(parseArtMode(`?art=${v}`)).toBe('lean');
    }
  });

  it('an unknown value falls back to rich (fail-safe to the shipped art)', () => {
    expect(parseArtMode('?art=banana')).toBe('rich');
  });

  it('reads the flag among other query params', () => {
    expect(parseArtMode('?debug=all&art=lean&pulses=3')).toBe('lean');
    expect(parseArtMode('?art=rich&debug=win')).toBe('rich');
  });
});
