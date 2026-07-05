// AUDIO E-H — Ticket H3, the SCENE ADAPTER (pure, Phaser-free). The adapter is the one bridge from the
// coordinator's intent stream to the AudioManager; here we drive it with a SPY sink (DI, no real manager)
// and prove: every intent op translates to the right sink call, pan/positional are dropped (stereo-flat),
// a zoom-LOD crossing forces an off-cadence emitter re-plan, collector cues come from deposits, a hidden
// tile can never produce a positional cue, and identical inputs are deterministic. No IsoScene boot.
import { describe, it, expect } from 'vitest';
import type { AtmosphereFrame } from '../src/scenes/audio/atmosphereCoordinator';
import type { AtmosphereIntent } from '../src/scenes/audio/atmosphereIntents';
import {
  AtmosphereSceneAdapter, applyAtmosphereIntents, type AtmosphereSink,
} from '../src/scenes/audio/atmosphereSceneAdapter';
import type { GameEvent } from '../src/sim';

// A recording spy sink (mirrors the noXrayGate injected-predicate style — a plain object, no manager).
function spySink(): { sink: AtmosphereSink; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const sink: AtmosphereSink = {
    playOneShot: (...a) => calls.push(['playOneShot', ...a]),
    startLoop: (...a) => calls.push(['startLoop', ...a]),
    stopLoop: (...a) => calls.push(['stopLoop', ...a]),
    setLoopGain: (...a) => calls.push(['setLoopGain', ...a]),
    duck: (...a) => calls.push(['duck', ...a]),
  };
  return { sink, calls };
}

const log = (kind: string, data?: Record<string, unknown>): GameEvent => ({ tick: 1, kind, message: 'm', ...(data ? { data } : {}) });
function frame(over: Partial<AtmosphereFrame>): AtmosphereFrame {
  return {
    nowMs: 10_000,
    camera: { centerTile: { gx: 5, gy: 5 }, audioZoom: 1.0 },
    districtAt: () => 'MARKET',
    eligibility: () => ({ revealed: true, onScreen: true }),
    playerFamilyId: 'player',
    ...over,
  };
}

describe('applyAtmosphereIntents — intent → sink translation', () => {
  it('maps every op to its sink call and DROPS pan/positional/tile (the manager is stereo-flat)', () => {
    const { sink, calls } = spySink();
    const intents: AtmosphereIntent[] = [
      { op: 'duck', targetsDb: { music: 0, beds: -6, emitters: -3, oneshots: 0 }, attackMs: 30, holdMs: 250, releaseMs: 1100, trigger: 'combat' },
      { op: 'playOneShot', bus: 'oneshots', key: 'police_raid_bust', priority: 90, positional: true, tile: { gx: 3, gy: 4 }, gain: 0.8, pan: 0.5, source: 'x' },
      { op: 'playLoop', bus: 'beds', key: 'bed_market_base', voiceId: 'bed:market:base', gain: 0.7, fadeInMs: 1500, pan: 0.2 },
      { op: 'setLoop', bus: 'beds', voiceId: 'bed:market:base', gain: 0.5, pan: -0.3 },
      { op: 'stopLoop', bus: 'beds', voiceId: 'bed:market:base', fadeOutMs: 900 },
    ];
    applyAtmosphereIntents(intents, sink);
    expect(calls).toEqual([
      ['duck', 250],                                        // holdMs only (manager duck is ms + beds-only)
      ['playOneShot', 'police_raid_bust', 0.8],            // key + gain; tile & pan discarded
      ['startLoop', 'bed:market:base', 'bed_market_base', 0.7, 1500],
      ['setLoopGain', 'bed:market:base', 0.5],             // pan discarded
      ['stopLoop', 'bed:market:base', 900],
    ]);
  });

  it('an empty intent list makes zero sink calls', () => {
    const { sink, calls } = spySink();
    applyAtmosphereIntents([], sink);
    expect(calls).toEqual([]);
  });
});

