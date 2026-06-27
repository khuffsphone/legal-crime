// DEV-DEBUG INJECTORS (QA / UAT) — the guard + the three injectors, at the STATE level (no Phaser). The
// module must be INERT without its param OR outside a dev build; ?arm must equip a SELECTABLE player unit via
// the REAL spawn/equip path (a valid weapon tier, identical to spawnEnforcer); ?debug=win|lose must flip ONLY
// the resolved status and NEVER corrupt sim state (no HQ raze, no family kill, no cash/turf change).
import { describe, it, expect } from 'vitest';
import {
  parseDebugFlags, applyDevDebug, armPlayerUnits, equipAsEnforcer, forceEndgame,
  ARM_WEAPON, ARM_SKILL,
} from '../src/scenes/devDebug';
import { createInitialState } from '../src/sim/state';
import { spawnUnit, spawnCollector, spawnEnforcer } from '../src/sim/movement';
import type { GameState } from '../src/sim/types';

/** A fresh game with one plain player button-man + one player collector on the map. */
function withPlayerUnits(): GameState {
  const s = createInitialState(1, { bigCity: true });
  const thug = spawnUnit('thug-1', 2, 2);
  thug.factionId = s.player.id; // a selectable player thug (no weapon yet)
  s.units.push(thug);
  s.units.push(spawnCollector('col-1', 3, 3, s.player.id, 100)); // a collector — must stay autonomous
  return s;
}

describe('the GUARD — inert without a dev build OR without a param', () => {
  it('parseDebugFlags is all-false unless dev AND the param is present', () => {
    expect(parseDebugFlags('?arm', false)).toEqual({ arm: false, forceWin: false, forceLose: false }); // not dev
    expect(parseDebugFlags('', true)).toEqual({ arm: false, forceWin: false, forceLose: false }); // no param
    expect(parseDebugFlags('?arm', true).arm).toBe(true);
    expect(parseDebugFlags('?debug=win', true).forceWin).toBe(true);
    expect(parseDebugFlags('?debug=lose', true).forceLose).toBe(true);
    expect(parseDebugFlags('?debug=turf', true)).toEqual({ arm: false, forceWin: false, forceLose: false }); // unrelated flag
  });

  it('applyDevDebug is a pure no-op when not a dev build, or with no param', () => {
    const a = withPlayerUnits();
    const r1 = applyDevDebug(a, '?arm&debug=win', false); // production build → wholly inert
    expect(r1).toEqual({ active: false, armed: [], endgame: null });
    expect(a.units.find((u) => u.id === 'thug-1')!.weapon).toBeUndefined();
    expect(a.status).toBe('playing');

    const b = withPlayerUnits();
    const r2 = applyDevDebug(b, '', true); // dev, but no param
    expect(r2.active).toBe(false);
    expect(b.units.find((u) => u.id === 'thug-1')!.weapon).toBeUndefined();
    expect(b.status).toBe('playing');
  });
});

describe('?arm — equips each selectable player unit via the REAL spawn/equip path', () => {
  it('equipAsEnforcer stamps EXACTLY the fields spawnEnforcer would (never an invalid weapon)', () => {
    const u = spawnUnit('u', 5, 6);
    u.factionId = 'player';
    equipAsEnforcer(u, 'player', ARM_WEAPON, ARM_SKILL);
    const canonical = spawnEnforcer('u', 5, 6, 'player', u.speed, { weapon: ARM_WEAPON, skill: ARM_SKILL });
    expect(u.role).toBe(canonical.role); // 'enforcer'
    expect(u.weapon).toBe(canonical.weapon); // a valid WeaponTier
    expect(u.skill).toBe(canonical.skill);
  });

  it('?arm equips the player thug (proper enforcer) but leaves the collector autonomous', () => {
    const s = withPlayerUnits();
    const report = applyDevDebug(s, '?arm', true);
    expect(report.active).toBe(true);
    expect(report.armed).toContain('thug-1');
    expect(report.armed).not.toContain('col-1'); // collectors stay autonomous

    const thug = s.units.find((u) => u.id === 'thug-1')!;
    expect(thug.role).toBe('enforcer');
    expect(thug.weapon).toBe(ARM_WEAPON);
    expect(thug.skill).toBe(ARM_SKILL);
    // the collector is untouched (still a collector, no weapon)
    const col = s.units.find((u) => u.id === 'col-1')!;
    expect(col.role).toBe('collector');
    expect(col.weapon).toBeUndefined();
  });

  it('armPlayerUnits keeps id + position (a re-equip, not a re-spawn into a new slot)', () => {
    const s = withPlayerUnits();
    const before = s.units.find((u) => u.id === 'thug-1')!;
    const beforePos = { ...before.pos };
    armPlayerUnits(s);
    const after = s.units.find((u) => u.id === 'thug-1')!;
    expect(after.pos).toEqual(beforePos); // same tile
    expect(s.units.filter((u) => u.id === 'thug-1').length).toBe(1); // no duplicate
  });
});

describe('?debug=win|lose — flips ONLY the resolved result, never corrupts sim state', () => {
  it('?debug=win sets status won WITHOUT razing rivals / touching the player HQ or cash', () => {
    const s = withPlayerUnits();
    const rivalsAliveBefore = s.rivals.map((r) => r.alive);
    const hqBefore = s.player.hqIntegrity;
    const cashBefore = s.player.cash;

    const report = applyDevDebug(s, '?debug=win', true);
    expect(s.status).toBe('won');
    expect(report.endgame?.status).toBe('won');
    // NO corruption: rivals still alive, player HQ + cash untouched
    expect(s.rivals.map((r) => r.alive)).toEqual(rivalsAliveBefore);
    expect(s.rivals.every((r) => r.alive)).toBe(true);
    expect(s.player.hqIntegrity).toBe(hqBefore);
    expect(s.player.cash).toBe(cashBefore);
  });

  it('?debug=lose sets status lost (+ a valid lossReason) WITHOUT razing the player HQ', () => {
    const s = withPlayerUnits();
    const hqBefore = s.player.hqIntegrity;
    const report = applyDevDebug(s, '?debug=lose', true);
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('dead');
    expect(report.endgame?.status).toBe('lost');
    expect(s.player.hqIntegrity).toBe(hqBefore); // HQ NOT razed — only the result flipped
    expect(s.player.alive).not.toBe(false); // the family was not eliminated
  });

  it('forceEndgame alone flips status and returns a synthetic result', () => {
    const s = withPlayerUnits();
    expect(forceEndgame(s, 'win').kind).toBe('win-last-standing');
    expect(s.status).toBe('won');
    const s2 = withPlayerUnits();
    expect(forceEndgame(s2, 'lose').kind).toBe('lose-hq');
    expect(s2.status).toBe('lost');
  });
});
