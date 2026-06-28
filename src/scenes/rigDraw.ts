// RTS-32 — the RIG DRAWER (Phaser-side). Strokes the articulated thug from a pure `RigPose` (gait.ts)
// using the same brass/charcoal vector vocabulary as the baked figure (cityArt.drawFigureRich) — so a
// CLOSE/MID thug is now POSED live instead of a static rasterised quad. One reused Graphics per unit
// (clear + redraw each frame; no per-frame texture bake, no per-frame object pool churn). Invariants:
// the BRASS HATBAND is the one bright accent; the figure is drawn from the GROUND point up so the
// vault moves the drawn body but never the ground ring (the selection/footprint anchor lives in the
// scene's rings, not here); danger-red is never used here (that's MOTION-only, fired elsewhere).

import Phaser from 'phaser';
import { PAL } from './cityArt';
import {
  type RigPose, HIP_H, TORSO_H, SHOULDER_HW, HIP_HW, HEAD_H, ARM_DROP, solveTwoBoneLegIK,
} from './gait';
import type { WeaponAttackPoseSample } from './weaponAttackPose';

export interface RigStyle {
  accent: number;    // faction read — brass (player) / blood (rival). The hatband + pocket square.
  accentDim: number;
  suit: number;      // coat fill
  suitDark: number;  // SE shadow half
}

export const PLAYER_RIG: RigStyle = { accent: PAL.brass, accentDim: PAL.brassDim, suit: PAL.suitCharcoal, suitDark: PAL.sootDeep };
export const RIVAL_RIG: RigStyle = { accent: PAL.blood, accentDim: PAL.bloodDim, suit: PAL.charcoal, suitDark: PAL.sootDeep };

const ELBOW_FWD = 1.6; // elbows keep the cheap forward-bulge (arms read fine without IK)
type Pt = { x: number; y: number };

/** Cheap forward-bulged midpoint (no IK): the joint sits at the limb midpoint, nudged forward + up so
 * the knee/elbow reads bent. With the foot PLANTED and the pelvis vaulting, this bend deepens as the
 * body passes over the foot — exactly the "vault over the planted leg" read, at zero trig cost. */
function joint(a: Pt, b: Pt, fwd: number, up: number): Pt {
  return { x: (a.x + b.x) / 2 + fwd, y: (a.y + b.y) / 2 - up };
}

function limb(g: Phaser.GameObjects.Graphics, a: Pt, j: Pt, b: Pt, color: number, w: number): void {
  g.lineStyle(w, color, 1);
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(j.x, j.y); g.lineTo(b.x, b.y); g.strokePath();
}

/**
 * Draw the posed thug into `g` (already cleared + positioned at the unit's ground point, scaled ±1 in
 * x for facing). All coordinates are offsets from that ground point: +x = facing-forward, y up = neg.
 * ~0 trig here (gait.ts did the trig); just fills + strokes. Draw order is back→front so the swinging
 * limbs read depth correctly through the cycle.
 */
