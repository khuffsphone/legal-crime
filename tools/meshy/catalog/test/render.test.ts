import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { planRenderJobs, runRender, type BlenderRunner } from "../src/render.js";
import type { CatalogEntry } from "../src/types.js";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "meshy-cat-render-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function entry(taskId: string): CatalogEntry {
  return {
    task_id: taskId,
    glb_path: `${taskId}/model.glb`,
    thumbnail_path: `_catalog/${taskId}.png`,
    descriptor: { apparent_sex: "", apparent_age: "", dress: "", proposed_archetype: "", confidence: "" },
    notes: "",
  };
}

describe("planRenderJobs", () => {
  it("skips entries whose thumbnail already exists, unless overwrite", async () => {
    const catalogDir = path.join(root, "_catalog");
    await fs.mkdir(catalogDir, { recursive: true });
    await fs.writeFile(path.join(catalogDir, "task-a.png"), "existing");

    const entries = [entry("task-a"), entry("task-b")];
    const jobs = await planRenderJobs(entries, { meshyRoot: root });
    expect(jobs.map((j) => j.task_id)).toEqual(["task-b"]); // task-a skipped

    const all = await planRenderJobs(entries, { meshyRoot: root, overwrite: true });
    expect(all.map((j) => j.task_id).sort()).toEqual(["task-a", "task-b"]);
    // absolute resolved paths
    expect(path.isAbsolute(all[0]!.glb)).toBe(true);
    expect(all[0]!.out).toBe(path.join(root, "_catalog", "task-a.png"));
  });
});

describe("runRender", () => {
  const catalogDir = () => path.join(root, "_catalog");

  it("writes a jobs file, runs the runner, and returns the result file it wrote", async () => {
    const jobs = [{ task_id: "task-a", glb: "/abs/task-a/model.glb", out: path.join(catalogDir(), "task-a.png") }];
    // stub runner: assert it received a jobs file, then write a result file (as the python would)
    const runner: BlenderRunner = async ({ jobsFile, resultFile, canvas, engine }) => {
      const spec = JSON.parse(await fs.readFile(jobsFile, "utf8"));
      expect(spec.jobs[0].task_id).toBe("task-a");
      expect(spec.canvas).toBe(canvas);
      expect(engine).toBe("BLENDER_EEVEE");
      await fs.writeFile(resultFile, JSON.stringify([{ task_id: "task-a", ok: true }]));
    };
    const results = await runRender(jobs, {
      blenderBin: "blender",
      scriptPath: "/x/render_catalog.py",
      catalogDir: catalogDir(),
      canvas: 512,
      engine: "BLENDER_EEVEE",
      runner,
    });
    expect(results).toEqual([{ task_id: "task-a", ok: true }]);
  });

  it("marks all jobs failed (never throws) when the runner errors, e.g. Blender missing", async () => {
    const jobs = [{ task_id: "task-a", glb: "/g.glb", out: path.join(catalogDir(), "task-a.png") }];
    const runner: BlenderRunner = async () => {
      throw new Error("spawn blender ENOENT");
    };
    const results = await runRender(jobs, {
      blenderBin: "blender",
      scriptPath: "/x/render_catalog.py",
      catalogDir: catalogDir(),
      canvas: 512,
      engine: "BLENDER_EEVEE",
      runner,
    });
    expect(results).toEqual([{ task_id: "task-a", ok: false, reason: "no render result (Blender missing or crashed)" }]);
  });

  it("returns [] for no jobs without invoking the runner", async () => {
    let called = false;
    const runner: BlenderRunner = async () => {
      called = true;
    };
    const results = await runRender([], {
      blenderBin: "blender",
      scriptPath: "/x.py",
      catalogDir: catalogDir(),
      canvas: 512,
      engine: "BLENDER_EEVEE",
      runner,
    });
    expect(results).toEqual([]);
    expect(called).toBe(false);
  });
});
