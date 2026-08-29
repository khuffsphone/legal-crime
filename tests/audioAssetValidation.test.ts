import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  categoryForClip,
  formatAudioAssetValidation,
  parseAudioAssetPolicy,
  parseCoreAudioCatalog,
  validateAudioAssets,
  type AudioAssetPolicy,
  type CoreAudioCatalogClip,
} from '../scripts/validate-audio-assets';

const POLICY: AudioAssetPolicy = { maxEventSfxSeconds: 5, categories: {} };

function clip(key: string, file: string, bus = 'sfx'): CoreAudioCatalogClip {
  return { key, file, bus, synth: file === '', line: 10 };
}

describe('FP-01 core audio catalog extraction', () => {
  it('extracts literal definitions without importing the Phaser runtime', () => {
    const source = `
      const LIBRARY: ClipDef[] = [
        { key: 'hit', file: 'hit.wav', bus: 'sfx', urgent: true },
        { key: 'score', file: 'score.m4a', bus: 'music', loop: true },
        { key: 'fallback', file: '', bus: 'sfx', synth: true },
      ];
    `;
    expect(parseCoreAudioCatalog(source, 'fixture.ts')).toEqual([
      { key: 'hit', file: 'hit.wav', bus: 'sfx', synth: false, line: 3 },
      { key: 'score', file: 'score.m4a', bus: 'music', synth: false, line: 4 },
      { key: 'fallback', file: '', bus: 'sfx', synth: true, line: 5 },
    ]);
  });

  it('fails closed when a required catalog value is dynamic', () => {
    const source = `const FILE = 'hit.wav'; const LIBRARY = [{ key: 'hit', file: FILE, bus: 'sfx' }];`;
    expect(() => parseCoreAudioCatalog(source, 'dynamic.ts')).toThrow(/LIBRARY\[0\]\.file must be a static string literal/);
  });

  it('parses the actual private LIBRARY source (including file-backed and synth-only entries)', () => {
    const source = readFileSync(new URL('../src/scenes/audio.ts', import.meta.url), 'utf8');
    const clips = parseCoreAudioCatalog(source);
    expect(clips.length).toBeGreaterThan(40);
    expect(clips).toContainEqual(expect.objectContaining({ key: 'extort', file: 'LCR_sfx_extort.m4a', bus: 'sfx' }));
    expect(clips).toContainEqual(expect.objectContaining({ key: 'music_establish', bus: 'music' }));
    expect(clips).toContainEqual(expect.objectContaining({ key: 'sfx_step_wood', file: '', synth: true }));
  });
});

describe('FP-01 physical audio validation', () => {
  it('reports every missing physical reference and never probes a missing or synth-only clip', () => {
    const probed: string[] = [];
    const result = validateAudioAssets(
      [clip('present', 'present.wav'), clip('missing', 'missing.wav'), clip('synth', '')],
      {
        audioDir: '/game/public/audio',
        policy: POLICY,
        fileExists: (path) => path.endsWith('present.wav'),
        durationSeconds: (path) => { probed.push(path); return 1; },
      },
    );
    expect(result.fileBackedEntries).toBe(2);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'missing-file', key: 'missing', file: 'missing.wav' }),
    ]);
    expect(probed).toEqual(['/game/public/audio/present.wav']);
  });

  it('rejects empty non-synth entries, duplicate keys, and stale policy overrides', () => {
    const result = validateAudioAssets(
      [{ ...clip('empty', ''), synth: false }, clip('same', 'a.wav'), clip('same', 'b.wav')],
      {
        audioDir: '/audio',
        policy: { maxEventSfxSeconds: 5, categories: { stale: 'cinematic' } },
        fileExists: () => true,
        durationSeconds: () => 1,
      },
    );
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'empty-file-without-synth', key: 'empty' }),
      expect.objectContaining({ code: 'duplicate-key', key: 'same' }),
      expect.objectContaining({ code: 'unknown-policy-key', key: 'stale' }),
    ]));
  });

  it('rejects SFX above five seconds but accepts the exact boundary', () => {
    const durations: Record<string, number> = { 'long.wav': 5.001, 'boundary.wav': 5 };
    const result = validateAudioAssets([clip('long', 'long.wav'), clip('boundary', 'boundary.wav')], {
      audioDir: '/audio', policy: POLICY, fileExists: () => true,
      durationSeconds: (path) => durations[path.split('/').at(-1) ?? ''],
    });
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'event-sfx-too-long', key: 'long', durationSeconds: 5.001 }),
    ]);
  });

  it('exempts explicitly categorized music, ambience, VO, and cinematic clips', () => {
    const clips = [
      clip('score', 'score.m4a', 'music'),
      clip('city', 'city.m4a', 'ambience'),
      clip('speech', 'speech.m4a', 'vo'),
      clip('intro', 'intro.m4a', 'sfx'),
    ];
    const policy: AudioAssetPolicy = { ...POLICY, categories: { intro: 'cinematic' } };
    const result = validateAudioAssets(clips, {
      audioDir: '/audio', policy, fileExists: () => true, durationSeconds: () => 120,
    });
    expect(result.issues).toEqual([]);
    expect(clips.map((value) => categoryForClip(value, policy.categories)))
      .toEqual(['music', 'ambience', 'vo', 'cinematic']);
  });

  it('fails closed when duration metadata cannot be read', () => {
    const result = validateAudioAssets([clip('bad', 'bad.wav')], {
      audioDir: '/audio', policy: POLICY, fileExists: () => true,
      durationSeconds: () => { throw new Error('decoder rejected file'); },
    });
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'duration-unreadable', key: 'bad', detail: 'decoder rejected file' }),
    ]);
  });
});

describe('FP-01 audio asset policy', () => {
  it('accepts explicit production categories and rejects ambiguous values', () => {
    expect(parseAudioAssetPolicy('{"maxEventSfxSeconds":5,"categories":{"intro":"cinematic"}}'))
      .toEqual({ maxEventSfxSeconds: 5, categories: { intro: 'cinematic' } });
    expect(() => parseAudioAssetPolicy('{"maxEventSfxSeconds":5,"categories":{"intro":"video"}}'))
      .toThrow(/must be one of sfx, music, ambience, cinematic, vo/);
  });

  it('formats actionable missing and duration failures', () => {
    const report = formatAudioAssetValidation({
      catalogEntries: 2,
      fileBackedEntries: 2,
      issues: [
        { code: 'missing-file', key: 'step', file: 'step.wav', line: 1, category: 'sfx' },
        { code: 'event-sfx-too-long', key: 'gun', file: 'gun.wav', line: 2, category: 'sfx', durationSeconds: 12 },
      ],
    }, POLICY);
    expect(report).toContain('MISSING    step (step.wav, catalog line 1)');
    expect(report).toContain('TOO LONG   gun (gun.wav, catalog line 2): 12.000s');
    expect(report).toContain('music, ambience, cinematic, or vo');
  });
});