export function drawThugRig(g: Phaser.GameObjects.Graphics, p: RigPose, st: RigStyle, atk?: WeaponAttackPoseSample): void {
  // pelvis (hips) + shoulders, with the opposed twist (hips lead the front leg; shoulders counter).
  const pelvisCx = p.bodyX + p.hipTwist;
  const pelvisCy = -HIP_H + p.bodyY;
  const shoulderCx = p.bodyX + p.lean + (atk?.leanPx ?? 0) + p.shoulderTwist + (atk?.shoulderTwistPx ?? 0);
  const shoulderCy = pelvisCy - TORSO_H;

  const hipL: Pt = { x: pelvisCx - HIP_HW, y: pelvisCy };
  const hipR: Pt = { x: pelvisCx + HIP_HW, y: pelvisCy };
  const shL: Pt = { x: shoulderCx - SHOULDER_HW, y: shoulderCy };
  const shR: Pt = { x: shoulderCx + SHOULDER_HW, y: shoulderCy };

  // feet (footLift 0 ⇒ planted on the ground at y=0); RTS-34.2 — the KNEE is now solved by two-bone IK
  // so the foot truly PLANTS (the leg bends naturally over the planted foot) instead of a forward-posed
  // midpoint that floated. The bend deepens as the body vaults over the contact foot.
  const footL: Pt = { x: p.legL.footDX, y: -p.legL.footLift };
  const footR: Pt = { x: p.legR.footDX, y: -p.legR.footLift };
  const kneeL = solveTwoBoneLegIK(hipL.x, hipL.y, footL.x, footL.y);
  const kneeR = solveTwoBoneLegIK(hipR.x, hipR.y, footR.x, footR.y);

  // hands swing fore/aft from the shoulders; elbows bulge forward.
  const armL = atk && atk.phase !== 'done' ? atk.armL : p.armL;
  const armR = atk && atk.phase !== 'done' ? atk.armR : p.armR;
  const handL: Pt = { x: shL.x + armL.handDX, y: shoulderCy + ARM_DROP - armL.handLift };
  const handR: Pt = { x: shR.x + armR.handDX, y: shoulderCy + ARM_DROP - armR.handLift };
  const elbowL = joint(shL, handL, ELBOW_FWD, 0);
  const elbowR = joint(shR, handR, ELBOW_FWD, 0);

  // which leg/arm is the BACK one (further behind) — drawn first + dimmer for depth; the FRONT one
  // (more forward) is drawn last + lit. This swaps correctly across the gait cycle.
  const legBackFirst = footL.x <= footR.x;
  const armBackFirst = handL.x <= handR.x;

  const drawLeg = (hip: Pt, knee: Pt, foot: Pt, lit: boolean) => {
    limb(g, hip, knee, foot, lit ? st.suit : st.suitDark, 5);
    g.fillStyle(PAL.ink, 1); g.fillEllipse(foot.x, foot.y, 9, 3.4); // shoe
  };
  const drawArm = (sh: Pt, elbow: Pt, hand: Pt, lit: boolean) => {
    limb(g, sh, elbow, hand, lit ? st.suit : st.suitDark, 4);
    g.fillStyle(PAL.fleshDark, 1); g.fillCircle(hand.x, hand.y, 2.2); // fist
  };
  const drawWeaponProp = () => {
    if (!atk || atk.phase === 'done' || atk.prop.kind === 'none' || atk.prop.length <= 0) return;
    const brace = Math.max(0, Math.min(1, atk.prop.brace));
    const grip: Pt = { x: handR.x * (1 - brace) + handL.x * brace, y: handR.y * (1 - brace) + handL.y * brace };
    const muzzle: Pt = { x: handR.x + atk.prop.length, y: handR.y - atk.prop.length * 0.08 };
    g.lineStyle(atk.prop.kind === 'pistol' ? 3 : 4, PAL.ink, 1);
    if (atk.prop.kind === 'satchel') {
      g.fillStyle(PAL.sootDeep, 1);
      g.fillRoundedRect(handR.x - 2, handR.y - 1, 9, 7, 2);
      g.lineStyle(1, st.accentDim, 0.8);
      g.strokeRoundedRect(handR.x - 2, handR.y - 1, 9, 7, 2);
      return;
    }
    g.beginPath(); g.moveTo(grip.x, grip.y); g.lineTo(muzzle.x, muzzle.y); g.strokePath();
    if (atk.prop.kind === 'tommy') {
      g.fillStyle(PAL.sootDeep, 1); g.fillCircle(grip.x + 4, grip.y + 4, 3.4); // drum read at 56px
    } else if (atk.prop.kind === 'longGun') {
      g.lineStyle(2, st.accentDim, 0.85); g.beginPath(); g.moveTo(handL.x - 3, handL.y + 2); g.lineTo(handL.x + 5, handL.y + 1); g.strokePath();
    } else {
      g.fillStyle(PAL.ink, 1); g.fillRect(muzzle.x - 1, muzzle.y - 1, 3, 2);
    }
  };

  // ── back arm + back leg ──
  if (armBackFirst) drawArm(shL, elbowL, handL, false); else drawArm(shR, elbowR, handR, false);
  if (legBackFirst) drawLeg(hipL, kneeL, footL, false); else drawLeg(hipR, kneeR, footR, false);

  // ── pelvis + torso (double-breasted trapezoid, NW-lit / SE-shadow) ──
  g.fillStyle(st.suit, 1);
  g.fillPoints([hipL, hipR, shR, shL], true);
  g.fillStyle(st.suitDark, 0.5);
  g.fillPoints([{ x: pelvisCx, y: pelvisCy }, hipR, shR, { x: shoulderCx, y: shoulderCy }], true);
  g.fillStyle(st.suit, 1); g.fillEllipse(shoulderCx, shoulderCy, SHOULDER_HW * 2 + 4, 7); // padded shoulders
  g.fillStyle(PAL.shirt, 1); g.fillTriangle(shoulderCx, shoulderCy + 2, shoulderCx - 2.5, shoulderCy + 3, shoulderCx, shoulderCy + 9); // collar V

  // ── front leg ──
  if (legBackFirst) drawLeg(hipR, kneeR, footR, true); else drawLeg(hipL, kneeL, footL, true);

  // ── neck + head + heavy jaw ──
  const headX = shoulderCx + p.headDX, headY = shoulderCy - HEAD_H + p.headDY;
  g.fillStyle(PAL.fleshDark, 1); g.fillRect(headX - 1.6, headY + 3, 3.2, 3); // neck
  g.fillStyle(PAL.fleshLit, 1); g.fillCircle(headX - 0.6, headY, 4.4); // head (NW lit)
  g.fillStyle(PAL.fleshDark, 1); g.fillCircle(headX + 1.4, headY + 0.6, 3.4); // SE shadow cheek/jaw
  g.fillStyle(PAL.fleshDark, 1); g.fillEllipse(headX, headY + 3, 7.5, 3.2); // heavy jaw

  // ── front arm ──
  if (armBackFirst) drawArm(shR, elbowR, handR, true); else drawArm(shL, elbowL, handL, true);
  drawWeaponProp();

  // ── fedora — crown + brim + the BRASS HATBAND (the one bright accent) ──
  const hatY = headY - 4.2;
  g.fillStyle(PAL.charcoal, 1); g.fillEllipse(headX, hatY + 3.2, 17, 4.4); // brim
  g.fillStyle(PAL.slate, 1); g.fillRoundedRect(headX - 5, hatY - 2.5, 10, 6, 2); // crown
  g.fillStyle(st.accent, 1); g.fillRect(headX - 5, hatY + 2.2, 10, 1.8); // HATBAND — the faction read
  // chest pocket-square accent triangle (high in the silhouette)
  g.fillStyle(st.accent, 1);
  g.fillTriangle(shoulderCx - 5, shoulderCy + 6, shoulderCx - 2, shoulderCy + 6, shoulderCx - 3.5, shoulderCy + 9);
}