describe('AtmosphereSceneAdapter.step — coordinator → sink', () => {
  it('drives collector cues from deposits onto the sink as a one-shot', () => {
    const { sink, calls } = spySink();
    const adapter = new AtmosphereSceneAdapter(1, sink);
    adapter.step(frame({ collectorDeposits: [{ collectorId: 'c1', familyId: 'player', banked: 200 }] }));
    expect(calls.some((c) => c[0] === 'playOneShot' && c[1] === 'collector_deposit')).toBe(true);
  });

  it('a zoom-LOD crossing forces an OFF-CADENCE emitter re-plan (fast zoom-out sheds loops NOW)', () => {
    const { sink, calls } = spySink();
    const adapter = new AtmosphereSceneAdapter(1, sink);
    const sources = [{ id: 's:fountain', family: 'fountain' as const, gx: 5, gy: 5 }];
    // t=0 MID: the fountain anchor loop starts.
    adapter.step(frame({ nowMs: 0, emitterSources: sources, camera: { centerTile: { gx: 5, gy: 5 }, audioZoom: 1.0 } }));
    expect(calls.some((c) => c[0] === 'startLoop')).toBe(true);
    // t=100 (INSIDE the 500 ms emitter cadence) the player zooms straight past FAR — the adapter detects
    // the MID→FAR LOD crossing and forces the re-plan, so the stopLoop lands now, not up to 500 ms late.
    const before = calls.length;
    adapter.step(frame({ nowMs: 100, emitterSources: sources, camera: { centerTile: { gx: 5, gy: 5 }, audioZoom: 0.4 } }));
    expect(calls.slice(before).some((c) => c[0] === 'stopLoop')).toBe(true);
  });

  it('threads coordinator state across frames — a bed pair starts ONCE, then only re-trims (no restart)', () => {
    const { sink, calls } = spySink();
    const adapter = new AtmosphereSceneAdapter(1, sink);
    adapter.step(frame({ nowMs: 0 }));      // arm the bed candidate (hysteresis — no bed yet)
    adapter.step(frame({ nowMs: 750 }));    // candidate ripens → MARKET bed pair fades in
    const starts = calls.filter((c) => c[0] === 'startLoop' && String(c[2]).startsWith('bed_market'));
    expect(starts).toHaveLength(2); // base + color, exactly once
    adapter.step(frame({ nowMs: 1000 }));   // same district — must NOT restart the loops
    const startsAfter = calls.filter((c) => c[0] === 'startLoop' && String(c[2]).startsWith('bed_market'));
    expect(startsAfter).toHaveLength(2);
  });

  it('is deterministic — same seed + same frames ⇒ identical sink-call log', () => {
    const run = (): unknown[][] => {
      const { sink, calls } = spySink();
      const adapter = new AtmosphereSceneAdapter(42, sink);
      for (let k = 0; k < 20; k++) {
        adapter.step(frame({
          nowMs: k * 500,
          camera: { centerTile: { gx: 5 + (k % 3), gy: 5 }, audioZoom: k < 10 ? 1.0 : 1.3 },
          emitterSources: [{ id: 'src:fountain', family: 'fountain', gx: 5, gy: 5 }],
          observation: k === 4 ? { logEvents: [log('fed-armed')] } : undefined,
        }));
      }
      return calls;
    };
    expect(run()).toEqual(run());
  });
});

describe('AtmosphereSceneAdapter — NO-X-RAY: a hidden tile never produces a positional cue', () => {
  const extortionConverted = [{
    actId: 'a', thugId: 't', frontId: 'front-9', kind: 'shakedown' as const,
    state: 'resolve' as const, prevState: 'shakedown' as const, progress: 1,
    converted: true, retook: false, sabotaged: false, failed: false,
  }];

  it('a fogged extortion front downgrades to a NON-positional one-shot; the sink gets no tile/pan', () => {
    const { sink, calls } = spySink();
    const adapter = new AtmosphereSceneAdapter(1, sink);
    const step = adapter.step(frame({
      observation: { extortion: extortionConverted, tileOfFront: () => ({ gx: 9, gy: 9 }) },
      eligibility: () => ({ revealed: false, onScreen: true }), // hidden tile, but on-screen
    }));
    // coordinator downgrade: the cue is emitted but stripped of position
    const shot = step.intents.find((i) => i.op === 'playOneShot') as { key: string; positional: boolean; tile?: unknown };
    expect(shot.key).toBe('extortion_shakedown_converted');
    expect(shot.positional).toBe(false);
    expect(shot.tile).toBeUndefined();
    // and the SINK only ever received (key, gain) — structurally it cannot carry a position anyway
    const played = calls.find((c) => c[0] === 'playOneShot' && c[1] === 'extortion_shakedown_converted');
    expect(played).toEqual(['playOneShot', 'extortion_shakedown_converted', expect.any(Number)]);
  });

  it('debugRevealAll semantics: revealed=true but onScreen=false is still SUPPRESSED as positional', () => {
    // The adapter is fed {revealed,onScreen} pre-split; a ?reveal board sets revealed=true but must NOT
    // flip onScreen. An off-screen tile (onScreen:false) can never be positional — shouldEmitFeedback
    // needs BOTH. This is the row-3 invariant proven at the coordinator boundary the adapter feeds.
    const { sink } = spySink();
    const adapter = new AtmosphereSceneAdapter(1, sink);
    const step = adapter.step(frame({
      observation: { extortion: extortionConverted, tileOfFront: () => ({ gx: 9, gy: 9 }) },
      eligibility: () => ({ revealed: true, onScreen: false }), // ?reveal lifted the veil; still off-screen
    }));
    const shot = step.intents.find((i) => i.op === 'playOneShot') as { positional: boolean; tile?: unknown };
    expect(shot.positional).toBe(false); // reveal does not make off-screen audio positional
    expect(shot.tile).toBeUndefined();
  });
});
