// AUDIO E-H — Tickets H2 (coordinator) + F2 (registration/manifest parity). Mutation-table driven,
// including the no-/src/sim-runtime-import guard and the no-private-library-access source scan.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GameEvent } from '../src/sim';
import {
  createAtmosphereState, gateEventCues, stepAtmosphere, type AtmosphereFrame,
} from '../src/scenes/audio/atmosphereCoordinator';
import { createRateLimiterState } from '../src/scenes/audio/mixGovernance';
import {
  ATMOSPHERE_CLIP_KEYS, ATMOSPHERE_CLIP_MANIFEST, isAtmosphereClipKey,
} from '../src/scenes/audio/atmosphereClipManifest';
import { ALL_BED_KEYS } from '../src/scenes/audio/districtBedCatalog';
import { PROP_CLIP_KEYS } from '../src/scenes/audio/propEmitterCatalog';
import {
  atmosphereClipDefs, atmosphereManifestParity, registerAtmosphereClips, verifyAtmosphereClipsLoaded,
} from '../src/scenes/audio/registerAtmosphereClips';
import { AudioManager } from '../src/scenes/audio';
import { federalCueKey } from '../src/scenes/audioMap';
import type { EventCueIntent } from '../src/scenes/audio/eventCueMapper';

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

describe('H2 — coordinator (mutation table)', () => {
  it('MUTATION unknown-key-passes: a cue whose key is not in the manifest is REJECTED + flagged', () => {
    const forged: EventCueIntent = { key: 'not_in_manifest', priority: 90, positional: false, source: 'forged', dedupeKey: 'x' };
    const gate = gateEventCues([forged], createRateLimiterState(), 0);
    expect(gate.admitted).toEqual([]);
    expect(gate.rejected[0]).toMatchObject({ key: 'not_in_manifest', reason: 'unknown-key' });
    expect(isAtmosphereClipKey('federal_armed')).toBe(true);
    expect(isAtmosphereClipKey('not_in_manifest')).toBe(false);
  });

  it('MUTATION tileless-promoted-to-positional: a positional cue without a tile is rejected defensively', () => {
    const forged: EventCueIntent = { key: 'extortion_shakedown_converted', priority: 65, positional: true, source: 'forged', dedupeKey: 'y' };
    const gate = gateEventCues([forged], createRateLimiterState(), 0);
    expect(gate.admitted).toEqual([]);
    expect(gate.rejected[0].reason).toBe('tileless-positional');
  });

  it('MUTATION priority-ignored: one-shot intents come out highest-priority-first', () => {
    const step = stepAtmosphere(createAtmosphereState(1), frame({
      observation: { logEvents: [log('raid'), log('fed-warning', { tier: 3 }), log('raid-bust', { familyId: 'player' })] },
    }));
    const shots = step.intents.filter((i) => i.op === 'playOneShot').map((i) => (i as { key: string }).key);
    expect(shots).toEqual(['federal_raid', 'police_raid_bust', 'player_offense_raid']); // 100 > 90 > 45
    // ducks precede the one-shots in the ordered intent list
    const firstShot = step.intents.findIndex((i) => i.op === 'playOneShot');
    const lastDuck = step.intents.map((i) => i.op).lastIndexOf('duck');
    expect(lastDuck).toBeLessThan(firstShot);
  });

  it('NO-X-RAY: rival and unowned police raid logs never reach atmosphere playback', () => {
    const step = stepAtmosphere(createAtmosphereState(1), frame({
      observation: {
        logEvents: [
          log('raid-bust', { familyId: 'rival-1' }),
          log('raid-operation'),
          log('raid-cash', { familyId: 'player' }),
        ],
      },
    }));
    const shots = step.intents.filter((i) => i.op === 'playOneShot').map((i) => (i as { key: string }).key);
    expect(shots).toEqual(['police_raid_cash']);
  });

  it('MUTATION collector-route-input-ignored + arrivedUnitIds-dependency: deposits drive collector cues; no arrivedUnitIds anywhere', () => {
    const step = stepAtmosphere(createAtmosphereState(1), frame({
      collectorDeposits: [{ collectorId: 'c1', familyId: 'player', banked: 200 }],
    }));
    expect(step.intents.some((i) => i.op === 'playOneShot' && (i as { key: string }).key === 'collector_deposit')).toBe(true);
    // structural guard: no E-H module's CODE ever references the wrapper's arrivedUnitIds (the
    // doc-comments explaining the prohibition are allowed — strip them before matching).
    const dir = join(process.cwd(), 'src', 'scenes', 'audio');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const code = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${f} code references arrivedUnitIds`).not.toMatch(/arrivedUnitIds/);
    }
  });

  it('REGRESSION gate-order: a HIGH-priority cue mapped LAST still wins the H.4 budget over earlier low-priority cues', () => {
    // 7 low-priority extortion outcomes on distinct fronts + police_raid_bust (90) mapped LAST via the
    // log — admission runs on the priority-ORDERED list, so the police cue is admitted and the excess
    // low-priority cues are the ones rate-dropped (EVENT_ONESHOTS_PER_SEC = 6).
    const extortion = Array.from({ length: 7 }, (_, i) => ({
      actId: `a${i}`, thugId: 't', frontId: `front-${i}`, kind: 'shakedown' as const,
      state: 'resolve' as const, prevState: 'shakedown' as const, progress: 1,
      converted: true, retook: false, sabotaged: false, failed: false,
    }));
    const step = stepAtmosphere(createAtmosphereState(1), frame({
      observation: { logEvents: [log('raid-bust', { familyId: 'player' })], extortion },
    }));
    const shots = step.intents.filter((i) => i.op === 'playOneShot').map((i) => (i as { key: string }).key);
    expect(shots[0]).toBe('police_raid_bust'); // priority 90 admitted first
    expect(shots.length).toBeLessThanOrEqual(6);
    expect(step.rejected.filter((r) => r.reason === 'rate').every((r) => r.key.startsWith('extortion_'))).toBe(true);
  });

  it('REGRESSION no-x-ray downgrade: a tiled event cue on a hidden/off-screen tile plays NON-positionally', () => {
    const converted = [{
      actId: 'a', thugId: 't', frontId: 'front-9', kind: 'shakedown' as const,
      state: 'resolve' as const, prevState: 'shakedown' as const, progress: 1,
      converted: true, retook: false, sabotaged: false, failed: false,
    }];
    const hidden = stepAtmosphere(createAtmosphereState(1), frame({
      observation: { extortion: converted, tileOfFront: () => ({ gx: 9, gy: 9 }) },
      eligibility: () => ({ revealed: false, onScreen: false }),
    }));
    const shot = hidden.intents.find((i) => i.op === 'playOneShot') as { positional: boolean; tile?: unknown; key: string };
    expect(shot.key).toBe('extortion_shakedown_converted'); // the player still hears their own outcome…
    expect(shot.positional).toBe(false);                    // …but no position can leak
    expect(shot.tile).toBeUndefined();
    const visible = stepAtmosphere(createAtmosphereState(1), frame({
      observation: { extortion: converted, tileOfFront: () => ({ gx: 9, gy: 9 }) },
    }));
    const vshot = visible.intents.find((i) => i.op === 'playOneShot') as { positional: boolean; tile?: unknown };
    expect(vshot.positional).toBe(true); // eligible tile stays positional
  });

  it('REGRESSION force flags: forceEmitterPlan stops FAR emitters immediately, off-cadence', () => {
    let st = createAtmosphereState(1);
    const sources = [{ id: 's:fountain', family: 'fountain' as const, gx: 5, gy: 5 }];
    let r = stepAtmosphere(st, frame({ nowMs: 0, emitterSources: sources, camera: { centerTile: { gx: 5, gy: 5 }, audioZoom: 1.0 } }));
    st = r.state;
    expect(r.intents.some((i) => i.op === 'playLoop')).toBe(true);
    // 100 ms later (inside the 500 ms cadence) the player zooms straight past FAR — without the force
    // flag nothing happens; with it the stopLoop lands NOW.
    const unforced = stepAtmosphere(st, frame({ nowMs: 100, emitterSources: sources, camera: { centerTile: { gx: 5, gy: 5 }, audioZoom: 0.4 } }));
    expect(unforced.intents.filter((i) => i.op === 'stopLoop')).toHaveLength(0);
    const forced = stepAtmosphere(st, frame({ nowMs: 100, emitterSources: sources, camera: { centerTile: { gx: 5, gy: 5 }, audioZoom: 0.4 }, forceEmitterPlan: true }));
    expect(forced.intents.filter((i) => i.op === 'stopLoop')).toHaveLength(1);
  });

  it('combat side-chain ducks the beds without emitting any combat cue', () => {
    const step = stepAtmosphere(createAtmosphereState(1), frame({ observation: { combatEventCount: 2 } }));
    const duck = step.intents.find((i) => i.op === 'duck' && (i as { trigger: string }).trigger === 'combat');
    expect(duck).toBeTruthy();
    expect((duck as { targetsDb: { beds: number } }).targetsDb.beds).toBe(-6);
    expect(step.intents.filter((i) => i.op === 'playOneShot')).toHaveLength(0);
  });

  it('MUTATION determinism: identical state + frames ⇒ deep-equal intent streams (beds + emitters + cues)', () => {
    const mkFrames = (): AtmosphereFrame[] => Array.from({ length: 20 }, (_, k) => frame({
      nowMs: k * 500,
      camera: { centerTile: { gx: 5 + (k % 3), gy: 5 }, audioZoom: k < 10 ? 1.0 : 1.3 },
      emitterSources: [{ id: 'src:fountain', family: 'fountain', gx: 5, gy: 5 }],
      observation: k === 4 ? { logEvents: [log('fed-armed')] } : undefined,
    }));
    const run = () => {
      let st = createAtmosphereState(42);
      const all: unknown[] = [];
      for (const f of mkFrames()) { const r = stepAtmosphere(st, f); st = r.state; all.push(r.intents); }
      return all;
    };
    expect(run()).toEqual(run());
  });

  it('beds resolve from explored-weighted districts and cadence at 4 Hz; emitters at 2 Hz', () => {
    let st = createAtmosphereState(1);
    // t=0: sample runs (MARKET everywhere explored) — candidate arms; no bed yet (hysteresis)
    let r = stepAtmosphere(st, frame({ nowMs: 0 })); st = r.state;
    expect(r.intents.filter((i) => i.op === 'playLoop')).toHaveLength(0);
    // t=100: too soon for the next 4 Hz sample — no bed intents at all
    r = stepAtmosphere(st, frame({ nowMs: 100 })); st = r.state;
    expect(r.intents).toHaveLength(0);
    // t=750+: the candidate ripens → the MARKET bed pair fades in
    r = stepAtmosphere(st, frame({ nowMs: 750 })); st = r.state;
    const plays = r.intents.filter((i) => i.op === 'playLoop').map((i) => (i as { key: string }).key);
    expect(plays.sort()).toEqual(['bed_market_base', 'bed_market_color']);
    // fully-fogged sample: bed HOLDS (no stop intents), gain re-trimmed with the −6 dB penalty
    r = stepAtmosphere(st, frame({ nowMs: 1250, districtAt: () => null })); st = r.state;
    expect(r.intents.filter((i) => i.op === 'stopLoop')).toHaveLength(0);
    expect(r.intents.filter((i) => i.op === 'setLoop').length).toBeGreaterThan(0);
  });
});

describe('F2 — registration + manifest parity (mutation table)', () => {
  it('the manifest is complete and duplicate-free: 18 beds + 12 event + 8 extortion + 15 prop = 53', () => {
    expect(ATMOSPHERE_CLIP_KEYS).toHaveLength(53);
    expect(new Set(ATMOSPHERE_CLIP_KEYS).size).toBe(53);
    expect(ATMOSPHERE_CLIP_MANIFEST.filter((c) => c.key.startsWith('bed_'))).toHaveLength(18);
    expect(ATMOSPHERE_CLIP_MANIFEST.filter((c) => c.key.startsWith('extortion_'))).toHaveLength(8);
    expect(ATMOSPHERE_CLIP_MANIFEST.filter((c) => c.key.startsWith('prop_'))).toHaveLength(15);
    // R4 wave delivery: every file is exactly <key>.wav
    for (const c of ATMOSPHERE_CLIP_MANIFEST) expect(c.file).toBe(`${c.key}.wav`);
  });

  it('MUTATION mapper-key-missing-from-registration: every key E/F/G can emit is IN the manifest', () => {
    for (const k of ALL_BED_KEYS) expect(isAtmosphereClipKey(k), k).toBe(true);          // E
    for (const k of PROP_CLIP_KEYS) expect(isAtmosphereClipKey(k), k).toBe(true);        // G
    for (const tier of [1, 2, 3]) expect(isAtmosphereClipKey(federalCueKey(tier))).toBe(true); // F federal
    for (const k of [
      'player_offense_raid', 'police_raid_cash', 'police_raid_operation', 'police_raid_bust',
      'federal_cooldown', 'federal_armed', 'interception_collector_robbed', 'collector_arrival', 'collector_deposit',
    ]) expect(isAtmosphereClipKey(k), k).toBe(true);                                     // F events
    for (const kind of ['shakedown', 'sabotage']) {
      for (const o of ['converted', 'retook', 'sabotaged', 'failed']) {
        expect(isAtmosphereClipKey(`extortion_${kind}_${o}`)).toBe(true);                // F extortion
      }
    }
  });

  it('MUTATION bed_quarter_base/federal_watch-unregistered: after registration EVERY manifest key is in the catalog', () => {
    const result = registerAtmosphereClips();
    // the shipped federal parity keys are SKIPPED (already catalogued with real assets), never overridden
    expect(result.skipped).toEqual(expect.arrayContaining(['federal_notice', 'federal_watch', 'federal_raid']));
    expect(result.added).toEqual(expect.arrayContaining(['bed_quarter_base', 'police_raid_bust', 'prop_fountain_loop']));
    const parity = atmosphereManifestParity();
    expect(parity.ok, `unregistered: ${parity.unregistered.join(',')}`).toBe(true);
    expect(AudioManager.isRegistered('bed_quarter_base')).toBe(true);
    expect(AudioManager.isRegistered('federal_watch')).toBe(true);
    // idempotent: a second call skips everything
    const again = registerAtmosphereClips();
    expect(again.added).toEqual([]);
    expect(again.skipped).toHaveLength(53);
  });

  it('R3: registration maps conceptual buses onto REAL AudioManager buses', () => {
    const defs = atmosphereClipDefs();
    expect(defs.find((d) => d.key === 'bed_docks_base')?.bus).toBe('ambience');
    expect(defs.find((d) => d.key === 'prop_fountain_loop')?.bus).toBe('sfx');
    expect(defs.find((d) => d.key === 'police_raid_bust')?.bus).toBe('sfx');
    expect(defs.find((d) => d.key === 'bed_docks_base')?.loop).toBe(true);
    expect(defs.find((d) => d.key === 'police_raid_bust')?.loop).toBe(false);
  });

  it('R4 fail-loudly: a registered key with a missing asset THROWS in dev, reports quietly in prod', () => {
    const nothingLoaded = () => false;
    expect(() => verifyAtmosphereClipsLoaded(nothingLoaded, true)).toThrow(/production queue/);
    const missing = verifyAtmosphereClipsLoaded(nothingLoaded, false);
    expect(missing).toHaveLength(53);
    expect(verifyAtmosphereClipsLoaded(() => true, true)).toEqual([]); // all assets present ⇒ clean
  });

  it('MUTATION private-library-access: only registerAtmosphereClips imports the AudioManager; nothing touches LIBRARY/DEFS', () => {
    const dir = join(process.cwd(), 'src', 'scenes', 'audio');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      if (f === 'registerAtmosphereClips.ts') {
        expect(src).toMatch(/AudioManager\.register/); // the one sanctioned touch point
      } else if (f !== 'conductorIntensity.ts') { // pre-E-H module (imports sim pacing types only)
        expect(src, `${f} must not import the AudioManager`).not.toMatch(/from '\.\.\/audio'/);
        expect(src, `${f} must not reach the private library`).not.toMatch(/\bLIBRARY\b|\bDEFS\b/);
      }
      // E-H purity: no runtime /src/sim imports anywhere in the audio modules (type-only is erased)
      const simImports = src.match(/import\s+(?!type\b)[^;]*from\s+'[^']*\/sim[^']*'/g) ?? [];
      expect(simImports, `${f} runtime sim import`).toEqual([]);
    }
  });
});
