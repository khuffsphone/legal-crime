// Phaser scene — Fedora Noir. Rendering and input only; all rules live in the pure sim,
// reached through the scene-agnostic adapter. Re-renders from a fresh view model after
// every command or advanced week.

import Phaser from 'phaser';
import {
  newGame,
  playerView,
  districtViews,
  rivalViews,
  statusView,
  narrate,
  advanceTurn,
  dispatch,
  moneyLine,
  heatLabel,
  bribeChannelLabel,
  shockFlavor,
  tierName,
  NOIR_PALETTE,
  NOIR_FONT,
} from './adapter';
import type { BribeChannel, GameState, ShockKind } from '../sim';

const CHANNELS: BribeChannel[] = ['police', 'judges', 'politicians', 'feds'];

export class BootScene extends Phaser.Scene {
  private state!: GameState;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('BootScene');
  }

  create(): void {
    // Real play runs with systemic shocks on (Phase 16).
    this.state = newGame(1, { shocks: true });
    this.cameras.main.setBackgroundColor(NOIR_PALETTE.ink);

    // SPACE ends the week; E extorts the home district; C collects it.
    this.input.keyboard?.on('keydown-SPACE', () => {
      advanceTurn(this.state);
      this.render();
    });
    this.input.keyboard?.on('keydown-E', () => {
      const front = this.state.districts[0].businesses.find((b) => b.kind === 'front');
      if (front) dispatch(this.state, { type: 'extort', familyId: 'player', businessId: front.id });
      this.render();
    });
    this.input.keyboard?.on('keydown-C', () => {
      dispatch(this.state, { type: 'collect', familyId: 'player', districtId: 'district-0' });
      this.render();
    });

    this.render();
  }

  private render(): void {
    this.texts.forEach((t) => t.destroy());
    this.texts = [];

    const p = playerView(this.state);
    const status = statusView(this.state);

    let y = 14;
    const line = (s: string, color: string = NOIR_PALETTE.fog, size = '16px') => {
      this.texts.push(this.add.text(16, y, s, { fontFamily: NOIR_FONT, fontSize: size, color }));
      y += Number.parseInt(size, 10) + 6;
    };

    line('LEGAL CRIME', NOIR_PALETTE.brass, '30px');
    line(narrate(this.state), NOIR_PALETTE.bone);
    line(
      `${moneyLine(p.cleanCash, p.dirtyCash)}  ·  Debt $${p.debt}  ·  ${heatLabel(p.heat)} (${p.heat})`,
      NOIR_PALETTE.brass,
    );
    line(
      `Crew ${p.gangsterCount}  ·  Held ${p.districtsHeld}/${status.districtsNeededToWin}  ·  Uncollected $${p.uncollected}`,
      NOIR_PALETTE.fog,
    );

    const activeShocks = status.shocks;
    if (activeShocks.length > 0) {
      line(`ACTIVE: ${activeShocks.map((s) => shockFlavor(s.kind as ShockKind)).join(', ')}`, NOIR_PALETTE.blood);
    }

    line('Protection:', NOIR_PALETTE.bone);
    line('  ' + CHANNELS.map((c) => `${bribeChannelLabel(c)} ${p.bribes[c]}`).join('  ·  '), NOIR_PALETTE.fog);

    line('Districts:', NOIR_PALETTE.bone);
    for (const d of districtViews(this.state)) {
      const holder = d.holderName ? `held by ${d.holderName}` : 'contested';
      const tiers = d.playerOperationTiers.map((t) => tierName(t)).join('/') || '—';
      line(
        `  ${d.name} — you ${d.playerControl} — ${holder} — ops ${tiers} — $${d.playerUncollected} waiting`,
        NOIR_PALETTE.fog,
      );
    }

    line('Rivals:', NOIR_PALETTE.bone);
    for (const r of rivalViews(this.state)) {
      const dead = r.alive ? '' : ' (in the river)';
      line(`  ${r.name} — crew ${r.gangsterCount} — ${heatLabel(r.heat)}${dead}`, NOIR_PALETTE.blood);
    }

    line('[SPACE] end week   [E] extort home   [C] collect home', '#6b6258');
  }
}
