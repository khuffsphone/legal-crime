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
export function drawThugRig(g: Phaser.GameObjects.Graphics, p: RigPose, st: RigStyle): void {
  // pelvis (hips) + shoulders, with the opposed twist (hips lead the front leg; shoulders counter).
  const pelvisCx = p.bodyX + p.hipTwist;
  const pelvisCy = -HIP_H + p.bodyY;
  const shoulderCx = p.bodyX + p.lean + p.shoulderTwist;
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
  const handL: Pt = { x: shL.x + p.armL.handDX, y: shoulderCy + ARM_DROP - p.armL.handLift };
  const handR: Pt = { x: shR.x + p.armR.handDX, y: shoulderCy + ARM_DROP - p.armR.handLift };
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

  // ── fedora — crown + brim + the BRASS HATBAND (the one bright accent) ──
  const hatY = headY - 4.2;
  g.fillStyle(PAL.charcoal, 1); g.fillEllipse(headX, hatY + 3.2, 17, 4.4); // brim
  g.fillStyle(PAL.slate, 1); g.fillRoundedRect(headX - 5, hatY - 2.5, 10, 6, 2); // crown
  g.fillStyle(st.accent, 1); g.fillRect(headX - 5, hatY + 2.2, 10, 1.8); // HATBAND — the faction read
  // chest pocket-square accent triangle (high in the silhouette)
  g.fillStyle(st.accent, 1);
  g.fillTriangle(shoulderCx - 5, shoulderCy + 6, shoulderCx - 2, shoulderCy + 6, shoulderCx - 3.5, shoulderCy + 9);
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
