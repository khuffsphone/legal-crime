// PLAYER SPINE — Ticket 1. The cosmetic dossier fields (Family.bossTitle? / Family.outfit?) are additive &
// default-safe: an old save lacks them (undefined) and must render the fallbacks. Pure read, no mutation,
// no mechanical effect.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { playerDossier } from '../src/scenes/ui/playerDossier';

const SEED = 12345;

describe('player dossier — cosmetic identity with safe fallbacks', () => {
  it('an old save (fields absent/undefined) falls back to Boss + The Outfit', () => {
    const s = createInitialState(SEED);
    expect(s.player.bossTitle).toBeUndefined();
    expect(s.player.outfit).toBeUndefined();
    const d = playerDossier(s);
    expect(d.bossTitle).toBe('Boss');
    expect(d.outfit).toBe('The Outfit');
  });

  it('surfaces the chosen title/outfit when set', () => {
    const s = createInitialState(SEED);
    s.player.bossTitle = 'Don';
    s.player.outfit = 'The Northside Ring';
    const d = playerDossier(s);
    expect(d.bossTitle).toBe('Don');
    expect(d.outfit).toBe('The Northside Ring');
  });

  it('a blank / whitespace-only field falls back (never renders empty)', () => {
    const s = createInitialState(SEED);
    s.player.bossTitle = '   ';
    s.player.outfit = '';
    const d = playerDossier(s);
    expect(d.bossTitle).toBe('Boss');
    expect(d.outfit).toBe('The Outfit');
  });

  it('is a pure read — never mutates the player', () => {
    const s = createInitialState(SEED);
    const before = JSON.stringify(s.player);
    playerDossier(s);
    expect(JSON.stringify(s.player)).toBe(before);
  });
});
