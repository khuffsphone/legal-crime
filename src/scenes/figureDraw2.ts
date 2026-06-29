// PROCEDURAL FIGURE RENDERER v2 (?fig2 A/B proof — THUG). Strokes the upgraded ICONIC noir gangster from the
// SAME pure RigPose (gait.ts) the default renderer uses — so the existing idle/walk/attack animation keeps
// working — but in the brain figure-guide's style: a BOLD coat silhouette (filled trapezoid, not stick
// limbs), 2–3 tone cel shading (NW-lit / SE-shadow / occlusion), a first-read fedora brim, a soft leg split,
// a dark ink outline, and only a few interior accent lines. Faction is NOT on the figure — it stays on the
// scene's base plate/ring (drawn separately); the hatband here is noir. Vector-only; world camera only.
//
// Geometry is in the same pose space as drawThugRig (offsets from the ground point, +x = facing-forward,
// y up = negative). ?figscale is applied by the SCENE as a uniform g.setScale, so this draws at native size.

import Phaser from 'phaser';
import { HIP_H, TORSO_H, SHOULDER_HW, HIP_HW, HEAD_H, ARM_DROP, solveTwoBoneLegIK, type RigPose } from './gait';
import { FIG2_BODY, type FigurePlan } from './figureStyle';
import type { WeaponAttackPoseSample } from './weaponAttackPose';

type Pt = { x: number; y: number };

/** Tones[] from the plan: [occlusion, coatShadow, clothDark, clothMid, litSepia] (or desaturated downed). */
function tones(plan: FigurePlan) {
  const t = plan.bodyTones;
  return { occ: t[0] ?? FIG2_BODY.occlusion, shadow: t[1] ?? FIG2_BODY.coatShadow, dark: t[2] ?? FIG2_BODY.clothDark, mid: t[3] ?? FIG2_BODY.clothMid, lit: t[4] ?? FIG2_BODY.litSepia };
}

/**
 * Draw the upgraded thug into `g` (already cleared, positioned at the unit ground point, x-scaled ±sc for
 * facing). Posed by `p`; styled by `plan` (tones, outline, line widths — all noir, faction-free). `atk`
 * gives the weapon prop a readable kick when attacking. No raster, no faction fill, no danger colour.
 */
