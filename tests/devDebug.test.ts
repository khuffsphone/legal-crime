// DEV-DEBUG INJECTORS (QA / UAT) — the guard + the three injectors, at the STATE level (no Phaser). The
// module must be INERT without its param OR outside a dev build; ?arm must equip a SELECTABLE player unit via
// the REAL spawn/equip path (a valid weapon tier, identical to spawnEnforcer); ?debug=win|lose must flip ONLY
// the resolved status and NEVER corrupt sim state (no HQ raze, no family kill, no cash/turf change).
import { describe, it, expect } from 'vitest';
import {
  parseDebugFlags, parseArmWeapon, applyDevDebug, armPlayerUnits, armPlayerUnitsVaried, equipAsEnforcer, forceEndgame,
  hasDevFlags, parseScenario, applyScenario, DEV_FLAG_KEYS, SCENARIOS, SCENARIO_PULSES,
  ARM_WEAPON, ARM_SKILL, ARM_WEAPONS,
} from '../src/scenes/devDebug';
import { createInitialState } from '../src/sim/state';
import { spawnUnit, spawnCollector, spawnEnforcer } from '../src/sim/movement';
import { fedWarningTier, federalExposure } from '../src/sim/federal';
import { FED_WARN_TIER_2 } from '../src/sim/constants';
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

/** A fresh game with N plain player button-men (ids thug-1..thug-N) + one collector. */
function withManyPlayerThugs(n: number): GameState {
  const s = createInitialState(1, { bigCity: true });
  for (let i = 1; i <= n; i++) {
    const t = spawnUnit(`thug-${i}`, 2 + i, 2);
    t.factionId = s.player.id;
    s.units.push(t);
  }
  s.units.push(spawnCollector('col-1', 3, 3, s.player.id, 100));
  return s;
}

describe('the GUARD — inert without a dev build OR without a param', () => {
  const INERT = { arm: false, armWeapon: ARM_WEAPON, armAll: false, forceWin: false, forceLose: false };

  it('parseDebugFlags is all-false unless dev AND the param is present', () => {
    expect(parseDebugFlags('?arm', false)).toEqual(INERT); // not dev
    expect(parseDebugFlags('', true)).toEqual(INERT); // no param
    expect(parseDebugFlags('?arm', true).arm).toBe(true);
    expect(parseDebugFlags('?debug=win', true).forceWin).toBe(true);
    expect(parseDebugFlags('?debug=lose', true).forceLose).toBe(true);
    expect(parseDebugFlags('?debug=turf', true)).toEqual(INERT); // unrelated flag
  });

  it('applyDevDebug is a pure no-op when not a dev build, or with no param', () => {
    const a = withPlayerUnits();
    const r1 = applyDevDebug(a, '?arm&debug=win', false); // production build → wholly inert
    expect(r1).toEqual({ active: false, armed: [], endgame: null, dismissIntro: false });
    expect(a.units.find((u) => u.id === 'thug-1')!.weapon).toBeUndefined();
    expect(a.status).toBe('playing');

    const b = withPlayerUnits();
    const r2 = applyDevDebug(b, '', true); // dev, but no param
    expect(r2.active).toBe(false);
    expect(b.units.find((u) => u.id === 'thug-1')!.weapon).toBeUndefined();
    expect(b.status).toBe('playing');
  });
});

