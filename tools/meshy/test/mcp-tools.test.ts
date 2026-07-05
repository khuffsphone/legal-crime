import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { buildTools, resolveKind, TOOL_NAMES, type ToolDef } from "../mcp-server/tools.js";
import type { MeshyClientLike } from "../src/client.js";
import type { MeshyTask } from "../src/types.js";

/** Parses input through the tool's zod shape (applying defaults), then runs the handler. */
async function invoke(def: ToolDef, input: Record<string, unknown>) {
  const parsed = z.object(def.config.inputSchema).parse(input);
  return def.handler(parsed as Record<string, unknown>);
}

function structured(result: Awaited<ReturnType<ToolDef["handler"]>>): Record<string, unknown> {
  return result.structuredContent ?? {};
}

function stubClient(overrides: Partial<MeshyClientLike> = {}): MeshyClientLike {
  return {
    createTask: vi.fn(async () => "task-created"),
    getTask: vi.fn(),
    listTasks: vi.fn(async () => []),
    listAllTasks: vi.fn(async () => []),
    pollTask: vi.fn(),
    downloadArrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3])),
    ...overrides,
  } as MeshyClientLike;
}

function toolMap(client: MeshyClientLike, defaultOutDir?: string): Record<string, ToolDef> {
  const defs = buildTools(client, defaultOutDir ? { defaultOutDir } : {});
  return Object.fromEntries(defs.map((d) => [d.name, d]));
}

