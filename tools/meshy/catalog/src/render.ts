import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { CatalogEntry } from "./types.js";

/** One Blender render job (absolute paths). */
export interface RenderJob {
  task_id: string;
  glb: string;
  out: string;
}

/** Per-task render outcome, written by render_catalog.py and read back here. */
export interface RenderResult {
  task_id: string;
  ok: boolean;
  reason?: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

/**
 * Plan the render jobs for a catalog: one per entry whose composite thumbnail is
 * not already on disk (skipped unless overwrite). Paths resolve against meshyRoot.
 */
export async function planRenderJobs(
  entries: CatalogEntry[],
  opts: { meshyRoot: string; overwrite?: boolean },
): Promise<RenderJob[]> {
  const jobs: RenderJob[] = [];
  for (const e of entries) {
    const out = path.resolve(opts.meshyRoot, e.thumbnail_path);
    if (!opts.overwrite && (await fileExists(out))) continue;
    jobs.push({
      task_id: e.task_id,
      glb: path.resolve(opts.meshyRoot, e.glb_path),
      out,
    });
  }
  return jobs;
}

/** Invokes Blender. Injectable so tests never spawn a process. */
export type BlenderRunner = (args: {
  blenderBin: string;
  script: string;
  jobsFile: string;
  resultFile: string;
  canvas: number;
  engine: string;
}) => Promise<void>;

const defaultBlenderRunner: BlenderRunner = async ({
  blenderBin,
  script,
  jobsFile,
  resultFile,
  canvas,
  engine,
}) => {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      blenderBin,
      ["-b", "-P", script, "--", "--jobs", jobsFile, "--result", resultFile, "--canvas", String(canvas), "--engine", engine],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`blender exited with code ${code}`));
    });
  });
};

export interface RunRenderOptions {
  blenderBin: string;
  scriptPath: string;
  /** Dir to write the jobs/result sidecar files (the _catalog dir). */
  catalogDir: string;
  canvas: number;
  engine: string;
  runner?: BlenderRunner;
  logger?: (msg: string) => void;
}

/**
 * Render all jobs via Blender and return per-task results. Robust to Blender
 * being absent or crashing: a runner failure never throws — the jobs are simply
 * reported as failed so the catalog scaffold still gets written.
 */
export async function runRender(jobs: RenderJob[], opts: RunRenderOptions): Promise<RenderResult[]> {
  const log = opts.logger ?? (() => {});
  if (jobs.length === 0) return [];

  await fs.mkdir(opts.catalogDir, { recursive: true });
  const jobsFile = path.join(opts.catalogDir, "_render_jobs.json");
  const resultFile = path.join(opts.catalogDir, "_render_result.json");
  await fs.writeFile(jobsFile, `${JSON.stringify({ canvas: opts.canvas, engine: opts.engine, jobs }, null, 2)}\n`);
  await fs.rm(resultFile, { force: true }).catch(() => {});

  const runner = opts.runner ?? defaultBlenderRunner;
  try {
    await runner({
      blenderBin: opts.blenderBin,
      script: opts.scriptPath,
      jobsFile,
      resultFile,
      canvas: opts.canvas,
      engine: opts.engine,
    });
  } catch (err) {
    log(`Blender run failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const raw = await fs.readFile(resultFile, "utf8");
    const parsed = JSON.parse(raw) as RenderResult[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* python wrote no result — treat all as failed below */
  }
  return jobs.map((j) => ({ task_id: j.task_id, ok: false, reason: "no render result (Blender missing or crashed)" }));
}
