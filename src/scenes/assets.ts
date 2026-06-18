// Asset manifest + graceful-fallback resolver for the visual reskin (Phase 20). Pure & no
// Phaser, so the fallback logic is unit-testable in node. The Phaser scene attempts to load
// every asset below; whatever is missing falls back to a labeled colored placeholder, so the
// scene ALWAYS renders. Drop a real PNG at the matching public/assets path (filename exactly
// as listed, no version suffix) and it appears automatically — no code change needed.

import { NOIR_PALETTE } from './theme';
import type { BusinessKind } from '../sim';

export type AssetCategory = 'env' | 'buildings' | 'units' | 'screens';

export interface AssetDef {
  /** Texture key (the filename without extension), e.g. "LCR_env_industrial". */
  key: string;
  category: AssetCategory;
  /** Filename with extension, exactly as the human should drop it. */
  file: string;
  /** Human label shown on the placeholder when the art is missing. */
  label: string;
  /** Placeholder fill colour (Fedora Noir palette). */
  color: string;
}

const { charcoal, brass, blood, fog, ink } = NOIR_PALETTE;

/** Every asset the scene expects, with its public path and placeholder styling. */
export const ASSET_MANIFEST: AssetDef[] = [
  // Environments (district backdrops).
  { key: 'LCR_env_industrial', category: 'env', file: 'LCR_env_industrial.png', label: 'Industrial', color: charcoal },
  { key: 'LCR_env_downtown', category: 'env', file: 'LCR_env_downtown.png', label: 'Downtown', color: charcoal },
  { key: 'LCR_env_waterfront', category: 'env', file: 'LCR_env_waterfront.png', label: 'Waterfront', color: charcoal },
  { key: 'LCR_env_alley', category: 'env', file: 'LCR_env_alley.png', label: 'Alley', color: charcoal },
  // Buildings (rackets / HQ / collection centers).
  { key: 'LCR_bldg_hq', category: 'buildings', file: 'LCR_bldg_hq.png', label: 'HQ', color: brass },
  { key: 'LCR_bldg_speakeasy', category: 'buildings', file: 'LCR_bldg_speakeasy.png', label: 'Speakeasy', color: brass },
  { key: 'LCR_bldg_gamblinghall', category: 'buildings', file: 'LCR_bldg_gamblinghall.png', label: 'Gambling Hall', color: brass },
  { key: 'LCR_bldg_collectioncenter', category: 'buildings', file: 'LCR_bldg_collectioncenter.png', label: 'Collection Center', color: brass },
  { key: 'LCR_bldg_storefront', category: 'buildings', file: 'LCR_bldg_storefront.png', label: 'Storefront', color: fog },
  // Units (crew).
  { key: 'LCR_unit_thug', category: 'units', file: 'LCR_unit_thug.png', label: 'Thug', color: fog },
  { key: 'LCR_unit_thompsonman', category: 'units', file: 'LCR_unit_thompsonman.png', label: 'Thompson Man', color: blood },
  { key: 'LCR_unit_collector', category: 'units', file: 'LCR_unit_collector.png', label: 'Collector', color: brass },
  { key: 'LCR_unit_cadillac', category: 'units', file: 'LCR_unit_cadillac.png', label: 'Cadillac', color: ink },
  // Full-screen art.
  { key: 'LCR_screen_title', category: 'screens', file: 'LCR_screen_title.png', label: 'Title', color: ink },
  { key: 'LCR_screen_gameover', category: 'screens', file: 'LCR_screen_gameover.png', label: 'Game Over', color: blood },
];

const BY_KEY = new Map(ASSET_MANIFEST.map((a) => [a.key, a]));

/** Look up an asset definition by key. */
export function assetByKey(key: string): AssetDef | undefined {
  return BY_KEY.get(key);
}

/** Public URL Phaser loads the asset from (served from /public). */
export function assetUrl(def: AssetDef): string {
  return `assets/${def.category}/${def.file}`;
}

export type SpriteResolution =
  | { kind: 'sprite'; key: string }
  | { kind: 'placeholder'; color: string; label: string };

/**
 * Decide how to render an asset key given the set of keys that actually loaded. A loaded
 * key resolves to its sprite; anything missing (or an unknown key) resolves to a labeled
 * colored placeholder — this is the graceful fallback that keeps the scene always rendering.
 */
export function resolveSprite(key: string, loaded: ReadonlySet<string>): SpriteResolution {
  const def = assetByKey(key);
  if (def && loaded.has(key)) return { kind: 'sprite', key };
  if (def) return { kind: 'placeholder', color: def.color, label: def.label };
  return { kind: 'placeholder', color: NOIR_PALETTE.fog, label: key };
}

const ENV_KEYS = ['LCR_env_industrial', 'LCR_env_downtown', 'LCR_env_waterfront', 'LCR_env_alley'] as const;

/** Environment backdrop key for a district by its index (cycles through the four envs). */
export function districtEnvKey(index: number): string {
  const i = ((index % ENV_KEYS.length) + ENV_KEYS.length) % ENV_KEYS.length;
  return ENV_KEYS[i];
}

/** Building sprite key for a business kind. */
export function buildingKeyForKind(kind: BusinessKind): string {
  switch (kind) {
    case 'front':
      return 'LCR_bldg_storefront';
    case 'speakeasy':
      return 'LCR_bldg_speakeasy';
    case 'numbers':
      return 'LCR_bldg_gamblinghall';
    case 'smuggling':
    case 'protection':
      return 'LCR_bldg_collectioncenter';
    default:
      return 'LCR_bldg_storefront';
  }
}

/** Crew unit sprite key for a gangster skill (tougher crew = Thompson men). */
export function unitKeyForSkill(skill: number): string {
  return skill >= 6 ? 'LCR_unit_thompsonman' : 'LCR_unit_thug';
}
