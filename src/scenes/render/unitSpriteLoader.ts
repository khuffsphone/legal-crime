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

/** The CORE clip every sprite unit must have for the view to engage; the rest are optional and degrade via
 * the fallback chain (see unitSpriteState.resolvePlayableAction). */
export const CORE_ACTION = 'idle';

export const THUG_SPRITE_CONFIG: SpriteUnitConfig = {
  unitName: 'thug',
  baseUrl: 'assets/sprites/units/',
  // CANDIDATE clips to attempt — only those actually rendered need exist; a missing optional sheet 404s
  // gracefully (texture absent → not registered → fallback chain covers it). The real Mixamo gangster pass
  // ships idle+walk(+run/hurt); attack arrives later and falls back to idle until then.
  actions: ['idle', 'walk', 'run', 'hurt', 'attack'],
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

/** The candidate actions that actually loaded — present in BOTH the manifest and as a texture. Drives which
 * clips can play; the rest degrade via the fallback chain. */
export function availableActions(scene: Phaser.Scene, cfg: SpriteUnitConfig = THUG_SPRITE_CONFIG): Set<string> {
  const manifest = scene.cache.json.get(manifestCacheKey(cfg.unitName)) as UnitSpriteManifest | undefined;
  const out = new Set<string>();
  if (!manifest || !manifest.actions) return out;
  for (const a of cfg.actions) {
    if (manifest.actions[a] && scene.textures.exists(sheetTextureKey(cfg.unitName, a))) out.add(a);
  }
  return out;
}

/** True once the manifest + the CORE (idle) sheet loaded — optional clips need NOT be present (they fall back).
 * This is what lets a real render ship idle+walk (no attack yet) and still engage the sprite view. */
export function unitSpritesReady(scene: Phaser.Scene, cfg: SpriteUnitConfig = THUG_SPRITE_CONFIG): boolean {
  const manifest = scene.cache.json.get(manifestCacheKey(cfg.unitName)) as UnitSpriteManifest | undefined;
  if (!manifest || !manifest.actions) return false;
  return availableActions(scene, cfg).has(CORE_ACTION);
}

/**
 * Register one Phaser animation per action×direction, for EVERY action that actually loaded (manifest + texture).
 * Idempotent (skips existing keys). Returns the manifest (or null if the core clip isn't ready). Call from
 * create() after load completes.
 */
export function registerUnitAnims(scene: Phaser.Scene, cfg: SpriteUnitConfig = THUG_SPRITE_CONFIG): UnitSpriteManifest | null {
  if (!unitSpritesReady(scene, cfg)) return null;
  const manifest = scene.cache.json.get(manifestCacheKey(cfg.unitName)) as UnitSpriteManifest;
  for (const action of availableActions(scene, cfg)) {
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
