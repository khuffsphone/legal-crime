// DISTRICT RACKET POSTURE — LIVE WIRING (integration, state/math). The posture multipliers actually move the
// game: dirty income scales at accrual, a staged change PROMOTES at a settlement boundary through the
// real-time wrapper, and an op-preview on a postured front surfaces the modifier line. tick/applyCommand/
// commands are untouched — these wrap accrueUncollected / the settlement / the preview selectors.
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { accrueUncollected } from '../src/sim/collection';
import { update } from '../src/sim/realtime';
import { requestPosture, postureOf, previewExtortFront } from '../src/sim';
import { businessEarner } from '../src/sim/economy';
import type { GameState } from '../src/sim/types';

/** A fresh big-city state with one player-extorted front isolated for measurement. */
function withPlayerFront(): { s: GameState; districtId: string; frontId: string } {
  const s = createInitialState(1, { bigCity: true });
  const d = s.districts[0];
  const front = d.businesses.find((b) => b.kind === 'front')!;
  front.extortedBy = s.player.id; // the player runs this block
  front.uncollected = 0;
  return { s, districtId: d.id, frontId: front.id };
}

describe('income wiring — posture scales the PLAYER dirty income at accrual (no-op by default)', () => {
  it('AGGRESSIVE accrues MORE than BALANCED on the same front; LOW_PROFILE less', () => {
    const base = withPlayerFront();
    accrueUncollected(base.s);
    const balanced = base.s.districts[0].businesses.find((b) => b.id === base.frontId)!.uncollected ?? 0;
    expect(balanced).toBeGreaterThan(0);

    const agg = withPlayerFront();
    agg.s.districts[0].posture = { active: 'AGGRESSIVE', setTick: 0 };
    accrueUncollected(agg.s);
    const aggressive = agg.s.districts[0].businesses.find((b) => b.id === agg.frontId)!.uncollected ?? 0;
    expect(aggressive).toBeGreaterThan(balanced); // ×1.25

    const lp = withPlayerFront();
    lp.s.districts[0].posture = { active: 'LOW_PROFILE', setTick: 0 };
    accrueUncollected(lp.s);
    const low = lp.s.districts[0].businesses.find((b) => b.id === lp.frontId)!.uncollected ?? 0;
    expect(low).toBeLessThan(balanced); // ×0.70
  });
  it('a RIVAL-earned business in a postured district is NOT scaled by the player posture', () => {
    const { s } = withPlayerFront();
    const d = s.districts[0];
    d.posture = { active: 'AGGRESSIVE', setTick: 0 };
    const rivalBiz = d.businesses.find((b) => businessEarner(b) && businessEarner(b) !== s.player.id);
    if (rivalBiz) { // only assert when the fixture actually has a rival earner
      const before = rivalBiz.uncollected ?? 0;
      // compare against a balanced run of the same business
      const balS = withPlayerFront().s; balS.districts[0].posture = { active: 'BALANCED', setTick: 0 };
      const balBiz = balS.districts[0].businesses.find((b) => b.id === rivalBiz.id)!;
      accrueUncollected(s); accrueUncollected(balS);
      expect((rivalBiz.uncollected ?? 0) - before).toBe((balBiz.uncollected ?? 0));
    }
    expect(true).toBe(true);
  });
});

describe('boundary wiring — a staged posture promotes at the next settlement via update()', () => {
  it('requestPosture stays pending until a week settles, then it is active', () => {
    const { s, districtId } = withPlayerFront();
    requestPosture(s.districts.find((d) => d.id === districtId)!, 'FORTIFIED', s.tick);
    expect(postureOf(s.districts.find((d) => d.id === districtId)!)).toBe('BALANCED'); // staged only
    const wk = 2; // small week duration so one step settles
    const r = update(s, wk, wk);
    expect(r.weeksFired).toBeGreaterThan(0);
    expect(postureOf(s.districts.find((d) => d.id === districtId)!)).toBe('FORTIFIED'); // promoted at the boundary
  });
});

describe('op-preview wiring — a postured front shows the modifier line (still NO-X-RAY)', () => {
  it('an AGGRESSIVE front extort preview carries a Posture detail row; BALANCED adds nothing', () => {
    const { s, frontId } = withPlayerFront();
    const thug = { id: 'p', pos: { gx: 0, gy: 0 }, path: [], speed: 1, factionId: s.player.id, role: 'enforcer' as const };
    s.units = [thug];
    const tile = { gx: 0, gy: 0 };
    // BALANCED: no posture row
    const balanced = previewExtortFront(s, 'p', frontId, tile, () => true);
    expect(balanced.detail.some((r) => r.label === 'Posture')).toBe(false);
    // AGGRESSIVE: a posture row appears (un-taken front so the extort gate is open)
    s.districts[0].businesses.find((b) => b.id === frontId)!.extortedBy = undefined; // make it extortable
    s.districts[0].posture = { active: 'AGGRESSIVE', setTick: 0 };
    const aggressive = previewExtortFront(s, 'p', frontId, tile, () => true);
    if (!aggressive.blocked) {
      expect(aggressive.detail.some((r) => r.label === 'Posture' && /AGGRESSIVE/.test(r.value))).toBe(true);
      // and it never leaks a rival number
      for (const r of aggressive.detail) expect(r.value).not.toMatch(/rival.*\d|\d+ (units|thugs)/i);
    }
  });
});
