import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSET_MANIFEST,
  assetByKey,
  assetUrl,
  resolveSprite,
  districtEnvKey,
  buildingKeyForKind,
  unitKeyForSkill,
} from '../src/scenes/assets';

const EXPECTED: Record<string, string[]> = {
  env: ['LCR_env_industrial.png', 'LCR_env_downtown.png', 'LCR_env_waterfront.png', 'LCR_env_alley.png'],
  buildings: [
    'LCR_bldg_hq.png',
    'LCR_bldg_speakeasy.png',
    'LCR_bldg_gamblinghall.png',
    'LCR_bldg_collectioncenter.png',
    'LCR_bldg_storefront.png',
  ],
  units: ['LCR_unit_thug.png', 'LCR_unit_thompsonman.png', 'LCR_unit_collector.png', 'LCR_unit_cadillac.png'],
  screens: ['LCR_screen_title.png', 'LCR_screen_gameover.png'],
};

describe('asset manifest', () => {
  it('lists exactly the expected filenames per category (LCR_ convention, no version suffix)', () => {
    for (const [category, files] of Object.entries(EXPECTED)) {
      const got = ASSET_MANIFEST.filter((a) => a.category === category).map((a) => a.file).sort();
      expect(got).toEqual([...files].sort());
    }
  });

  it('keys are the filename without extension and have no version suffix', () => {
    for (const a of ASSET_MANIFEST) {
      expect(a.key).toBe(a.file.replace(/\.png$/, ''));
      expect(a.key).not.toMatch(/_v\d+$/);
    }
  });

  it('assetUrl points under /assets/<category>/<file>', () => {
    const def = assetByKey('LCR_env_industrial')!;
    expect(assetUrl(def)).toBe('assets/env/LCR_env_industrial.png');
  });

  it('the public asset folders exist so dropped art is served', () => {
    for (const category of Object.keys(EXPECTED)) {
      expect(existsSync(join(process.cwd(), 'public', 'assets', category))).toBe(true);
    }
  });
});

describe('graceful fallback (the loader never crashes on missing art)', () => {
  it('falls back to a labeled colored placeholder when the key is not loaded', () => {
    const r = resolveSprite('LCR_bldg_hq', new Set());
    expect(r.kind).toBe('placeholder');
    if (r.kind === 'placeholder') {
      expect(r.label).toBe('HQ');
      expect(r.color).toMatch(/^#/);
    }
  });

  it('uses the sprite once its key has loaded', () => {
    const r = resolveSprite('LCR_bldg_hq', new Set(['LCR_bldg_hq']));
    expect(r).toEqual({ kind: 'sprite', key: 'LCR_bldg_hq' });
  });

  it('an unknown key still resolves to a (safe) placeholder — never a crash', () => {
    const r = resolveSprite('LCR_does_not_exist', new Set(['LCR_does_not_exist']));
    expect(r.kind).toBe('placeholder');
    if (r.kind === 'placeholder') expect(r.label).toBe('LCR_does_not_exist');
  });

  it('every manifest key resolves to a placeholder when nothing is loaded (scene always renders)', () => {
    for (const a of ASSET_MANIFEST) {
      expect(resolveSprite(a.key, new Set()).kind).toBe('placeholder');
    }
  });
});

describe('view → asset mappings', () => {
  it('districtEnvKey cycles the four environments and wraps', () => {
    expect(districtEnvKey(0)).toBe('LCR_env_industrial');
    expect(districtEnvKey(1)).toBe('LCR_env_downtown');
    expect(districtEnvKey(2)).toBe('LCR_env_waterfront');
    expect(districtEnvKey(3)).toBe('LCR_env_alley');
    expect(districtEnvKey(4)).toBe('LCR_env_industrial'); // wraps
  });

  it('buildingKeyForKind maps each business kind to a building sprite', () => {
    expect(buildingKeyForKind('front')).toBe('LCR_bldg_storefront');
    expect(buildingKeyForKind('speakeasy')).toBe('LCR_bldg_speakeasy');
    expect(buildingKeyForKind('numbers')).toBe('LCR_bldg_gamblinghall');
    expect(buildingKeyForKind('smuggling')).toBe('LCR_bldg_collectioncenter');
    expect(buildingKeyForKind('protection')).toBe('LCR_bldg_collectioncenter');
  });

  it('unitKeyForSkill upgrades tough crew to Thompson men', () => {
    expect(unitKeyForSkill(1)).toBe('LCR_unit_thug');
    expect(unitKeyForSkill(5)).toBe('LCR_unit_thug');
    expect(unitKeyForSkill(6)).toBe('LCR_unit_thompsonman');
    expect(unitKeyForSkill(10)).toBe('LCR_unit_thompsonman');
  });

  it('every mapping target is a real manifest key', () => {
    const keys = new Set(ASSET_MANIFEST.map((a) => a.key));
    expect(keys.has(districtEnvKey(0))).toBe(true);
    expect(keys.has(buildingKeyForKind('numbers'))).toBe(true);
    expect(keys.has(unitKeyForSkill(7))).toBe(true);
  });
});
