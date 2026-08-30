import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AudioManager } from '../src/scenes/audio';
import { footstepPlayback, footstepRoleGain } from '../src/scenes/footstepFeedback';

interface FakeSound {
  isPlaying: boolean;
  play(): boolean;
  once(): FakeSound;
  destroy(): void;
}

/** RMS for the shipped PCM16 WAVs. Header parsing keeps the regression independent of ffmpeg availability. */
function pcm16Rms(file: string): number {
  const wav = readFileSync(resolve(process.cwd(), 'public/audio', file));
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a RIFF/WAVE file`);
  }
  let offset = 12;
  let pcm = false;
  let bits = 0;
  let dataStart = -1;
  let dataSize = 0;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      pcm = wav.readUInt16LE(start) === 1;
      bits = wav.readUInt16LE(start + 14);
    } else if (id === 'data') {
      dataStart = start;
      dataSize = Math.min(size, wav.length - start);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!pcm || bits !== 16 || dataStart < 0) throw new Error(`${file} must be PCM16 WAV`);
  let sumSquares = 0;
  const samples = Math.floor(dataSize / 2);
  for (let i = 0; i < samples; i++) {
    const sample = wav.readInt16LE(dataStart + i * 2) / 32768;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / samples);
}

describe('FP-01 footstep mix', () => {
  it('keeps the loudest runtime footstep at least 15 dB beneath VO at equal bus settings', () => {
    const starts: Array<{ key: string; volume: number }> = [];
    const scene = {
      time: { now: 1000 },
      sound: {
        locked: false,
        add: (key: string, options: { volume: number }) => {
          const sound: FakeSound = {
            isPlaying: false,
            play: () => { sound.isPlaying = true; return true; },
            once: () => sound,
            destroy: () => undefined,
          };
          starts.push({ key, volume: options.volume });
          return sound;
        },
      },
      tweens: { add: () => undefined, killTweensOf: () => undefined },
    } as unknown as Phaser.Scene;

    const audio = new AudioManager(scene);
    const internals = audio as unknown as { loaded: Set<string> };
    internals.loaded.add('sfx_step_pavement');
    internals.loaded.add('sfx_step_gravel');
    internals.loaded.add('vo_confirm_1');

    const loudestVariation = Math.max(...[0, 1, 2, 3].map((i) => footstepPlayback(i).gain));
    const collectorScale = footstepRoleGain('collector', 'player') * loudestVariation;
    expect(audio.play('sfx_step_pavement', { volScale: collectorScale })).toBe(true);
    expect(audio.play('sfx_step_gravel', { volScale: collectorScale })).toBe(true);
    expect(audio.play('vo_confirm_1')).toBe(true);

    const outputVolume = (key: string): number => starts.find((start) => start.key === key)!.volume;
    const stepVolume = outputVolume('sfx_step_pavement');
    const voVolume = starts.find((start) => start.key === 'vo_confirm_1')!.volume;
    const relativeDb = 20 * Math.log10(stepVolume / voVolume);

    // This exercises the real catalog trims (step 0.35, VO 1.0), bus math, loudest role, and loudest take.
    expect(relativeDb).toBeLessThanOrEqual(-15);

    const voFiles = [
      'LCR_vo_confirm_1.wav', 'LCR_vo_confirm_2.wav', 'LCR_vo_confirm_3.wav',
      'LCR_vo_tip_extort.wav', 'LCR_vo_tip_grease.wav', 'LCR_vo_tip_launder.wav',
      'LCR_vo_tip_war.wav', 'LCR_vo_win.wav', 'LCR_vo_lose.wav',
    ];
    const voRms = voFiles.map(pcm16Rms);
    const meanVoRms = voRms.reduce((sum, rms) => sum + rms, 0) / voRms.length;
    const quietestVoRms = Math.min(...voRms);
    for (const [key, file] of [
      ['sfx_step_pavement', 'sfx_step_pavement_v2.wav'],
      ['sfx_step_gravel', 'sfx_step_gravel_v2.wav'],
    ] as const) {
      const renderedStep = pcm16Rms(file) * outputVolume(key);
      const againstMeanVoDb = 20 * Math.log10(renderedStep / (meanVoRms * voVolume));
      const againstQuietestVoDb = 20 * Math.log10(renderedStep / (quietestVoRms * voVolume));
      expect(againstMeanVoDb, `${key} vs mean VO`).toBeLessThanOrEqual(-15);
      expect(againstQuietestVoDb, `${key} vs quietest VO`).toBeLessThanOrEqual(-10);
    }
  });
});
