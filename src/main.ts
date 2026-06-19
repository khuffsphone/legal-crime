// Browser entry point. Wires Phaser to the scenes. The pure sim is rendered by scenes;
// no game rules live here.

import Phaser from 'phaser';
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
  // RTS branch: the isometric world is the default view; the strategic card scene
  // (BootScene) stays registered and reachable ([B] from the map, [M] back).
  scene: [IsoScene, BootScene],
};

new Phaser.Game(config);