describe("tool registry", () => {
  it("exposes exactly the six expected tools", () => {
    const defs = buildTools(stubClient());
    expect(defs.map((d) => d.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("embeds project canon in generation + download tool descriptions", () => {
    const map = toolMap(stubClient());
    for (const name of ["meshy_text_to_3d", "meshy_image_to_3d", "meshy_text_to_texture", "meshy_download_task"]) {
      const desc = map[name]!.config.description;
      expect(desc).toContain("GLB ONLY");
      expect(desc).toContain("pngquant");
      expect(desc).toContain("2.8284");
    }
  });

  it("every tool has annotations and a non-empty input schema", () => {
    for (const def of buildTools(stubClient())) {
      expect(def.config.annotations).toBeTruthy();
      expect(Object.keys(def.config.inputSchema).length).toBeGreaterThan(0);
      // schema must build into a valid zod object
      expect(() => z.object(def.config.inputSchema)).not.toThrow();
    }
  });
});

describe("resolveKind", () => {
  it("maps aliases to canonical task kinds", () => {
    expect(resolveKind("text")).toBe("text-to-3d");
    expect(resolveKind("text-to-3d")).toBe("text-to-3d");
    expect(resolveKind("image")).toBe("image-to-3d");
    expect(resolveKind("texture")).toBe("retexture");
    expect(resolveKind("text-to-texture")).toBe("retexture");
    expect(() => resolveKind("bogus")).toThrow();
  });
});

describe("schema validation", () => {
  it("rejects an out-of-range target_polycount", () => {
    const map = toolMap(stubClient());
    const schema = z.object(map["meshy_text_to_3d"]!.config.inputSchema);
    expect(() => schema.parse({ mode: "preview", prompt: "x", target_polycount: 9_999_999 })).toThrow();
  });
  it("rejects a non-URL image_url", () => {
    const map = toolMap(stubClient());
    const schema = z.object(map["meshy_image_to_3d"]!.config.inputSchema);
    expect(() => schema.parse({ image_url: "not a url" })).toThrow();
  });
});

describe("meshy_text_to_3d handler", () => {
  it("forces target_formats to GLB only (never FBX) on preview", async () => {
    const createTask = vi.fn(async () => "task-xyz");
    const map = toolMap(stubClient({ createTask }));
    const res = await invoke(map["meshy_text_to_3d"]!, { mode: "preview", prompt: "a race cone", wait: false });

    expect(createTask).toHaveBeenCalledTimes(1);
    const [, body] = createTask.mock.calls[0]!;
    expect(body.target_formats).toEqual(["glb"]);
    expect(JSON.stringify(body)).not.toMatch(/fbx|obj|usdz/i);
    expect(structured(res).task_id).toBe("task-xyz");
  });

  it("errors when preview mode has no prompt", async () => {
    const map = toolMap(stubClient());
    const res = await invoke(map["meshy_text_to_3d"]!, { mode: "preview", wait: false });
    expect(res.isError).toBe(true);
  });

  it("errors when refine mode has no preview_task_id", async () => {
    const map = toolMap(stubClient());
    const res = await invoke(map["meshy_text_to_3d"]!, { mode: "refine", wait: false });
    expect(res.isError).toBe(true);
  });
});

describe("meshy_text_to_texture handler", () => {
  it("requires input_task_id or model_url", async () => {
    const map = toolMap(stubClient());
    const res = await invoke(map["meshy_text_to_texture"]!, { text_style_prompt: "rusty", wait: false });
    expect(res.isError).toBe(true);
  });
  it("accepts an input_task_id and forces GLB output", async () => {
    const createTask = vi.fn(async () => "rt-1");
    const map = toolMap(stubClient({ createTask }));
    const res = await invoke(map["meshy_text_to_texture"]!, {
      input_task_id: "prev-1",
      text_style_prompt: "weathered steel",
      wait: false,
    });
    const [, body] = createTask.mock.calls[0]!;
    expect(body.target_formats).toEqual(["glb"]);
    expect(body.input_task_id).toBe("prev-1");
    expect(structured(res).task_id).toBe("rt-1");
  });
});

describe("meshy_get_task handler", () => {
  it("summarizes a task", async () => {
    const task: MeshyTask = {
      id: "g1",
      status: "SUCCEEDED",
      prompt: "a barrel",
      model_urls: { glb: "https://a/g1.glb" },
      expires_at: Date.UTC(2026, 0, 2),
    };
    const map = toolMap(stubClient({ getTask: vi.fn(async () => task) }));
    const res = await invoke(map["meshy_get_task"]!, { kind: "text", task_id: "g1" });
    const s = structured(res);
    expect(s.task_id).toBe("g1");
    expect(s.glb_url).toBe("https://a/g1.glb");
    expect(s.kind).toBe("text-to-3d");
  });
});

describe("meshy_list_tasks handler", () => {
  const page: MeshyTask[] = [
    { id: "a", status: "SUCCEEDED", model_urls: { glb: "u" } },
    { id: "b", status: "FAILED" },
    { id: "c", status: "SUCCEEDED", model_urls: {} },
  ];

  it("filters by status and by GLB availability", async () => {
    const map = toolMap(stubClient({ listTasks: vi.fn(async () => page) }));
    const res = await invoke(map["meshy_list_tasks"]!, {
      kind: "image",
      status: "SUCCEEDED",
      only_with_glb: true,
    });
    const s = structured(res);
    expect(s.count).toBe(1);
    expect((s.tasks as { task_id: string }[])[0]!.task_id).toBe("a");
  });

  it("reports has_more when the page is full", async () => {
    const full = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, status: "SUCCEEDED" as const }));
    const map = toolMap(stubClient({ listTasks: vi.fn(async () => full) }));
    const res = await invoke(map["meshy_list_tasks"]!, { kind: "text", page_num: 1, page_size: 10 });
    const s = structured(res);
    expect(s.has_more).toBe(true);
    expect(s.next_page).toBe(2);
  });
});

describe("meshy_download_task handler", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "meshy-mcp-dl-"));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const succeeded: MeshyTask = {
    id: "d1",
    status: "SUCCEEDED",
    prompt: "a crate",
    model_urls: { glb: "https://a/d1.glb" },
    texture_urls: [{ base_color: "https://a/d1.png" }],
  };

  it("downloads a SUCCEEDED task and writes the manifest", async () => {
    const client = stubClient({ getTask: vi.fn(async () => succeeded) });
    const map = toolMap(client, tmp);
    const res = await invoke(map["meshy_download_task"]!, { kind: "text", task_id: "d1" });
    const s = structured(res);
    expect(s.downloaded).toBe(2);
    await expect(fs.stat(path.join(tmp, "d1", "model.glb"))).resolves.toBeTruthy();
    const manifest = JSON.parse(await fs.readFile(path.join(tmp, "manifest.json"), "utf8"));
    expect(manifest.tasks["d1"]).toBeTruthy();
  });

  it("errors (does not download) when the task is not SUCCEEDED", async () => {
    const running: MeshyTask = { id: "d2", status: "IN_PROGRESS", model_urls: {} };
    const client = stubClient({ getTask: vi.fn(async () => running) });
    const map = toolMap(client, tmp);
    const res = await invoke(map["meshy_download_task"]!, { kind: "text", task_id: "d2" });
    expect(res.isError).toBe(true);
    expect(client.downloadArrayBuffer).not.toHaveBeenCalled();
  });
});
