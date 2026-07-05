import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { assetTargets, downloadTaskAssets, extFromUrl } from "../src/download.js";
import type { MeshyClientLike } from "../src/client.js";
import type { MeshyTask } from "../src/types.js";

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "meshy-dl-"));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function stubClient(bytes = new Uint8Array([1, 2, 3])): MeshyClientLike & { downloadArrayBuffer: ReturnType<typeof vi.fn> } {
  return {
    createTask: vi.fn(),
    getTask: vi.fn(),
    listTasks: vi.fn(),
    listAllTasks: vi.fn(),
    pollTask: vi.fn(),
    downloadArrayBuffer: vi.fn(async () => bytes),
  } as unknown as MeshyClientLike & { downloadArrayBuffer: ReturnType<typeof vi.fn> };
}

const taskWithGlb: MeshyTask = {
  id: "task-1",
  status: "SUCCEEDED",
  model_urls: { glb: "https://a/model.glb?sig=1", fbx: "https://a/model.fbx?sig=2" },
  texture_urls: [{ base_color: "https://a/base.png?sig=3", normal: "https://a/normal.jpg?sig=4" }],
  thumbnail_url: "https://a/thumb.png?sig=5",
};

describe("extFromUrl", () => {
  it("reads the extension ignoring the query string", () => {
    expect(extFromUrl("https://a/x.glb?sig=1", ".bin")).toBe(".glb");
    expect(extFromUrl("https://a/base.PNG?x=1", ".bin")).toBe(".png");
  });
  it("falls back when there is no extension", () => {
    expect(extFromUrl("https://a/noext?x=1", ".png")).toBe(".png");
    expect(extFromUrl("not a url", ".png")).toBe(".png");
  });
});

describe("assetTargets", () => {
  it("takes only the GLB (never FBX) plus all texture maps", () => {
    const targets = assetTargets(taskWithGlb);
    const roles = targets.map((t) => t.role);
    expect(roles).toContain("model.glb");
    expect(roles).toContain("texture.base_color");
    expect(roles).toContain("texture.normal");
    // canon: never FBX/OBJ
    expect(targets.some((t) => t.filename.endsWith(".fbx"))).toBe(false);
    // no thumbnail unless requested
    expect(roles).not.toContain("thumbnail");
  });

  it("includes the thumbnail when asked", () => {
    const targets = assetTargets(taskWithGlb, { includeThumbnail: true });
    expect(targets.map((t) => t.role)).toContain("thumbnail");
  });

  it("returns no model target when there is no GLB", () => {
    const targets = assetTargets({ id: "x", status: "SUCCEEDED", model_urls: {} });
    expect(targets).toHaveLength(0);
  });
});

describe("downloadTaskAssets", () => {
  it("downloads the GLB + textures into <out>/<id>/ and reports bytes", async () => {
    const client = stubClient(new Uint8Array([9, 9, 9]));
    const res = await downloadTaskAssets(client, taskWithGlb, { outDir: tmp });
    expect(res.dir).toBe(path.join(tmp, "task-1"));
    // 1 glb + 2 textures = 3 downloads
    expect(client.downloadArrayBuffer).toHaveBeenCalledTimes(3);
    const glb = res.files.find((f) => f.role === "model.glb")!;
    expect(glb.filename).toBe("model.glb");
    expect(glb.bytes).toBe(3);
    // files actually exist on disk
    await expect(fs.stat(path.join(res.dir, "model.glb"))).resolves.toBeTruthy();
    // no leftover .part files
    const entries = await fs.readdir(res.dir);
    expect(entries.some((e) => e.endsWith(".part"))).toBe(false);
  });

  it("skips files that already exist and does not re-download them", async () => {
    const dir = path.join(tmp, "task-1");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "model.glb"), "already here");

    const client = stubClient();
    const res = await downloadTaskAssets(client, taskWithGlb, { outDir: tmp });

    const glb = res.files.find((f) => f.role === "model.glb")!;
    expect(glb.skipped).toBe(true);
    // only the 2 textures were fetched, not the pre-existing glb
    expect(client.downloadArrayBuffer).toHaveBeenCalledTimes(2);
  });

  it("re-downloads when overwrite is set", async () => {
    const dir = path.join(tmp, "task-1");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "model.glb"), "old");

    const client = stubClient();
    const res = await downloadTaskAssets(client, taskWithGlb, { outDir: tmp, overwrite: true });
    expect(res.files.find((f) => f.role === "model.glb")!.skipped).toBe(false);
    expect(client.downloadArrayBuffer).toHaveBeenCalledTimes(3);
  });

  it("dry-run writes nothing and downloads nothing", async () => {
    const client = stubClient();
    const res = await downloadTaskAssets(client, taskWithGlb, { outDir: tmp, dryRun: true });
    expect(client.downloadArrayBuffer).not.toHaveBeenCalled();
    expect(res.files.every((f) => f.bytes === 0 && !f.skipped)).toBe(true);
    await expect(fs.stat(path.join(tmp, "task-1"))).rejects.toBeTruthy();
  });
});
