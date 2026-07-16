/**
 * Shared type definitions for the Meshy AI API surface used by Octane Racer.
 *
 * These intentionally use permissive index signatures on the URL bags because
 * Meshy occasionally adds new keys; we only depend on the ones we name.
 */

/** The three generation task families this integration supports. */
export type TaskKind = "text-to-3d" | "image-to-3d" | "retexture";

/** Task-status values Meshy reports. Terminal ones are handled explicitly. */
export type MeshyStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

export interface MeshyModelUrls {
  glb?: string;
  fbx?: string;
  obj?: string;
  usdz?: string;
  mtl?: string;
  blend?: string;
  stl?: string;
  [key: string]: string | undefined;
}

/** One texture set. Meshy returns an array of these (usually length 1). */
export interface MeshyTextureUrl {
  base_color?: string;
  metallic?: string;
  roughness?: string;
  normal?: string;
  [key: string]: string | undefined;
}

export interface MeshyTaskError {
  message?: string;
  category?: string;
}

/**
 * A Meshy task object as returned by the retrieve / list endpoints. The exact
 * field set differs slightly per endpoint, so most fields are optional.
 */
export interface MeshyTask {
  id: string;
  /** "preview" | "refine" on text-to-3d; absent elsewhere. */
  mode?: string;
  name?: string;
  prompt?: string;
  object_prompt?: string;
  style_prompt?: string;
  texture_prompt?: string;
  text_style_prompt?: string;
  art_style?: string;
  status: MeshyStatus | string;
  /** 0-100. */
  progress?: number;
  model_urls?: MeshyModelUrls;
  texture_urls?: MeshyTextureUrl[];
  thumbnail_url?: string;
  video_url?: string;
  /** epoch milliseconds */
  created_at?: number;
  started_at?: number;
  finished_at?: number;
  /** epoch milliseconds after which the result assets may be deleted */
  expires_at?: number;
  task_error?: MeshyTaskError | null;
  [key: string]: unknown;
}
