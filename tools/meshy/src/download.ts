import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { MeshyClientLike } from "./client.js";
import type { MeshyTask } from "./types.js";

/** One asset we intend to (or did) write to disk. */
export interface DownloadedFile {
  /** Logical role, e.g. "model.glb" or "texture.base_color". */
  role: string;
  url: string;
  /** Absolute path on disk. */
  path: string;
  /** Relative filename inside the task dir. */
  filename: string;
  bytes: number;
  /** True if the file already existed and was left untouched. */
  skipped: boolean;
}

export interface AssetTarget {
  role: string;
  url: string;
  filename: string;
}

/** Derives a file extension (with dot) from a URL path, ignoring query strings. */
export function extFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const base = parsed.pathname.split("/").pop() ?? "";
    const dot = base.lastIndexOf(".");
    if (dot > 0 && dot < base.length - 1) return base.slice(dot).toLowerCase();
  } catch {
    /* not a parseable URL — fall through */
  }
  return fallback;
}

/**
 * Selects the assets we pull for a task: the GLB (canon: GLB only, never FBX)
 * plus every texture map. Optionally the thumbnail render for review.
 */
export function assetTargets(
  task: MeshyTask,
  opts: { includeThumbnail?: boolean } = {},
): AssetTarget[] {
  const targets: AssetTarget[] = [];

  const glb = task.model_urls?.glb;
  if (glb) targets.push({ role: "model.glb", url: glb, filename: "model.glb" });

  const textures = task.texture_urls ?? [];
  const multi = textures.length > 1;
  textures.forEach((tex, index) => {
    for (const [mapKey, url] of Object.entries(tex)) {
      if (!url) continue;
      const ext = extFromUrl(url, ".png");
      const filename = multi
        ? `texture_${index}_${mapKey}${ext}`
        : `texture_${mapKey}${ext}`;
      targets.push({ role: `texture.${mapKey}`, url, filename });
    }
  });

  if (opts.includeThumbnail && task.thumbnail_url) {
    const ext = extFromUrl(task.thumbnail_url, ".png");
    targets.push({ role: "thumbnail", url: task.thumbnail_url, filename: `thumbnail${ext}` });
  }

  return targets;
}

export interface DownloadTaskOptions {
  /** Parent directory; each task gets its own `<outDir>/<task-id>/` subfolder. */
  outDir: string;
  dryRun?: boolean;
  /** Re-download even if the file already exists. */
  overwrite?: boolean;
  includeThumbnail?: boolean;
}

export interface DownloadTaskResult {
  taskId: string;
  dir: string;
  files: DownloadedFile[];
}

async function statSize(filePath: string): Promise<number | null> {
  try {
    const s = await fs.stat(filePath);
    return s.isFile() ? s.size : null;
  } catch {
    return null;
  }
}

/**
 * Downloads a single task's assets into `<outDir>/<task-id>/`. Existing non-empty
 * files are skipped (unless overwrite). Writes go through a `.part` temp file and
 * an atomic rename so an interrupted run never leaves a half file that later
 * looks "already downloaded".
 */
export async function downloadTaskAssets(
  client: MeshyClientLike,
  task: MeshyTask,
  opts: DownloadTaskOptions,
): Promise<DownloadTaskResult> {
  const dir = path.resolve(opts.outDir, task.id);
  const targets = assetTargets(task, { includeThumbnail: opts.includeThumbnail });
  const files: DownloadedFile[] = [];

  if (!opts.dryRun && targets.length > 0) {
    await fs.mkdir(dir, { recursive: true });
  }

  for (const target of targets) {
    const dest = path.join(dir, target.filename);
    const existing = await statSize(dest);
    let bytes = 0;
    let skipped = false;

    if (existing !== null && existing > 0 && !opts.overwrite) {
      skipped = true;
      bytes = existing;
    } else if (opts.dryRun) {
      // planning only — do not touch disk
    } else {
      const data = await client.downloadArrayBuffer(target.url);
      const part = `${dest}.part`;
      await fs.writeFile(part, data);
      await fs.rename(part, dest);
      bytes = data.byteLength;
    }

    files.push({
      role: target.role,
      url: target.url,
      path: dest,
      filename: target.filename,
      bytes,
      skipped,
    });
  }

  return { taskId: task.id, dir, files };
}
