// STATUS DASHBOARD — the at-a-glance threat/economy view-model. Pure: values must DERIVE from the input, and
// (the cardinal rule) the dashboard must expose NO hidden-rival position — rival pressure is a player-knowable
// aggregate only.
import { describe, it, expect } from 'vitest';
import {
  buildStatusDashboard, cashflowTrend, federalBand, districtHealth, rivalPressure,
  type StatusDashboardInput,
} from '../src/scenes/ui/statusDashboard';
import { FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3 } from '../src/sim';

const input = (over: Partial<StatusDashboardInput>): StatusDashboardInput => ({
  federalExposure: 0, netPerWeek: 0, cleanCash: 0,
  districtsHeld: 1, districtsTotal: 9, districtsContested: 0, rivalPressureEvents: 0, ...over,
});

describe('federalBand — NOTICE 50 / WATCH 70 / RAID 85', () => {
  it('bands at the canon thresholds', () => {
    expect(federalBand(FED_WARN_TIER_1 - 1).label).toBe('CLEAR');
    expect(federalBand(FED_WARN_TIER_1).label).toBe('NOTICE');
    expect(federalBand(FED_WARN_TIER_2).label).toBe('WATCH');
    expect(federalBand(FED_WARN_TIER_3).label).toBe('RAID');
    expect(federalBand(FED_WARN_TIER_3).tone).toBe('danger');
    expect(federalBand(0).tone).toBe('good');
  });
});

describe('cashflowTrend — direction with a deadband', () => {
  it('reads up / down / flat', () => {
    expect(cashflowTrend(500)).toBe('up');
    expect(cashflowTrend(-500)).toBe('down');
    expect(cashflowTrend(0)).toBe('flat');
  });
});

describe('districtHealth — holdings + contested turf', () => {
  it('contested turf reads as pressed/under fire; held turf as secure/holding; none as no turf', () => {
    expect(districtHealth(3, 9, 0).label).toBe('HOLDING');
    expect(districtHealth(5, 9, 0).label).toBe('SECURE');
    expect(districtHealth(0, 9, 0).label).toBe('NO TURF');
    expect(districtHealth(3, 9, 1).tone).not.toBe('good'); // pressed
    expect(districtHealth(3, 9, 2).label).toBe('UNDER FIRE');
    expect(districtHealth(3, 9, 2).tone).toBe('danger');
  });
});

describe('rivalPressure — player-knowable aggregate, escalating', () => {
  it('escalates CALM → PROBING → PRESSING → WAR with contested turf + observed events', () => {
    expect(rivalPressure(0, 0).label).toBe('CALM');
    expect(rivalPressure(0, 1).label).toBe('PROBING');
    expect(rivalPressure(2, 0).label).toBe('PRESSING'); // 2 contested → heat 4
    expect(rivalPressure(2, 3).label).toBe('WAR');       // heat 7
    expect(rivalPressure(0, 0).tone).toBe('calm');
    expect(rivalPressure(3, 3).tone).toBe('danger');
  });
});

describe('buildStatusDashboard — values derive from state', () => {
  it('produces the four cells, each reflecting the input', () => {
    const v = buildStatusDashboard(input({
      federalExposure: 72, netPerWeek: -300, cleanCash: 12450,
      districtsHeld: 4, districtsTotal: 9, districtsContested: 1, rivalPressureEvents: 0,
    }));
    expect(v.cells.map((c) => c.key)).toEqual(['federal', 'district', 'cashflow', 'rival']);
    const by = (k: string) => v.cells.find((c) => c.key === k)!;
    expect(by('federal').value).toBe('WATCH');           // 72 → WATCH
    expect(by('federal').detail).toBe('72/100');
    expect(by('district').detail).toContain('4/9');      // holdings reflected
    expect(by('district').detail).toContain('1 contested');
    expect(by('cashflow').value).toContain('▼');         // negative net → down glyph
    expect(by('cashflow').value).toContain('300');       // magnitude reflected
    expect(by('cashflow').detail).toContain('12,450');   // funds reflected
    expect(by('rival').value).toBe('PROBING');           // 1 contested → heat 2 → PROBING
  });

  it('a calm, solvent, secure board reads clean', () => {
    const v = buildStatusDashboard(input({ federalExposure: 10, netPerWeek: 800, cleanCash: 5000, districtsHeld: 6 }));
    const by = (k: string) => v.cells.find((c) => c.key === k)!;
    expect(by('federal').value).toBe('CLEAR');
    expect(by('cashflow').value).toContain('▲');
    expect(by('rival').value).toBe('CALM');
  });
});

describe('NO-X-RAY — the dashboard exposes no hidden-rival position', () => {
  // bans a hidden-position field. (Note: `position`, not loose `pos`, so "federalExposure" doesn't trip it.)
  const POSITION_FIELD = /position|coord|tile|gx|gy|^x$|^y$|\blive\b/i;

  it('the input carries no position field — rival pressure is counts only', () => {
    const i = input({ districtsContested: 2, rivalPressureEvents: 3 });
    for (const k of Object.keys(i)) expect(k).not.toMatch(POSITION_FIELD);
  });

  it('no dashboard cell field or value carries a coordinate', () => {
    const v = buildStatusDashboard(input({ districtsContested: 2, rivalPressureEvents: 5 }));
    for (const cell of v.cells) {
      for (const k of Object.keys(cell)) expect(k).not.toMatch(POSITION_FIELD);
      // the rival cell is a band + a contested-turf count — never a position.
      if (cell.key === 'rival') {
        expect(cell.value).toBe('WAR');
        expect(cell.value).not.toMatch(/\d+\s*,\s*\d+/); // no "gx,gy" pair
        expect(cell.detail).not.toMatch(/\d+\s*,\s*\d+/);
      }
    }
    // nothing in the serialized view looks like a tile coordinate.
    expect(JSON.stringify(v)).not.toMatch(/"[xy]":/);
  });
});