// ── RTS-37 (BRASSMERE procedural-fidelity pass) — drawThugRig2: the HIGH-FIDELITY thug drawer ─────────
// Same RigPose in; a heavier DRAWN read out. The current drawThugRig strokes thin limbs (a touch
// stick-figurey); this builds SOLID FILLED MASSES with a bold period silhouette — fedora (bold ink brim +
// creased crown), a hem-flared OVERCOAT, a planted stance, and a BAT slung over the shoulder — plus a
// 3-tone cel-shade (NW lit / SE shadow / brim+coat occlusion), a unifying dark INK OUTLINE, and a FEW
// accent lines (hatband, lapel, placket, belt). Faction stays on the scene's base-plate ring; the only
// figure accent is the small hatband (brass player / dim blood rival) — the body is NEVER recolored to
// rival-red. Reads from the pose only, so the existing idle/walk/attack/hit animation carries unchanged.

const COAT_LIT = 0x2e2a25;          // NW-lit coat plane (one value step over base)
const COAT_BASE = PAL.suitCharcoal; // base coat
const COAT_SHADE = PAL.sootDeep;    // SE shadow half
const OCCLUDE = PAL.ink;            // deepest: under-brim, coat interior, the unifying outline
const RIM = 0xb8c7d9;               // moon-rim edge light — TINY amounts only
const BAT_WOOD = 0x6b5236;          // muted ash-wood (a prop tone, not a semantic colour)
const BAT_WOOD_DK = 0x4a3826;

