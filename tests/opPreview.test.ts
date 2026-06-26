// OPERATION-OUTCOME PREVIEWS (state/math — never pixels). The selectors PROJECT only what the sim already
// computes for the four player verbs, lead with the existing gate when blocked, keep the GLANCE card ≤4 rows,
// and obey NO-X-RAY: a fog-hidden rival reads 'visible only'/'Unknown', never a fabricated number.
import { describe, it, expect } from 'vitest';
import {
  previewAttackRival, previewExtortFront, previewRetakeFront, previewFederalAction,
} from '../src/sim/opPreview';
import { MAX_GLANCE_ROWS, VISIBLE_ONLY } from '../src/sim/opPreviewTypes';
import { spawnEnforcer, type MovableUnit } from '../src/sim/movement';
import { LOCKOUT_BUREAU_REQ, LOCKOUT_COST } from '../src/sim/constants';
import type { GameState, Family, Business, District } from '../src/sim/types';

// ── minimal pure fixtures (no Phaser, no scene) ──────────────────────────────────────────────────
function family(id: string, over: Partial<Family> = {}): Family {
  return {
    id, name: id, isPlayer: id === 'player', alive: true, color: 0, hq: { gx: 0, gy: 0 },
    cash: 0, dirtyCash: 0, heat: 0, gangsters: [], bribes: { feds: 0, judges: 0, politicians: 0, police: 0 },
    aggro: 0, fedWarningLevel: 0, fedImminentTicks: 0, bustArmed: false,
    ...over,
  } as Family;
}
function front(id: string, over: Partial<Business> = {}): Business {
  return { id, name: id, kind: 'front', baseIncome: 100, uncollected: 0, tile: { gx: 5, gy: 5 }, ...over } as Business;
}
function district(id: string, businesses: Business[], over: Partial<District> = {}): District {
  return { id, name: id, wealth: 1, control: {}, businesses, ...over } as District;
}
function baseState(over: Partial<GameState> = {}): GameState {
  return {
    tick: 0, rngState: 1, offenseCooldown: 0,
    player: family('player', { cash: 5000, bribes: { feds: 30, judges: 0, politicians: 0, police: 0 } }),
    rivals: [family('rival-a', { cash: 0 })],
    districts: [], units: [], log: [], extortionActs: [],
    ...over,
  } as unknown as GameState;
}
const thug = (id: string, faction: string, over: Partial<MovableUnit> = {}): MovableUnit =>
  ({ ...spawnEnforcer(id, 5, 5, faction), ...over });

describe('attack_rival — deterministic combat projection, NO-X-RAY on a fogged target', () => {
  it('a selected fighter vs a VISIBLE rival → exact hits-to-down + the reciprocal risk, ≤4 glance rows', () => {
    const st = baseState({ units: [thug('p1', 'player'), thug('r1', 'rival-a', { pos: { gx: 6, gy: 5 }, path: [] })] });
    const p = previewAttackRival(st, 'p1', 'r1', () => true);
    expect(p.blocked).toBe(false);
    expect(p.glance.length).toBeLessThanOrEqual(MAX_GLANCE_ROWS);
    expect(p.glance[0].value).toMatch(/down them in \d+ hit/);   // exact, deterministic
    expect(p.glance.some((r) => r.tone === 'risk')).toBe(true);  // they hit back
  });
  it('NO-X-RAY — a FOGGED rival reads "visible only", never a number', () => {
    const st = baseState({ units: [thug('p1', 'player'), thug('r1', 'rival-a', { pos: { gx: 30, gy: 30 }, path: [] })] });
    const p = previewAttackRival(st, 'p1', 'r1', () => false);   // target not visible
    expect(p.glance[0].value).toBe(VISIBLE_ONLY);
    expect(JSON.stringify(p)).not.toMatch(/down them in/);       // invented nothing
  });
  it('blocks when no fighter is selected or the target is not a rival fighter', () => {
    const st = baseState({ units: [thug('p1', 'player'), thug('p2', 'player', { pos: { gx: 6, gy: 5 }, path: [] })] });
    expect(previewAttackRival(st, 'nope', 'p2').blocked).toBe(true);
    expect(previewAttackRival(st, 'p1', 'p2').blocked).toBe(true); // p2 is the player's own
  });
});

