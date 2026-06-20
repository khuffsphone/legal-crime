// RTS-7 — isometric art pipeline. Pure & Phaser-free, so the fallback logic is unit-testable in
// node. Defines the canonical iso sprite spec (locked by RTS-1: 2:1 dimetric, 128×64 tiles) and
// a graceful-fallback resolver: the scene tries to load every texture below; whatever is missing
// renders as the existing colored placeholder, so the scene ALWAYS renders. Drop a real PNG at
// the matching public/assets/iso/<kind>/ path (filename exactly as listed) and it appears
// automatically — no code change needed.
//
// ANCHORING (the art contract, from the RTS-1 projection receipt):
//   • a sprite is placed at gridToScreen(gx, gy) — the CENTER of its tile diamond;
//   • TILE sprites use origin (0.5, 0.5): the 128×64 diamond covers the tile exactly;
//   • BUILDING / UNIT sprites use origin (0.5, 1.0) — BOTTOM-CENTER — so the base sits on the
//     tile center and the body rises upward (−y), overlapping tiles/objects behind it correctly;
//   • a 1×1-footprint building/unit base is ISO_TILE_WIDTH (128px) wide; taller art extends up;
//   • an N×N building scales the base width by N (a 2×2 ≈ 256px wide).

import { NOIR_PALETTE } from './theme';
import type { BusinessKind } from '../sim';

export const ISO_TILE_PX_WIDTH = 128;
export const ISO_TILE_PX_HEIGHT = 64;

export type IsoAssetKind = 'tile' | 'building' | 'unit';

export interface IsoAssetDef {
  /** Texture key == filename without extension, e.g. "LCR_iso_bldg_hq". */
  key: string;
  kind: IsoAssetKind;
  /** Filename with extension, exactly as the human should drop it. */
  file: string;
  /** Placeholder label shown when the art is missing. */
  label: string;
  /** Placeholder fill colour (Fedora Noir palette). */
  color: string;
  /** Origin x (always 0.5 — horizontally centered). */
  anchorX: number;
  /** Origin y: 0.5 for ground tiles, 1.0 (bottom) for buildings/units. */
  anchorY: number;
  /** Base width in px for a 1×1 footprint (the diamond width contract). */
  baseWidth: number;
}

const { charcoal, brass, blood, fog, ink, bone } = NOIR_PALETTE;

function tile(key: string, label: string, color: string): IsoAssetDef {
  return { key, kind: 'tile', file: `${key}.png`, label, color, anchorX: 0.5, anchorY: 0.5, baseWidth: ISO_TILE_PX_WIDTH };
}
function building(key: string, label: string, color: string): IsoAssetDef {
  return { key, kind: 'building', file: `${key}.png`, label, color, anchorX: 0.5, anchorY: 1.0, baseWidth: ISO_TILE_PX_WIDTH };
}
function unit(key: string, label: string, color: string): IsoAssetDef {
  return { key, kind: 'unit', file: `${key}.png`, label, color, anchorX: 0.5, anchorY: 1.0, baseWidth: 64 };
}

/** Every iso texture the scene expects, at the canonical 2:1 / 128×64 spec. */
export const ISO_ASSET_MANIFEST: IsoAssetDef[] = [
  // Ground tiles (128×64 diamonds).
  tile('LCR_iso_tile_cobble', 'Cobble', charcoal),
  tile('LCR_iso_tile_street', 'Street', ink),
  // Buildings (128px base, rising upward).
  building('LCR_iso_bldg_hq', 'HQ', brass),
  building('LCR_iso_bldg_storefront', 'Storefront', fog),
  building('LCR_iso_bldg_speakeasy', 'Speakeasy', brass),
  building('LCR_iso_bldg_gamblinghall', 'Gambling Hall', brass),
  building('LCR_iso_bldg_warehouse', 'Warehouse', charcoal),
  // Units (64px base).
  unit('LCR_iso_unit_collector', 'Collector', brass),
  unit('LCR_iso_unit_enforcer', 'Enforcer', blood),
  unit('LCR_iso_unit_thug', 'Thug', bone),
];

const BY_KEY = new Map(ISO_ASSET_MANIFEST.map((a) => [a.key, a]));

export function isoAssetByKey(key: string): IsoAssetDef | undefined {
  return BY_KEY.get(key);
}

/** Public URL Phaser loads the texture from (served from /public). Grouped by kind. */
export function isoAssetUrl(def: IsoAssetDef): string {
  return `assets/iso/${def.kind}/${def.file}`;
}

export type IsoSpriteResolution =
  | { kind: 'sprite'; key: string; def: IsoAssetDef }
  | { kind: 'placeholder'; def?: IsoAssetDef; color: string; label: string };

/**
 * Decide how to render an iso key given the set of texture keys that actually loaded. A loaded,
 * known key resolves to its sprite; anything missing (or unknown) resolves to a labeled colored
 * placeholder — the graceful fallback that keeps the scene always rendering.
 */
export function resolveIsoSprite(key: string, loaded: ReadonlySet<string>): IsoSpriteResolution {
  const def = isoAssetByKey(key);
  if (def && loaded.has(key)) return { kind: 'sprite', key, def };
  if (def) return { kind: 'placeholder', def, color: def.color, label: def.label };
  return { kind: 'placeholder', color: NOIR_PALETTE.fog, label: key };
}

/** Iso building sprite key for a business kind (parallels the Phase-20 mapping). */
export function isoBuildingKeyForKind(kind: BusinessKind): string {
  switch (kind) {
    case 'front':
      return 'LCR_iso_bldg_storefront';
    case 'speakeasy':
      return 'LCR_iso_bldg_speakeasy';
    case 'numbers':
      return 'LCR_iso_bldg_gamblinghall';
    case 'smuggling':
    case 'protection':
      return 'LCR_iso_bldg_warehouse';
    default:
      return 'LCR_iso_bldg_storefront';
  }
}

/** Iso unit sprite key for a map role. */
export function isoUnitKeyForRole(role: 'collector' | 'enforcer' | undefined): string {
  if (role === 'collector') return 'LCR_iso_unit_collector';
  if (role === 'enforcer') return 'LCR_iso_unit_enforcer';
  return 'LCR_iso_unit_thug';
}

/** Every key the scene should attempt to load (for the preloader). */
export function allIsoAssetKeys(): string[] {
  return ISO_ASSET_MANIFEST.map((a) => a.key);
}
