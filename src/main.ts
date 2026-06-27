// Browser entry point. Wires Phaser to the scenes. The pure sim is rendered by scenes;
// no game rules live here.

import Phaser from 'phaser';
import { MainMenuScene } from './scenes/MainMenuScene';
import { BootScene } from './scenes/BootScene';
import { IsoScene } from './scenes/IsoScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#111111',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
    // RTS-25: snap sprites/text to whole pixels — kills the sub-pixel shimmer that blurs HUD text.
    // (Per-Text `resolution` = devicePixelRatio is set in IsoScene so text rasterises crisp on HiDPI.)
    roundPixels: true,
  },
  // Lane G: MainMenuScene is the boot ENTRY (Phaser auto-starts the first scene); it launches IsoScene on
  // New Game / Continue. The isometric world + the strategic card scene (BootScene, reachable via [B]/[M])
  // stay registered but inactive until started.
  scene: [MainMenuScene, IsoScene, BootScene],
};

// RTS-25: don't paint the HUD until the noir web fonts are ready, or Phaser measures/rasterises text
// against the fallback and never reflows. Cap the wait so an offline / blocked boot still starts.
function start(): void {
  new Phaser.Game(config);
}
const doc = typeof document !== 'undefined' ? document : undefined;
const fontsReady: Promise<unknown> = doc?.fonts
  ? Promise.race([doc.fonts.ready, new Promise((res) => setTimeout(res, 1500))])
  : Promise.resolve();
void fontsReady.then(start);