/** An ink-underlaid limb: a fat ink stroke then a thinner colour stroke = a filled, OUTLINED limb (vs the
 * current thin single stroke). Rounds the joint since this Graphics API has no line-cap control. */
function inkLimb(g: Phaser.GameObjects.Graphics, a: Pt, j: Pt, b: Pt, color: number, w: number): void {
  g.lineStyle(w + 2, OCCLUDE, 1);
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(j.x, j.y); g.lineTo(b.x, b.y); g.strokePath();
  g.lineStyle(w, color, 1);
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(j.x, j.y); g.lineTo(b.x, b.y); g.strokePath();
  g.fillStyle(color, 1); g.fillCircle(j.x, j.y, w / 2);
}

export function drawThugRig2(g: Phaser.GameObjects.Graphics, p: RigPose, st: RigStyle, atk?: WeaponAttackPoseSample): void {
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

  const armL = atk && atk.phase !== 'done' ? atk.armL : p.armL;
  const armR = atk && atk.phase !== 'done' ? atk.armR : p.armR;
  const handL: Pt = { x: shL.x + armL.handDX, y: shoulderCy + ARM_DROP - armL.handLift };
  const handR: Pt = { x: shR.x + armR.handDX, y: shoulderCy + ARM_DROP - armR.handLift };
  const elbowL = joint(shL, handL, ELBOW_FWD, 0);
  const elbowR = joint(shR, handR, ELBOW_FWD, 0);

  const legBackFirst = footL.x <= footR.x;
  const armBackFirst = handL.x <= handR.x;

  const drawLeg = (hip: Pt, knee: Pt, foot: Pt, lit: boolean) => {
    inkLimb(g, hip, knee, foot, lit ? COAT_BASE : COAT_SHADE, 6);
    g.fillStyle(OCCLUDE, 1); g.fillEllipse(foot.x + 1.5, foot.y, 11, 4);                 // period wingtip sole
    g.fillStyle(lit ? 0x2a2622 : COAT_SHADE, 1); g.fillEllipse(foot.x + 1, foot.y - 0.9, 8, 2.4);
  };
  const drawArm = (sh: Pt, elbow: Pt, hand: Pt, lit: boolean) => {
    inkLimb(g, sh, elbow, hand, lit ? COAT_BASE : COAT_SHADE, 5);
    g.fillStyle(PAL.fleshDark, 1); g.fillCircle(hand.x, hand.y, 2.4);                    // fist
  };

  // ── the slung BAT (drawn first so the coat + body overlap its mid → reads "over the shoulder/back") ──
  const batLowX = pelvisCx - 6, batLowY = pelvisCy + 2;       // grip at the back hip
  const batTopX = shoulderCx + 7, batTopY = shoulderCy - 12;  // barrel above the far shoulder
  g.lineStyle(5, OCCLUDE, 1); g.beginPath(); g.moveTo(batLowX, batLowY); g.lineTo(batTopX, batTopY); g.strokePath();
  g.lineStyle(3.2, BAT_WOOD, 1); g.beginPath(); g.moveTo(batLowX, batLowY); g.lineTo(batTopX, batTopY); g.strokePath();
  g.fillStyle(BAT_WOOD, 1); g.fillCircle(batTopX, batTopY, 3); g.lineStyle(1, OCCLUDE, 1); g.strokeCircle(batTopX, batTopY, 3); // barrel
  g.fillStyle(BAT_WOOD_DK, 1); g.fillCircle(batLowX, batLowY, 1.8);                       // grip knob

  // ── back arm + back leg (shadow tone, drawn first for depth) ──
  if (armBackFirst) drawArm(shL, elbowL, handL, false); else drawArm(shR, elbowR, handR, false);
  if (legBackFirst) drawLeg(hipL, kneeL, footL, false); else drawLeg(hipR, kneeR, footR, false);

  // ── the OVERCOAT: a hem-flared trapezoid mass with a waist pinch (the silhouette win vs thin limbs) ──
  const coatTopY = shoulderCy + 1, waistY = pelvisCy - 1, hemY = pelvisCy + 8;
  const shHW = 8.5, waistHW = 6.5, hemHW = 8.0;
  const coat: Pt[] = [
    { x: shoulderCx - shHW, y: coatTopY }, { x: shoulderCx + shHW, y: coatTopY },
    { x: pelvisCx + waistHW, y: waistY }, { x: pelvisCx + hemHW, y: hemY },
    { x: pelvisCx - hemHW, y: hemY }, { x: pelvisCx - waistHW, y: waistY },
  ];
  g.fillStyle(COAT_BASE, 1); g.fillPoints(coat, true);
  // cel step 2 — SE shadow half
  g.fillStyle(COAT_SHADE, 0.85);
  g.fillPoints([{ x: shoulderCx, y: coatTopY }, { x: shoulderCx + shHW, y: coatTopY }, { x: pelvisCx + waistHW, y: waistY }, { x: pelvisCx + hemHW, y: hemY }, { x: pelvisCx, y: hemY }], true);
  // cel step 3 — NW lit lapel/shoulder strip
  g.fillStyle(COAT_LIT, 0.9);
  g.fillPoints([{ x: shoulderCx - shHW, y: coatTopY }, { x: shoulderCx - 1.5, y: coatTopY }, { x: pelvisCx - 2, y: waistY }, { x: pelvisCx - waistHW, y: waistY }], true);
  // padded shoulders (lit NW / base SE)
  g.fillStyle(COAT_LIT, 1); g.fillEllipse(shoulderCx - 3.6, coatTopY, 8, 4.2);
  g.fillStyle(COAT_BASE, 1); g.fillEllipse(shoulderCx + 3.6, coatTopY, 8, 4.2);
  // shirt V + the dark placket gap (coat interior occlusion)
  g.fillStyle(PAL.shirt, 1); g.fillTriangle(shoulderCx, coatTopY + 1.5, shoulderCx - 3, coatTopY + 3, shoulderCx, coatTopY + 8);
  g.fillStyle(OCCLUDE, 1); g.fillRect(shoulderCx - 0.7, coatTopY + 2.5, 1.4, 7);

  // ── front leg (lit) ──
  if (legBackFirst) drawLeg(hipR, kneeR, footR, true); else drawLeg(hipL, kneeL, footL, true);

  // ── neck + head + heavy jaw, with the fedora BRIM OCCLUSION shadowing the eyes ──
  const headX = shoulderCx + p.headDX, headY = shoulderCy - HEAD_H + p.headDY;
  g.fillStyle(PAL.fleshDark, 1); g.fillRect(headX - 1.6, headY + 3, 3.2, 3);             // neck
  g.fillStyle(PAL.fleshLit, 1); g.fillCircle(headX - 0.6, headY + 0.4, 4.6);             // head (NW lit)
  g.fillStyle(PAL.fleshDark, 1); g.fillCircle(headX + 1.5, headY + 1.2, 3.6);            // SE jaw shadow
  g.fillStyle(PAL.fleshDark, 1); g.fillEllipse(headX, headY + 3.4, 8, 3.4);              // heavy jaw
  g.fillStyle(OCCLUDE, 0.85); g.fillRect(headX - 4.4, headY - 1.6, 9, 2.6);              // under-brim eye shadow

  // ── front arm (lit) ──
  if (armBackFirst) drawArm(shR, elbowR, handR, true); else drawArm(shL, elbowL, handL, true);

  // ── fedora: bold ink brim + creased crown + the faction HATBAND accent ──
  const hatY = headY - 4.6;
  g.fillStyle(OCCLUDE, 1); g.fillEllipse(headX + 0.3, hatY + 3.4, 19, 5);                // brim (ink — bold silhouette)
  g.fillStyle(PAL.charcoal, 1); g.fillEllipse(headX, hatY + 3.0, 17, 3.8);               // brim top plane
  g.fillStyle(PAL.slate, 1); g.fillRoundedRect(headX - 5.2, hatY - 3, 10.4, 6.4, 2);     // crown
  g.fillStyle(OCCLUDE, 1); g.fillRect(headX - 0.8, hatY - 3, 1.6, 5);                     // crown pinch crease
  g.fillStyle(st.accent, 1); g.fillRect(headX - 5.2, hatY + 2.0, 10.4, 1.8);             // HATBAND — the one faction accent
  g.fillStyle(st.accentDim, 1); g.fillRect(headX - 5.2, hatY + 3.6, 10.4, 0.6);

  // ── the unifying INK OUTLINE + the few accent lines ──
  g.lineStyle(1.2, OCCLUDE, 0.95); g.strokePoints(coat, true, true);                     // coat silhouette
  g.lineStyle(1, OCCLUDE, 0.6);
  g.beginPath(); g.moveTo(shoulderCx - 3.2, coatTopY + 2.5); g.lineTo(shoulderCx, coatTopY + 8); g.lineTo(shoulderCx + 3.2, coatTopY + 2.5); g.strokePath(); // lapel V
  g.beginPath(); g.moveTo(shoulderCx, coatTopY + 8); g.lineTo(pelvisCx, hemY - 1); g.strokePath(); // center placket
  g.lineStyle(2, OCCLUDE, 0.8); g.beginPath(); g.moveTo(pelvisCx - waistHW, waistY + 1); g.lineTo(pelvisCx + waistHW, waistY + 1); g.strokePath(); // belt
  g.fillStyle(st.accentDim, 1); g.fillRect(pelvisCx - 1.2, waistY, 2.4, 2);              // buckle (dim faction metal)

  // ── tiny rim light (moon edge) — NW hat brim, very sparing ──
  g.lineStyle(1, RIM, 0.4); g.beginPath(); g.moveTo(headX - 8.5, hatY + 3); g.lineTo(headX - 5, hatY + 2); g.strokePath();
}

