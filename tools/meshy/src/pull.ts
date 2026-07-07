import * as path from "node:path";
import type { MeshyClientLike } from "./client.js";
import { downloadTaskAssets } from "./download.js";
import {
  buildEntry,
  readManifest,
  taskModeLabel,
  taskPrompt,
  writeManifest,
} from "./manifest.js";
import type { MeshyTask, TaskKind } from "./types.js";

export interface PullOptions {
  /** Which task families to pull. */
  kinds: TaskKind[];
  /** Only pull tasks with created_at >= this epoch-ms value. */
  since?: number;
  /** Parent output directory. */
  outDir: string;
  dryRun?: boolean;
  overwrite?: boolean;
  includeThumbnail?: boolean;
  pageSize?: number;
  logger?: (msg: string) => void;
  /** Injectable clock for deterministic manifest timestamps in tests. */
  now?: () => number;
}

export interface PullTaskSummary {
  id: string;
  kind: TaskKind;
  mode: string;
  prompt: string;
  status: string;
  filesDownloaded: number;
  filesSkipped: number;
}

export interface PullSummary {
  pulled: PullTaskSummary[];
  totalDownloaded: number;
  totalSkipped: number;
  manifestPath: string;
  dryRun: boolean;
}

/** True when a completed task actually has a GLB to pull. */
function hasGlb(task: MeshyTask): boolean {
  return Boolean(task.model_urls?.glb);
}

/**
 * Lists every SUCCEEDED task across the requested kinds and downloads its GLB +
 * textures (RAW, no recompression) into `<outDir>/<task-id>/`, skipping files
 * already on disk. Records everything in `<outDir>/manifest.json`.
 */
export async function pullAssets(
  client: MeshyClientLike,
  opts: PullOptions,
): Promise<PullSummary> {
  const log = opts.logger ?? (() => {});
  const nowMs = opts.now?.() ?? Date.now();
  const pulledAt = new Date(nowMs).toISOString();
  const manifestPath = path.join(opts.outDir, "manifest.json");
  const manifest = await readManifest(manifestPath, pulledAt);

  const pulled: PullTaskSummary[] = [];
  let totalDownloaded = 0;
  let totalSkipped = 0;

  for (const kind of opts.kinds) {
    log(`Listing ${kind} tasks…`);
    let tasks: MeshyTask[];
    try {
      tasks = await client.listAllTasks(kind, { pageSize: opts.pageSize });
    } catch (err) {
      log(`  ! Failed to list ${kind}: ${(err as Error).message}`);
      continue;
    }

    const completed = tasks.filter((t) => String(t.status).toUpperCase() === "SUCCEEDED");
    const selected = completed.filter((t) => {
      if (!hasGlb(t)) return false;
      if (opts.since !== undefined && typeof t.created_at === "number" && t.created_at < opts.since) {
        return false;
      }
      return true;
    });

    log(
      `  ${kind}: ${tasks.length} total, ${completed.length} completed, ${selected.length} to pull`,
    );

    for (const task of selected) {
      const result = await downloadTaskAssets(client, task, {
        outDir: opts.outDir,
        dryRun: opts.dryRun,
        overwrite: opts.overwrite,
        includeThumbnail: opts.includeThumbnail,
        kind,
      });
      const downloaded = result.files.filter((f) => !f.skipped).length;
      const skipped = result.files.filter((f) => f.skipped).length;
      totalDownloaded += downloaded;
      totalSkipped += skipped;

      if (!opts.dryRun) {
        manifest.tasks[task.id] = buildEntry(task, kind, result, pulledAt);
      }

      const mode = taskModeLabel(kind, task);
      pulled.push({
        id: task.id,
        kind,
        mode,
        prompt: taskPrompt(task),
        status: String(task.status),
        filesDownloaded: downloaded,
        filesSkipped: skipped,
      });
      log(`  ${opts.dryRun ? "[dry-run] " : ""}${task.id} (${mode}): +${downloaded} new / =${skipped} skipped`);
    }
  }

  if (!opts.dryRun) {
    manifest.generated_at = pulledAt;
    await writeManifest(manifestPath, manifest);
  }

  return {
    pulled,
    totalDownloaded,
    totalSkipped,
    manifestPath,
    dryRun: Boolean(opts.dryRun),
  };
}
