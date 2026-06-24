import { describe, it, expect } from 'vitest';
import {
  hasEstablishedIncome,
  suggestedExtortTarget,
  hasCarryingCollector,
  firstObjective,
} from '../src/sim/onboarding';
import { createInitialState } from '../src/sim/state';
import { extortSuccessChance } from '../src/sim/commands';
import { spawnCollector } from '../src/sim/movement';
import { EXTORT_BASE_CHANCE, EXTORT_MIN_CONTROL } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

describe('startingCrew option — a fair opening, determinism preserved', () => {
  it('seeds two loyal guards on the player when requested, none by default', () => {
    expect(createInitialState(1).player.gangsters).toHaveLength(0);
    const s = createInitialState(1, { startingCrew: true });
    expect(s.player.gangsters).toHaveLength(2);
    expect(s.player.gangsters.every((g) => g.assignment.type === 'guard')).toBe(true);
    expect(s.player.gangsters.every((g) => g.loyalty >= 70)).toBe(true);
  });

  it('does NOT perturb the seeded RNG cursor (fixed stats, no draw)', () => {
    expect(createInitialState(7, { startingCrew: true }).rngState).toBe(createInitialState(7).rngState);
  });

  it('the crew gives extortion muscle at the home front', () => {
    const plain = createInitialState(1);
    const crew = createInitialState(1, { startingCrew: true });
    const bizId = plain.districts[0].businesses[0].id;
    // muscle (2 guards × skill 3 = 6) adds 0.24, and RTS-14 Vito's Brutal trait adds 0.08 → +0.32.
    expect(extortSuccessChance(crew, 'player', bizId)).toBeCloseTo(extortSuccessChance(plain, 'player', bizId) + 0.32, 6);
  });
});

describe('extortSuccessChance — RTS-11 onboarding floor', () => {
  it('scales from EXTORT_BASE_CHANCE at zero control to 1.0 at full control', () => {
    const s = createInitialState(1);
    const id = s.districts[0].businesses[0].id;
    s.districts[0].control.player = 0;
    expect(extortSuccessChance(s, 'player', id)).toBeCloseTo(EXTORT_BASE_CHANCE, 6);
    s.districts[0].control.player = 40;
    expect(extortSuccessChance(s, 'player', id)).toBeCloseTo(0.7, 6); // 0.5 + 0.4*0.5
    s.districts[0].control.player = 100;
    expect(extortSuccessChance(s, 'player', id)).toBe(1);
  });

  it('the starting home front (control 30) is a favorable first shakedown', () => {
    const s = createInitialState(1);
    const id = s.districts[0].businesses[0].id;
    // control 30 -> 0.5 + 0.3*0.5 = 0.65, already better than even.
    expect(extortSuccessChance(s, 'player', id)).toBeCloseTo(0.65, 6);
    expect(extortSuccessChance(s, 'player', id)).toBeGreaterThan(0.5);
  });
});

describe('hasEstablishedIncome / suggestedExtortTarget', () => {
  it('no income on a fresh state; the home front is the suggested target', () => {
    const s = createInitialState(1);
    expect(hasEstablishedIncome(s, 'player')).toBe(false);
    const t = suggestedExtortTarget(s, 'player');
    expect(t).not.toBeNull();
    expect(t!.districtId).toBe('district-0'); // where the player has control 30 ≥ min
    expect(t!.businessId).toBe(s.districts[0].businesses[0].id);
  });

  it('once a front is extorted, income is established and it is no longer suggested', () => {
    const s = createInitialState(1);
    const first = s.districts[0].businesses[0];
    first.extortedBy = 'player';
    expect(hasEstablishedIncome(s, 'player')).toBe(true);
    expect(suggestedExtortTarget(s, 'player')!.businessId).not.toBe(first.id); // moves to the next front
  });

  it('suggests nothing where control is below the gate', () => {
    const s = createInitialState(1);
    s.districts[0].control.player = EXTORT_MIN_CONTROL - 1; // drop below the only foothold
    expect(suggestedExtortTarget(s, 'player')).toBeNull();
  });

  it('RTS-31: never points [E] at a front someone ELSE already extorts (it would not be shakeable)', () => {
    const s = createInitialState(1);
    // a RIVAL holds the first home front; the objective must skip it (not an un-shaken [%] target) and
    // suggest the next genuinely un-shaken one — so the first [E] always lands on a real target.
    s.districts[0].businesses[0].extortedBy = 'rival-a';
    const t = suggestedExtortTarget(s, 'player');
    expect(t).not.toBeNull();
    expect(t!.businessId).not.toBe(s.districts[0].businesses[0].id);
    expect(s.districts[0].businesses.find((b) => b.id === t!.businessId)!.extortedBy).toBeUndefined();
  });
});

