// RTS-32 — the procedural GAIT (pure, Phaser-free, render-side math). The "skip" was a baked figure
// sprite getting a single sine-bob applied to the whole quad — feet skated. This module is Design's
// articulated rig posed by a DISTANCE-DRIVEN gait clock, so a walking thug reads as a real stride:
// the forward foot PLANTS and holds while the body vaults over it, the rear leg pushes off and swings
// through with a bent knee, the arms swing in OPPOSITION, and the shoulders counter-twist against the
// hips. Cadence tracks ground speed (the anti-skate keystone) — feet never skate. IsoScene owns the
// Phaser Graphics and just STROKES the points this module returns; all the trig + the testable
// invariants (opposed limbs / foot-plant / phase ∝ distance / idle doesn't step) live here.
//
// Coordinate convention for a pose: offsets are in screen px, relative to the unit's GROUND point
// (the foot-center the selection ring anchors). +x = the facing-FORWARD direction (the drawer mirrors
// for facing-left), +y = DOWN. `footLift` is height ABOVE the ground (0 = planted). The VAULT raises
// the pelvis (bodyY) but NEVER a planted foot — so the contact anchor never moves with the vault.

// ── tunable rig geometry (px, for the ~56px MID figure — the rts30c scale) ──────────────────────
export const FIGURE_PX = 56; // rts30c-scale figure height — UNCHANGED (the silhouette/anchor contract)
export const HIP_H = 20;     // pelvis (hip line) height above the ground point (< leg length ⇒ stepping slack)
export const TORSO_H = 17;   // hip → shoulder
export const SHOULDER_HW = 6; // half shoulder width
export const HIP_HW = 4;      // half hip width
export const HEAD_H = 8;      // shoulder → head center
export const ARM_DROP = 14;   // shoulder → relaxed hand drop

// ── tunable gait degrees/lengths (Design's seed 46/92 hand-tuned to THIS 56px figure until the skip
// was gone: a 46px stride throws a ±23px foot past the ±8px rest stance — the splits, not a step — so
// the stride is tuned to a ±12px excursion that reads as a planted, moderate pace; the run keeps the
// ~1.8× longer-stride relationship). The anti-skate (cadence ∝ distance) holds at any stride. ──────
export const WALK_STRIDE = 36; // px of ground travel per full gait cycle at a walk (tuned from 46)
export const RUN_STRIDE = 78;  // a run lengthens the stride (tuned from 92)
const WALK_DUTY = 0.62;        // fraction of the cycle a foot is PLANTED (>0.5 ⇒ always one foot down)
const RUN_DUTY = 0.34;         // <0.5 ⇒ a FLIGHT phase (both feet airborne — the run "float")
const WALK_LIFT = 5;           // swing-foot peak lift
const RUN_LIFT = 8;
const WALK_VAULT = 2.4;        // pelvis rise at mid-stance (the body vaulting over the planted leg)
const RUN_VAULT = 4.2;
const WALK_SWAY = 1.0;         // lateral weight shift
const WALK_ARM = 7;            // hand fore/aft swing amplitude
const RUN_ARM = 12;
const WALK_TWIST = 3;          // shoulder counter-rotation vs the hips (opposed)
const RUN_TWIST = 5;
const RUN_LEAN = 5;            // forward torso lean into a run
const IDLE_STANCE = 4;         // half-distance between the two planted feet at rest
const IDLE_BREATH_PX = 1.1;    // gentle idle vault (breath)
const IDLE_BREATH_MS = 1600;   // ≥1300 idle loop (matches MOTION.idleBreath)
const TWO_PI = Math.PI * 2;

export interface LegPose { footDX: number; footLift: number; } // footLift 0 ⇒ planted on the ground
export interface ArmPose { handDX: number; handLift: number; }
export interface RigPose {
  bodyX: number;        // lateral pelvis sway (pre-facing)
  bodyY: number;        // VAULT — pelvis rise (negative = up); never moves a planted foot
  lean: number;         // forward torso lean (px at the shoulders)
  hipTwist: number;     // pelvis horizontal twist (leads the forward leg)
  shoulderTwist: number; // shoulder twist — OPPOSITE sign to hipTwist (counter-rotation)
  headDX: number; headDY: number;
  legL: LegPose; legR: LegPose;
  armL: ArmPose; armR: ArmPose;
}

