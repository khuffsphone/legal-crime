// unitSpriteView.ts — Phaser-side per-unit driver for the sprite-sheet view. Phaser-side only. Owns the
// lazy Sprite GameObject and, each frame, selects the action+direction, plays the clip, and parks the
// sprite at the SAME anchor/depth the procedural figure uses (origin 0.5,1.0 = foot baseline). Faction is
// carried by the existing base-plate ring (caller), NEVER by recolouring the body. NO-X-RAY: the caller
// passes `visible=false` for an unrevealed rival so a hidden unit draws nothing.

import { facingToDirIndex } from './unitFacingQuantize';
import { actionForState, resolvePlayableAction } from './unitSpriteState';
import type { UnitSpriteAction } from './unitSpriteState';
import { playUnitAnim } from './unitSpriteAnimator';
import { sheetTextureKey } from './unitSpriteLoader';
import type { Facing } from '../../sim/inspect';

/** Empty set fallback so an absent `availableActions` (legacy callers) just plays whatever clip exists. */
const ANY_ACTION: ReadonlySet<string> = new Set(['idle', 'walk', 'run', 'hurt', 'attack']);

export interface UnitSpriteDriveCtx {
  unitName: string;
  facing: Facing;
  attacking: boolean;
  moving: boolean;
  loco: number;
  /** optional injured state (no scene trigger wired yet; the hurt clip is supported end-to-end). */
  hurt?: boolean;
  x: number;
  y: number;
  depth: number;
  alpha: number;
  visible: boolean;
  scale: number;
  /** which clips actually rendered + registered — desired actions degrade to these (run→walk→idle, etc.). */
  availableActions?: ReadonlySet<string>;
  /** runtime facing calibration (default 0; correct for the placeholder). */
  dirOffset?: number;
}

/** Create (once) the unit's sprite, anchored foot-baseline. Returns the Sprite. */
export function ensureUnitSprite(
  scene: Phaser.Scene,
  unitName: string,
  startAction: UnitSpriteAction = 'idle',
): Phaser.GameObjects.Sprite {
  const sprite = scene.add.sprite(0, 0, sheetTextureKey(unitName, startAction), 0);
  sprite.setOrigin(0.5, 1.0); // foot anchor bottom-centre
  return sprite;
}

/** Drive one unit's sprite for this frame: action+direction clip, transform, visibility. */
export function driveUnitSprite(sprite: Phaser.GameObjects.Sprite, ctx: UnitSpriteDriveCtx): void {
  if (!ctx.visible) {
    sprite.setVisible(false);
    return;
  }
  const desired = actionForState({ attacking: ctx.attacking, moving: ctx.moving, loco: ctx.loco, hurt: ctx.hurt });
  const action = resolvePlayableAction(desired, ctx.availableActions ?? ANY_ACTION);
  const dir = facingToDirIndex(ctx.facing, ctx.dirOffset ?? 0);
  playUnitAnim(sprite, ctx.unitName, action, dir);
  sprite
    .setVisible(true)
    .setPosition(ctx.x, ctx.y)
    .setDepth(ctx.depth)
    .setScale(ctx.scale)
    .setAlpha(ctx.alpha);
}
