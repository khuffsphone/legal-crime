// RTS-31 — the MUSIC CONDUCTOR. The beta teardown heard 3 music beds at once: skip-week fired phase
// transitions faster than the 700ms crossfade, and the old setPhase only retired the SINGLE previous
// bed, so orphan instances stacked. The fix is a pure conductor (audioMap.conductBeds) that, on every
// phase change, names EVERY live bed instance to stop — guaranteeing ≤1 bed afterward. These tests
// drive the conductor exactly as the manager does (start pushes an instance, stop removes it) and
// assert the live-bed count never exceeds 1 across a rapid, oscillating phase sequence.

import { describe, it, expect } from 'vitest';
import { conductBeds, musicBedForPhase, type BedInstance, type MusicPhase } from '../src/scenes/audioMap';

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