describe('extort_front — reads the gate + the existing economy, never invents odds', () => {
  it('an un-taken VISIBLE front → result/reward/time/heat, all from the sim', () => {
    const f = front('f1');
    const st = baseState({ districts: [district('d1', [f])], units: [thug('p1', 'player')] });
    const p = previewExtortFront(st, 'p1', 'f1', { gx: 5, gy: 5 }, () => true);
    expect(p.blocked).toBe(false);
    expect(p.glance.length).toBeLessThanOrEqual(MAX_GLANCE_ROWS);
    expect(p.glance.some((r) => /\+\$30\/tick/.test(r.value))).toBe(true); // floor(100 * 0.3)
    expect(p.glance.some((r) => r.tone === 'risk' && /heat/.test(r.value))).toBe(true);
  });
  it('NO-X-RAY — a fogged front hides its income as "visible only"', () => {
    const f = front('f1');
    const st = baseState({ districts: [district('d1', [f])], units: [thug('p1', 'player')] });
    const p = previewExtortFront(st, 'p1', 'f1', { gx: 5, gy: 5 }, () => false);
    expect(p.glance.some((r) => r.value === VISIBLE_ONLY)).toBe(true);
  });
  it('a front that already pays is blocked with the existing gate reason', () => {
    const f = front('f1', { extortedBy: 'player' });
    const st = baseState({ districts: [district('d1', [f])], units: [thug('p1', 'player')] });
    expect(previewExtortFront(st, 'p1', 'f1', { gx: 5, gy: 5 }).blocked).toBe(true);
  });
});

describe('retake_front — surfaces the guard gate; flips ownership only when clear', () => {
  it('a rival-held front with the guard CLEARED → flip projection', () => {
    const f = front('f1', { extortedBy: 'rival-a' });
    const st = baseState({ districts: [district('d1', [f])], units: [thug('p1', 'player')] }); // no rival guard
    const p = previewRetakeFront(st, 'p1', 'f1', { gx: 5, gy: 5 }, () => true);
    expect(p.blocked).toBe(false);
    expect(p.glance[0].value).toMatch(/flips rival/);
  });
  it('a GUARDED rival-held front is blocked (clear the guard first)', () => {
    const f = front('f1', { extortedBy: 'rival-a' });
    const guard = thug('g1', 'rival-a', { pos: { gx: 5, gy: 5 }, path: [] });
    const st = baseState({ districts: [district('d1', [f])], units: [thug('p1', 'player'), guard] });
    expect(previewRetakeFront(st, 'p1', 'f1', { gx: 5, gy: 5 }).blocked).toBe(true);
  });
  it('a front that is not rival-held is blocked', () => {
    const f = front('f1'); // un-taken, not rival-held
    const st = baseState({ districts: [district('d1', [f])], units: [thug('p1', 'player')] });
    expect(previewRetakeFront(st, 'p1', 'f1', { gx: 5, gy: 5 }).blocked).toBe(true);
  });
});

describe('federal_heat_action — the Bureau lockout, deterministic, ladder context', () => {
  it('all gates pass → lockout projection, NO player heat, ladder shown in detail', () => {
    const st = baseState();
    const p = previewFederalAction(st, 'rival-a');
    expect(p.blocked).toBe(false);
    expect(p.glance.length).toBeLessThanOrEqual(MAX_GLANCE_ROWS);
    expect(p.glance.some((r) => /unchanged/.test(r.value) && r.tone === 'good')).toBe(true); // adds no heat
    expect(p.detail.some((r) => /exposure/.test(r.value))).toBe(true);                       // 50/70/85 ladder
  });
  it('blocks via the EXISTING gate when the Bureau investment or cash is short', () => {
    const poor = baseState({ player: family('player', { cash: LOCKOUT_COST - 1, bribes: { feds: LOCKOUT_BUREAU_REQ, judges: 0, politicians: 0, police: 0 } }) });
    expect(previewFederalAction(poor, 'rival-a').blocked).toBe(true);
    const noBureau = baseState({ player: family('player', { cash: 5000, bribes: { feds: LOCKOUT_BUREAU_REQ - 1, judges: 0, politicians: 0, police: 0 } }) });
    expect(previewFederalAction(noBureau, 'rival-a').blocked).toBe(true);
  });
});
