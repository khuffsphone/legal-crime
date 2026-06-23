// RTS-30d-4 — pure tests for the ACTION REQUIREMENT INSPECTOR: it must turn the EXISTING gates into a
// plain-English requirement breakdown (met/missing/risk rows) and a READY/CONDITIONAL/LOCKED verdict,
// inventing no new sim state. These pin the verdict logic, the row categories, the channel/federal copy
// rules, and the multi-select common-verb reflection.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  buildActionInspector,
  multiSelectInspectors,
  rowSymbol,
  type ActionRequirementInspector,
} from '../src/sim/actionInspector';
import { commonVerbs } from '../src/sim/actionCard';
import type { GameState } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { startingCrew: true, bigCity: true }); }
const rowFor = (insp: ActionRequirementInspector, cat: string) => insp.rows.find((r) => r.category === cat);

describe('RTS-30d-4 — action requirement inspector', () => {
  it('a RAID with no home block reads LOCKED, with a structural district row missing (not just cash)', () => {
    const s = big();
    const insp = buildActionInspector(s, 'raid');
    expect(insp.actionId).toBe('raid');
    expect(insp.title).toBe('RAID');
    // at the start the player holds no block → a structural requirement is missing → LOCKED (not CONDITIONAL).
    expect(insp.state).toBe('locked');
    const district = rowFor(insp, 'district');
    expect(district?.state).toBe('missing');
    expect(insp.nextStep).toBeTruthy();
  });

  it('an action blocked ONLY by cash/cooldown is CONDITIONAL, not LOCKED', () => {
    const s = big();
    s.player.cash = 0; // recruit needs cash and nothing structural
    const insp = buildActionInspector(s, 'recruit');
    expect(insp.state).toBe('conditional');
    expect(rowFor(insp, 'cash')?.state).toBe('missing');
    // make it affordable → READY, no nextStep
    s.player.cash = 100_000;
    const ready = buildActionInspector(s, 'recruit');
    expect(ready.state).toBe('ready');
    expect(ready.nextStep).toBeUndefined();
  });

  it('every requirement is shown independently — RAID lists cooldown, district, target, unit, cash rows', () => {
    const s = big();
    const cats = buildActionInspector(s, 'raid').rows.map((r) => r.category);
    for (const c of ['cooldown', 'district', 'target', 'unit', 'cash']) expect(cats).toContain(c);
    // each row carries a current/required read or a label — never an empty row.
    for (const r of buildActionInspector(s, 'raid').rows) expect(r.label.length).toBeGreaterThan(0);
  });

  it('the federal RISK row references ONLY the 50/70/85 ladder and never blocks the action', () => {
    const s = big();
    s.player.cash = 100_000;
    s.player.heat = 45;
    const insp = buildActionInspector(s, 'assassinate');
    const fed = rowFor(insp, 'federal');
    expect(fed?.state).toBe('risk'); // a risk, not a blocker
    // its threshold copy may name only 50 / 70 / 85.
    const txt = `${fed?.detail ?? ''} ${fed?.required ?? ''}`;
    const nums = txt.match(/\d+/g)?.filter((n) => !['100'].includes(n)) ?? [];
    for (const n of nums) expect(['50', '70', '85']).toContain(n);
    // a risk row must NEVER be the reason an action is locked.
    const onlyRisk = buildActionInspector({ ...s } as GameState, 'assassinate');
    expect(insp.riskSummary).toBeTruthy();
    expect(onlyRisk.rows.filter((r) => r.state === 'missing').every((r) => r.category !== 'federal')).toBe(true);
  });

  it('LOCKOUT names The Bureau channel (canon channel naming) in a channel-category row', () => {
    const s = big();
    s.player.cash = 100_000;
    s.player.bribes.feds = 0; // not greased
    const insp = buildActionInspector(s, 'lockout');
    expect(insp.title).toBe('LOCKOUT');
    expect(rowFor(insp, 'channel')?.label).toMatch(/The Bureau/);
    expect(rowFor(insp, 'channel')?.state).toBe('missing'); // feds = 0
    // and DEMOLISH/SABOTAGE/RAID never reference a channel that isn't one of the canon four.
    const channelText = buildActionInspector(s, 'raid').rows.map((r) => `${r.label} ${r.detail ?? ''}`).join(' ');
    expect(/Police|Judges|Politicians|Feds\b/.test(channelText)).toBe(false);
  });

  it('multi-select inspectors resolve one card per COMMON verb, and rowSymbol pairs a glyph with text', () => {
    const s = big();
    const common = commonVerbs([{ extortTarget: false, attackTarget: false, weapon: 'shotgun' }, { extortTarget: false, attackTarget: false }]);
    const insps = multiSelectInspectors(s, common);
    expect(insps.length).toBe(common.length);
    expect(insps.map((i) => i.actionId)).toEqual(common);
    expect(rowSymbol('met')).toBe('✓');
    expect(rowSymbol('missing')).toBe('✗');
    expect(rowSymbol('risk')).toBe('!');
  });
});
