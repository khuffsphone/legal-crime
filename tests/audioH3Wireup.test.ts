// AUDIO E-H — Ticket H3, the IsoScene WIRE-UP. Source-scan mutation table (the spec's H3 rows): the one
// isolated touch point is post-updateAndObserve, consumes the ObserveResult { result, strategy, endgame,
// state }, injects exactly one isAudioFeedbackEligible closure over shouldEmitFeedback (no parallel LOS),
// keeps debugRevealAll on `revealed` only (never onScreen), sources collector cues from
// processCollectorArrivals (never arrivedUnitIds), registers F2 clips BEFORE preload, adds NO /src/sim
// edit, and is behind ?audio (default OFF). Static guards — a regression here fails CI before any pixels.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCENE = join(process.cwd(), 'src', 'scenes', 'IsoScene.ts');
const src = readFileSync(SCENE, 'utf8');
const adapterSrc = readFileSync(join(process.cwd(), 'src', 'scenes', 'audio', 'atmosphereSceneAdapter.ts'), 'utf8');

/** Brace-matched method body (the quickloadRestartTeardown idiom) — depth-counts from the signature. */
function methodBody(name: string): string {
  const at = (() => {
    const p = src.indexOf(`private ${name}(`);
    return p >= 0 ? p : src.indexOf(`  ${name}(`); // create()/preload()/updateUnits() carry no `private`
  })();
  expect(at, `method ${name} exists`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  throw new Error(`unbalanced braces scanning ${name}`);
}

const updateUnits = methodBody('updateUnits');
const preload = methodBody('preload');
const eligibility = src.slice(src.indexOf('isAudioFeedbackEligible = '), src.indexOf('isAudioFeedbackEligible = ') + 320);

describe('H3 wire-up — the FP-01 profile gate + F2 ordering', () => {
  it('is governed by the central runtime profile (showcase default, legacy/per-layer rollback)', () => {
    expect(src).toContain("import { resolveFeatureProfile } from './featureProfile'");
    expect(src).toContain('private atmosphereAudioEnabled = this.featureProfile.atmosphereAudio;');
  });

  it('MUTATION play-before-registration: registerAtmosphereClips() runs BEFORE AudioManager.preload()', () => {
    const reg = preload.indexOf('registerAtmosphereClips(');
    const pre = preload.indexOf('AudioManager.preload(');
    expect(reg, 'registerAtmosphereClips present in preload').toBeGreaterThanOrEqual(0);
    expect(pre).toBeGreaterThanOrEqual(0);
    expect(reg, 'register must precede preload (else clips catalogued but never queued)').toBeLessThan(pre);
    expect((preload.match(/registerAtmosphereClips\(/g) ?? []).length).toBe(1);
  });
});

describe('H3 wire-up — the single post-observe touch point', () => {
  it('MUTATION multiple-hooks: EXACTLY ONE atmosphere.step() call, after observe + processCollectorArrivals', () => {
    expect((updateUnits.match(/this\.atmosphere\.step\(/g) ?? []).length).toBe(1);
    const hook = updateUnits.indexOf('this.atmosphere.step(');
    expect(hook).toBeGreaterThan(updateUnits.indexOf('this.state = obs.state'));               // post-observe
    expect(hook).toBeGreaterThan(updateUnits.indexOf('processCollectorArrivals('));            // post-collectors
    expect(hook).toBeGreaterThan(updateUnits.indexOf('this.state = harvestIncidents(this.state)')); // fully-appended log
  });

  it('MUTATION destructure-without-state: the frame is built from obs.result + the reassigned this.state', () => {
    // this.state must be reassigned to obs.state BEFORE the atmosphere step reads it for districts/log.
    const assign = updateUnits.indexOf('this.state = obs.state');
    const hook = updateUnits.indexOf('this.atmosphere.step(');
    expect(assign).toBeGreaterThanOrEqual(0);
    expect(assign).toBeLessThan(hook);
    // the frame builder reads obs.result (not a re-fetched/older shape) and the live this.state.log
    const buildFrame = methodBody('buildAtmosphereFrame');
    expect(buildFrame).toMatch(/obs\.result\.extortion/);
    expect(buildFrame).toMatch(/obs\.result\.interceptions/);
    expect(buildFrame).toMatch(/obs\.result\.combat\.filter\(.*isVisibleTile.*\)\.length/s);
    expect(buildFrame).toMatch(/this\.state\.log\.slice\(this\.atmoLogCursor\)/);
  });

  it('MUTATION arrivedUnitIds: collector cues come from processCollectorArrivals, never arrivedUnitIds', () => {
    const buildFrame = methodBody('buildAtmosphereFrame');
    // capture site + frame both read the deposits; the wrapper's arrivedUnitIds is never touched here
    expect(updateUnits).toContain('processCollectorArrivals(');
    expect(buildFrame).toContain('collectorDeposits');
    // strip comments, then assert the code paths never reference arrivedUnitIds
    const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(strip(buildFrame)).not.toMatch(/arrivedUnitIds/);
    expect(strip(adapterSrc)).not.toMatch(/arrivedUnitIds/);
  });
});

describe('H3 wire-up — NO-X-RAY eligibility (one closure, no parallel LOS)', () => {
  it('MUTATION new-LOS-check: the closure REUSES isVisibleTile + onScreen, feeding shouldEmitFeedback semantics', () => {
    // revealed rides the shared fog predicate (isVisibleTile), onScreen rides the shared camera-bounds
    // helper — no fresh isRevealed/LOS math invented in the audio path.
    expect(eligibility).toMatch(/revealed: this\.isVisibleTile\(\{ gx, gy \}\)/);
    expect(eligibility).toMatch(/onScreen: this\.onScreen\(/);
  });

  it('MUTATION debug-reveal-overrides-on-screen: debugRevealAll rides `revealed` ONLY, never `onScreen`', () => {
    // isVisibleTile folds debugRevealAll into `revealed`; the onScreen half must carry NO debugRevealAll
    // term, or a ?reveal board would make off-screen audio audible.
    const onScreenLine = eligibility.split('\n').find((l) => l.includes('onScreen:')) ?? '';
    expect(onScreenLine).not.toMatch(/debugRevealAll/);
    // and there is no ad-hoc `debugRevealAll || isRevealed(...)` re-derivation in the closure (it delegates)
    expect(eligibility).not.toMatch(/debugRevealAll \|\| isRevealed/);
  });
});

describe('H3 wire-up — /src/sim untouched + adapter purity', () => {
  it('MUTATION src/sim-touched: the adapter runtime-imports NO sim (type-only erased) and no ../audio', () => {
    // the new adapter is auto-scanned by the audio-dir guards; assert directly too.
    expect(adapterSrc.match(/import\s+(?!type\b)[^;]*from\s+'[^']*\/sim[^']*'/g) ?? []).toEqual([]);
    expect(adapterSrc).not.toMatch(/from '\.\.\/audio'/);           // manager arrives by DI (AtmosphereSink)
    expect(adapterSrc).not.toMatch(/\bLIBRARY\b|\bDEFS\b/);         // never the private catalog
  });

  it('the adapter takes its playback surface by injection — a structural AtmosphereSink, spy-testable', () => {
    expect(adapterSrc).toMatch(/export interface AtmosphereSink/);
    expect(adapterSrc).toMatch(/constructor\(seed: number, sink: AtmosphereSink\)/);
  });

  it('flag-OFF inertness: the per-frame step + registration are both guarded by atmosphereAudioEnabled', () => {
    expect(updateUnits).toMatch(/if \(this\.atmosphereAudioEnabled && this\.atmosphere\)/);
    expect(preload).toMatch(/if \(this\.atmosphereAudioEnabled\) registerAtmosphereClips\(\)/);
  });
});
