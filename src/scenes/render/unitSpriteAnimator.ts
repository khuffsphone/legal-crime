// unitSpriteAnimator.ts — Phaser-side: pick + play the right action×direction clip on a unit's sprite.
// Phaser-side only. Switches the playing animation ONLY when the action or direction changes, so looping
// clips never restart mid-stride and a one-shot attack plays through and holds its final frame.

import { animKey } from './spriteManifest';
import type { UnitSpriteAction } from './unitSpriteState';

/**
 * Ensure `sprite` is playing the `unit:action:dir` clip. No-op if it already is (keeps loops continuous and
 * lets a non-looping attack finish + hold). Returns the resolved anim key.
 */
export function playUnitAnim(
  sprite: Phaser.GameObjects.Sprite,
  unitName: string,
  action: UnitSpriteAction,
  dirIndex: number,
): string {
  const key = animKey(unitName, action, dirIndex);
  if (sprite.anims.getName() !== key) {
    // ignoreIfPlaying=true is redundant given the guard, but cheap insurance against re-entrancy.
    sprite.play(key, true);
  }
  return key;
}
