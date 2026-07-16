import { promises as fs } from "node:fs";
import * as path from "node:path";

/** One GLB discovered under a task dir. */
export interface GlbAsset {
  /** Task-id = the immediate subdir name under the meshy root. */
  taskId: string;
  /** Absolute path to the GLB. */
  glbAbs: string;
  /** GLB path relative to the meshy root. */
  glbRel: string;
  /** Absolute paths to sibling texture images in the task dir. */
  textures: string[];
}

/** A pull-manifest entry (subset we read for provenance notes). */
export interface ManifestEntry {
  mode?: string;
  prompt?: string;
  art_style?: string;
  created_at?: number;
  [key: string]: unknown;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const CATALOG_DIRNAME = "_catalog";

/** Task dirs to scan — skip the _catalog output dir and any dot/underscore dir. */
function isTaskDir(name: string): boolean {
  return !name.startsWith("_") && !name.startsWith(".") && name !== CATALOG_DIRNAME;
}

/** Recursively (max 2 deep) find .glb files under a task dir. */
async function findGlbs(dir: string, depth = 0): Promise<string[]> {
  let ents: import("node:fs").Dirent[];
  try {
    ents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 2) {
      out.push(...(await findGlbs(p, depth + 1)));
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".glb")) {
      out.push(p);
    }
  }
  return out;
}

/** Texture images directly under (max 2 deep) a task dir. */
async function findTextures(dir: string, depth = 0): Promise<string[]> {
  let ents: import("node:fs").Dirent[];
  try {
    ents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 2) {
      out.push(...(await findTextures(p, depth + 1)));
    } else if (e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Walk the meshy root and return one GlbAsset per GLB found. Task dirs are the
 * immediate subdirs (Meshy task-ids); the _catalog output dir is skipped.
 */
export async function scanMeshyRoot(root: string): Promise<GlbAsset[]> {
  let ents: import("node:fs").Dirent[];
  try {
    ents = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const assets: GlbAsset[] = [];
  for (const e of ents) {
    if (!e.isDirectory() || !isTaskDir(e.name)) continue;
    const taskDir = path.join(root, e.name);
    const glbs = await findGlbs(taskDir);
    if (glbs.length === 0) continue;
    const textures = await findTextures(taskDir);
    for (const glbAbs of glbs.sort()) {
      assets.push({
        taskId: e.name,
        glbAbs,
        glbRel: path.relative(root, glbAbs),
        textures,
      });
    }
  }
  return assets;
}

/** Read the pull-written manifest.json (task_id -> entry). Empty if absent/corrupt. */
export async function readPullManifest(root: string): Promise<Record<string, ManifestEntry>> {
  try {
    const raw = await fs.readFile(path.join(root, "manifest.json"), "utf8");
    const parsed = JSON.parse(raw) as { tasks?: Record<string, ManifestEntry> };
    return parsed && typeof parsed === "object" && parsed.tasks ? parsed.tasks : {};
  } catch {
    return {};
  }
}
