// RTS-23 (HUD_SPEC) — pure HUD text/state helpers: the named federal ladder, the channel brackets,
// the action-verb chip states, and the Wire alert categories. Pure & Phaser-free.

import { describe, it, expect } from 'vitest';
import {
  federalTierLabel, FEDERAL_LADDER, bribeBracket, BRIBE_PIPS,
  verbChipState, alertCategory, incidentNeedsYou,
} from '../src/sim/hudText';
import { FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3 } from '../src/sim/constants';

describe('§1D — the named federal ladder', () => {
  it('names the tiers CLEAR / NOTICE / WATCH / RAID', () => {
    expect(federalTierLabel(0)).toBe('CLEAR');
    expect(federalTierLabel(1)).toBe('NOTICE');
    expect(federalTierLabel(2)).toBe('WATCH');
    expect(federalTierLabel(3)).toBe('RAID');
  });
  it('the engraved ticks match the 50/70/85 ladder constants', () => {
    expect(FEDERAL_LADDER.map((t) => t.at)).toEqual([FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3]);
    expect(FEDERAL_LADDER.map((t) => t.label)).toEqual(['NOTICE', 'WATCH', 'RAID']);
  });
});

describe('§2 — the channel brackets (NONE → … → IRON GRIP)', () => {
  it('names a level and points at the next bracket + its cost', () => {
    expect(bribeBracket(0).name).toBe('NONE');
    expect(bribeBracket(0).nextName).toBe('GREASED');
    expect(bribeBracket(0).nextAt).toBe(1);
    expect(bribeBracket(10).name).toBe('GREASED');
    expect(bribeBracket(20).name).toBe('ON THE TAKE');
    expect(bribeBracket(40).name).toBe('IN POCKET');
    const top = bribeBracket(60);
    expect(top.name).toBe('IRON GRIP');
    expect(top.nextName).toBeNull(); // the top of the ladder
    expect(top.nextAt).toBeNull();
  });
  it('the dial fills more pips as the bracket climbs (0..BRIBE_PIPS)', () => {
    expect(bribeBracket(0).pips).toBe(0);
    expect(bribeBracket(60).pips).toBe(BRIBE_PIPS - 1);
    expect(bribeBracket(20).pips).toBeGreaterThan(bribeBracket(2).pips);
  });
});

describe('§3C — action-verb chip states', () => {
  it('READY when ok; CONDITIONAL when only cash/cooldown away; LOCKED for a structural gate', () => {
    expect(verbChipState(true, 'ready')).toBe('READY');
    expect(verbChipState(false, 'need $500')).toBe('CONDITIONAL');
    expect(verbChipState(false, 'crew regrouping (8s)')).toBe('CONDITIONAL');
    expect(verbChipState(false, 'need 12 muscle')).toBe('LOCKED');
    expect(verbChipState(false, 'secure a home block first')).toBe('LOCKED');
    expect(verbChipState(false, 'need The Bureau ≥ 20')).toBe('LOCKED');
  });
});

describe('§4 — the Wire alert categories + needs-you', () => {
  it('buckets incident types into category + a palette dot colour', () => {
    expect(alertCategory('deposit').category).toBe('money');
    expect(alertCategory('robbery').category).toBe('threat');
    expect(alertCategory('federal_warning').category).toBe('law');
    expect(alertCategory('territory').category).toBe('turf');
    expect(alertCategory('mutiny').category).toBe('crew');
    expect(alertCategory('deposit').color).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('danger + warning incidents are NEEDS-YOU; info/gain are not', () => {
    expect(incidentNeedsYou('danger')).toBe(true);
    expect(incidentNeedsYou('warning')).toBe(true);
    expect(incidentNeedsYou('info')).toBe(false);
    expect(incidentNeedsYou('gain')).toBe(false);
  });
});
