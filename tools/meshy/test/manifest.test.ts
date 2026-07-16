import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildEntry,
  emptyManifest,
  readManifest,
  taskModeLabel,
  taskPrompt,
  writeManifest,
} from "../src/manifest.js";
import type { DownloadTaskResult } from "../src/download.js";
import type { MeshyTask } from "../src/types.js";

let tmp: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "meshy-man-"));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const download: DownloadTaskResult = {
  taskId: "t1",
  dir: "/x/t1",
  files: [
    { role: "model.glb", url: "u", path: "/x/t1/model.glb", filename: "model.glb", bytes: 10, skipped: false },
    { role: "texture.base_color", url: "u", path: "/x/t1/texture_base_color.png", filename: "texture_base_color.png", bytes: 5, skipped: false },
  ],
};

describe("taskModeLabel / taskPrompt", () => {
  it("labels text-to-3d with its sub-mode", () => {
    expect(taskModeLabel("text-to-3d", { id: "a", status: "SUCCEEDED", mode: "refine" })).toBe("text-to-3d/refine");
    expect(taskModeLabel("image-to-3d", { id: "a", status: "SUCCEEDED" })).toBe("image-to-3d");
  });
  it("finds a prompt across endpoint field variants", () => {
    expect(taskPrompt({ id: "a", status: "S", prompt: "p1" })).toBe("p1");
    expect(taskPrompt({ id: "a", status: "S", object_prompt: "p2" })).toBe("p2");
    expect(taskPrompt({ id: "a", status: "S", text_style_prompt: "p3" })).toBe("p3");
    expect(taskPrompt({ id: "a", status: "S" })).toBe("");
  });
});

describe("buildEntry", () => {
  it("captures task metadata and written filenames", () => {
    const task: MeshyTask = {
      id: "t1",
      status: "SUCCEEDED",
      mode: "refine",
      prompt: "a rusty barrel",
      art_style: "realistic",
      model_urls: { glb: "g" },
      created_at: 111,
      finished_at: 222,
      expires_at: 333,
    };
    const entry = buildEntry(task, "text-to-3d", download, "2026-01-01T00:00:00.000Z");
    expect(entry).toMatchObject({
      id: "t1",
      kind: "text-to-3d",
      mode: "text-to-3d/refine",
      status: "SUCCEEDED",
      prompt: "a rusty barrel",
      files: ["model.glb", "texture_base_color.png"],
      created_at: 111,
      finished_at: 222,
      expires_at: 333,
      pulled_at: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("readManifest / writeManifest", () => {
  it("returns an empty manifest when the file is missing", async () => {
    const m = await readManifest(path.join(tmp, "nope.json"), "2026-01-01T00:00:00.000Z");
    expect(m.tasks).toEqual({});
    expect(m.count).toBe(0);
  });

  it("round-trips and merges entries idempotently", async () => {
    const file = path.join(tmp, "manifest.json");
    const m = emptyManifest("2026-01-01T00:00:00.000Z");
    m.tasks["t1"] = buildEntry({ id: "t1", status: "SUCCEEDED", model_urls: { glb: "g" } }, "image-to-3d", download, "iso1");
    await writeManifest(file, m);

    // second pull adds a new task, keeps the old one
    const reloaded = await readManifest(file, "iso2");
    expect(Object.keys(reloaded.tasks)).toEqual(["t1"]);
    reloaded.tasks["t2"] = buildEntry({ id: "t2", status: "SUCCEEDED", model_urls: { glb: "g" } }, "image-to-3d", { ...download, taskId: "t2" }, "iso2");
    await writeManifest(file, reloaded);

    const final = await readManifest(file, "iso3");
    expect(Object.keys(final.tasks).sort()).toEqual(["t1", "t2"]);
    expect(final.count).toBe(2);
    // valid JSON on disk with trailing newline
    const raw = await fs.readFile(file, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("recovers from a corrupt manifest by starting fresh", async () => {
    const file = path.join(tmp, "manifest.json");
    await fs.writeFile(file, "{ not valid json");
    const m = await readManifest(file, "iso");
    expect(m.tasks).toEqual({});
  });
});
