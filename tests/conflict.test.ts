import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import { applyCommand, type OrderHitCommand } from '../src/sim/commands';
import { familyStrength, decideCasualties, resolveConflict } from '../src/sim/conflict';
import { HIT_HEAT } from '../src/sim/constants';
import type { Family, Gangster } from '../src/sim/types';

function gangster(id: string, skill: number): Gangster {
  return { id, name: id, skill, loyalty: 60, upkeep: 0, assignment: { type: 'idle' } };
}

function stockRoster(family: Family, skills: number[]): void {
  family.gangsters = skills.map((sk, i) => gangster(`${family.id}-g${i}`, sk));
}

const hit = (attackerFamilyId: string, targetFamilyId: string): OrderHitCommand => ({
  type: 'orderHit',
  attackerFamilyId,
  targetFamilyId,
});

describe('familyStrength', () => {
  it('sums gangster skill', () => {
    const s = createInitialState(1);
    stockRoster(s.player, [3, 5, 10]);
    expect(familyStrength(s.player)).toBe(18);
    expect(familyStrength(s.rivals[0])).toBe(0);
  });
});

describe('decideCasualties', () => {
  it('attacker wins on ties (aggressor edge) and in a close fight both lose one', () => {
    const o = decideCasualties(10, 10, 3, 3);
    expect(o.attackerWins).toBe(true);
    expect(o.margin).toBe(0);
    expect(o.attackerLosses).toBe(1); // close fight -> winner also loses 1
    expect(o.defenderLosses).toBe(1);
  });

  it('a rout costs the loser two and the winner none', () => {
    const o = decideCasualties(100, 10, 3, 3); // margin 0.9
    expect(o.attackerWins).toBe(true);
    expect(o.attackerLosses).toBe(0);
    expect(o.defenderLosses).toBe(2);
  });

  it('a losing attacker takes the casualties', () => {
    const o = decideCasualties(10, 100, 3, 3);
    expect(o.attackerWins).toBe(false);
    expect(o.attackerLosses).toBe(2);
    expect(o.defenderLosses).toBe(0);
  });

  it('clamps losses to the roster size', () => {
    const o = decideCasualties(100, 1, 1, 1); // rout, but defender has only 1
    expect(o.defenderLosses).toBe(1);
  });
});

describe('orderHit command', () => {
  it('queues a hit when both families are alive and the attacker has muscle', () => {
    const s = createInitialState(1);
    stockRoster(s.player, [5]);
    applyCommand(s, hit('player', 'rival-a'));
    expect(s.pendingHits).toHaveLength(1);
    expect(s.pendingHits[0]).toMatchObject({ attackerId: 'player', targetId: 'rival-a' });
    expect(s.log.at(-1)?.kind).toBe('hit-ordered');
  });

  it('rejects hitting yourself', () => {
    const s = createInitialState(1);
    stockRoster(s.player, [5]);
    applyCommand(s, hit('player', 'player'));
    expect(s.pendingHits).toHaveLength(0);
    expect(s.log.at(-1)?.kind).toBe('hit-invalid');
  });

  it('is denied when the attacker has no muscle', () => {
    const s = createInitialState(1);
    s.player.gangsters = [];
    applyCommand(s, hit('player', 'rival-a'));
    expect(s.pendingHits).toHaveLength(0);
    expect(s.log.at(-1)?.kind).toBe('hit-denied');
  });
});

describe('resolveConflict', () => {
  it('a much stronger attacker reliably overruns a lone defender (boss killed)', () => {
    let kills = 0;
    for (let seed = 0; seed < 40; seed++) {
      const s = createInitialState(seed);
      stockRoster(s.player, [10, 10, 10]); // strength 30
      stockRoster(s.rivals[0], [1]); // strength 1
      s.pendingHits = [{ attackerId: 'player', targetId: 'rival-a', orderedTick: 0 }];
      resolveConflict(s);
      if (!s.rivals[0].alive) kills++;
    }
    expect(kills).toBe(40); // 30*[0.5,1.5) always beats 1*[0.5,1.5)
  });

  it('applies casualties and adds attacker heat', () => {
    const s = createInitialState(1);
    stockRoster(s.player, [10, 10, 10]);
    stockRoster(s.rivals[0], [8, 8, 8]);
    const heat0 = s.player.heat;
    s.pendingHits = [{ attackerId: 'player', targetId: 'rival-a', orderedTick: 0 }];
    resolveConflict(s);
    const totalAfter = s.player.gangsters.length + s.rivals[0].gangsters.length;
    expect(totalAfter).toBeLessThan(6); // someone took casualties
    expect(s.player.heat).toBe(heat0 + HIT_HEAT);
  });

  it('removes the weakest gangsters first', () => {
    const s = createInitialState(1);
    stockRoster(s.player, [10, 10, 10]);
    stockRoster(s.rivals[0], [1, 2, 9]); // weakest are 1 and 2
    s.pendingHits = [{ attackerId: 'player', targetId: 'rival-a', orderedTick: 0 }];
    resolveConflict(s);
    // attacker wins a rout -> defender loses up to 2 weakest; the skill-9 survives
    expect(s.rivals[0].gangsters.some((g) => g.skill === 9)).toBe(true);
  });

  it('killing the player boss sets a dead loss', () => {
    const s = createInitialState(1);
    stockRoster(s.rivals[0], [10, 10, 10]);
    s.player.gangsters = []; // no defenders
    // give player a token so the attacker validity isn't the issue; defender = player
    s.pendingHits = [{ attackerId: 'rival-a', targetId: 'player', orderedTick: 0 }];
    resolveConflict(s);
    expect(s.player.alive).toBe(false);
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('dead');
  });

  it('clears the pending-hit queue after resolving', () => {
    const s = createInitialState(1);
    stockRoster(s.player, [10]);
    stockRoster(s.rivals[0], [5]);
    s.pendingHits = [{ attackerId: 'player', targetId: 'rival-a', orderedTick: 0 }];
    resolveConflict(s);
    expect(s.pendingHits).toHaveLength(0);
  });

  it('skips a hit whose target is already dead', () => {
    const s = createInitialState(1);
    stockRoster(s.player, [10]);
    s.rivals[0].alive = false;
    s.pendingHits = [{ attackerId: 'player', targetId: 'rival-a', orderedTick: 0 }];
    const cursor = s.rngState;
    resolveConflict(s);
    expect(s.rngState).toBe(cursor); // no combat rolled
  });

  it('is deterministic: same seed yields a deeply equal post-conflict state', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      stockRoster(s.player, [7, 7]);
      stockRoster(s.rivals[0], [6, 6]);
      s.pendingHits = [{ attackerId: 'player', targetId: 'rival-a', orderedTick: 0 }];
      resolveConflict(s);
      return s;
    };
    expect(build(13)).toEqual(build(13));
  });
});
