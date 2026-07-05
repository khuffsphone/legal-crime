// atmosphereSceneAdapter.ts — AUDIO E-H, Ticket H3 (the scene side). The SINGLE bridge between the pure
// coordinator (stepAtmosphere) and the AudioManager. It holds the per-match AtmosphereState + the zoom-LOD
// tracker, steps the coordinator once per frame, and translates its ordered intents into AudioSink calls.
//
// Kept DEPENDENCY-INJECTED and Phaser-free: the sink arrives by injection (this module never imports
// ../audio, never reaches the manager's private clip catalog), so it unit-tests with a plain spy and the
// audio-dir "no ../audio / no runtime sim import" guards stay green. /src/sim is type-only (erased). The
// scene owns the actual AudioManager; here we only decide WHICH calls to make and in WHAT order.

import {
  createAtmosphereState, stepAtmosphere,
  type AtmosphereFrame, type AtmosphereState, type AtmosphereStep,
} from './atmosphereCoordinator';
import type { AtmosphereIntent } from './atmosphereIntents';
import { audioLod, type AudioLod } from './propEmitterPlanner';

/** The playback surface the adapter drives — a structural SUBSET of AudioManager, injected so this module
 * stays Phaser-free + spy-testable. Loops are voiceId-keyed; pan/positional are intentionally absent (the
 * manager is stereo-flat, and the coordinator already used the eligibility gate to downgrade hidden-tile
 * cues to non-positional before they ever reach here). */
export interface AtmosphereSink {
  playOneShot(key: string, gain: number): void;
  startLoop(voiceId: string, key: string, gain: number, fadeInMs: number): void;
  stopLoop(voiceId: string, fadeOutMs: number): void;
  setLoopGain(voiceId: string, gain: number): void;
  duck(holdMs: number): void;
}

/** Translate ONE coordinator intent list into sink calls, preserving the coordinator's order (ducks →
 * event one-shots by priority → bed loops → emitter loops). Pure over the sink. pan/positional/tile are
 * dropped — no positional seam exists; the coordinator already gated positional integrity upstream. */
export function applyAtmosphereIntents(intents: readonly AtmosphereIntent[], sink: AtmosphereSink): void {
  for (const it of intents) {
    switch (it.op) {
      case 'playOneShot': sink.playOneShot(it.key, it.gain); break;                 // pan/tile dropped
      case 'playLoop':    sink.startLoop(it.voiceId, it.key, it.gain, it.fadeInMs); break;
      case 'setLoop':     sink.setLoopGain(it.voiceId, it.gain); break;             // retrim, no restart
      case 'stopLoop':    sink.stopLoop(it.voiceId, it.fadeOutMs); break;
      case 'duck':        sink.duck(it.holdMs); break;                              // lossy: manager duck is beds/ms only
    }
  }
}

export class AtmosphereSceneAdapter {
  private state: AtmosphereState;
  private readonly sink: AtmosphereSink;
  private lastLod: AudioLod | null = null;

  constructor(seed: number, sink: AtmosphereSink) {
    this.state = createAtmosphereState(seed);
    this.sink = sink;
  }

  /** ONE frame. The scene builds the AtmosphereFrame from the post-updateAndObserve surface; the adapter
   * forces an emitter re-plan on a zoom-LOD crossing (so a fast zoom-out sheds emitters immediately rather
   * than up to 500 ms late), steps the pure coordinator, threads its state forward, and drives the sink.
   * Returns the step so the scene/tests can inspect intents + rejected cues (?debugaudio). */
  step(frame: AtmosphereFrame): AtmosphereStep {
    const lod = audioLod(frame.camera.audioZoom);
    const crossedLod = this.lastLod !== null && lod !== this.lastLod;
    this.lastLod = lod;
    const stepped = stepAtmosphere(
      this.state,
      frame.forceEmitterPlan || !crossedLod ? frame : { ...frame, forceEmitterPlan: true },
    );
    this.state = stepped.state;
    applyAtmosphereIntents(stepped.intents, this.sink);
    return stepped;
  }
}