describe('?arm=<tier> — equips ANY valid weapon tier (default pistol) via the real path', () => {
  it('parseArmWeapon maps each tier, defaulting unknown / legacy / empty to pistol', () => {
    for (const t of ARM_WEAPONS) expect(parseArmWeapon(t)).toBe(t);
    expect(parseArmWeapon('HITMAN')).toBe('hitman'); // case-insensitive
    expect(parseArmWeapon('')).toBe(ARM_WEAPON); // bare ?arm
    expect(parseArmWeapon(null)).toBe(ARM_WEAPON); // param absent
    expect(parseArmWeapon('1')).toBe(ARM_WEAPON); // legacy ?arm=1
    expect(parseArmWeapon('bazooka')).toBe(ARM_WEAPON); // unknown → never an invalid weapon
  });

  it('parseDebugFlags carries the requested tier', () => {
    expect(parseDebugFlags('?arm=hitman', true).armWeapon).toBe('hitman');
    expect(parseDebugFlags('?arm=demolitions', true).armWeapon).toBe('demolitions');
    expect(parseDebugFlags('?arm', true).armWeapon).toBe(ARM_WEAPON); // bare ?arm → default
  });

  it('?arm=<tier> equips the player thug with THAT tier (via spawnEnforcer), not just pistol', () => {
    for (const tier of ARM_WEAPONS) {
      const s = withPlayerUnits();
      const report = applyDevDebug(s, `?arm=${tier}`, true);
      expect(report.armed).toContain('thug-1');
      const thug = s.units.find((u) => u.id === 'thug-1')!;
      expect(thug.role).toBe('enforcer');
      expect(thug.weapon).toBe(tier);
      expect(thug.skill).toBe(ARM_SKILL);
    }
  });

  it('?arm does not dismiss the intro overlay (only win/lose do)', () => {
    expect(applyDevDebug(withPlayerUnits(), '?arm=hitman', true).dismissIntro).toBe(false);
  });

  it('?arm (bare) and ?arm=bogus fall back to the default pistol', () => {
    const a = withPlayerUnits();
    applyDevDebug(a, '?arm', true);
    expect(a.units.find((u) => u.id === 'thug-1')!.weapon).toBe(ARM_WEAPON);
    const b = withPlayerUnits();
    applyDevDebug(b, '?arm=bogus', true);
    expect(b.units.find((u) => u.id === 'thug-1')!.weapon).toBe(ARM_WEAPON);
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
    expect(report.dismissIntro).toBe(true); // the scene dismisses the intro overlay so the readout shows
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
    expect(report.dismissIntro).toBe(true);
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

describe('hasDevFlags — the menu-bypass guard (Task 1)', () => {
  it('is false without a dev build, or with no recognised dev flag', () => {
    expect(hasDevFlags('?debug=win', false)).toBe(false); // not dev
    expect(hasDevFlags('', true)).toBe(false); // no query
    expect(hasDevFlags('?reveal=1', true)).toBe(false); // inspection flag, NOT a bypass flag
    expect(hasDevFlags('?art=rich&life=high&market=on', true)).toBe(false); // none are bypass flags
  });

  it('is true for any dev/QA deep-link under a dev build', () => {
    expect(hasDevFlags('?debug=win', true)).toBe(true);
    expect(hasDevFlags('?debug=turf', true)).toBe(true);
    expect(hasDevFlags('?arm', true)).toBe(true);
    expect(hasDevFlags('?arm=hitman', true)).toBe(true);
    expect(hasDevFlags('?scenario=fed-watch', true)).toBe(true);
    expect(hasDevFlags('?skipmenu', true)).toBe(true);
    expect(hasDevFlags('?reveal=1&arm=all', true)).toBe(true); // a bypass flag alongside an inspection flag
  });

  it('the bypass key set matches CANON (debug/arm/scenario/skipmenu)', () => {
    expect([...DEV_FLAG_KEYS].sort()).toEqual(['arm', 'debug', 'scenario', 'skipmenu']);
  });
});

describe('?arm=all — round-robins EVERY weapon tier across the selectable units (Task 2)', () => {
  it('parseDebugFlags marks armAll only for ?arm=all (and arm stays true)', () => {
    expect(parseDebugFlags('?arm=all', true).armAll).toBe(true);
    expect(parseDebugFlags('?arm=all', true).arm).toBe(true);
    expect(parseDebugFlags('?arm=hitman', true).armAll).toBe(false);
    expect(parseDebugFlags('?arm', true).armAll).toBe(false);
    expect(parseDebugFlags('?arm=ALL', true).armAll).toBe(true); // case-insensitive
  });

  it('armPlayerUnitsVaried assigns each selectable unit the next tier in the canon cycle', () => {
    const s = withManyPlayerThugs(5);
    const armed = armPlayerUnitsVaried(s);
    armed.forEach((id, i) => {
      const u = s.units.find((x) => x.id === id)!;
      expect(u.role).toBe('enforcer');
      expect(u.weapon).toBe(ARM_WEAPONS[i % ARM_WEAPONS.length]); // round-robin, in unit order
      expect(u.skill).toBe(ARM_SKILL);
    });
    // with ≥5 selectable units, EVERY tier appears at least once
    const tiers = new Set(armed.map((id) => s.units.find((x) => x.id === id)!.weapon));
    for (const t of ARM_WEAPONS) expect(tiers.has(t)).toBe(true);
  });

  it('applyDevDebug(?arm=all) arms varied tiers via the real path and leaves the collector autonomous', () => {
    const s = withManyPlayerThugs(5);
    const report = applyDevDebug(s, '?arm=all', true);
    expect(report.active).toBe(true);
    expect(report.armed).not.toContain('col-1');
    expect(report.armed.length).toBeGreaterThanOrEqual(5);
    const distinct = new Set(report.armed.map((id) => s.units.find((x) => x.id === id)!.weapon));
    expect(distinct.size).toBeGreaterThanOrEqual(2); // genuinely varied, not all-pistol
    const col = s.units.find((u) => u.id === 'col-1')!;
    expect(col.role).toBe('collector');
    expect(col.weapon).toBeUndefined();
  });
});

describe('?scenario= — deterministic QA boards, NO-X-RAY (Task 3)', () => {
  it('parseScenario gates on dev + a known value (case-insensitive); else null', () => {
    expect(parseScenario('?scenario=fed-watch', false)).toBeNull(); // not dev
    expect(parseScenario('', true)).toBeNull(); // no query
    expect(parseScenario('?scenario=bogus', true)).toBeNull(); // unknown
    for (const sc of SCENARIOS) expect(parseScenario(`?scenario=${sc}`, true)).toBe(sc);
    expect(parseScenario('?scenario=FED-WATCH', true)).toBe('fed-watch');
  });

  it('fed-watch raises player heat to the WATCH rung (FED_WARN_TIER_2) and nothing else', () => {
    const s = withPlayerUnits();
    const cashBefore = s.player.cash;
    const report = applyScenario(s, 'fed-watch');
    expect(report.scenario).toBe('fed-watch');
    expect(report.pulsed).toBe(false);
    expect(s.player.heat).toBeGreaterThanOrEqual(FED_WARN_TIER_2);
    expect(fedWarningTier(federalExposure(s.player))).toBeGreaterThanOrEqual(2); // WATCH (or above)
    expect(s.player.cash).toBe(cashBefore); // no economy change
    expect(s.status).toBe('playing'); // no endgame flip
  });

  it('rival-contest fast-forwards the strategic clock without crashing or eliminating the player', () => {
    const s = withPlayerUnits();
    const report = applyScenario(s, 'rival-contest');
    expect(report.scenario).toBe('rival-contest');
    expect(report.pulsed).toBe(true); // the scene re-harvests incidents after this
    expect(s.player.alive).not.toBe(false); // the player is not pre-killed by the seed
    expect(SCENARIO_PULSES).toBeGreaterThan(0);
  });

  it('save-roundtrip is a pure marker — no state mutation', () => {
    const s = withPlayerUnits();
    const heatBefore = s.player.heat, cashBefore = s.player.cash;
    const report = applyScenario(s, 'save-roundtrip');
    expect(report.scenario).toBe('save-roundtrip');
    expect(report.pulsed).toBe(false);
    expect(report.note).not.toBe('');
    expect(s.player.heat).toBe(heatBefore);
    expect(s.player.cash).toBe(cashBefore);
  });

  it('applyScenario(null) is wholly inert', () => {
    const s = withPlayerUnits();
    const report = applyScenario(s, null);
    expect(report).toEqual({ scenario: null, pulsed: false, note: '' });
    expect(s.status).toBe('playing');
  });
});
