// HUD PHASE 2 — the TOP LEDGER BAR model (state/math, never pixels). The pure core that derives every
// displayed value: thousands-separated money with a REAL minus, per-week flows, brass+arrow trends (NEVER
// colour), the clean/dirty hero + dirty-exposure meter, the federal heat ladder (NOTICE@50/WATCH@70/RAID@85),
// the win-path ticker, and the funding budget. This is the non-HITL part — it must be green + canon-clean.
import { describe, it, expect } from 'vitest';
import {
  groupThousands, formatMoney, formatFlowPerWeek, trendOf, trendGlyph,
  cashPair, heatLadder, winPathTicker, controlBudget, buildLedgerBar,
} from '../src/scenes/hud/ledgerBar';
import { createInitialState } from '../src/sim/state';
import {
  dirtyExposurePoints, fedWarningTier, FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3, FED_DIRTY_DANGER,
} from '../src/sim';

describe('number formatting — thousands separators, REAL minus, per-week flows', () => {
  it('groupThousands inserts commas every 3 digits (magnitude only)', () => {
    expect(groupThousands(0)).toBe('0');
    expect(groupThousands(999)).toBe('999');
    expect(groupThousands(1000)).toBe('1,000');
    expect(groupThousands(12450)).toBe('12,450');
    expect(groupThousands(-1234567)).toBe('1,234,567'); // magnitude only
  });
  it('formatMoney uses $ + commas and a REAL minus sign (−, not a hyphen) for losses', () => {
    expect(formatMoney(12450)).toBe('$12,450');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(-1234)).toBe('−$1,234');
    expect(formatMoney(-1234).startsWith('−')).toBe(true);   // U+2212
    expect(formatMoney(-1234).includes('-')).toBe(false);    // never an ASCII hyphen
  });
  it('formatFlowPerWeek signs flows and tags /wk', () => {
    expect(formatFlowPerWeek(420)).toBe('+$420/wk');
    expect(formatFlowPerWeek(-420)).toBe('−$420/wk');
    expect(formatFlowPerWeek(0)).toBe('$0/wk');
    expect(formatFlowPerWeek(1500)).toBe('+$1,500/wk');
  });
});

