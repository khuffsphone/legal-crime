// RTS-32 — MATH tests for the procedural gait (not pixels). These lock the invariants that make a
// walk read as a walk and that killed the "skip": opposed limbs, a foot PLANTED through its contact
// window, the gait clock advancing ∝ DISTANCE (the anti-skate keystone), idle never stepping, the
// figure scale/anchor held, and the FAR-LOD bypass.

import { describe, it, expect } from 'vitest';
import {
  advanceGaitPhase, legWalk, legRun, walkPose, runPose, idlePose, poseFor, blendPose,
  locoTarget, easeLoco, rigLOD, FIGURE_PX, WALK_STRIDE, RUN_STRIDE,
  solveTwoBoneLegIK, THIGH, SHIN, HIP_H,
} from '../src/scenes/gait';

describe('opposed limbs — diagonal coordination', () => {
  it('phase 0: LEFT leg + RIGHT arm forward; RIGHT leg + LEFT arm back', () => {
    const p = walkPose(0);
    expect(p.legL.footDX).toBeGreaterThan(0); // left foot planted forward
    expect(p.armR.handDX).toBeGreaterThan(0); // right arm swung forward (opposition)
    expect(p.legR.footDX).toBeLessThan(0);
    expect(p.armL.handDX).toBeLessThan(0);
  });
  it('phase 0.5: the diagonal SWAPS (right leg + left arm forward)', () => {
    const p = walkPose(0.5);
    expect(p.legR.footDX).toBeGreaterThan(0);
    expect(p.armL.handDX).toBeGreaterThan(0);
    expect(p.legL.footDX).toBeLessThan(0);
    expect(p.armR.handDX).toBeLessThan(0);
  });
  it('shoulders counter-rotate against the hips (opposed twist)', () => {
    const p = walkPose(0.18);
    expect(Math.sign(p.shoulderTwist)).toBe(-Math.sign(p.hipTwist));
    expect(p.hipTwist).not.toBe(0);
  });
});

describe('foot-plant — the planted foot does not skate or lift during contact', () => {
  it('the stance foot stays on the ground (footLift 0) through its whole contact window', () => {
    // left leg is in stance for phase ~[0,0.62)
    for (const ph of [0, 0.1, 0.3, 0.5, 0.6]) {
      expect(legWalk(ph).footLift).toBe(0); // planted — never lifts with the vault
    }
    // and the swing foot DOES lift
    expect(legWalk(0.8).footLift).toBeGreaterThan(0);
  });
  it('during stance the foot tracks straight BACK (front plant → toe-off) — the anti-skate motion', () => {
    const front = legWalk(0.0).footDX;   // front plant
    const mid = legWalk(0.31).footDX;     // mid-stance
    const toeOff = legWalk(0.61).footDX;  // about to lift
    expect(front).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(toeOff);  // monotonically back across the contact window
    expect(toeOff).toBeLessThan(0);
  });
  it('the VAULT raises the pelvis but the planted foot stays down (anchor never moves with the vault)', () => {
    const p = walkPose(0.25); // peak mid-stance vault
    expect(p.bodyY).toBeLessThan(0);      // pelvis lifted (up = negative)
    expect(p.legL.footLift).toBe(0);      // the planted foot is still on the ground
  });

  it('⭐ NO SKATE: simulate a moving body — the planted foot holds a FIXED world point through stance', () => {
    // The proof the "skip" is dead: drive the gait by distance exactly as the scene does, and track a
    // foot's WORLD x (body world-x + body-relative footDX). While that foot is planted it must not move.
    const stride = WALK_STRIDE, step = 1.3; // px of ground travel per simulated frame
    let phase = 0, bodyX = 0;
    let plantedWorldX: number | null = null, maxDrift = 0;
    for (let f = 0; f < 200; f++) {
      bodyX += step;
      phase = advanceGaitPhase(phase, step, stride);
      const leg = legWalk(phase);
      if (leg.footLift === 0) { // in contact this frame
        const worldX = bodyX + leg.footDX;
        if (plantedWorldX === null) plantedWorldX = worldX;
        else maxDrift = Math.max(maxDrift, Math.abs(worldX - plantedWorldX));
      } else {
        plantedWorldX = null; // foot lifted — a new plant will start fresh
      }
    }
    expect(maxDrift).toBeLessThan(0.001); // the planted foot is rock-steady on the ground — zero skate
  });
});

describe('anti-skate keystone — gait clock advances ∝ distance, not time', () => {
  it('twice the distance advances ~twice the phase', () => {
    const a = advanceGaitPhase(0, 10, WALK_STRIDE);
    const b = advanceGaitPhase(0, 20, WALK_STRIDE);
    expect(b).toBeCloseTo(2 * a, 6);
    expect(a).toBeCloseTo(10 / WALK_STRIDE, 6);
  });
  it('a full stride of travel advances exactly one cycle (phase wraps to where it started)', () => {
    expect(advanceGaitPhase(0.3, WALK_STRIDE, WALK_STRIDE)).toBeCloseTo(0.3, 6);
  });
  it('a stopped (dist 0) or teleporting (dist ≫ stride) unit HOLDS its phase', () => {
    expect(advanceGaitPhase(0.42, 0, WALK_STRIDE)).toBe(0.42);
    expect(advanceGaitPhase(0.42, WALK_STRIDE * 10, WALK_STRIDE)).toBe(0.42);
  });
  it('a run uses a longer stride, so the same ground distance steps SLOWER (longer paces)', () => {
    expect(advanceGaitPhase(0, 23, RUN_STRIDE)).toBeLessThan(advanceGaitPhase(0, 23, WALK_STRIDE));
    expect(RUN_STRIDE).toBeGreaterThan(WALK_STRIDE);
  });
});

