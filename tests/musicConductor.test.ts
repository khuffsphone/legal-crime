// RTS-31 — the MUSIC CONDUCTOR. The beta teardown heard 3 music beds at once: skip-week fired phase
// transitions faster than the 700ms crossfade, and the old setPhase only retired the SINGLE previous
// bed, so orphan instances stacked. The fix is a pure conductor (audioMap.conductBeds) that, on every
// phase change, names EVERY live bed instance to stop — guaranteeing ≤1 bed afterward. These tests
// drive the conductor exactly as the manager does (start pushes an instance, stop removes it) and
// assert the live-bed count never exceeds 1 across a rapid, oscillating phase sequence.

import { describe, it, expect } from 'vitest';
import {
  conductBeds, musicBedForPhase, holdBed, BED_MIN_INTERVAL_MS, type BedInstance, type BedHold, type MusicPhase,
} from '../src/scenes/audioMap';

/** Apply a conductor decision to a live-instance list the way AudioManager.setPhase does. */
function step(live: BedInstance[], seq: { n: number }, phase: MusicPhase, isLoaded?: (b: string) => boolean): BedInstance[] {
  const d = conductBeds(live, phase, isLoaded);
  const stopIds = new Set(d.stop.map((s) => s.id));
  const next = live.filter((i) => !stopIds.has(i.id));
  if (d.start) next.push({ id: ++seq.n, bed: d.start });
  return next;
}

describe('music conductor — at most one bed', () => {
  it('rapid, oscillating phase flips never leave more than one live bed', () => {
    const seq = { n: 0 };
    let live: BedInstance[] = [];
    // a skip-week storm: many phase changes back-to-back (A→B→A across distinct beds).
    const storm: MusicPhase[] = ['TITLE', 'ESTABLISH', 'DECAPITATE', 'ESTABLISH', 'CONTEST', 'TITLE', 'DECAPITATE', 'ESTABLISH', 'GAMEOVER', 'TITLE'];
    let maxLive = 0;
    for (const ph of storm) {
      live = step(live, seq, ph);
      maxLive = Math.max(maxLive, live.length);
      expect(live.length).toBeLessThanOrEqual(1); // ≤1 after every transition
    }
    expect(maxLive).toBe(1);
    expect(live[0].bed).toBe(musicBedForPhase('TITLE')); // settled on the last phase's bed
  });

  it('same-bed phases (FIRST BLOOD ↔ CONTEST share the conflict bed) do NOT restart or stack', () => {
    const seq = { n: 0 };
    let live = step([], seq, 'FIRST BLOOD');
    const idAfterFirst = live[0].id;
    live = step(live, seq, 'CONTEST'); // same bed → no-op, no new instance
    expect(live.length).toBe(1);
    expect(live[0].id).toBe(idAfterFirst); // not restarted
  });

  it('a missing clip silences every bed and starts none', () => {
    const seq = { n: 0 };
    let live = step([], seq, 'ESTABLISH'); // establish loads
    expect(live.length).toBe(1);
    live = step(live, seq, 'DECAPITATE', (b) => b !== 'music_war'); // war clip absent
    expect(live.length).toBe(0);
  });
});

// AUDIO PASS — the SINK-LEVEL DWELL: even though conductBeds keeps ≤1 bed PER change, the caller used to
// request changes every frame as the game phase oscillated → a thrash of crossfades + a scratchy restart.
// holdBed makes transitions RARE: a different-clip switch is held until the min interval elapses.
describe('holdBed — the conductor picks ONE bed and HOLDS it under an oscillating request', () => {
  const map = (p: MusicPhase) => musicBedForPhase(p);

  it('the FIRST bed starts immediately; the same bed is always a no-op', () => {
    let h: BedHold = { bed: '', sinceMs: Number.NEGATIVE_INFINITY };
    let r = holdBed(h, map('ESTABLISH'), 0); // first ever → applies
    expect(r.changed).toBe(true); h = r.hold;
    r = holdBed(h, map('ESTABLISH'), 100); // same clip → no-op regardless of time
    expect(r.changed).toBe(false);
  });

  it('an OSCILLATING phase request does NOT swap the bed within the dwell window', () => {
    // simulate updateConductor calling every ~16ms with a phase flipping CONTEST↔DECAPITATE↔ESTABLISH
    // (distinct clips) — the real bug. Only the first switch lands; the rest are held.
    let h: BedHold = { bed: '', sinceMs: Number.NEGATIVE_INFINITY };
    const flips: MusicPhase[] = ['CONTEST', 'DECAPITATE', 'ESTABLISH', 'DECAPITATE', 'CONTEST', 'ESTABLISH'];
    let switches = 0;
    let t = 0;
    // first request settles the bed
    let r = holdBed(h, map(flips[0]), t); if (r.changed) { switches++; h = r.hold; }
    // now hammer it for ~3s, well within BED_MIN_INTERVAL_MS, alternating clips every frame
    for (let i = 1; i < 200; i++) { t += 16; r = holdBed(h, map(flips[i % flips.length]), t); if (r.changed) { switches++; h = r.hold; } }
    expect(switches).toBe(1);            // it picked ONE bed and HELD it
    expect(h.bed).toBe(map('CONTEST'));  // the first one
  });

  it('after the dwell elapses, a sustained DIFFERENT bed is allowed (exactly one more switch)', () => {
    let h: BedHold = { bed: map('ESTABLISH'), sinceMs: 0 };
    expect(holdBed(h, map('DECAPITATE'), BED_MIN_INTERVAL_MS - 1).changed).toBe(false); // still too soon
    const r = holdBed(h, map('DECAPITATE'), BED_MIN_INTERVAL_MS + 1);                    // dwell elapsed
    expect(r.changed).toBe(true);
    expect(r.hold.bed).toBe(map('DECAPITATE'));
  });

  it('force (terminal TITLE/GAMEOVER, init) bypasses the dwell', () => {
    const h: BedHold = { bed: map('CONTEST'), sinceMs: 1000 };
    expect(holdBed(h, map('GAMEOVER'), 1100, BED_MIN_INTERVAL_MS, true).changed).toBe(true); // forced → immediate
  });
});
