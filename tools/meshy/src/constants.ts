import type { TaskKind } from "./types.js";

/**
 * Base URL for the Meshy REST API. Overridable via MESHY_API_BASE for tests or
 * self-hosted proxies; defaults to the public endpoint.
 */
export const MESHY_API_BASE: string = (
  process.env.MESHY_API_BASE || "https://api.meshy.ai"
).replace(/\/+$/, "");

/** Env var that holds the API key. Read from the environment ONLY — never hardcoded. */
export const API_KEY_ENV = "MESHY_API_KEY";

/** Maps each task kind to its OpenAPI version + path segment. */
export const ENDPOINTS: Record<TaskKind, { version: "v1" | "v2"; path: string }> = {
  "text-to-3d": { version: "v2", path: "text-to-3d" },
  "image-to-3d": { version: "v1", path: "image-to-3d" },
  retexture: { version: "v1", path: "retexture" },
};

/** Builds an endpoint path, e.g. endpointPath("text-to-3d", "abc") -> /openapi/v2/text-to-3d/abc */
export function endpointPath(kind: TaskKind, id?: string): string {
  const { version, path } = ENDPOINTS[kind];
  return `/openapi/${version}/${path}${id ? `/${encodeURIComponent(id)}` : ""}`;
}

/** Meshy caps list page size at 50. */
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_LIST_PAGE_SIZE = 10;

/** Recommended polling cadence per Meshy's own quickstart. */
export const DEFAULT_POLL_INTERVAL_MS = 5000;
/** Give long refine/texture jobs plenty of head-room by default. */
export const DEFAULT_POLL_TIMEOUT_MS = 20 * 60 * 1000;

/** Statuses after which a task will never change again. */
export const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"]);

/** Cap on MCP text responses so we never flood the agent's context. */
export const CHARACTER_LIMIT = 25000;

/**
 * PROJECT CANON: Octane Racer ships GLB exclusively. Every create call forces
 * this and this only — never FBX/OBJ/USDZ.
 */
export const TARGET_FORMATS_GLB: readonly string[] = ["glb"];
