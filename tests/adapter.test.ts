import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  newGame,
  playerView,
  districtViews,
  rivalViews,
  statusView,
  statusBanner,
  dispatch,
  advanceTurn,
} from '../src/scenes/adapter';

describe('adapter selectors', () => {
  it('playerView reports derived player stats', () => {
    const s = newGame(1);
    s.player.cash = 1234;
    s.player.heat = 17;
    s.player.bribeLevel = 5;
    s.player.gangsters = [
      { id: 'g1', name: 'g1', skill: 4, loyalty: 60, upkeep: 40, assignment: { type: 'idle' } },
      { id: 'g2', name: 'g2', skill: 6, loyalty: 60, upkeep: 60, assignment: { type: 'idle' } },
    ];
    const v = playerView(s);
    expect(v).toMatchObject({
      name: 'Player Family',
      cash: 1234,
      heat: 17,
      bribeLevel: 5,
      gangsterCount: 2,
      strength: 10, // 4 + 6
      districtsHeld: 0, // only 30 control in d0
    });
  });

  it('districtViews resolves the holder name and player control', () => {
    const s = newGame(1);
    s.districts[0].control = { player: 70, 'rival-a': 20 };
    const views = districtViews(s);
    expect(views).toHaveLength(5);
    expect(views[0]).toMatchObject({
      id: 'district-0',
      holderId: 'player',
      holderName: 'Player Family',
      playerControl: 70,
    });
    // district-2 is rival-a home turf (control 40 < hold) -> contested
    expect(views[2].holderId).toBeNull();
    expect(views[2].holderName).toBeNull();
  });

  it('districtViews counts operations distinct from fronts', () => {
    const s = newGame(1);
    s.player.cash = 5000;
    dispatch(s, { type: 'establishOperation', familyId: 'player', districtId: 'district-0', kind: 'numbers' });
    const view = districtViews(s).find((d) => d.id === 'district-0')!;
    expect(view.operationCount).toBe(1);
    expect(view.businessCount).toBeGreaterThan(view.operationCount);
  });

  it('rivalViews reports each rival with strength and alive flag', () => {
    const s = newGame(1);
    s.rivals[0].gangsters = [
      { id: 'r1', name: 'r1', skill: 7, loyalty: 50, upkeep: 0, assignment: { type: 'idle' } },
    ];
    s.rivals[1].alive = false;
    const views = rivalViews(s);
    expect(views[0]).toMatchObject({ id: 'rival-a', strength: 7, alive: true });
    expect(views[1]).toMatchObject({ id: 'rival-b', alive: false });
  });

  it('statusView and statusBanner reflect game state', () => {
    const s = newGame(1);
    expect(statusView(s)).toMatchObject({ status: 'playing', tick: 0, districtsNeededToWin: 3, over: false });
    expect(statusBanner(s)).toBe('Week 0');

    s.status = 'won';
    expect(statusBanner(s)).toBe('YOU TOOK THE CITY');
    expect(statusView(s).over).toBe(true);

    s.status = 'lost';
    s.lossReason = 'busted';
    expect(statusBanner(s)).toBe('GAME OVER — busted');
  });
});

describe('adapter dispatch / advanceTurn', () => {
  it('dispatch applies a command without advancing the tick', () => {
    const s = newGame(1);
    s.districts[0].control = { player: 100 };
    s.districts[0].businesses = [
      { id: 'f1', name: 'f1', kind: 'front', baseIncome: 100, heatPerTick: 0, districtId: 'district-0' },
    ];
    dispatch(s, { type: 'extort', familyId: 'player', businessId: 'f1' });
    expect(s.tick).toBe(0);
    expect(s.districts[0].businesses[0].extortedBy).toBe('player');
  });

  it('advanceTurn applies commands then ticks once', () => {
    const s = newGame(1);
    s.player.cash = 5000;
    advanceTurn(s, [
      { type: 'establishOperation', familyId: 'player', districtId: 'district-0', kind: 'numbers' },
    ]);
    expect(s.tick).toBe(1);
    expect(districtViews(s).find((d) => d.id === 'district-0')!.operationCount).toBe(1);
  });

  it('a full deterministic mini-game is reproducible through the adapter', () => {
    const play = (seed: number) => {
      const s = newGame(seed);
      s.player.cash = 10000;
      advanceTurn(s, [{ type: 'expandControl', familyId: 'player', districtId: 'district-0' }]);
      advanceTurn(s, [{ type: 'recruitGangster', familyId: 'player' }]);
      advanceTurn(s, [{ type: 'bribe', familyId: 'player', amount: 20 }]);
      return s;
    };
    expect(play(42)).toEqual(play(42));
  });
});

describe('architecture invariant: /src/sim is Phaser-free', () => {
  it('no file under src/sim imports or references Phaser', () => {
    const simDir = join(process.cwd(), 'src', 'sim');
    const offenders: string[] = [];
    for (const file of readdirSync(simDir)) {
      if (!file.endsWith('.ts')) continue;
      const src = readFileSync(join(simDir, file), 'utf8');
      // Match an actual import of the phaser module (case-insensitive specifier), not the
      // word "Phaser" appearing in a comment.
      if (/\bfrom\s+['"]phaser['"]/i.test(src) || /\brequire\(\s*['"]phaser['"]\s*\)/i.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
