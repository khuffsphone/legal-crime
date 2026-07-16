/**
 * Catalog data model for the Meshy character GLBs.
 *
 * The per-entry field set is FROZEN (task_id, glb_path, thumbnail_path,
 * descriptor{...}, notes) — a later pass-2 rename script consumes this exact
 * schema, so do not rename or drop fields.
 */

/** The 7 LOCKED figureStyle archetypes (src/scenes/figureStyle.ts). */
export const ARCHETYPES = [
  "thug",
  "gunner",
  "collector",
  "boss",
  "civilian",
  "police",
  "rival",
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** Suggested vocab for the (human/vision) labeling pass. Advisory — the JSON stays free-text. */
export const DESCRIPTOR_VOCAB = {
  apparent_sex: ["male", "female", "unknown"],
  apparent_age: ["adult", "child", "unknown"],
  dress: ["suit", "dress", "uniform", "workclothes", "unknown"],
  proposed_archetype: [...ARCHETYPES],
  confidence: ["low", "medium", "high"],
} as const;

/**
 * Best-guess descriptor. Left EMPTY by this tool (the tool can't "see"); filled
 * downstream by a vision pass reading the gallery contact sheet. Field names frozen.
 */
export interface CatalogDescriptor {
  /** "" | male | female | unknown */
  apparent_sex: string;
  /** "" | adult | child | unknown */
  apparent_age: string;
  /** "" | suit | dress | uniform | workclothes | unknown */
  dress: string;
  /** "" | one of ARCHETYPES */
  proposed_archetype: string;
  /** "" | low | medium | high */
  confidence: string;
}

/** One GLB's catalog entry. FROZEN field set. */
export interface CatalogEntry {
  /** The Meshy task-id (the source dir name under assets/raw/meshy/). */
  task_id: string;
  /** GLB path, relative to the meshy root (e.g. "<task-id>/model.glb"). */
  glb_path: string;
  /** Composite thumbnail path, relative to the meshy root (e.g. "_catalog/<task-id>.png"). */
  thumbnail_path: string;
  descriptor: CatalogDescriptor;
  /** Free-text; seeded with provenance (mode/prompt/#textures) to aid labeling. */
  notes: string;
}

export interface Catalog {
  schema: 1;
  generated_at: string;
  /** Absolute path of the meshy root the entries are relative to. */
  meshy_root: string;
  /** The allowed archetype vocabulary for proposed_archetype. */
  archetypes: readonly string[];
  /** Advisory vocab for the labeling pass. */
  descriptor_vocab: typeof DESCRIPTOR_VOCAB;
  count: number;
  entries: CatalogEntry[];
}

/** A blank descriptor scaffold. */
export function emptyDescriptor(): CatalogDescriptor {
  return {
    apparent_sex: "",
    apparent_age: "",
    dress: "",
    proposed_archetype: "",
    confidence: "",
  };
}