// ── THE ANTI-SKATE KEYSTONE ──────────────────────────────────────────────────────────────────────
/** Advance the gait clock by GROUND DISTANCE, not time: `phase = (phase + dist/stride) % 1`. Cadence
 * therefore tracks real speed — 2× the speed advances ~2× the phase — so the planted foot tracks
 * straight back under the body at exactly ground speed and NEVER skates. dist≤0 holds the phase (a
 * stopped unit freezes its stride and eases to idle); a teleport (dist ≫ stride) holds too. */
export function advanceGaitPhase(phase: number, dist: number, stride: number): number {
  if (!(stride > 0) || !(dist > 0) || dist > stride * 2.5) return phase; // hold on stop/teleport
  const p = (phase + dist / stride) % 1;
  return p < 0 ? p + 1 : p;
}

/** One leg through a cycle. THE PLANT MATH: with the gait clock distance-driven (phase = B/stride,
 * B = body world-x), a planted foot must hold a FIXED world point — so its body-relative offset must
 * slide back at slope −stride (d footDX/d phase = −stride ⇒ d(B+footDX)/d phase = 0 = world-fixed).
 * STANCE [0,duty): footDX = ½·step − p·stride (planted, foot world-position constant). SWING [duty,1):
 * the foot lifts in an arc and swings forward to the next plant. The visible step = duty·stride, so the
 * foot excursion is ±duty·stride/2 — never the full ±stride/2 (that older form skated backward). */
function legGait(phase: number, stride: number, duty: number, lift: number): LegPose {
  const p = ((phase % 1) + 1) % 1;
  const half = (duty * stride) / 2; // half the visible step = the planted excursion
  if (p < duty) {
    return { footDX: half - p * stride, footLift: 0 }; // PLANTED: slope −stride ⇒ world-fixed, no skate
  }
  const v = (p - duty) / (1 - duty);  // 0→1 across swing
  return { footDX: -half + v * duty * stride, footLift: lift * Math.sin(Math.PI * v) };
}

export function legWalk(phase: number, stride: number = WALK_STRIDE): LegPose {
  return legGait(phase, stride, WALK_DUTY, WALK_LIFT);
}
export function legRun(phase: number, stride: number = RUN_STRIDE): LegPose {
  return legGait(phase, stride, RUN_DUTY, RUN_LIFT);
}

/** An arm swings as a free pendulum in OPPOSITION to its same-side leg. Forward (+) at phase 0 so the
 * RIGHT arm leads when the LEFT leg plants forward (cos: +1 at phase 0). */
export function armSwing(phase: number, amp: number): ArmPose {
  const a = Math.cos(TWO_PI * phase);
  return { handDX: a * amp, handLift: Math.max(0, a) * 1.5 }; // a touch of lift as it swings forward
}

/** Build a full WALK pose at `phase`. Legs are a half-cycle apart (opposed); each arm opposes its
 * same-side leg; the pelvis vaults at mid-stance and the shoulders counter-rotate against the hips. */
export function walkPose(phase: number): RigPose {
  const legL = legWalk(phase);
  const legR = legWalk(phase + 0.5);
  const armR = armSwing(phase, WALK_ARM);          // right arm leads the left leg
  const armL = armSwing(phase + 0.5, WALK_ARM);
  const hipTwist = ((legL.footDX - legR.footDX) / WALK_STRIDE) * WALK_TWIST; // hips lead the front leg
  return {
    bodyX: Math.sin(TWO_PI * phase) * WALK_SWAY,
    bodyY: -Math.abs(Math.sin(TWO_PI * phase)) * WALK_VAULT, // up at each mid-stance (twice/cycle)
    lean: 0,
    hipTwist,
    shoulderTwist: -hipTwist, // OPPOSED — the counter-twist
    headDX: -hipTwist * 0.3, headDY: 0,
    legL, legR, armL, armR,
  };
}

/** A RUN: a longer stride, lower duty (a float), more vault + arm drive, and a forward lean. */
export function runPose(phase: number): RigPose {
  const legL = legRun(phase);
  const legR = legRun(phase + 0.5);
  const armR = armSwing(phase, RUN_ARM);
  const armL = armSwing(phase + 0.5, RUN_ARM);
  const hipTwist = ((legL.footDX - legR.footDX) / RUN_STRIDE) * RUN_TWIST;
  return {
    bodyX: Math.sin(TWO_PI * phase) * WALK_SWAY,
    bodyY: -Math.abs(Math.sin(TWO_PI * phase)) * RUN_VAULT,
    lean: RUN_LEAN,
    hipTwist,
    shoulderTwist: -hipTwist,
    headDX: -hipTwist * 0.3, headDY: 0,
    legL, legR, armL, armR,
  };
}