export function drawThugFig2(g: Phaser.GameObjects.Graphics, p: RigPose, plan: FigurePlan, atk?: WeaponAttackPoseSample): void {
  const c = tones(plan);
  const outerW = plan.lineWidths.outer;
  const innerW = plan.lineWidths.inner;

  // ── pose joints (same maths as the default rig so animation matches) ──
  const pelvisCx = p.bodyX + p.hipTwist;
  const pelvisCy = -HIP_H + p.bodyY;
  const shoulderCx = p.bodyX + p.lean + (atk?.leanPx ?? 0) + p.shoulderTwist + (atk?.shoulderTwistPx ?? 0);
  const shoulderCy = pelvisCy - TORSO_H;
  const hipL: Pt = { x: pelvisCx - HIP_HW, y: pelvisCy };
  const hipR: Pt = { x: pelvisCx + HIP_HW, y: pelvisCy };
  const shL: Pt = { x: shoulderCx - SHOULDER_HW, y: shoulderCy };
  const shR: Pt = { x: shoulderCx + SHOULDER_HW, y: shoulderCy };
  const footL: Pt = { x: p.legL.footDX, y: -p.legL.footLift };
  const footR: Pt = { x: p.legR.footDX, y: -p.legR.footLift };
  const kneeL = solveTwoBoneLegIK(hipL.x, hipL.y, footL.x, footL.y);
  const kneeR = solveTwoBoneLegIK(hipR.x, hipR.y, footR.x, footR.y);
  const armR = atk && atk.phase !== 'done' ? atk.armR : p.armR;
  const handR: Pt = { x: shR.x + armR.handDX, y: shoulderCy + ARM_DROP - armR.handLift };
  const legBackFirst = footL.x <= footR.x;

  // coat-hem half-width: wider than the hips for a readable lower silhouette.
  const hemHW = SHOULDER_HW + 3;
  const hemL: Pt = { x: pelvisCx - hemHW, y: pelvisCy + 3 };
  const hemR: Pt = { x: pelvisCx + hemHW, y: pelvisCy + 3 };

  // ── 1. legs as wedges below the hem (back dim, front lit) ──
  const drawLeg = (hip: Pt, knee: Pt, foot: Pt, lit: boolean) => {
    g.fillStyle(lit ? c.dark : c.shadow, 1);
    g.fillPoints([{ x: hip.x - 2.4, y: hip.y }, { x: hip.x + 2.4, y: hip.y }, { x: knee.x + 2, y: knee.y }, { x: foot.x + 2.2, y: foot.y }, { x: foot.x - 2.2, y: foot.y }, { x: knee.x - 2, y: knee.y }], true);
    g.fillStyle(plan.outline, 1); g.fillEllipse(foot.x + 1, foot.y, 9, 3.2); // shoe (ink)
  };
  if (legBackFirst) drawLeg(hipL, kneeL, footL, false); else drawLeg(hipR, kneeR, footR, false);
  if (legBackFirst) drawLeg(hipR, kneeR, footR, true); else drawLeg(hipL, kneeL, footL, true);

  // ── 2. the COAT mass — a bold trapezoid shoulders→hem (mid fill, SE shadow half, occlusion lapel V) ──
  const coat: Pt[] = [shL, shR, hemR, hemL];
  g.fillStyle(c.mid, 1); g.fillPoints(coat, true);
  // SE shadow half (the body's own cel split — light from NW)
  g.fillStyle(c.shadow, 0.55); g.fillPoints([{ x: shoulderCx, y: shoulderCy }, shR, hemR, { x: pelvisCx, y: hemR.y }], true);
  // NW lit edge band
  g.lineStyle(2, c.lit, 0.7); g.beginPath(); g.moveTo(shL.x, shL.y + 1); g.lineTo(hemL.x + 1, hemL.y); g.strokePath();
  // occlusion triangle of the open coat (between lapels) + a dark hem crescent under the coat
  g.fillStyle(c.occ, 0.9); g.fillTriangle(shoulderCx, shoulderCy + 2, shoulderCx - 3, shoulderCy + 11, shoulderCx + 3, shoulderCy + 11);
  g.fillStyle(c.occ, 0.7); g.fillEllipse(pelvisCx, hemR.y + 1.5, hemHW * 1.7, 3);

  // ── 3. broad blocky SHOULDERS (lit top), then the head mass under the brim shadow ──
  g.fillStyle(c.mid, 1); g.fillEllipse(shoulderCx, shoulderCy, SHOULDER_HW * 2 + 6, 8); // padded shoulders
  g.fillStyle(c.lit, 0.85); g.fillEllipse(shoulderCx - 1, shoulderCy - 2, SHOULDER_HW * 2, 3); // NW-lit cap
  const headX = shoulderCx + p.headDX, headY = shoulderCy - HEAD_H + p.headDY;
  g.fillStyle(c.dark, 1); g.fillRect(headX - 1.8, headY + 3, 3.6, 3.2); // neck (in coat shadow)
  g.fillStyle(c.mid, 1); g.fillCircle(headX, headY, 4.6); // head/face mass (kept simple)
  g.fillStyle(c.occ, 0.85); g.fillEllipse(headX, headY - 1.4, 9.2, 3.4); // brim-cast occlusion band over the face

  // ── 4. front arm (a coat-toned wedge, not a thin wire), drawn over the coat ──
  const drawArm = (sh: Pt, hand: Pt) => {
    const mid: Pt = { x: (sh.x + hand.x) / 2 + 1.6, y: (sh.y + hand.y) / 2 };
    g.fillStyle(c.dark, 1);
    g.fillPoints([{ x: sh.x - 2.2, y: sh.y }, { x: sh.x + 2.2, y: sh.y }, { x: mid.x + 2, y: mid.y }, { x: hand.x + 2, y: hand.y }, { x: hand.x - 2, y: hand.y }, { x: mid.x - 2, y: mid.y }], true);
    g.fillStyle(FIG2_BODY.warmRim, 0.5); g.fillCircle(hand.x, hand.y, 2.2); // hand (low-alpha warm, not identity)
  };
  drawArm(shR, handR);

  // ── 5. the FEDORA last for a clean first-read silhouette (noir hatband — faction is the plate) ──
  const hatY = headY - 4.4;
  g.fillStyle(plan.outline, 1); g.fillEllipse(headX, hatY + 3.4, 18, 4.8); // wide brim (near-ink, first read)
  g.fillStyle(c.dark, 1); g.fillRoundedRect(headX - 5.2, hatY - 3, 10.4, 6.4, 2); // crown
  g.fillStyle(c.lit, 0.6); g.fillRect(headX - 5, hatY - 2.6, 4, 1.6); // NW crown highlight
  g.fillStyle(plan.hatband, 1); g.fillRect(headX - 5.2, hatY + 2.2, 10.4, 1.8); // NOIR hatband

  // ── 6. minimal interior accent lines (ink, clamped inner width): lapel V + coat centre seam ──
  g.lineStyle(innerW, plan.outline, 0.9);
  g.beginPath();
  g.moveTo(shoulderCx - 3, shoulderCy + 2); g.lineTo(pelvisCx, pelvisCy - 3); // left lapel
  g.moveTo(shoulderCx + 3, shoulderCy + 2); g.lineTo(pelvisCx, pelvisCy - 3); // right lapel (the V)
  g.moveTo(pelvisCx, pelvisCy - 2); g.lineTo(pelvisCx, hemR.y); // coat centre seam
  g.strokePath();

  // ── 7. the bold OUTER outline around the coat + brim (built from simple closed shapes) ──
  g.lineStyle(outerW, plan.outline, 1);
  g.strokePoints([shL, shR, hemR, hemL], true);

  // ── weapon prop (kept small — must not dominate the silhouette unless attacking) ──
  if (atk && atk.phase !== 'done' && atk.prop.kind !== 'none' && atk.prop.length > 0) {
    const muzzle: Pt = { x: handR.x + atk.prop.length, y: handR.y - atk.prop.length * 0.08 };
    g.lineStyle(atk.prop.kind === 'pistol' ? 3 : 4, plan.outline, 1);
    g.beginPath(); g.moveTo(handR.x, handR.y); g.lineTo(muzzle.x, muzzle.y); g.strokePath();
    if (atk.prop.kind === 'tommy') { g.fillStyle(c.occ, 1); g.fillCircle(handR.x + 4, handR.y + 4, 3.4); } // drum
  }
}
