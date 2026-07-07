import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { scanMeshyRoot, readPullManifest } from "../src/scan.js";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "meshy-cat-scan-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function touch(rel: string, content = "x"): Promise<void> {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content);
}

describe("scanMeshyRoot", () => {
  it("finds GLBs per task dir, records textures, skips dirs without a GLB and the _catalog dir", async () => {
    await touch("task-a/model.glb");
    await touch("task-a/texture_base_color.png");
    await touch("task-a/texture_normal.jpg");
    await touch("task-b/model.glb");
    await touch("no-glb/readme.txt"); // no glb -> skipped
    await touch("_catalog/task-a.png"); // output dir -> skipped
    await touch(".hidden/model.glb"); // dotdir -> skipped

    const assets = await scanMeshyRoot(root);
    const ids = assets.map((a) => a.taskId).sort();
    expect(ids).toEqual(["task-a", "task-b"]);

    const a = assets.find((x) => x.taskId === "task-a")!;
    expect(a.glbRel).toBe(path.join("task-a", "model.glb"));
    expect(a.textures.length).toBe(2);
    expect(path.isAbsolute(a.glbAbs)).toBe(true);
  });

  it("finds a nested GLB (one level deep)", async () => {
    await touch("task-c/export/model.glb");
    const assets = await scanMeshyRoot(root);
    expect(assets.map((a) => a.taskId)).toEqual(["task-c"]);
    expect(assets[0]!.glbRel).toBe(path.join("task-c", "export", "model.glb"));
  });

  it("emits one asset per GLB when a task dir has multiple", async () => {
    await touch("multi/a.glb");
    await touch("multi/b.glb");
    const assets = await scanMeshyRoot(root);
    expect(assets.filter((a) => a.taskId === "multi").length).toBe(2);
  });

  it("returns [] for a missing root", async () => {
    expect(await scanMeshyRoot(path.join(root, "nope"))).toEqual([]);
  });
});

describe("readPullManifest", () => {
  it("reads the tasks map, empty when absent/corrupt", async () => {
    expect(await readPullManifest(root)).toEqual({});
    await touch("manifest.json", JSON.stringify({ tasks: { "task-a": { mode: "image-to-3d", prompt: "a man" } } }));
    const m = await readPullManifest(root);
    expect(m["task-a"]!.mode).toBe("image-to-3d");
    await fs.writeFile(path.join(root, "manifest.json"), "{ broken");
    expect(await readPullManifest(root)).toEqual({});
  });
});
