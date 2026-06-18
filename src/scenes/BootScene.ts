// Phaser scene. Rendering and input only — all game rules live in the pure sim, reached
// exclusively through the scene-agnostic adapter. The scene re-renders from a fresh view
// model after every dispatched command or advanced turn.

import Phaser from 'phaser';
import {
  newGame,
  playerView,
  districtViews,
  rivalViews,
  statusBanner,
  statusView,
  advanceTurn,
  dispatch,
} from './adapter';
import type { GameState } from '../sim';

const TEXT = { fontFamily: 'monospace', fontSize: '16px', color: '#cccccc' } as const;

export class BootScene extends Phaser.Scene {
  private state!: GameState;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('BootScene');
  }

  create(): void {
    this.state = newGame(1);

    // SPACE advances a turn; E extorts the first front in the player's home district.
    this.input.keyboard?.on('keydown-SPACE', () => {
      advanceTurn(this.state);
      this.render();
    });
    this.input.keyboard?.on('keydown-E', () => {
      const home = this.state.districts[0];
      const front = home.businesses.find((b) => b.kind === 'front');
      if (front) dispatch(this.state, { type: 'extort', familyId: 'player', businessId: front.id });
      this.render();
    });

    this.render();
  }

  private render(): void {
    this.texts.forEach((t) => t.destroy());
    this.texts = [];

    const banner = statusBanner(this.state);
    const status = statusView(this.state);
    const p = playerView(this.state);

    let y = 16;
    const line = (s: string, color = '#cccccc', size = '16px') => {
      this.texts.push(this.add.text(16, y, s, { ...TEXT, color, fontSize: size }));
      y += Number.parseInt(size, 10) + 6;
    };

    line('LEGAL CRIME', '#e8c170', '28px');
    line(`${banner}    (need ${status.districtsNeededToWin} districts to win)`, '#e8c170');
    line(
      `Cash $${p.cash}  Heat ${p.heat}  Bribe ${p.bribeLevel}  Crew ${p.gangsterCount}  Held ${p.districtsHeld}`,
      '#9ccc65',
    );

    line('Districts:', '#ffffff');
    for (const d of districtViews(this.state)) {
      const holder = d.holderName ? `held by ${d.holderName}` : 'contested';
      line(`  ${d.name} — you ${d.playerControl} — ${holder} — ops ${d.operationCount}`, '#aaaaaa');
    }

    line('Rivals:', '#ffffff');
    for (const r of rivalViews(this.state)) {
      const dead = r.alive ? '' : ' (eliminated)';
      line(`  ${r.name} — cash $${r.cash} heat ${r.heat} crew ${r.gangsterCount}${dead}`, '#cc8888');
    }

    line('[SPACE] end week   [E] extort home district', '#666666');
  }
}