describe('idle — a still unit breathes but never steps', () => {
  it('both feet stay planted (footLift 0) and do NOT translate, for any time', () => {
    for (const t of [0, 200, 800, 1600, 5000]) {
      const p = idlePose(t);
      expect(p.legL.footLift).toBe(0);
      expect(p.legR.footLift).toBe(0);
      expect(p.legL.footDX).toBe(idlePose(0).legL.footDX); // no stride translation
      expect(p.legR.footDX).toBe(idlePose(0).legR.footDX);
    }
  });
  it('but it DOES breathe (the vault oscillates over time)', () => {
    const ys = [0, 400, 800, 1200].map((t) => idlePose(t).bodyY);
    expect(Math.max(...ys)).not.toBeCloseTo(Math.min(...ys), 3);
  });
});

describe('run — lengthens the stride, drops duty into a float, leans in', () => {
  it('the run has a FLIGHT phase: at some moment BOTH feet are airborne (duty < 0.5)', () => {
    let bothAirborne = false;
    for (let i = 0; i < 100; i++) {
      const ph = i / 100;
      if (legRun(ph).footLift > 0 && legRun(ph + 0.5).footLift > 0) { bothAirborne = true; break; }
    }
    expect(bothAirborne).toBe(true);
  });
  it('the run leans the torso forward; the walk does not', () => {
    expect(runPose(0.2).lean).toBeGreaterThan(0);
    expect(walkPose(0.2).lean).toBe(0);
  });
});

describe('blends + loco — continuous phase, eased state changes', () => {
  it('loco 0 = idle, 1 = walk, between = a blend (no pop)', () => {
    const half = poseFor(0.25, 0.5, 0);
    const idle = idlePose(0), walk = walkPose(0.25);
    expect(half.bodyY).toBeCloseTo(blendPose(idle, walk, 0.5).bodyY, 6);
  });
  it('locoTarget maps speed→intent; easeLoco approaches the target (≈150ms feel)', () => {
    expect(locoTarget(1.15, true, 1.55)).toBe(1);  // walk
    expect(locoTarget(1.8, true, 1.55)).toBe(2);   // run
    expect(locoTarget(2.0, false, 1.55)).toBe(0);  // stopped ⇒ idle regardless of speed
    const eased = easeLoco(0, 1, 75, 110); // half a tau ≈ partway
    expect(eased).toBeGreaterThan(0);
    expect(eased).toBeLessThan(1);
  });
});

describe('RTS-34.2 two-bone IK — the foot PLANTS (knee bends naturally, no over-extension)', () => {
  const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);

  it('the solved knee makes the bones EXACT: |hip→knee| = thigh and |knee→foot| = shin', () => {
    const hipX = 0, hipY = -HIP_H, footX = 6, footY = 0; // a reachable foot target
    const k = solveTwoBoneLegIK(hipX, hipY, footX, footY);
    expect(dist(hipX, hipY, k.x, k.y)).toBeCloseTo(THIGH, 4);
    expect(dist(k.x, k.y, footX, footY)).toBeCloseTo(SHIN, 4);
  });

  it('the knee bends FORWARD (+x) — the anatomically correct flex, not backward', () => {
    // foot straight under the hip: a real leg still breaks the knee forward
    const k = solveTwoBoneLegIK(0, -HIP_H, 0, 0);
    expect(k.x).toBeGreaterThan(0.5); // knee bows forward, not on the straight hip→foot line
  });

  it('the leg cannot OVER-EXTEND: an out-of-reach foot straightens to full reach (knee ≈ on the line)', () => {
    const reach = THIGH + SHIN;
    const k = solveTwoBoneLegIK(0, -HIP_H, reach + 30, 0); // far beyond reach
    // with the target clamped to max reach, hip→knee→foot is nearly straight (knee ~on the hip→foot line)
    const hipKnee = dist(0, -HIP_H, k.x, k.y);
    expect(hipKnee).toBeCloseTo(THIGH, 3); // bone length preserved (never stretched)
  });

  it('a planted stance foot is HIT by the IK through the whole contact window (the foot plants)', () => {
    for (const ph of [0.0, 0.2, 0.4, 0.6]) {
      const leg = legWalk(ph);
      const footX = leg.footDX, footY = -leg.footLift;
      const k = solveTwoBoneLegIK(0, -HIP_H, footX, footY);
      expect(dist(k.x, k.y, footX, footY)).toBeCloseTo(SHIN, 4); // the foot is exactly reached → planted
      expect(Math.hypot(footX, footY + HIP_H)).toBeLessThan(THIGH + SHIN); // never over-extended → bent knee
    }
  });
});

describe('scale + anchor held, FAR-LOD bypass', () => {
  it('the figure scale constant is the rts30c 56px (unchanged)', () => {
    expect(FIGURE_PX).toBe(56);
  });
  it('idle/walk keep the foot on the ground baseline (the selection anchor is never lifted)', () => {
    expect(idlePose(0).legL.footLift).toBe(0);
    expect(legWalk(0.0).footLift).toBe(0); // front-plant on the ground
  });
  it('FAR zoom bypasses the full rig; CLOSE/MID draw it', () => {
    expect(rigLOD(1.0)).toBe('full');   // CLOSE
    expect(rigLOD(0.6)).toBe('full');   // MID
    expect(rigLOD(0.35)).toBe('far');   // FAR strategy zoom → bypass
  });
});
