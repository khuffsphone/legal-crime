import { describe, it, expect } from 'vitest';
import {
  ISO_ASSET_MANIFEST,
  ISO_TILE_PX_WIDTH,
  ISO_TILE_PX_HEIGHT,
  isoAssetByKey,
  isoAssetUrl,
  resolveIsoSprite,
  isoBuildingKeyForKind,
  isoUnitKeyForRole,
  allIsoAssetKeys,
} from '../src/scenes/isoAssets';

describe('iso art spec — canonical 2:1 / 128×64', () => {
  it('locks the tile pixel dimensions to the RTS-1 projection', () => {
    expect(ISO_TILE_PX_WIDTH).toBe(128);
    expect(ISO_TILE_PX_HEIGHT).toBe(64);
    expect(ISO_TILE_PX_WIDTH).toBe(2 * ISO_TILE_PX_HEIGHT);
  });

  it('anchors tiles centered and buildings/units bottom-center', () => {
    for (const def of ISO_ASSET_MANIFEST) {
      expect(def.anchorX).toBe(0.5);
      if (def.kind === 'tile') {
        expect(def.anchorY).toBe(0.5);
        expect(def.baseWidth).toBe(128);
      } else {
        expect(def.anchorY).toBe(1.0); // bottom-center so art rises and overlaps correctly
      }
    }
  });

  it('1×1 building bases are a full tile width (128px)', () => {
    for (const def of ISO_ASSET_MANIFEST.filter((d) => d.kind === 'building')) {
      expect(def.baseWidth).toBe(128);
    }
  });
});

describe('iso asset urls + lookup', () => {
  it('serves textures from public/assets/iso/<kind>/ with the exact filename', () => {
    const hq = isoAssetByKey('LCR_iso_bldg_hq')!;
    expect(hq.file).toBe('LCR_iso_bldg_hq.png');
    expect(isoAssetUrl(hq)).toBe('assets/iso/building/LCR_iso_bldg_hq.png');
    const cobble = isoAssetByKey('LCR_iso_tile_cobble')!;
    expect(isoAssetUrl(cobble)).toBe('assets/iso/tile/LCR_iso_tile_cobble.png');
  });

  it('allIsoAssetKeys lists every manifest key', () => {
    expect(allIsoAssetKeys()).toEqual(ISO_ASSET_MANIFEST.map((d) => d.key));
    expect(allIsoAssetKeys()).toContain('LCR_iso_unit_collector');
  });
});

describe('resolveIsoSprite — graceful fallback (no crash when art is missing)', () => {
  it('resolves to the sprite only when its texture has loaded', () => {
    const loaded = new Set(['LCR_iso_bldg_hq']);
    const r = resolveIsoSprite('LCR_iso_bldg_hq', loaded);
    expect(r.kind).toBe('sprite');
    if (r.kind === 'sprite') expect(r.def.anchorY).toBe(1.0);
  });

  it('falls back to a labeled colored placeholder for a known-but-unloaded key', () => {
    const r = resolveIsoSprite('LCR_iso_bldg_hq', new Set()); // nothing loaded
    expect(r.kind).toBe('placeholder');
    if (r.kind === 'placeholder') {
      expect(r.label).toBe('HQ');
      expect(r.def?.key).toBe('LCR_iso_bldg_hq');
      expect(r.color).toMatch(/^#/);
    }
  });

  it('falls back for an entirely unknown key without throwing', () => {
    const r = resolveIsoSprite('not_a_real_key', new Set(['not_a_real_key']));
    expect(r.kind).toBe('placeholder');
    if (r.kind === 'placeholder') {
      expect(r.label).toBe('not_a_real_key');
      expect(r.def).toBeUndefined();
    }
  });
});

describe('iso key mappings', () => {
  it('maps business kinds to iso building keys', () => {
    expect(isoBuildingKeyForKind('front')).toBe('LCR_iso_bldg_storefront');
    expect(isoBuildingKeyForKind('speakeasy')).toBe('LCR_iso_bldg_speakeasy');
    expect(isoBuildingKeyForKind('numbers')).toBe('LCR_iso_bldg_gamblinghall');
    expect(isoBuildingKeyForKind('smuggling')).toBe('LCR_iso_bldg_warehouse');
  });

  it('maps unit roles to iso unit keys', () => {
    expect(isoUnitKeyForRole('collector')).toBe('LCR_iso_unit_collector');
    expect(isoUnitKeyForRole('enforcer')).toBe('LCR_iso_unit_enforcer');
    expect(isoUnitKeyForRole(undefined)).toBe('LCR_iso_unit_thug');
  });
});
