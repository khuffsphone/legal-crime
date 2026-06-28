// unitSpriteLoader.ts — Phaser-side loader for the iso unit sprite SHEETS + manifest. Phaser-side only
// (never imported by /src/sim). Loads each action sheet (rows=8 dirs × cols=frames, uniform 256 cells) +
// the manifest JSON, then registers one looping/one-shot animation per action×direction. Degrades
// gracefully: a missing sheet/manifest simply leaves the unit "not ready" → the procedural figure stays
// authoritative (the ?sprites swap is best-effort, never required).

import type { UnitSpriteManifest } from './spriteManifest';
import { animKey, frameIndexFor } from './spriteManifest';

/** A unit type that has rendered sheets. Add entries as more units get the 3D pass. */
export interface SpriteUnitConfig {
  unitName: string;
  /** public-relative dir holding `<unit>_<action>.png` + `<unit>_manifest.json`. */
  baseUrl: string;
  actions: string[];
  /** uniform cell size (px) the render emits; must match manifest.frameCanvas. */
  cell: number;
}

export const THUG_SPRITE_CONFIG: SpriteUnitConfig = {
  unitName: 'thug',
  baseUrl: 'assets/sprites/units/',
  actions: ['idle', 'walk', 'attack'],
  cell: 256,
};

export function manifestCacheKey(unitName: string): string {
  return `${unitName}_manifest`;
}
export function sheetTextureKey(unitName: string, action: string): string {
  return `${unitName}_${action}`;
}

/** Queue the manifest + every action sheet for loading. Call from Scene.preload(). */
export function preloadUnitSprites(scene: Phaser.Scene, cfg: SpriteUnitConfig = THUG_SPRITE_CONFIG): void {
  scene.load.json(manifestCacheKey(cfg.unitName), `${cfg.baseUrl}${cfg.unitName}_manifest.json`);
  for (const action of cfg.actions) {
    scene.load.spritesheet(
      sheetTextureKey(cfg.unitName, action),
      `${cfg.baseUrl}${cfg.unitName}_${action}.png`,
      { frameWidth: cfg.cell, frameHeight: cfg.cell },
    );
  }
}

/** True once the manifest + all action textures loaded (post-load, from create()). */
export function unitSpritesReady(scene: Phaser.Scene, cfg: SpriteUnitConfig = THUG_SPRITE_CONFIG): boolean {
  const manifest = scene.cache.json.get(manifestCacheKey(cfg.unitName)) as UnitSpriteManifest | undefined;
  if (!manifest || !manifest.actions) return false;
  return cfg.actions.every((a) => scene.textures.exists(sheetTextureKey(cfg.unitName, a)) && !!manifest.actions[a]);
}

/**
 * Register one Phaser animation per action×direction from the manifest. Idempotent (skips existing keys).
 * Returns the manifest (or null if not ready). Call from create() after load completes.
 */
export function registerUnitAnims(scene: Phaser.Scene, cfg: SpriteUnitConfig = THUG_SPRITE_CONFIG): UnitSpriteManifest | null {
  if (!unitSpritesReady(scene, cfg)) return null;
  const manifest = scene.cache.json.get(manifestCacheKey(cfg.unitName)) as UnitSpriteManifest;
  for (const action of cfg.actions) {
    const am = manifest.actions[action];
    const tex = sheetTextureKey(cfg.unitName, action);
    for (let dir = 0; dir < am.rows; dir++) {
      const key = animKey(cfg.unitName, action, dir);
      if (scene.anims.exists(key)) continue;
      const frames: number[] = [];
      for (let f = 0; f < am.cols; f++) frames.push(frameIndexFor(am, dir, f));
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(tex, { frames }),
        frameRate: am.playbackFps,
        repeat: am.loop ? -1 : 0,
      });
    }
  }
  return manifest;
}
