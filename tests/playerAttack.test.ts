// TOP-PRIORITY BUG — the player could not attack rival units. The whole 35a/35c combat arc was UNREACHABLE
// in real play: spawnUnit() makes player muscle with NO factionId, and the 35a combat only fights
// isCombatant() units (which REQUIRES a factionId) — so resolveProximityCombat never engaged a player unit.
// The thug walked up to the rival and nothing happened. The router + AI-initiated-combat tests passed
// because their units hardcode factionId — this exercises the PLAYER-INITIATED path end-to-end (the gap).
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { spawnUnit, spawnEnforcer, unitTile, type MovableUnit } from '../src/sim/movement';
import { resolveMoveCommand } from '../src/sim/selection';
import { resolveProximityCombat, isCombatant, unitHealth } from '../src/sim/combat';
import { update } from '../src/sim/realtime';
import { THUG_MAX_HEALTH } from '../src/sim/constants';
import type { NavGrid } from '../src/sim/pathfinding';

const OPEN: NavGrid = { cols: 40, rows: 40, isBlocked: () => false };

describe('the root cause — a player thug needs a factionId to be a combatant', () => {
  it('REGRESSION: a raw spawnUnit() player thug has NO factionId and is NOT a combatant (the dead-combat bug)', () => {
    const t = spawnUnit('p', 5, 5);
    expect(t.factionId).toBeUndefined();   // the scene used to leave it like this
    expect(isCombatant(t)).toBe(false);    // → resolveProximityCombat skipped it entirely
  });

  it('THE FIX: stamping the player faction (what addUnit now does) makes it a combatant that DAMAGES a rival', () => {
    const s = createInitialState(1, { bigCity: true });
    const thug = spawnUnit('p', 5, 5); thug.factionId = s.player.id; // ⭐ the addUnit fix
    const rival = spawnEnforcer('r', 6, 5, 'rival-a');               // adjacent (within COMBAT_ENGAGE_RANGE)
    s.units = [thug, rival];
    expect(isCombatant(thug)).toBe(true);
    const before = unitHealth(rival);
    const events = resolveProximityCombat(s, 1.0);
    expect(unitHealth(rival)).toBeLessThan(before);                 // the rival actually took damage
    expect(events.some((e) => e.attackerId === 'p')).toBe(true);    // the PLAYER thug landed the blow
  });
});

describe('the PLAYER-INITIATED attack, end-to-end (select a thug → attack a rival → engage → damage)', () => {
  it('a move-to-engage is created toward the rival AND, stepping the sim, the rival takes combat damage', () => {
    const s = createInitialState(1, { bigCity: true });
    const thug: MovableUnit = { ...spawnUnit('p', 2, 2), factionId: s.player.id }; // a stamped player thug
    const rival = spawnEnforcer('r', 8, 2, 'rival-a');                              // stationary rival
    s.units = [thug, rival];

    // the attack command's move-to-engage: order the SELECTED thug onto the rival's tile (35b.1 actor).
    const dest = unitTile(rival);
    const res = resolveMoveCommand(s.units, ['p'], dest, OPEN);
    expect(res.moved).toEqual(['p']);                 // the selected thug is the actor…
    expect(thug.path.length).toBeGreaterThan(0);      // …and a move-to-engage was created…
    expect(thug.path[thug.path.length - 1]).toEqual(dest); // …pathing onto the rival.

    // step the real-time world: the thug closes, then the 35a proximity combat trades blows on contact.
    const startHealth = unitHealth(rival);
    let playerLandedABlow = false, rivalDamaged = false;
    for (let i = 0; i < 400; i++) {
      const r = update(s, 0.1, 1e9);                  // big weekDuration → no settlement noise
      if (r.combat.some((e) => e.attackerId === 'p')) playerLandedABlow = true;
      const rv = s.units.find((u) => u.id === 'r');
      if (!rv || unitHealth(rv) < startHealth) rivalDamaged = true;
      if (!rv) break;                                 // rival downed + removed → the kill landed
    }
    expect(playerLandedABlow).toBe(true);             // the player-initiated attack actually engaged…
    expect(rivalDamaged).toBe(true);                  // …and damaged (or downed) the rival.
    expect(startHealth).toBe(THUG_MAX_HEALTH);        // sanity: it started at full
  });
});
