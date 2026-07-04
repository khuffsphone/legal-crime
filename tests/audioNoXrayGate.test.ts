// Ticket C — the NO-X-RAY gate. Guards the audio law: a LOCAL (tile-tied) cue plays ONLY when its tile
// passes the render's OWN reveal predicate (injected IsVisible — the opPreview contract) AND is on-screen
// (the shipped shouldEmitFeedback combinator); global/HUD/federal cues bypass. A hidden local event is
// SUPPRESSED — sound never leaks a fogged actor.
import { describe, it, expect } from 'vitest';
import { cueAllowed, cueSuppressReason, gateCues } from '../src/scenes/audio/noXrayGate';
import { cueFor, type AudioCueDescriptor } from '../src/scenes/audio/sfxEventMapper';
import { createFog, isRevealed, revealAround } from '../src/sim/fog';
import type { GridPos } from '../src/sim';

const HIT = (gx: number, gy: number): AudioCueDescriptor => cueFor('sfx_hit_pistol', 'hit:pistol', 'test', { gx, gy });
const DOWN = (gx: number, gy: number): AudioCueDescriptor => cueFor('sfx_down_thud', 'down', 'test', { gx, gy });

const NEVER = () => false;
const ALWAYS = () => true;

describe('no-x-ray audio gate — hidden local suppression', () => {
  it('suppresses a LOCAL cue on a hidden tile (reason: hidden)', () => {
    expect(cueAllowed(HIT(4, 4), { isVisible: NEVER })).toBe(false);
    expect(cueSuppressReason(HIT(4, 4), { isVisible: NEVER })).toBe('hidden');
    expect(cueAllowed(DOWN(4, 4), { isVisible: NEVER })).toBe(false);
  });

  it('allows a LOCAL cue on a revealed tile (default: on-screen)', () => {
    expect(cueAllowed(HIT(4, 4), { isVisible: ALWAYS })).toBe(true);
    expect(cueSuppressReason(HIT(4, 4), { isVisible: ALWAYS })).toBeNull();
  });

  it('suppresses a revealed-but-OFF-SCREEN local cue (both halves of shouldEmitFeedback)', () => {
    expect(cueAllowed(HIT(4, 4), { isVisible: ALWAYS, isOnScreen: () => false })).toBe(false);
    expect(cueSuppressReason(HIT(4, 4), { isVisible: ALWAYS, isOnScreen: () => false })).toBe('hidden');
    expect(cueAllowed(HIT(4, 4), { isVisible: ALWAYS, isOnScreen: () => true })).toBe(true);
  });

  it('suppresses a LOCAL cue with NO position defensively (unverifiable ⇒ silent)', () => {
    const noPos: AudioCueDescriptor = { ...HIT(0, 0) };
    delete (noPos as { pos?: GridPos }).pos;
    expect(cueAllowed(noPos, { isVisible: ALWAYS })).toBe(false);
    expect(cueSuppressReason(noPos, { isVisible: ALWAYS })).toBe('no-position');
  });

  it('routes through the SAME reveal math the render uses (sim fog.isRevealed — no parallel system)', () => {
    const fog = createFog();
    revealAround(fog, 5, 5, 2, 32, 32); // reveal a patch around (5,5)
    const isVisible = (pos: GridPos) => isRevealed(fog, Math.round(pos.gx), Math.round(pos.gy)); // the scene's own closure shape
    expect(cueAllowed(HIT(5, 5), { isVisible })).toBe(true);   // inside the reveal
    expect(cueAllowed(HIT(20, 20), { isVisible })).toBe(false); // deep in the fog
  });
});

describe('no-x-ray audio gate — global/HUD/federal bypass', () => {
  it('global and hud cues bypass the gate even when NOTHING is visible', () => {
    for (const cue of [
      cueFor('mutiny', 'mutiny', 'test'),           // global (own crew)
      cueFor('extort', 'extort:b1', 'test'),        // global (own action)
      cueFor('federal_raid', 'fed:3', 'test'),      // hud (own federal ladder)
      cueFor('wire_crisis', 'wire', 'test'),        // hud
      cueFor('sting_lose', 'endgame', 'test'),      // global (endgame)
    ]) {
      expect(cueAllowed(cue, { isVisible: NEVER, isOnScreen: () => false }), cue.key).toBe(true);
    }
  });

  it('gateCues splits a mixed batch, preserving order among the allowed', () => {
    const cues = [
      HIT(1, 1),                                  // hidden → suppressed
      cueFor('federal_watch', 'fed:2', 'test'),   // hud → allowed
      cueFor('extort', 'extort:b2', 'test'),      // global → allowed
      DOWN(2, 2),                                 // hidden → suppressed
    ];
    const { allowed, suppressed } = gateCues(cues, { isVisible: NEVER });
    expect(allowed.map((c) => c.key)).toEqual(['federal_watch', 'extort']);
    expect(suppressed.map((s) => s.cue.key)).toEqual(['sfx_hit_pistol', 'sfx_down_thud']);
    expect(suppressed.every((s) => s.reason === 'hidden')).toBe(true);
  });
});
