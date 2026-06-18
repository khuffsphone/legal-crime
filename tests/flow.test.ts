import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  resolveWinLoss,
  endTurn,
  isGameOver,
  districtsNeededToWin,
  allRivalsEliminated,
} from '../src/sim/flow';
import { tick } from '../src/sim/tick';
import { BANKRUPT_FLOOR } from '../src/sim/constants';
import type { GameState } from '../src/sim/types';

/** Put the player on the brink of victory: every rival dead, holding enough districts. */
function nearWin(s: GameState): void {
  s.rivals.forEach((r) => (r.alive = false));
  // hold districts 0,1,2 (need ceil(5*0.6)=3)
  s.districts[0].control = { player: 60 };
  s.districts[1].control = { player: 60 };
  s.districts[2].control = { player: 60 };
}

describe('win/loss helpers', () => {
  it('districtsNeededToWin is ceil(districts * WIN_DISTRICTS)', () => {
    const s = createInitialState(1);
    expect(s.districts).toHaveLength(5);
    expect(districtsNeededToWin(s)).toBe(3); // ceil(5 * 0.6)
  });

  it('allRivalsEliminated reflects rival alive flags', () => {
    const s = createInitialState(1);
    expect(allRivalsEliminated(s)).toBe(false);
    s.rivals.forEach((r) => (r.alive = false));
    expect(allRivalsEliminated(s)).toBe(true);
  });
});

describe('resolveWinLoss — loss', () => {
  it('declares bankruptcy below the floor', () => {
    const s = createInitialState(1);
    s.player.cash = BANKRUPT_FLOOR - 1;
    resolveWinLoss(s);
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('bankrupt');
  });

  it('does not declare bankruptcy exactly at the floor', () => {
    const s = createInitialState(1);
    s.player.cash = BANKRUPT_FLOOR;
    resolveWinLoss(s);
    expect(s.status).toBe('playing');
  });

  it('declares a dead loss when the player boss is gone', () => {
    const s = createInitialState(1);
    s.player.alive = false;
    resolveWinLoss(s);
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('dead');
  });

  it('preserves an already-decided busted loss', () => {
    const s = createInitialState(1);
    s.status = 'lost';
    s.lossReason = 'busted';
    s.player.cash = BANKRUPT_FLOOR - 1000; // would otherwise be bankrupt
    resolveWinLoss(s);
    expect(s.lossReason).toBe('busted'); // not overwritten
  });
});

describe('resolveWinLoss — win', () => {
  it('declares victory when all rivals are dead and enough districts are held', () => {
    const s = createInitialState(1);
    nearWin(s);
    resolveWinLoss(s);
    expect(s.status).toBe('won');
    expect(s.lossReason).toBeUndefined();
  });

  it('does not win while any rival lives', () => {
    const s = createInitialState(1);
    nearWin(s);
    s.rivals[0].alive = true;
    resolveWinLoss(s);
    expect(s.status).toBe('playing');
  });

  it('does not win without enough districts held', () => {
    const s = createInitialState(1);
    s.rivals.forEach((r) => (r.alive = false));
    s.districts[0].control = { player: 60 };
    s.districts[1].control = { player: 60 }; // only 2 held, need 3
    resolveWinLoss(s);
    expect(s.status).toBe('playing');
  });
});

describe('endTurn', () => {
  it('applies the turn commands then advances one tick', () => {
    const s = createInitialState(1);
    s.player.cash = 5000;
    endTurn(s, [{ type: 'establishOperation', familyId: 'player', districtId: 'district-0', kind: 'numbers' }]);
    expect(s.tick).toBe(1);
    // the operation exists and produced its income this tick
    const op = s.districts[0].businesses.find((b) => b.ownerFamily === 'player');
    expect(op).toBeDefined();
  });

  it('is a no-op once the game is over', () => {
    const s = createInitialState(1);
    s.status = 'won';
    const snapshot = JSON.parse(JSON.stringify(s));
    endTurn(s, [{ type: 'recruitGangster', familyId: 'player' }]);
    expect(s.tick).toBe(snapshot.tick);
    expect(s.player.gangsters).toHaveLength(0);
  });

  it('isGameOver tracks status', () => {
    const s = createInitialState(1);
    expect(isGameOver(s)).toBe(false);
    s.status = 'lost';
    expect(isGameOver(s)).toBe(true);
  });
});

describe('tick integrates win/loss (step 8) and freezes a decided game', () => {
  it('a tick declares victory from a near-win state', () => {
    const s = createInitialState(1);
    nearWin(s);
    tick(s);
    expect(s.status).toBe('won');
  });

  it('a tick declares bankruptcy when expenses sink the player', () => {
    const s = createInitialState(1);
    s.player.cash = BANKRUPT_FLOOR + 10;
    // heavy upkeep drives cash below the floor this tick
    s.player.gangsters = [
      { id: 'g1', name: 'g1', skill: 5, loyalty: 60, upkeep: 100, assignment: { type: 'idle' } },
    ];
    tick(s);
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('bankrupt');
  });

  it('a decided game does not advance on further ticks', () => {
    const s = createInitialState(1);
    nearWin(s);
    tick(s); // -> won at tick 1
    expect(s.status).toBe('won');
    const frozenTick = s.tick;
    tick(s);
    tick(s);
    expect(s.tick).toBe(frozenTick); // frozen
  });

  it('is deterministic through endTurn for the same seed and commands', () => {
    const build = (seed: number) => {
      const s = createInitialState(seed);
      s.player.cash = 8000;
      endTurn(s, [{ type: 'expandControl', familyId: 'player', districtId: 'district-0' }]);
      endTurn(s, [{ type: 'recruitGangster', familyId: 'player' }]);
      return s;
    };
    expect(build(21)).toEqual(build(21));
  });
});
