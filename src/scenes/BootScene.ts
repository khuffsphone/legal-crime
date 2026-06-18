// Phaser scene. Rendering only — no game rules live here. Reads sim state and (in later
// phases) dispatches commands back into the pure simulation.

import Phaser from 'phaser';
import { createInitialState, type GameState } from '../sim';

export class BootScene extends Phaser.Scene {
  private state!: GameState;

  constructor() {
    super('BootScene');
  }

  create(): void {
    // Deterministic world from a fixed seed for now.
    this.state = createInitialState(1);

    this.add.text(16, 16, 'LEGAL CRIME', {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#e8c170',
    });

    this.add.text(16, 64, `Tick: ${this.state.tick}`, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#cccccc',
    });

    this.add.text(16, 96, `Cash: $${this.state.player.cash}`, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#9ccc65',
    });

    this.state.districts.forEach((d, i) => {
      this.add.text(16, 140 + i * 24, `${d.name} — ${d.businesses.length} businesses`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#aaaaaa',
      });
    });
  }
}
