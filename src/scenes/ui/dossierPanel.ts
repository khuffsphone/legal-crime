// EARNED-INTEL DOSSIER PANEL (lane D) — the ONE HUD mount for the dossier. A READ-ONLY text/stat overlay on
// the FIXED HUD/UI camera (SACRED — no shake/zoom/offset/freeze; it never touches the world camera). It paints
// what the player has LEARNED about rivals from the pure intel.ts dossier — aged, timestamped, confidence-
// faded — and NOTHING live: it derives every line from queryDossier (which never reads live state), drives no
// markers/silhouettes/SFX/telegraphs, and shows only district-level last-known locations with a staleness age.
//
// CANON COLOUR: rival references use the STATIC rival-red #9E1B1B ONLY (never the motion danger reds); player/
// labels use brass; body/meta use the HUD bone/fog palette.

import Phaser from 'phaser';
import { NOIR_PALETTE, NOIR_FONT, NOIR_DISPLAY } from '../theme';
import {
  queryDossier, dossierSubjects, type IntelDossier, type DossierViewRow, type Staleness,
} from '../../sim/intel';

/** The STATIC rival identity red (#9E1B1B) — never a motion danger-red. Matches cityArt `blood`. */
const RIVAL_RED = '#9E1B1B';
const PANEL_W = 340;
const TOP = 64;
const DEPTH = 100130; // above the right-side drawers; still a fixed-HUD object

const CATEGORY_LABEL: Record<DossierViewRow['category'], string> = {
  'enforcer-presence': 'Muscle',
  'legal-exposure': 'Legal',
  'political-ties': 'Politics',
  'federal-standing': 'Federal',
  'ambient-activity': 'Sighting',
};

/** Resolvers the scene supplies so the panel shows NAMES, not ids. */
export interface DossierPanelLookups {
  rivalName: (id: string) => string;
  districtName: (id: string) => string;
}

/** A 5-pip confidence meter, e.g. 0.62 → "●●●○○". */
function confidenceBar(confidence: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(confidence * 5)));
  return '●'.repeat(filled) + '○'.repeat(5 - filled);
}

/** Human age + staleness, e.g. "wk 3 · aging". (Age is in sim ticks = weeks.) */
function ageTag(ageTicks: number, staleness: Staleness): string {
  return `${ageTicks}w · ${staleness}`;
}

export class DossierPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private frame: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private subtitle: Phaser.GameObjects.Text;
  private lines: Phaser.GameObjects.Text[] = [];
  private open = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.frame = scene.add.graphics();
    this.title = scene.add.text(0, 0, 'DOSSIER', { fontFamily: NOIR_DISPLAY, fontSize: '16px', color: NOIR_PALETTE.brass, fontStyle: 'bold' }).setOrigin(0, 0);
    this.subtitle = scene.add.text(0, 0, 'what you’ve learned · aged intel, not live', { fontFamily: NOIR_FONT, fontSize: '11px', color: NOIR_PALETTE.fog }).setOrigin(0, 0);
    this.container = scene.add.container(0, 0, [this.frame, this.title, this.subtitle])
      .setScrollFactor(0).setDepth(DEPTH).setVisible(false);
  }

  /** The root display object — the scene registers it with hudFx so the WORLD camera ignores it (fixed HUD). */
  get root(): Phaser.GameObjects.Container {
    return this.container;
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Toggle visibility; re-renders from the current dossier when opening. */
  toggle(dossier: IntelDossier, tick: number, lookups: DossierPanelLookups): void {
    this.open = !this.open;
    this.container.setVisible(this.open);
    if (this.open) this.render(dossier, tick, lookups);
  }

  hide(): void {
    this.open = false;
    this.container.setVisible(false);
  }

  /** Rebuild the read-only body from the pure dossier query. No live state is read here. */
  render(dossier: IntelDossier, tick: number, lookups: DossierPanelLookups): void {
    for (const t of this.lines) t.destroy();
    this.lines = [];

    const W = this.scene.scale.width;
    const x = W - PANEL_W - 8;
    let y = TOP + 52;
    const pushLine = (text: string, color: string, indent: number, size: number): void => {
      const t = this.scene.add.text(x + 14 + indent, y, text, { fontFamily: NOIR_FONT, fontSize: `${size}px`, color, wordWrap: { width: PANEL_W - 30 - indent } }).setOrigin(0, 0);
      this.container.add(t);
      this.lines.push(t);
      y += t.height + 4;
    };

    const subjects = dossierSubjects(dossier);
    if (subjects.length === 0) {
      pushLine('No intel yet. Grease the channels, run collectors, hold ground —', NOIR_PALETTE.fog, 0, 12);
      pushLine('what you learn shows up here, and ages.', NOIR_PALETTE.fog, 0, 12);
    } else {
      for (const sid of subjects) {
        const view = queryDossier(dossier, sid, tick);
        // rival name header — STATIC rival-red.
        pushLine(lookups.rivalName(sid), RIVAL_RED, 0, 14);
        for (const row of view.rows) {
          const where = row.lastKnownDistrictId ? ` — last seen ${lookups.districtName(row.lastKnownDistrictId)}` : '';
          pushLine(`${CATEGORY_LABEL[row.category]}: ${row.note}${where}`, NOIR_PALETTE.bone, 10, 12);
          pushLine(`${confidenceBar(row.confidence)}  ${ageTag(row.ageTicks, row.staleness)}`, NOIR_PALETTE.fog, 10, 11);
        }
        y += 6;
      }
    }

    // frame sized to content, drawn behind the text.
    const h = Math.max(120, y - TOP + 12);
    this.frame.clear()
      .fillStyle(0x0a0807, 0.96).fillRect(x, TOP, PANEL_W, h)
      .lineStyle(2, Phaser.Display.Color.HexStringToColor(NOIR_PALETTE.brass).color, 0.9).strokeRect(x, TOP, PANEL_W, h);
    this.title.setPosition(x + 14, TOP + 12);
    this.subtitle.setPosition(x + 14, TOP + 34);
  }
}