describe('trends are brass + ARROW, never colour', () => {
  it('trendOf classifies with a dead-band', () => {
    expect(trendOf(5)).toBe('up');
    expect(trendOf(-5)).toBe('down');
    expect(trendOf(0)).toBe('flat');
    expect(trendOf(3, 5)).toBe('flat'); // inside the eps band
  });
  it('trendGlyph is ONLY ▲ / ▼ / · — no green/red, no colour strings', () => {
    expect(trendGlyph('up')).toBe('▲');
    expect(trendGlyph('down')).toBe('▼');
    expect(trendGlyph('flat')).toBe('·');
    for (const g of [trendGlyph('up'), trendGlyph('down'), trendGlyph('flat')]) expect(g).not.toMatch(/red|green|#/i);
  });
});

describe('cash pair + dirty-exposure meter (reuses the EXISTING dirtyExposurePoints)', () => {
  it('formats the hero pair and derives the exposure meter from dirty cash', () => {
    const v = cashPair(12450, 5000);
    expect(v.cleanText).toBe('$12,450');
    expect(v.dirtyText).toBe('$5,000');
    expect(v.exposurePoints).toBe(dirtyExposurePoints(5000)); // 25 — not reinvented
    expect(v.safeCapPct).toBe(50);                            // 25/50 of the cap
    expect(v.exposureFill).toBeCloseTo(0.5);
    expect(v.overDanger).toBe(5000 > FED_DIRTY_DANGER);       // true
  });
  it('the exposure meter clamps at the cap (dirty ≥ $10k → 100%)', () => {
    const v = cashPair(0, 20000);
    expect(v.exposureFill).toBe(1);
    expect(v.safeCapPct).toBe(100);
  });
  it('trends come off the previous frame (▲/▼), flat without a prior', () => {
    expect(cashPair(100, 0).cleanTrend).toBe('flat'); // no prev
    expect(cashPair(200, 50, { clean: 100, dirty: 0 }).cleanTrend).toBe('up');
    expect(cashPair(80, 0, { clean: 100, dirty: 0 }).cleanTrend).toBe('down');
  });
});

describe('federal heat ladder — canon thresholds 50 / 70 / 85', () => {
  it('the ticks ARE the canon thresholds', () => {
    const ticks = heatLadder(0).ticks;
    expect(ticks.map((t) => t.at)).toEqual([FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3]);
    expect(ticks.map((t) => t.at)).toEqual([50, 70, 85]);
    expect(ticks.map((t) => t.name)).toEqual(['NOTICE', 'WATCH', 'RAID']);
  });
  it('the rung tracks the canon fedWarningTier mapping at the boundaries', () => {
    for (const e of [0, 49, 50, 69, 70, 84, 85, 100]) {
      const rung = ['CLEAR', 'NOTICE', 'WATCH', 'RAID'][fedWarningTier(e)];
      expect(heatLadder(e).rung).toBe(rung);
    }
  });
  it('distance-to-next and "N to RAID" are exact', () => {
    expect(heatLadder(0)).toMatchObject({ rung: 'CLEAR', toNext: 50, nextLabel: 'NOTICE', toRaid: 85 });
    expect(heatLadder(50)).toMatchObject({ rung: 'NOTICE', toNext: 20, nextLabel: 'WATCH', toRaid: 35 });
    expect(heatLadder(70)).toMatchObject({ rung: 'WATCH', toNext: 15, nextLabel: 'RAID', toRaid: 15 });
    expect(heatLadder(85)).toMatchObject({ rung: 'RAID', toNext: null, nextLabel: null, toRaid: 0 });
  });
  it('passed flags + fill, clamped to [0,100]', () => {
    expect(heatLadder(72).ticks.map((t) => t.passed)).toEqual([true, true, false]);
    expect(heatLadder(50).fill).toBeCloseTo(0.5);
    expect(heatLadder(150).fill).toBe(1);
    expect(heatLadder(-10).rung).toBe('CLEAR');
  });
});

describe('win-path ticker — all three always present, compact', () => {
  it('formats DOM X/Y · STRAIGHT Z% · ELECT W/100', () => {
    const v = winPathTicker(4, 9, 37, 62);
    expect(v.domText).toBe('DOM 4/9');
    expect(v.straightText).toBe('STRAIGHT 37%');
    expect(v.electText).toBe('ELECT 62/100');
  });
});

describe('control / funding budget (secondary; bottleneck flag)', () => {
  it('reads the net weekly flow with a /wk tag + trend; flags the bottleneck when non-positive', () => {
    expect(controlBudget(420).text).toBe('NET +$420/wk');
    expect(controlBudget(420).bottleneck).toBe(false);
    expect(controlBudget(-50).text).toBe('NET −$50/wk');
    expect(controlBudget(-50).bottleneck).toBe(true);
    expect(controlBudget(0).bottleneck).toBe(true);
    expect(controlBudget(500, 200).trend).toBe('up');   // flow rose
    expect(controlBudget(200, 500).trend).toBe('down');
  });
});

describe('buildLedgerBar — assembles the whole model from a real GameState', () => {
  it('derives a coherent model with no invented fields (shape + canon invariants)', () => {
    const s = createInitialState(1, { bigCity: true });
    const m = buildLedgerBar(s, { paused: true });
    expect(m.cash.cleanText).toMatch(/^[−$]/);          // formatted money
    expect(m.heat.ticks).toHaveLength(3);                // the 3 canon rungs
    expect(m.winPaths.domText).toMatch(/^DOM \d+\/\d+$/);
    expect(m.winPaths.electText).toMatch(/^ELECT \d+\/100$/);
    expect(m.budget.text).toMatch(/^NET /);
    expect(m.weekText).toMatch(/^WK \d+$/);
    expect(m.paused).toBe(true);
    // the heat rung matches the canon mapping for the live exposure
    expect(m.heat.rung).toBe(['CLEAR', 'NOTICE', 'WATCH', 'RAID'][fedWarningTier(m.heat.exposure)]);
  });
});