// ── ?debugRig=1 overlay — joint + plant dots, gaitPhase + state. Debug colors only; off in play. ──
const DBG_JOINT = 0x00e5ff, DBG_PLANT = 0xff2bd0, DBG_AIR = 0xffe600;
export function drawRigDebug(g: Phaser.GameObjects.Graphics, p: RigPose): void {
  const pelvisCx = p.bodyX + p.hipTwist, pelvisCy = -HIP_H + p.bodyY;
  const shoulderCx = p.bodyX + p.lean + p.shoulderTwist, shoulderCy = pelvisCy - TORSO_H;
  const footL: Pt = { x: p.legL.footDX, y: -p.legL.footLift };
  const footR: Pt = { x: p.legR.footDX, y: -p.legR.footLift };
  // joints
  g.fillStyle(DBG_JOINT, 1);
  for (const j of [{ x: pelvisCx, y: pelvisCy }, { x: shoulderCx, y: shoulderCy }]) g.fillCircle(j.x, j.y, 1.6);
  // feet: pink when PLANTED (on the ground), yellow when airborne — the plant is the thing to verify.
  for (const f of [{ pose: p.legL, pt: footL }, { pose: p.legR, pt: footR }]) {
    g.fillStyle(f.pose.footLift === 0 ? DBG_PLANT : DBG_AIR, 1);
    g.fillCircle(f.pt.x, f.pt.y, 2);
  }
  g.lineStyle(1, DBG_PLANT, 0.5); g.beginPath(); g.moveTo(-24, 0); g.lineTo(24, 0); g.strokePath(); // ground line
}
