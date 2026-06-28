// Phaser scene — Fedora Noir, rendered. Draws a district map with environment/building/unit
// sprites (labeled placeholders until real art is dropped in public/assets), and a styled HUD
// in the noir palette. Rendering and input only; all rules live in the pure, Phaser-free sim,
// reached through the scene-agnostic adapter.

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
import { GAME_TITLE } from './theme';
import {
  ASSET_MANIFEST,
  assetUrl,
  resolveSprite,
  districtEnvKey,
  buildingKeyForKind,
  unitKeyForSkill,
  type SpriteResolution,
} from './assets';
import type { BribeChannel, GameState, ShockKind } from '../sim';

const CHANNELS: BribeChannel[] = ['police', 'judges', 'politicians', 'feds'];

/** Parse a '#rrggbb' string to a Phaser numeric colour. */
function hex(c: string): number {
  return Number.parseInt(c.replace('#', ''), 16);
}

export class BootScene extends Phaser.Scene {
  private state!: GameState;
  /** Sprites/graphics drawn for the current frame, destroyed and rebuilt on each render. */
  private layer: Phaser.GameObjects.GameObject[] = [];
  /** Keys whose textures actually loaded (the rest fall back to placeholders). */
  private loaded: Set<string> = new Set();

  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Attempt every asset; missing files simply 404 and fall back to placeholders.
    this.load.on('loaderror', () => {
      /* expected for not-yet-dropped art — handled by the placeholder fallback */
    });
    for (const def of ASSET_MANIFEST) {
      this.load.image(def.key, assetUrl(def));
    }
  }

  create(): void {
    this.state = newGame(1, { shocks: true });
    this.cameras.main.setBackgroundColor(NOIR_PALETTE.ink);
    // After preload, a present texture means the art loaded; everything else uses placeholders.
    this.loaded = new Set(ASSET_MANIFEST.filter((d) => this.textures.exists(d.key)).map((d) => d.key));

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
    // [M] return to the isometric map (RTS-1).
    this.input.keyboard?.on('keydown-M', () => this.scene.start('IsoScene'));

    this.render();
  }

  // ── drawing helpers ───────────────────────────────────────────────────────────────────

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.layer.push(obj);
    return obj;
  }

  private panel(x: number, y: number, w: number, h: number, fill: string = NOIR_PALETTE.charcoal): void {
    const r = this.add.rectangle(x, y, w, h, hex(fill), 0.92).setOrigin(0, 0);
    r.setStrokeStyle(1, hex(NOIR_PALETTE.brass), 0.4);
    this.track(r);
  }

  private label(x: number, y: number, text: string, color: string = NOIR_PALETTE.fog, size = '15px'): Phaser.GameObjects.Text {
    return this.track(this.add.text(x, y, text, { fontFamily: NOIR_FONT, fontSize: size, color }));
  }

  /** Place a sprite, or a labeled colored placeholder rectangle if the art is missing. */
  private sprite(key: string, x: number, y: number, w: number, h: number, showLabel = true): void {
    const r: SpriteResolution = resolveSprite(key, this.loaded);
    if (r.kind === 'sprite') {
      this.track(this.add.image(x, y, r.key).setOrigin(0, 0).setDisplaySize(w, h));
      return;
    }
    const rect = this.add.rectangle(x, y, w, h, hex(r.color), 1).setOrigin(0, 0);
    rect.setStrokeStyle(1, hex(NOIR_PALETTE.ink));
    this.track(rect);
    if (showLabel && h >= 18) {
      this.track(
        this.add.text(x + 4, y + h - 16, r.label, { fontFamily: NOIR_FONT, fontSize: '11px', color: NOIR_PALETTE.bone }),
      );
    }
  }

  private meter(x: number, y: number, w: number, h: number, frac: number, color: string): void {
    this.track(this.add.rectangle(x, y, w, h, hex(NOIR_PALETTE.ink), 1).setOrigin(0, 0).setStrokeStyle(1, hex(NOIR_PALETTE.fog), 0.5));
    const fillW = Math.max(0, Math.min(1, frac)) * (w - 2);
    this.track(this.add.rectangle(x + 1, y + 1, fillW, h - 2, hex(color), 1).setOrigin(0, 0));
  }

  // ── render ────────────────────────────────────────────────────────────────────────────

  private render(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];

    const p = playerView(this.state);
    const status = statusView(this.state);

    // Top HUD bar.
    this.panel(8, 8, 944, 92, NOIR_PALETTE.charcoal);
    this.label(20, 14, GAME_TITLE, NOIR_PALETTE.brass, '26px');
    this.label(250, 20, narrate(this.state), NOIR_PALETTE.bone);
    this.label(250, 44, moneyLine(p.cleanCash, p.dirtyCash), NOIR_PALETTE.brass);
    this.label(250, 66, `Debt $${p.debt}   ${heatLabel(p.heat)} (${p.heat})   Crew ${p.gangsterCount}   Held ${p.districtsHeld}/${status.districtsNeededToWin}   Uncollected $${p.uncollected}`, NOIR_PALETTE.fog, '13px');

    // Federal exposure meter + warning ladder.
    const expColor = p.federalTier >= 3 ? NOIR_PALETTE.blood : p.federalTier >= 1 ? NOIR_PALETTE.brass : NOIR_PALETTE.fog;
    this.label(700, 14, `FEDERAL EXPOSURE ${p.federalExposure}/100${p.bustArmed ? '  BUST ARMED' : ''}`, expColor, '12px');
    this.meter(700, 32, 240, 12, p.federalExposure / 100, expColor);
    const ladder = ['questions', 'agents', 'imminent'];
    ladder.forEach((t, i) => {
      const lit = p.federalTier >= i + 1;
      this.label(700 + i * 82, 50, `${i + 1}·${t}`, lit ? NOIR_PALETTE.blood : NOIR_PALETTE.fog, '11px');
    });
    if (p.federalWarning) this.label(700, 66, `⚠ ${p.federalWarning}`, NOIR_PALETTE.blood, '11px');
    else if (p.launderPrompt) this.label(700, 66, `Launder! cap $${p.launderCapacity}/run`, NOIR_PALETTE.brass, '11px');

    // Active shocks banner.
    if (status.shocks.length > 0) {
      this.label(20, 104, `THE CITY: ${status.shocks.map((s) => shockFlavor(s.kind as ShockKind)).join(' · ')}`, NOIR_PALETTE.blood, '13px');
    }

    // District map: a row of district cards with env backdrop + building + status.
    const districts = districtViews(this.state);
    const cardW = 182;
    const cardH = 196;
    const gap = 8;
    const startX = 8;
    const mapY = 124;
    districts.forEach((d, i) => {
      const x = startX + i * (cardW + gap);
      // Environment backdrop.
      this.sprite(districtEnvKey(i), x, mapY, cardW, cardH, false);
      // Darkened header strip for legibility.
      this.track(this.add.rectangle(x, mapY, cardW, 22, hex(NOIR_PALETTE.ink), 0.7).setOrigin(0, 0));
      this.label(x + 6, mapY + 4, d.name, NOIR_PALETTE.bone, '13px');

      // HQ marker on the player's home district.
      if (i === 0) this.sprite('LCR_bldg_hq', x + cardW - 52, mapY + 26, 44, 44);

      // A building sprite per player-owned operation (up to 3), tier-labeled.
      const ops = this.state.districts[i].businesses.filter((b) => b.kind !== 'front' && b.ownerFamily === 'player');
      ops.slice(0, 3).forEach((op, k) => {
        this.sprite(buildingKeyForKind(op.kind), x + 8 + k * 50, mapY + 70, 44, 44);
      });

      // Status footer panel.
      this.track(this.add.rectangle(x, mapY + cardH - 56, cardW, 56, hex(NOIR_PALETTE.charcoal), 0.85).setOrigin(0, 0));
      const holder = d.holderName ? `held: ${d.holderName}` : 'contested';
      this.label(x + 6, mapY + cardH - 52, `Control ${d.playerControl}  ${holder}`, NOIR_PALETTE.fog, '11px');
      const tiers = d.playerOperationTiers.map((t) => tierName(t)).join('/') || 'no rackets';
      this.label(x + 6, mapY + cardH - 38, `Rackets: ${tiers}`, NOIR_PALETTE.fog, '11px');
      const waitColor = d.playerUncollected > 0 ? NOIR_PALETTE.brass : NOIR_PALETTE.fog;
      this.label(x + 6, mapY + cardH - 22, `$${d.playerUncollected} waiting`, waitColor, '11px');

      // Hover + click affordance on each district card.
      const hit = this.add.rectangle(x, mapY, cardW, cardH, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
      hit.on('pointerover', () => hit.setFillStyle(hex(NOIR_PALETTE.brass), 0.12));
      hit.on('pointerout', () => hit.setFillStyle(0xffffff, 0.001));
      hit.on('pointerdown', () => {
        dispatch(this.state, { type: 'collect', familyId: 'player', districtId: d.id });
        this.render();
      });
      this.track(hit);
    });

    // Crew strip: a unit sprite per player gangster (+ a collector if takings are waiting).
    const crewY = mapY + cardH + 12;
    this.panel(8, crewY, 944, 78, NOIR_PALETTE.charcoal);
    this.label(16, crewY + 6, 'YOUR CREW', NOIR_PALETTE.bone, '12px');
    const crew = this.state.player.gangsters;
    crew.slice(0, 16).forEach((g, i) => {
      this.sprite(unitKeyForSkill(g.skill), 16 + i * 50, crewY + 24, 44, 44);
    });
    if (crew.length === 0) this.label(16, crewY + 40, 'no crew — recruit some muscle', NOIR_PALETTE.fog, '12px');
    if (p.uncollected > 0) this.sprite('LCR_unit_collector', 944 - 56, crewY + 24, 44, 44);

    // Protection (bribe channels) chips.
    const protY = crewY + 86;
    this.panel(8, protY, 944, 40, NOIR_PALETTE.charcoal);
    CHANNELS.forEach((c, i) => {
      const cx = 16 + i * 220;
      this.track(this.add.rectangle(cx, protY + 8, 210, 24, hex(NOIR_PALETTE.ink), 0.8).setOrigin(0, 0).setStrokeStyle(1, hex(NOIR_PALETTE.brass), 0.3));
      const isBureau = c === 'feds';
      const extra = isBureau && p.bureauShielded ? `  shield ${Math.round(p.bureauShield * 100)}%` : '';
      this.label(cx + 8, protY + 12, `${bribeChannelLabel(c)}: ${p.bribes[c]}${extra}`, isBureau && p.bureauShielded ? NOIR_PALETTE.brass : NOIR_PALETTE.fog, '12px');
    });

    // Rivals + controls.
    const rivals = rivalViews(this.state);
    this.label(16, protY + 50, 'Rivals: ' + rivals.map((r) => `${r.name} (crew ${r.gangsterCount}${r.alive ? '' : ', down'})`).join('   '), NOIR_PALETTE.blood, '12px');
    this.label(16, protY + 70, '[SPACE] end week    [E] extort home    [C] collect home    (click a district to collect)', '#6b6258', '12px');

    // Game-over / victory full-screen overlay.
    if (status.over) {
      this.track(this.add.rectangle(0, 0, 2000, 1200, hex(NOIR_PALETTE.ink), 0.78).setOrigin(0, 0));
      this.sprite('LCR_screen_gameover', 280, 150, 400, 240);
      this.label(300, 400, narrate(this.state), NOIR_PALETTE.bone, '20px');
    }
  }
}
