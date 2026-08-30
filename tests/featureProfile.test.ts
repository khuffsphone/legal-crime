import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveFeatureProfile } from '../src/scenes/featureProfile';

describe('FP-01 runtime feature profile', () => {
  it('makes the integrated showcase the normal launch', () => {
    expect(resolveFeatureProfile('')).toEqual({
      name: 'showcase',
      sprites: true,
      props: true,
      cops: false,
      combatControls: true,
      atmosphereAudio: false,
      facadeKit: true,
      facadeOverlays: true,
      citizens: true,
    });
  });

  it('keeps a complete legacy rollback valve', () => {
    expect(resolveFeatureProfile('?profile=legacy')).toEqual({
      name: 'legacy',
      sprites: false,
      props: false,
      cops: false,
      combatControls: false,
      atmosphereAudio: false,
      facadeKit: false,
      facadeOverlays: false,
      citizens: false,
    });
  });

  it('allows precise per-layer rollback and opt-in overrides', () => {
    const showcase = resolveFeatureProfile('?sprites=off&audio=1&citizens=false&facadeoverlays=off');
    expect(showcase).toMatchObject({ name: 'showcase', sprites: false, atmosphereAudio: true, citizens: false, props: true, facadeOverlays: false });

    const legacy = resolveFeatureProfile('?profile=legacy&sprites=1&combat=on&cops=true');
    expect(legacy).toMatchObject({ name: 'legacy', sprites: true, combatControls: true, cops: true, props: false });
  });

  it('is total over malformed input and unknown profiles', () => {
    expect(() => resolveFeatureProfile('%%%')).not.toThrow();
    expect(resolveFeatureProfile('?profile=unknown').name).toBe('showcase');
  });

  it('passes the police profile gate into realtime so disabled saved patrols stay frozen', () => {
    const scene = readFileSync('src/scenes/IsoScene.ts', 'utf8');
    expect(scene).toMatch(/this\.combatControlsEnabled \? this\.combatCtx\(\) : undefined,\s+this\.copsEnabled,/);
    expect(scene).not.toContain('this.state.beatCops = []');
  });
});
