import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pullAssets } from "../src/pull.js";
import type { MeshyClientLike } from "../src/client.js";
import type { MeshyTask, TaskKind } from "../src/types.js";

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "meshy-pull-"));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function makeClient(tasksByKind: Partial<Record<TaskKind, MeshyTask[]>>): MeshyClientLike & {
  downloadArrayBuffer: ReturnType<typeof vi.fn>;
} {
  return {
    createTask: vi.fn(),
    getTask: vi.fn(),
    listTasks: vi.fn(),
    listAllTasks: vi.fn(async (kind: TaskKind) => tasksByKind[kind] ?? []),
    pollTask: vi.fn(),
    downloadArrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
  } as unknown as MeshyClientLike & { downloadArrayBuffer: ReturnType<typeof vi.fn> };
}

const tasks: MeshyTask[] = [
  { id: "ok-1", status: "SUCCEEDED", prompt: "a car", created_at: 2000, model_urls: { glb: "https://a/1.glb" } },
  { id: "ok-2", status: "SUCCEEDED", prompt: "a barrel", created_at: 5000, model_urls: { glb: "https://a/2.glb" }, texture_urls: [{ base_color: "https://a/2.png" }] },
  { id: "no-glb", status: "SUCCEEDED", prompt: "no glb", created_at: 5000, model_urls: {} },
  { id: "running", status: "IN_PROGRESS", prompt: "wip", created_at: 5000, model_urls: { glb: "https://a/x.glb" } },
  { id: "old", status: "SUCCEEDED", prompt: "old one", created_at: 100, model_urls: { glb: "https://a/old.glb" } },
];

describe("pullAssets", () => {
  it("pulls only SUCCEEDED tasks that have a GLB, and writes a manifest", async () => {
    const client = makeClient({ "text-to-3d": tasks });
    const summary = await pullAssets(client, {
      kinds: ["text-to-3d"],
      outDir: tmp,
      now: () => Date.UTC(2026, 0, 1),
    });

    const ids = summary.pulled.map((p) => p.id).sort();
    expect(ids).toEqual(["ok-1", "ok-2", "old"]); // not no-glb, not running
    // ok-1: 1 glb; ok-2: 1 glb + 1 texture; old: 1 glb => 4 files
    expect(summary.totalDownloaded).toBe(4);
    expect(client.downloadArrayBuffer).toHaveBeenCalledTimes(4);

    const manifest = JSON.parse(await fs.readFile(path.join(tmp, "manifest.json"), "utf8"));
    expect(Object.keys(manifest.tasks).sort()).toEqual(["ok-1", "ok-2", "old"]);
    expect(manifest.tasks["ok-2"].files).toContain("model.glb");
    expect(manifest.tasks["ok-2"].files.some((f: string) => f.startsWith("texture_"))).toBe(true);
  });

  it("honors --since by filtering on created_at", async () => {
    const client = makeClient({ "text-to-3d": tasks });
    const summary = await pullAssets(client, {
      kinds: ["text-to-3d"],
      outDir: tmp,
      since: 1000, // drops "old" (created_at 100)
      now: () => Date.UTC(2026, 0, 1),
    });
    expect(summary.pulled.map((p) => p.id).sort()).toEqual(["ok-1", "ok-2"]);
  });

  it("skips already-downloaded files on a second run", async () => {
    const client = makeClient({ "text-to-3d": tasks });
    await pullAssets(client, { kinds: ["text-to-3d"], outDir: tmp, now: () => 0 });
    expect(client.downloadArrayBuffer).toHaveBeenCalledTimes(4);

    // second run: everything already on disk
    client.downloadArrayBuffer.mockClear();
    const summary2 = await pullAssets(client, { kinds: ["text-to-3d"], outDir: tmp, now: () => 0 });
    expect(client.downloadArrayBuffer).not.toHaveBeenCalled();
    expect(summary2.totalDownloaded).toBe(0);
    expect(summary2.totalSkipped).toBe(4);
  });

  it("dry-run downloads nothing and writes no manifest", async () => {
    const client = makeClient({ "text-to-3d": tasks });
    const summary = await pullAssets(client, { kinds: ["text-to-3d"], outDir: tmp, dryRun: true, now: () => 0 });
    expect(client.downloadArrayBuffer).not.toHaveBeenCalled();
    expect(summary.dryRun).toBe(true);
    await expect(fs.stat(path.join(tmp, "manifest.json"))).rejects.toBeTruthy();
  });

  it("continues to other kinds when one kind's listing fails", async () => {
    const client = makeClient({ "image-to-3d": [tasks[0]!] });
    (client.listAllTasks as ReturnType<typeof vi.fn>).mockImplementation(async (kind: TaskKind) => {
      if (kind === "text-to-3d") throw new Error("boom");
      if (kind === "image-to-3d") return [tasks[0]!];
      return [];
    });
    const logs: string[] = [];
    const summary = await pullAssets(client, {
      kinds: ["text-to-3d", "image-to-3d"],
      outDir: tmp,
      now: () => 0,
      logger: (m) => logs.push(m),
    });
    expect(summary.pulled.map((p) => p.id)).toEqual(["ok-1"]);
    expect(logs.some((l) => l.includes("Failed to list text-to-3d"))).toBe(true);
  });
});