describe('firstObjective — the guided next move', () => {
  it('step 1 is extort, pointing at the home front', () => {
    const s = createInitialState(1);
    const o = firstObjective(s);
    expect(o.step).toBe('extort');
    expect(o.targetBusinessId).toBe(s.districts[0].businesses[0].id);
    expect(o.done).toBe(false);
    expect(o.detail).toMatch(/\[E\]/);
  });

  it('after extorting, step becomes collect while takings wait', () => {
    const s = createInitialState(1);
    const front = s.districts[0].businesses[0];
    front.extortedBy = 'player';
    front.uncollected = 200; // takings piled up, no collector out
    const o = firstObjective(s);
    expect(o.step).toBe('collect');
    expect(o.detail).toMatch(/\[C\]/);
  });

  it('a collector carrying cash flips the objective to protect', () => {
    const s: GameState = createInitialState(1);
    s.districts[0].businesses[0].extortedBy = 'player';
    s.units.push(spawnCollector('c', 5, 5, 'player', 300));
    const o = firstObjective(s);
    expect(o.step).toBe('protect');
    expect(o.title).toMatch(/HQ/);
  });

  it('RTS-33: earning with nothing pending no longer DEAD-ENDS — it teaches GREASE next (not done)', () => {
    const s = createInitialState(1);
    s.districts[0].businesses[0].extortedBy = 'player'; // income, but no takings yet, no collector
    const o = firstObjective(s);
    expect(o.step).toBe('grease');
    expect(o.done).toBe(false);
    expect(o.detail).toMatch(/\[G\]/);
  });

  it('RTS-33: the chain advances PAST earn — grease → hold → specialist → war → win', () => {
    const s = createInitialState(1, { bigCity: true });
    // earning: extort the home front
    s.districts[0].businesses[0].extortedBy = 'player';
    expect(firstObjective(s).step).toBe('grease');

    // greased a channel → teach HOLD a district
    s.player.bribes.police = 10;
    expect(firstObjective(s).step).toBe('hold');

    // hold the home district → teach RECRUIT a SPECIALIST
    s.districts[0].control.player = 60;
    expect(firstObjective(s).step).toBe('specialist');

    // fielded a specialist (an enforcer crew member) → teach the TURF WAR
    s.player.gangsters.push({ id: 'enf-pistol-1-0', name: 'PISTOL MAN', skill: 4, loyalty: 70, upkeep: 18, assignment: { type: 'idle' } });
    expect(firstObjective(s).step).toBe('war');

    // hold a SECOND district → self-directing: point at the WIN paths (the only `done` step)
    s.districts[1].control.player = 60;
    const win = firstObjective(s);
    expect(win.step).toBe('win');
    expect(win.done).toBe(true);
    expect(win.detail).toMatch(/DOMINATION|GO STRAIGHT|MAYOR/);
  });

  it('RTS-33: only the terminal WIN step is `done` — the player always has a next goal until then', () => {
    const s = createInitialState(1, { bigCity: true });
    s.districts[0].businesses[0].extortedBy = 'player';
    for (const step of ['grease', 'hold', 'specialist', 'war'] as const) {
      const o = firstObjective(s);
      expect(o.step).toBe(step);
      expect(o.done).toBe(false); // never a dead-end before the win
      // satisfy this step's condition to advance to the next
      if (step === 'grease') s.player.bribes.police = 10;
      else if (step === 'hold') s.districts[0].control.player = 60;
      else if (step === 'specialist') s.player.gangsters.push({ id: 'enf-pistol-1-0', name: 'PISTOL MAN', skill: 4, loyalty: 70, upkeep: 18, assignment: { type: 'idle' } });
      else if (step === 'war') s.districts[1].control.player = 60;
    }
    expect(firstObjective(s).done).toBe(true);
  });

  it('hasCarryingCollector is false for an empty collector', () => {
    const s = createInitialState(1);
    s.units.push(spawnCollector('c', 0, 0, 'player', 0));
    expect(hasCarryingCollector(s, 'player')).toBe(false);
  });
});
