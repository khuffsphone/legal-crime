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
// stick-figurey); this builds SOLID FILLED MASSES with a bold period silhouette — a broad fedora (bold ink
// brim + creased crown), a hem-FLARED overcoat (wider at the hem than the shoulders), a planted stance, and
// a BAT slung over the shoulder — plus a 3-tone cel-shade (NW lit / SE shadow / deep occlusion), a unifying
// dark INK OUTLINE, and a FEW accent lines (lapel, placket, belt, hatband). Faction stays on the scene's
// base-plate ring; the only figure accent is the small hatband (brass player / dim blood rival) — the body
// is NEVER recolored to rival-red. Reads from the pose only, so idle/walk/attack/hit animation carries.
// (Synthesized in the BRASSMERE procedural-fidelity design pass; silhouette-first composition.)
export function drawThugRig2(g: Phaser.GameObjects.Graphics, p: RigPose, st: RigStyle, atk?: WeaponAttackPoseSample): void {
  // ── skeleton (identical math to drawThugRig so the gait reads the same) ──
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

  // ── palette steps (noir, NW key) ──
  const INK = PAL.ink;          // unifying outline + deep occlusion
  const COAT = st.suit;         // base coat tone
  const COAT_LIT = 0x2e2a25;    // NW-lit coat step
  const COAT_DARK = st.suitDark;// SE shadow half
  const RIM = 0xb8c7d9;         // moonRim — tiny amounts on the NW edge only

  const stroke = (a: Pt, b: Pt, w: number, color: number, alpha = 1) => {
    g.lineStyle(w, color, alpha);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath();
  };
  const inkPoly = (pts: Pt[], fill: number, w = 2) => {
    g.fillStyle(fill, 1); g.fillPoints(pts, true);
    g.lineStyle(w, INK, 1);
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath(); g.strokePath();
  };

  // Solid coat SLEEVE: tapered quads shoulder→elbow→hand, ink spine + rounded joints + fist (mass, not a stick).
  const drawSleeve = (sh: Pt, elbow: Pt, hand: Pt, lit: boolean) => {
    const fill = lit ? COAT : COAT_DARK;
    const w0 = 4.6, w1 = 3.0;
    g.fillStyle(fill, 1);
    g.fillPoints([
      { x: sh.x - w0 * 0.5, y: sh.y - w0 * 0.5 }, { x: sh.x + w0 * 0.5, y: sh.y + w0 * 0.5 },
      { x: elbow.x + w0 * 0.5, y: elbow.y + w0 * 0.5 }, { x: elbow.x - w0 * 0.5, y: elbow.y - w0 * 0.5 },
    ], true);
    g.fillPoints([
      { x: elbow.x - w0 * 0.5, y: elbow.y - w0 * 0.5 }, { x: elbow.x + w0 * 0.5, y: elbow.y + w0 * 0.5 },
      { x: hand.x + w1 * 0.5, y: hand.y + w1 * 0.5 }, { x: hand.x - w1 * 0.5, y: hand.y - w1 * 0.5 },
    ], true);
    g.fillCircle(sh.x, sh.y, w0 * 0.5); g.fillCircle(elbow.x, elbow.y, w0 * 0.5); g.fillCircle(hand.x, hand.y, w1 * 0.5);
    g.lineStyle(2, INK, 0.9);
    g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(elbow.x, elbow.y); g.lineTo(hand.x, hand.y); g.strokePath();
    g.fillStyle(PAL.fleshDark, 1); g.fillCircle(hand.x, hand.y, 2.4);
    g.lineStyle(1, INK, 0.8); g.strokeCircle(hand.x, hand.y, 2.4);
  };

  // Solid trousered LEG: tapered quads hip→knee→foot + chunky ink wingtip shoe w/ a lit toe-cap.
  const drawLeg = (hip: Pt, knee: Pt, foot: Pt, lit: boolean) => {
    const fill = lit ? COAT : COAT_DARK;
    const w0 = 5.2, w1 = 4.0;
    g.fillStyle(fill, 1);
    g.fillPoints([
      { x: hip.x - w0 * 0.5, y: hip.y }, { x: hip.x + w0 * 0.5, y: hip.y },
      { x: knee.x + w0 * 0.5, y: knee.y }, { x: knee.x - w0 * 0.5, y: knee.y },
    ], true);
    g.fillPoints([
      { x: knee.x - w0 * 0.5, y: knee.y }, { x: knee.x + w0 * 0.5, y: knee.y },
      { x: foot.x + w1 * 0.5, y: foot.y }, { x: foot.x - w1 * 0.5, y: foot.y },
    ], true);
    g.fillCircle(knee.x, knee.y, w0 * 0.5);
    g.lineStyle(2, INK, 0.9);
    g.beginPath(); g.moveTo(hip.x, hip.y); g.lineTo(knee.x, knee.y); g.lineTo(foot.x, foot.y); g.strokePath();
    g.fillStyle(INK, 1); g.fillEllipse(foot.x + 1.2, foot.y, 11, 4.2);
    g.fillStyle(lit ? COAT_LIT : COAT, 1); g.fillEllipse(foot.x - 1.4, foot.y - 0.5, 4.5, 2.2);
  };

  // The BAT — leg-breaker read — RESTING over the shoulder, barrel up-and-BACK so it clears the head and
  // breaks the silhouette above the shoulder line. Knob follows the right hand; tip anchored to the
  // shoulder so it tracks the pose. Suppressed during an attack (the prop takes over).
  const drawBat = () => {
    if (atk && atk.phase !== 'done') return;
    const grip: Pt = { x: handR.x, y: handR.y };
    const tip: Pt = { x: shoulderCx - 9, y: shoulderCy - 13 };
    const dx = tip.x - grip.x, dy = tip.y - grip.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const wh = 1.5, wt = 3.4;
    const knob: Pt = { x: grip.x - ux * 1.5, y: grip.y - uy * 1.5 };
    g.fillStyle(INK, 0.35); g.fillEllipse(shoulderCx - 2, shoulderCy - 1, 8, 4); // rest-contact occlusion
    g.fillStyle(PAL.charcoal, 1);
    g.fillPoints([
      { x: knob.x + nx * wh, y: knob.y + ny * wh }, { x: knob.x - nx * wh, y: knob.y - ny * wh },
      { x: tip.x - nx * wt, y: tip.y - ny * wt }, { x: tip.x + nx * wt, y: tip.y + ny * wt },
    ], true);
    g.fillCircle(tip.x, tip.y, wt); g.fillCircle(knob.x, knob.y, wh + 0.4);
    g.lineStyle(2.2, INK, 1);
    g.beginPath(); g.moveTo(knob.x, knob.y); g.lineTo(tip.x, tip.y); g.strokePath();
    g.fillStyle(INK, 1); g.fillCircle(tip.x, tip.y, wt + 0.5);
    g.fillStyle(PAL.slate, 1); g.fillCircle(tip.x - ux, tip.y - uy, wt - 0.4);
    g.fillStyle(RIM, 0.5); g.fillCircle(tip.x - ux * 1.4 - 0.5, tip.y - uy * 1.4 - 0.6, 1.0);
  };

  // Attack weapon prop (matches drawThugRig's behaviour so attacks still render).
  const drawWeaponProp = () => {
    if (!atk || atk.phase === 'done' || atk.prop.kind === 'none' || atk.prop.length <= 0) return;
    const brace = Math.max(0, Math.min(1, atk.prop.brace));
    const grip: Pt = { x: handR.x * (1 - brace) + handL.x * brace, y: handR.y * (1 - brace) + handL.y * brace };
    const muzzle: Pt = { x: handR.x + atk.prop.length, y: handR.y - atk.prop.length * 0.08 };
    if (atk.prop.kind === 'satchel') {
      g.fillStyle(PAL.sootDeep, 1); g.fillRoundedRect(handR.x - 2, handR.y - 1, 9, 7, 2);
      g.lineStyle(1, st.accentDim, 0.8); g.strokeRoundedRect(handR.x - 2, handR.y - 1, 9, 7, 2);
      return;
    }
    g.lineStyle(atk.prop.kind === 'pistol' ? 3 : 4, INK, 1);
    g.beginPath(); g.moveTo(grip.x, grip.y); g.lineTo(muzzle.x, muzzle.y); g.strokePath();
    if (atk.prop.kind === 'tommy') { g.fillStyle(PAL.sootDeep, 1); g.fillCircle(grip.x + 4, grip.y + 4, 3.4); }
    else if (atk.prop.kind === 'longGun') { g.lineStyle(2, st.accentDim, 0.85); g.beginPath(); g.moveTo(handL.x - 3, handL.y + 2); g.lineTo(handL.x + 5, handL.y + 1); g.strokePath(); }
    else { g.fillStyle(INK, 1); g.fillRect(muzzle.x - 1, muzzle.y - 1, 3, 2); }
  };

  // ════════ DRAW ORDER: back→front ════════

  // (1) BACK arm + BACK leg (dim) behind the coat mass.
  if (armBackFirst) drawSleeve(shL, elbowL, handL, false); else drawSleeve(shR, elbowR, handR, false);
  if (legBackFirst) drawLeg(hipL, kneeL, footL, false); else drawLeg(hipR, kneeR, footR, false);

  // (2) THE COAT MASS — the silhouette win: one bold overcoat that FLARES at the hem (wider than the
  //     shoulders) so it reads as a heavy period coat, not thin limbs. Single ink-outlined polygon.
  const waistY = pelvisCy + 2;
  const hemY = pelvisCy + 9;
  const shHW = SHOULDER_HW + 3.2;   // padded shoulder width
  const waistHW = SHOULDER_HW + 0.5;
  const hemHW = SHOULDER_HW + 6.5;  // ⭐ FLARE — hem wider than shoulders
  const coat: Pt[] = [
    { x: shoulderCx - shHW, y: shoulderCy + 1 }, { x: shoulderCx + shHW, y: shoulderCy + 1 },
    { x: pelvisCx + waistHW, y: waistY }, { x: pelvisCx + hemHW, y: hemY },
    { x: pelvisCx + hemHW - 2, y: hemY + 2 }, { x: pelvisCx - hemHW + 2, y: hemY + 2 },
    { x: pelvisCx - hemHW, y: hemY }, { x: pelvisCx - waistHW, y: waistY },
  ];
  inkPoly(coat, COAT, 2.4);

  // (3) CEL SHADING: SE shadow HALF + NW lit slab + deep occlusion shelf inside the hem (crisp steps).
  g.fillStyle(COAT_DARK, 0.85);
  g.fillPoints([
    { x: shoulderCx, y: shoulderCy + 1 }, { x: shoulderCx + shHW, y: shoulderCy + 1 },
    { x: pelvisCx + waistHW, y: waistY }, { x: pelvisCx + hemHW, y: hemY },
    { x: pelvisCx + hemHW - 2, y: hemY + 2 }, { x: pelvisCx, y: hemY + 2 },
  ], true);
  g.fillStyle(COAT_LIT, 0.9);
  g.fillPoints([
    { x: shoulderCx - shHW, y: shoulderCy + 1 }, { x: shoulderCx - 1, y: shoulderCy + 1 },
    { x: pelvisCx - 1, y: waistY }, { x: pelvisCx - waistHW, y: waistY },
  ], true);
  g.fillStyle(INK, 0.55);
  g.fillPoints([
    { x: pelvisCx - hemHW + 2.5, y: hemY + 0.5 }, { x: pelvisCx + hemHW - 2.5, y: hemY + 0.5 },
    { x: pelvisCx + hemHW - 3.5, y: hemY + 2 }, { x: pelvisCx - hemHW + 3.5, y: hemY + 2 },
  ], true);

  // (4) PADDED SHOULDERS cap — broad period shoulder line, NW rim + SE pad shadow, ink-rimmed.
  g.fillStyle(COAT, 1); g.fillEllipse(shoulderCx, shoulderCy + 0.5, shHW * 2, 7);
  g.fillStyle(COAT_DARK, 0.7); g.fillEllipse(shoulderCx + shHW * 0.5, shoulderCy + 1, shHW, 6);
  g.fillStyle(RIM, 0.45); g.fillEllipse(shoulderCx - shHW * 0.55, shoulderCy - 0.5, shHW * 0.7, 2.6);
  g.lineStyle(2, INK, 0.9); g.strokeEllipse(shoulderCx, shoulderCy + 0.5, shHW * 2, 7);

  // (5) INTERIOR ACCENT LINES: shirt wedge, lapel V, center placket, belt.
  g.fillStyle(PAL.shirt, 1);
  g.fillTriangle(shoulderCx, shoulderCy + 1.5, shoulderCx - 2.6, shoulderCy + 3, shoulderCx, shoulderCy + 8.5);
  g.fillTriangle(shoulderCx, shoulderCy + 1.5, shoulderCx + 2.6, shoulderCy + 3, shoulderCx, shoulderCy + 8.5);
  stroke({ x: shoulderCx - 4.4, y: shoulderCy + 1.5 }, { x: shoulderCx, y: shoulderCy + 8.5 }, 1.6, INK, 1);
  stroke({ x: shoulderCx + 4.4, y: shoulderCy + 1.5 }, { x: shoulderCx, y: shoulderCy + 8.5 }, 1.6, INK, 1);
  stroke({ x: shoulderCx, y: shoulderCy + 8.5 }, { x: pelvisCx, y: hemY }, 1.4, INK, 0.85);
  stroke({ x: pelvisCx - waistHW + 0.5, y: waistY - 0.5 }, { x: pelvisCx + waistHW - 0.5, y: waistY - 0.5 }, 2, INK, 0.9);

  // (6) FRONT leg (lit) over the coat hem.
  if (legBackFirst) drawLeg(hipR, kneeR, footR, true); else drawLeg(hipL, kneeL, footL, true);

  // (7) NECK + HEAD with heavy noir jaw (NW lit / SE shadow), ink-rimmed.
  const headX = shoulderCx + p.headDX, headY = shoulderCy - HEAD_H + p.headDY;
  g.fillStyle(PAL.fleshDark, 1); g.fillRect(headX - 1.8, headY + 3, 3.6, 3.2);
  g.lineStyle(1.4, INK, 0.7); g.strokeRect(headX - 1.8, headY + 3, 3.6, 3.2);
  g.fillStyle(PAL.fleshLit, 1); g.fillCircle(headX - 0.4, headY, 4.6);
  g.fillStyle(PAL.fleshDark, 1); g.fillCircle(headX + 1.6, headY + 0.6, 3.6);
  g.fillStyle(PAL.fleshDark, 1); g.fillEllipse(headX, headY + 2.8, 7.6, 3.4);
  // GRAFT (judge): the fedora brim casts a shadow over the upper face — "eyes in shadow" is the single
  // strongest noir cue. Kept subtle (≤0.55) so the lit cheek/jaw still reads and it never becomes "no face".
  g.fillStyle(INK, 0.5); g.fillEllipse(headX + 0.2, headY - 1.1, 7.6, 2.7);
  g.fillStyle(RIM, 0.4); g.fillCircle(headX - 2.6, headY - 1.4, 1.1);
  g.lineStyle(1.4, INK, 0.85); g.strokeCircle(headX - 0.4, headY, 4.6);

  // (8) FRONT arm (lit) + weapon prop (attack) + bat (carry).
  if (armBackFirst) drawSleeve(shR, elbowR, handR, true); else drawSleeve(shL, elbowL, handL, true);
  drawWeaponProp();
  drawBat();

  // (9) FEDORA — broad ink brim (the strongest single noir read), creased crown, faction hat band.
  const hatY = headY - 4.4;
  g.fillStyle(INK, 1); g.fillEllipse(headX, hatY + 3.4, 19, 5);
  g.fillStyle(PAL.charcoal, 1); g.fillEllipse(headX, hatY + 3.0, 17.5, 4);
  g.fillStyle(COAT_LIT, 0.9); g.fillEllipse(headX - 1, hatY + 2.2, 13, 1.8);
  g.fillStyle(PAL.slate, 1); g.fillRoundedRect(headX - 5.2, hatY - 3.2, 10.4, 6.4, 2.2);
  g.fillStyle(PAL.charcoal, 0.85); g.fillRoundedRect(headX + 0.4, hatY - 3.0, 5, 6, 2);
  g.fillStyle(RIM, 0.4); g.fillRect(headX - 4.6, hatY - 3.0, 4.5, 1.4);
  stroke({ x: headX, y: hatY - 3.2 }, { x: headX, y: hatY + 1.6 }, 1.3, INK, 0.7); // centre crease
  g.lineStyle(1.8, INK, 1); g.strokeRoundedRect(headX - 5.2, hatY - 3.2, 10.4, 6.4, 2.2);
  g.fillStyle(st.accent, 1); g.fillRect(headX - 5.2, hatY + 1.7, 10.4, 1.9);   // HATBAND — the faction read
  g.fillStyle(st.accentDim, 1); g.fillRect(headX - 5.2, hatY + 3.0, 10.4, 0.7);
  g.lineStyle(1, INK, 0.6); g.strokeRect(headX - 5.2, hatY + 1.7, 10.4, 1.9);
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