/** IDLE: both feet planted at a neutral stance (NO step — footLift stays 0 for all t), a gentle breath
 * vault, and a slow weight sway. `tMs` is wall-clock so the breath loops independent of the gait clock. */
export function idlePose(tMs: number): RigPose {
  const ph = (tMs / IDLE_BREATH_MS) * TWO_PI;
  return {
    bodyX: Math.sin(ph * 0.5) * 0.6,
    bodyY: -(0.5 + 0.5 * Math.sin(ph)) * IDLE_BREATH_PX, // a shallow chest breath
    lean: 0, hipTwist: 0, shoulderTwist: 0, headDX: 0, headDY: 0,
    legL: { footDX: -IDLE_STANCE, footLift: 0 }, // planted, apart — the anchor never lifts
    legR: { footDX: IDLE_STANCE, footLift: 0 },
    armL: { handDX: -0.5, handLift: 0 }, armR: { handDX: 0.5, handLift: 0 },
  };
}

// ── blends (idle ↔ walk ↔ run cross-fade, gaitPhase kept continuous) ─────────────────────────────
function lerp(a: number, b: number, w: number): number { return a + (b - a) * w; }
function lerpLeg(a: LegPose, b: LegPose, w: number): LegPose {
  return { footDX: lerp(a.footDX, b.footDX, w), footLift: lerp(a.footLift, b.footLift, w) };
}
function lerpArm(a: ArmPose, b: ArmPose, w: number): ArmPose {
  return { handDX: lerp(a.handDX, b.handDX, w), handLift: lerp(a.handLift, b.handLift, w) };
}

/** Cross-fade two poses (w 0→a, 1→b). Used for the idle↔walk↔run blends; because both ends are
 * sampled at the SAME continuous gaitPhase, the foot-plant never pops across a state change. */
export function blendPose(a: RigPose, b: RigPose, w: number): RigPose {
  return {
    bodyX: lerp(a.bodyX, b.bodyX, w), bodyY: lerp(a.bodyY, b.bodyY, w),
    lean: lerp(a.lean, b.lean, w), hipTwist: lerp(a.hipTwist, b.hipTwist, w),
    shoulderTwist: lerp(a.shoulderTwist, b.shoulderTwist, w),
    headDX: lerp(a.headDX, b.headDX, w), headDY: lerp(a.headDY, b.headDY, w),
    legL: lerpLeg(a.legL, b.legL, w), legR: lerpLeg(a.legR, b.legR, w),
    armL: lerpArm(a.armL, b.armL, w), armR: lerpArm(a.armR, b.armR, w),
  };
}

/** The locomotion target for a unit: 0 = idle (stopped), 1 = walk, 2 = run (≥ runSpeed). */
export function locoTarget(speed: number, moving: boolean, runSpeed: number): number {
  if (!moving) return 0;
  return speed >= runSpeed ? 2 : 1;
}

/** Ease the current loco value toward its target — an exponential approach giving the ~150ms state
 * cross-fade (and the ~250ms stop→idle settle). `tauMs` is the time constant; dtMs the frame delta. */
export function easeLoco(cur: number, target: number, dtMs: number, tauMs: number): number {
  if (!(tauMs > 0)) return target;
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  return cur + (target - cur) * k;
}

/** The pose for a continuous gaitPhase + an eased loco value (0..2): idle↔walk for loco≤1, walk↔run
 * above. gaitPhase stays continuous across the blend so the stride never resets. */
export function poseFor(gaitPhase: number, loco: number, tMs: number): RigPose {
  if (loco <= 0) return idlePose(tMs);
  if (loco <= 1) return blendPose(idlePose(tMs), walkPose(gaitPhase), loco);
  return blendPose(walkPose(gaitPhase), runPose(gaitPhase), Math.min(1, loco - 1));
}

// ── LOD ──────────────────────────────────────────────────────────────────────────────────────────
export type RigLOD = 'full' | 'far';
/** Which rig LOD a zoom warrants: CLOSE/MID draw the full articulated rig; FAR (the strategy zoom)
 * BYPASSES the per-frame rig entirely for a cheap silhouette/dot. Threshold sits below the MID stop. */
export function rigLOD(zoom: number): RigLOD {
  return zoom >= 0.45 ? 'full' : 'far';
}
