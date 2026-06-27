// SAVE / LOAD — the VIEW layer (fog) round-trip + NO-X-RAY. Lane F adds an optional `view` to a save so
// visibility restores EXACTLY as saved: explored ground stays explored, and a rival that was hidden when you
// saved stays hidden on load (the fog isn't recomputed from current positions). Pure — exercises the save core
// + the fog helpers, no Phaser.
import { describe, it, expect } from 'vitest';
import { serializeGame, serializeToString, deserializeGame } from '../src/sim/saveLoad';
import { createInitialState } from '../src/sim/state';
import { createFog, revealAround, isRevealed } from '../src/sim/fog';
import { spawnEnforcer } from '../src/sim/movement';

describe('save view — fog persists so visibility restores exactly as saved', () => {
  it('round-trips the fog set exactly', () => {
    const s = createInitialState(1, { bigCity: true });
    const fog = createFog();
    revealAround(fog, 5, 5, 3, 96, 96);
    const r = deserializeGame(serializeToString(s, { label: 't', savedAt: 0 }, { fog: [...fog] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(new Set(r.file.view?.fog ?? [])).toEqual(fog); // byte-for-byte the saved fog
  });

  it('an older save with NO view still loads (the scene recomputes fog) — backward compatible', () => {
    const r = deserializeGame(serializeToString(createInitialState(1))); // no view passed
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.view).toBeUndefined();
  });

  it('serializeGame omits the view unless fog is supplied (older callers/saves byte-identical)', () => {
    const s = createInitialState(1);
    expect(serializeGame(s).view).toBeUndefined();
    expect(serializeGame(s, undefined, { fog: ['1,1', '2,2'] }).view).toEqual({ fog: ['1,1', '2,2'] });
  });
});

describe('NO-X-RAY — a hidden rival saved + loaded STAYS hidden', () => {
  it('the rival survives the round-trip at its tile, but the restored fog never reveals it', () => {
    const s = createInitialState(1, { bigCity: true });
    const rivalTile = { gx: 80, gy: 80 };
    s.units = [spawnEnforcer('r', rivalTile.gx, rivalTile.gy, s.rivals[0].id)];
    // fog reveals only the player's corner — the rival's tile is NOT revealed (hidden) at save time.
    const fog = createFog();
    revealAround(fog, 5, 5, 4, 96, 96);
    expect(isRevealed(fog, rivalTile.gx, rivalTile.gy)).toBe(false);

    const r = deserializeGame(serializeToString(s, { savedAt: 0 }, { fog: [...fog] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // the rival round-trips at its exact tile (the save holds true full state — fine, it's on disk)…
    const rival = r.state.units.find((u) => u.id === 'r')!;
    expect(rival.pos).toEqual(rivalTile);
    // …and the RESTORED fog still does not reveal that tile → the rival stays hidden on load (NO-X-RAY).
    const restoredFog = new Set(r.file.view?.fog ?? []);
    expect(isRevealed(restoredFog, rivalTile.gx, rivalTile.gy)).toBe(false);
    // the view layer never leaks the hidden rival's tile.
    expect(JSON.stringify(r.file.view)).not.toContain('80,80');
  });
});
