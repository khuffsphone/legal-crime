import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand, type SetBribeCommand, type BribeCommand } from '../src/sim/commands';
import { sumBribes, recomputeBribeLevel, bustAvoidChance } from '../src/sim/bribery';
import { familyExpenses } from '../src/sim/economy';
import { resolveLaw } from '../src/sim/law';
import { tick } from '../src/sim/tick';
import {
  HEAT_MAX,
  HEAT_DECAY,
  JUDGE_BUST_MITIGATION_PER_LEVEL,
  JUDGE_MAX_BUST_MITIGATION,
} from '../src/sim/constants';
import type { BribeChannel } from '../src/sim/types';

const setBribe = (familyId: string, channel: BribeChannel, amount: number): SetBribeCommand => ({
  type: 'setBribe',
  familyId,
  channel,
  amount,
});
const bribe = (familyId: string, amount: number): BribeCommand => ({ type: 'bribe', familyId, amount });

describe('bribery helpers', () => {
  it('sumBribes totals the channels and recomputeBribeLevel syncs it', () => {
    const s = createInitialState(1);
    s.player.bribes = { police: 10, judges: 20, politicians: 5, feds: 0 };
    expect(sumBribes(s.player)).toBe(35);
    recomputeBribeLevel(s.player);
    expect(s.player.bribeLevel).toBe(35);
  });

  it('bustAvoidChance is judges * per-level, capped', () => {
    expect(bustAvoidChance(0)).toBe(0);
    expect(bustAvoidChance(50)).toBeCloseTo(50 * JUDGE_BUST_MITIGATION_PER_LEVEL, 6);
    expect(bustAvoidChance(10000)).toBe(JUDGE_MAX_BUST_MITIGATION);
  });
});

describe('setBribe command', () => {
  it('sets a channel to an absolute amount and keeps bribeLevel in sync', () => {
    const s = createInitialState(1);
    s.player.cash = 2000;
    applyCommand(s, setBribe('player', 'judges', 50));
    expect(s.player.bribes.judges).toBe(50);
    expect(s.player.bribeLevel).toBe(50);
    applyCommand(s, setBribe('player', 'police', 30));
    expect(s.player.bribeLevel).toBe(80);
    applyCommand(s, setBribe('player', 'judges', 10)); // lower the slider
    expect(s.player.bribes.judges).toBe(10);
    expect(s.player.bribeLevel).toBe(40);
  });

  it('lowering a slider is allowed even when nearly broke', () => {
    const s = createInitialState(1);
    s.player.cash = 5;
    s.player.bribes.police = 50;
    recomputeBribeLevel(s.player);
    applyCommand(s, setBribe('player', 'police', 10));
    expect(s.player.bribes.police).toBe(10);
    expect(s.player.bribeLevel).toBe(10);
  });

  it('raising the total is denied without cash to sustain it', () => {
    const s = createInitialState(1);
    s.player.cash = 30;
    applyCommand(s, setBribe('player', 'feds', 100));
    expect(s.player.bribes.feds).toBe(0);
    expect(s.log.at(-1)?.kind).toBe('bribe-denied');
  });

  it('rejects negative amounts', () => {
    const s = createInitialState(1);
    applyCommand(s, setBribe('player', 'police', -5));
    expect(s.player.bribes.police).toBe(0);
    expect(s.log.at(-1)?.kind).toBe('bribe-invalid');
  });
});

describe('legacy bribe command maps to the police channel', () => {
  it('raises the police slider and the total', () => {
    const s = createInitialState(1);
    s.player.cash = 1000;
    applyCommand(s, bribe('player', 40));
    expect(s.player.bribes.police).toBe(40);
    expect(s.player.bribeLevel).toBe(40);
  });
});

describe('channel effects', () => {
  it('politicians speed heat decay', () => {
    const s = createInitialState(1);
    s.player.heat = 50;
    s.player.cash = 5000;
    applyCommand(s, setBribe('player', 'politicians', 40)); // +2 decay
    resolveLaw(s);
    expect(s.player.heat).toBe(50 - (HEAT_DECAY + 2));
  });

  it('the total bribe (any channel) is charged each tick via the economy', () => {
    const s = createInitialState(1);
    s.player.cash = 2000;
    applyCommand(s, setBribe('player', 'judges', 25));
    applyCommand(s, setBribe('player', 'feds', 15));
    expect(familyExpenses(s.player)).toBe(40); // no gangsters, retainer 40
    const cash0 = s.player.cash;
    tick(s);
    expect(s.player.cash).toBe(cash0 - 40);
  });

  it('judges spring the boss from some bust-level raids; without them every raid kills', () => {
    let avertedWithJudges = 0;
    let bustedWithJudges = 0;
    for (let seed = 0; seed < 80; seed++) {
      const s = createInitialState(seed);
      s.player.heat = HEAT_MAX;
      s.player.bribes.police = 0; // let raids fire
      s.player.bribes.judges = 80; // 0.8 chance to avert a bust
      resolveLaw(s);
      if (s.log.some((e) => e.kind === 'raid-averted')) avertedWithJudges++;
      if (!s.player.alive) bustedWithJudges++;
    }
    expect(avertedWithJudges).toBeGreaterThan(0);
    expect(bustedWithJudges).toBeGreaterThan(0); // 0.8 isn't total immunity

    let bustsNoJudges = 0;
    for (let seed = 0; seed < 80; seed++) {
      const s = createInitialState(seed);
      s.player.heat = HEAT_MAX;
      s.player.bribes.police = 0;
      s.player.bribes.judges = 0;
      resolveLaw(s);
      if (!s.player.alive) bustsNoJudges++;
    }
    // Judges meaningfully reduce deaths.
    expect(bustsNoJudges).toBeGreaterThan(bustedWithJudges);
  });

  it('is deterministic for the same seed and bribe channels', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 5000;
      applyCommand(s, setBribe('player', 'police', 30));
      applyCommand(s, setBribe('player', 'politicians', 20));
      tick(s);
      return s;
    };
    expect(build(8)).toEqual(build(8));
  });
});
