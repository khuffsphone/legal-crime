// RTS-37 — the high-fidelity thug drawer (drawThugRig2) render/perf smoke test. We can't judge LOOK in
// node, but we CAN guarantee: it renders (no throw) for both factions across idle/walk/run, it reads ONLY
// from the pose (deterministic — same pose ⇒ same op count), and it stays BOUNDED (no accidental
// unbounded loop = the "no perf regression at many-units zoom" guard) and within a sane factor of the
// current drawer. A Proxy mock counts every Graphics call and is chainable.
import { describe, it, expect, vi } from 'vitest';
// rigDraw → cityArt both `import Phaser from 'phaser'`, whose OS.js touches `window` at load (the node test
// env has none). Phaser is used ONLY as an erased TYPE here + as `new Phaser.Geom.Point` inside cityArt fns
// that drawThugRig2 never calls — so a stub default export lets us import + exercise the pure drawing math.
vi.mock('phaser', () => ({ default: {} }));
import { drawThugRig, drawThugRig2, PLAYER_RIG, RIVAL_RIG } from '../src/scenes/rigDraw';
import { idlePose, walkPose, runPose } from '../src/scenes/gait';

function mockG(): { opCount: number } & Record<string, (...a: unknown[]) => unknown> {
  let ops = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'opCount') return ops;
      return (..._a: unknown[]) => { ops += 1; return g; };
    },
  });
  return g;
}

const POSES = [
  { name: 'idle', pose: idlePose(0) },
  { name: 'walk', pose: walkPose(0.25) },
  { name: 'run', pose: runPose(0.5) },
];

describe('drawThugRig2 — renders for every faction × locomotion (no throw)', () => {
  for (const { name, pose } of POSES) {
    for (const [fac, st] of [['player', PLAYER_RIG], ['rival', RIVAL_RIG]] as const) {
      it(`${fac} ${name} renders`, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => drawThugRig2(mockG() as any, pose, st)).not.toThrow();
      });
    }
  }
});

describe('drawThugRig2 — deterministic + bounded (perf guard)', () => {
  it('is deterministic: the same pose yields the same op count', () => {
    const a = mockG(), b = mockG();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drawThugRig2(a as any, walkPose(0.3), PLAYER_RIG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drawThugRig2(b as any, walkPose(0.3), PLAYER_RIG);
    expect(a.opCount).toBe(b.opCount);
  });

  it('emits a bounded number of draw ops (no unbounded loop)', () => {
    const g = mockG();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drawThugRig2(g as any, walkPose(0.3), PLAYER_RIG);
    expect(g.opCount).toBeGreaterThan(20);   // it actually draws the figure
    expect(g.opCount).toBeLessThan(200);     // …but a fixed, small set of shapes per frame
  });

  it('stays within a sane factor of the current drawer (fidelity costs ops, not a blowup)', () => {
    const g1 = mockG(), g2 = mockG();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drawThugRig(g1 as any, walkPose(0.3), PLAYER_RIG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drawThugRig2(g2 as any, walkPose(0.3), PLAYER_RIG);
    expect(g2.opCount).toBeLessThan(g1.opCount * 4);
  });
});
