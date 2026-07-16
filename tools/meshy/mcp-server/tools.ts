import * as path from "node:path";
import { z } from "zod";
import type { MeshyClientLike } from "../src/client.js";
import { TARGET_FORMATS_GLB, TERMINAL_STATUSES } from "../src/constants.js";
import { CANON_PREAMBLE } from "../src/canon.js";
import { downloadTaskAssets } from "../src/download.js";
import {
  buildEntry,
  readManifest,
  writeManifest,
} from "../src/manifest.js";
import type { MeshyTask, TaskKind } from "../src/types.js";
import { compact, fail, ok, summarizeTask, type ToolResult } from "./format.js";

/** Accepted `kind` values (aliases included) and how they map to a TaskKind. */
export const KIND_ALIASES: Record<string, TaskKind> = {
  "text-to-3d": "text-to-3d",
  text: "text-to-3d",
  "image-to-3d": "image-to-3d",
  image: "image-to-3d",
  retexture: "retexture",
  "text-to-texture": "retexture",
  texture: "retexture",
};

const KIND_ENUM = [
  "text-to-3d",
  "text",
  "image-to-3d",
  "image",
  "retexture",
  "text-to-texture",
  "texture",
] as const;

export function resolveKind(value: string): TaskKind {
  const kind = KIND_ALIASES[value];
  if (!kind) throw new Error(`Unknown task kind "${value}".`);
  return kind;
}

/** A tool definition decoupled from the SDK so it can be unit-tested directly. */
export interface ToolDef {
  name: string;
  config: {
    title: string;
    description: string;
    inputSchema: z.ZodRawShape;
    annotations: {
      readOnlyHint: boolean;
      destructiveHint: boolean;
      idempotentHint: boolean;
      openWorldHint: boolean;
    };
  };
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface BuildToolsOptions {
  /** Default output dir for meshy_download_task. */
  defaultOutDir?: string;
  /** Progress sink; defaults to stderr (stdout is reserved for the MCP transport). */
  log?: (msg: string) => void;
}

/** Reusable wait/poll parameters shared by the generation tools. */
const waitShape = {
  wait: z
    .boolean()
    .default(true)
    .describe(
      "Poll until the task reaches a terminal state and return the final result (default true). Set false to return immediately with just a task_id.",
    ),
  poll_timeout_seconds: z
    .number()
    .int()
    .min(10)
    .max(3600)
    .default(600)
    .describe("Max seconds to poll before returning current progress (default 600)."),
};

/** Creates a task and, if wait=true, polls to completion and reports. */
async function createAndReport(
  client: MeshyClientLike,
  kind: TaskKind,
  aliasForHints: string,
  body: Record<string, unknown>,
  wait: boolean,
  timeoutSeconds: number,
  log: (msg: string) => void,
): Promise<ToolResult> {
  const taskId = await client.createTask(kind, body);
  log(`[meshy] created ${kind} task ${taskId}`);

  if (!wait) {
    return ok({
      task_id: taskId,
      kind,
      status: "PENDING",
      note: `Task created. Poll with meshy_get_task(kind="${aliasForHints}", task_id="${taskId}").`,
    });
  }

  const final = await client.pollTask(kind, taskId, {
    timeoutMs: timeoutSeconds * 1000,
    onProgress: (t) => log(`[meshy] ${taskId} ${t.status} ${t.progress ?? 0}%`),
  });
  const status = String(final.status).toUpperCase();
  const summary = summarizeTask(kind, final);

  if (status === "SUCCEEDED") {
    return ok({
      ...summary,
      note: `Done. GLB is at glb_url. Store it RAW (no recompression) with meshy_download_task(kind="${aliasForHints}", task_id="${taskId}").`,
    });
  }
  if (TERMINAL_STATUSES.has(status)) {
    return ok({ ...summary, note: `Task ended with status ${status}.` });
  }
  return ok({
    ...summary,
    note: `Still ${final.status} after ${timeoutSeconds}s. Keep polling with meshy_get_task(kind="${aliasForHints}", task_id="${taskId}").`,
  });
}

/**
 * Builds every Meshy MCP tool against a client. Kept pure (no SDK/registration)
 * so tests can inspect schemas and drive handlers with a stub client.
 */
export function buildTools(client: MeshyClientLike, opts: BuildToolsOptions = {}): ToolDef[] {
  const log = opts.log ?? (() => {});
  const defaultOutDir = opts.defaultOutDir ?? path.resolve("assets/raw/meshy");

  const genAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  };
  const readAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };

  const tools: ToolDef[] = [];

  // ── meshy_text_to_3d ────────────────────────────────────────────────────
  tools.push({
    name: "meshy_text_to_3d",
    config: {
      title: "Meshy: Text to 3D",
      description: `${CANON_PREAMBLE}

Generate a 3D model (GLB) from a text prompt via Meshy. This is a TWO-STEP workflow:
  1. mode="preview" with a 'prompt' -> an untextured geometry mesh. Returns a preview task id.
  2. mode="refine" with 'preview_task_id' -> applies textures to that mesh.
Run preview first, then refine the returned preview task id.

Costs Meshy credits. Long jobs: by default this polls to completion (wait=true) and
reports progress on stderr; if it times out you get the current progress and a task_id to keep polling.

Returns JSON: { task_id, kind, status, progress, glb_url, model_urls, texture_urls, thumbnail_url, expires_at, error, note }.`,
      inputSchema: {
        mode: z
          .enum(["preview", "refine"])
          .default("preview")
          .describe(
            "preview = geometry-only mesh (step 1, needs prompt). refine = texture a completed preview (step 2, needs preview_task_id).",
          ),
        prompt: z
          .string()
          .min(3)
          .max(600)
          .optional()
          .describe("Required for preview. Describe a single upright, centered game asset."),
        art_style: z
          .enum(["realistic", "sculpture"])
          .optional()
          .describe("Preview only. Default realistic."),
        ai_model: z
          .string()
          .optional()
          .describe("Meshy model version e.g. 'meshy-5' or 'meshy-4'. Omit for the account default."),
        topology: z.enum(["quad", "triangle"]).optional().describe("Mesh topology (default quad)."),
        target_polycount: z
          .number()
          .int()
          .min(100)
          .max(300000)
          .optional()
          .describe("Target polygon count."),
        should_remesh: z.boolean().optional().describe("Remesh to the target topology/polycount (default true)."),
        seed: z.number().int().optional().describe("Random seed for reproducibility."),
        preview_task_id: z
          .string()
          .optional()
          .describe("Refine only: the SUCCEEDED preview task id to texture."),
        enable_pbr: z
          .boolean()
          .default(false)
          .describe("Refine only: also generate PBR maps (metallic/roughness/normal)."),
        texture_prompt: z.string().max(600).optional().describe("Refine only: guides texturing."),
        negative_prompt: z.string().max(600).optional().describe("Things to avoid."),
        ...waitShape,
      },
      annotations: genAnnotations,
    },
    handler: async (raw) => {
      const a = raw as {
        mode: "preview" | "refine";
        prompt?: string;
        art_style?: string;
        ai_model?: string;
        topology?: string;
        target_polycount?: number;
        should_remesh?: boolean;
        seed?: number;
        preview_task_id?: string;
        enable_pbr?: boolean;
        texture_prompt?: string;
        negative_prompt?: string;
        wait: boolean;
        poll_timeout_seconds: number;
      };
      let body: Record<string, unknown>;
      if (a.mode === "preview") {
        if (!a.prompt) return fail("preview mode requires a 'prompt'.");
        body = compact({
          mode: "preview",
          prompt: a.prompt,
          art_style: a.art_style,
          ai_model: a.ai_model,
          topology: a.topology,
          target_polycount: a.target_polycount,
          should_remesh: a.should_remesh,
          seed: a.seed,
          negative_prompt: a.negative_prompt,
          target_formats: [...TARGET_FORMATS_GLB],
        });
      } else {
        if (!a.preview_task_id) {
          return fail("refine mode requires 'preview_task_id' (a SUCCEEDED preview task).");
        }
        body = compact({
          mode: "refine",
          preview_task_id: a.preview_task_id,
          enable_pbr: a.enable_pbr,
          texture_prompt: a.texture_prompt,
          ai_model: a.ai_model,
          target_formats: [...TARGET_FORMATS_GLB],
        });
      }
      return createAndReport(client, "text-to-3d", "text-to-3d", body, a.wait, a.poll_timeout_seconds, log);
    },
  });

  // ── meshy_image_to_3d ───────────────────────────────────────────────────
  tools.push({
    name: "meshy_image_to_3d",
    config: {
      title: "Meshy: Image to 3D",
      description: `${CANON_PREAMBLE}

Generate a 3D model (GLB) from a single reference image via Meshy. One-step:
provide an 'image_url' (public URL or data: URI, jpg/jpeg/png). Costs credits.
By default polls to completion (wait=true) and reports progress on stderr.

Returns JSON: { task_id, kind, status, progress, glb_url, model_urls, texture_urls, thumbnail_url, expires_at, error, note }.`,
      inputSchema: {
        image_url: z
          .string()
          .url()
          .describe("Publicly reachable image URL (jpg/jpeg/png) or a data: URI."),
        ai_model: z.string().optional().describe("Meshy model version. Omit for the account default."),
        topology: z.enum(["quad", "triangle"]).optional().describe("Mesh topology (default quad)."),
        target_polycount: z.number().int().min(100).max(300000).optional().describe("Target polygon count."),
        should_remesh: z.boolean().optional().describe("Remesh to target topology/polycount (default true)."),
        should_texture: z.boolean().default(true).describe("Generate textures (default true)."),
        enable_pbr: z
          .boolean()
          .default(false)
          .describe("Also generate PBR maps. Only applies when should_texture is true."),
        texture_prompt: z.string().max(600).optional().describe("Optional guidance for texturing."),
        ...waitShape,
      },
      annotations: genAnnotations,
    },
    handler: async (raw) => {
      const a = raw as {
        image_url: string;
        ai_model?: string;
        topology?: string;
        target_polycount?: number;
        should_remesh?: boolean;
        should_texture?: boolean;
        enable_pbr?: boolean;
        texture_prompt?: string;
        wait: boolean;
        poll_timeout_seconds: number;
      };
      const body = compact({
        image_url: a.image_url,
        ai_model: a.ai_model,
        topology: a.topology,
        target_polycount: a.target_polycount,
        should_remesh: a.should_remesh,
        should_texture: a.should_texture,
        enable_pbr: a.enable_pbr,
        texture_prompt: a.texture_prompt,
        target_formats: [...TARGET_FORMATS_GLB],
      });
      return createAndReport(client, "image-to-3d", "image-to-3d", body, a.wait, a.poll_timeout_seconds, log);
    },
  });

  // ── meshy_text_to_texture (retexture) ───────────────────────────────────
  tools.push({
    name: "meshy_text_to_texture",
    config: {
      title: "Meshy: Text to Texture (Retexture)",
      description: `${CANON_PREAMBLE}

Re-texture an EXISTING model from a text description (Meshy "retexture" endpoint).
Provide EITHER input_task_id (a SUCCEEDED text-to-3d/image-to-3d/remesh task) OR
model_url (.glb/.gltf/.obj/.fbx/.stl). Costs credits. Output is still GLB.
By default polls to completion (wait=true).

Returns JSON: { task_id, kind, status, progress, glb_url, model_urls, texture_urls, thumbnail_url, expires_at, error, note }.`,
      inputSchema: {
        input_task_id: z
          .string()
          .optional()
          .describe("A SUCCEEDED text-to-3d/image-to-3d/remesh task id to retexture. Provide this OR model_url."),
        model_url: z
          .string()
          .url()
          .optional()
          .describe("URL to a model (.glb/.gltf/.obj/.fbx/.stl) to texture. Provide this OR input_task_id."),
        text_style_prompt: z
          .string()
          .min(1)
          .max(600)
          .optional()
          .describe("Describe the desired texture/material."),
        art_style: z.string().optional().describe("Texture art style, e.g. 'realistic'."),
        ai_model: z.string().optional().describe("Meshy model version. Omit for the account default."),
        enable_pbr: z.boolean().default(false).describe("Also generate PBR maps."),
        enable_original_uv: z.boolean().default(true).describe("Keep the model's original UVs (default true)."),
        negative_prompt: z.string().max(600).optional().describe("Things to avoid."),
        resolution: z.enum(["1024", "2048", "4096"]).optional().describe("Texture resolution."),
        remove_lighting: z
          .boolean()
          .optional()
          .describe("Remove baked highlights/shadows from the base color map."),
        ...waitShape,
      },
      annotations: genAnnotations,
    },
    handler: async (raw) => {
      const a = raw as {
        input_task_id?: string;
        model_url?: string;
        text_style_prompt?: string;
        art_style?: string;
        ai_model?: string;
        enable_pbr?: boolean;
        enable_original_uv?: boolean;
        negative_prompt?: string;
        resolution?: string;
        remove_lighting?: boolean;
        wait: boolean;
        poll_timeout_seconds: number;
      };
      if (!a.input_task_id && !a.model_url) {
        return fail("Provide either 'input_task_id' or 'model_url' to retexture.");
      }
      const body = compact({
        input_task_id: a.input_task_id,
        model_url: a.model_url,
        text_style_prompt: a.text_style_prompt,
        art_style: a.art_style,
        ai_model: a.ai_model,
        enable_pbr: a.enable_pbr,
        enable_original_uv: a.enable_original_uv,
        negative_prompt: a.negative_prompt,
        resolution: a.resolution,
        remove_lighting: a.remove_lighting,
        target_formats: [...TARGET_FORMATS_GLB],
      });
      return createAndReport(client, "retexture", "retexture", body, a.wait, a.poll_timeout_seconds, log);
    },
  });

  // ── meshy_get_task ──────────────────────────────────────────────────────
  tools.push({
    name: "meshy_get_task",
    config: {
      title: "Meshy: Get Task",
      description: `Retrieve the current status and result of a Meshy task by id. Read-only.
Use this to poll a task started with wait=false, or to fetch download URLs.

Returns JSON: { task_id, kind, status, progress, glb_url, model_urls, texture_urls, thumbnail_url, expires_at, error }.
Note: model_urls / texture_urls are pre-signed and EXPIRE (see expires_at) — download promptly (RAW, no recompression).`,
      inputSchema: {
        kind: z.enum(KIND_ENUM).describe("Task family: text-to-3d | image-to-3d | retexture (aliases: text/image/texture/text-to-texture)."),
        task_id: z.string().min(1).describe("The Meshy task id."),
      },
      annotations: readAnnotations,
    },
    handler: async (raw) => {
      const a = raw as { kind: string; task_id: string };
      const kind = resolveKind(a.kind);
      const task = await client.getTask(kind, a.task_id);
      return ok(summarizeTask(kind, task));
    },
  });

  // ── meshy_list_tasks ────────────────────────────────────────────────────
  tools.push({
    name: "meshy_list_tasks",
    config: {
      title: "Meshy: List Tasks",
      description: `List Meshy tasks of a given kind, newest first. Read-only, paginated.
Filter by status (e.g. SUCCEEDED) and/or only tasks that already have a downloadable GLB.

Returns JSON: { kind, page_num, page_size, count, has_more, next_page, tasks: [summaries] }.`,
      inputSchema: {
        kind: z.enum(KIND_ENUM).describe("Task family to list."),
        page_num: z.number().int().min(1).default(1).describe("1-based page number."),
        page_size: z.number().int().min(1).max(50).default(10).describe("Results per page (max 50)."),
        sort_by: z.string().default("-created_at").describe("Sort key, e.g. '-created_at' for newest first."),
        status: z
          .enum(["PENDING", "IN_PROGRESS", "SUCCEEDED", "FAILED", "CANCELED"])
          .optional()
          .describe("Only return tasks with this status."),
        only_with_glb: z
          .boolean()
          .default(false)
          .describe("Only return tasks that already have a downloadable GLB."),
      },
      annotations: readAnnotations,
    },
    handler: async (raw) => {
      const a = raw as {
        kind: string;
        page_num: number;
        page_size: number;
        sort_by: string;
        status?: string;
        only_with_glb: boolean;
      };
      const kind = resolveKind(a.kind);
      const page = await client.listTasks(kind, {
        pageNum: a.page_num,
        pageSize: a.page_size,
        sortBy: a.sort_by,
      });
      let filtered: MeshyTask[] = page;
      if (a.status) {
        const want = a.status.toUpperCase();
        filtered = filtered.filter((t) => String(t.status).toUpperCase() === want);
      }
      if (a.only_with_glb) {
        filtered = filtered.filter((t) => Boolean(t.model_urls?.glb));
      }
      const hasMore = page.length === a.page_size;
      return ok({
        kind,
        page_num: a.page_num,
        page_size: a.page_size,
        count: filtered.length,
        has_more: hasMore,
        next_page: hasMore ? a.page_num + 1 : null,
        tasks: filtered.map((t) => summarizeTask(kind, t)),
      });
    },
  });

  // ── meshy_download_task ─────────────────────────────────────────────────
  tools.push({
    name: "meshy_download_task",
    config: {
      title: "Meshy: Download Task Assets",
      description: `${CANON_PREAMBLE}

Download a SUCCEEDED task's GLB + textures to disk, RAW (no recompression), into
<out_dir>/<task-id>/, skipping files already present, and update the shared manifest.json.
Only the GLB is taken (never FBX/OBJ/USDZ). If the task isn't SUCCEEDED yet, this errors —
poll with meshy_get_task first.

Returns JSON: { task_id, dir, files: [{ role, filename, bytes, skipped }], downloaded, skipped }.`,
      inputSchema: {
        kind: z.enum(KIND_ENUM).describe("Task family."),
        task_id: z.string().min(1).describe("The Meshy task id to download."),
        out_dir: z
          .string()
          .optional()
          .describe(
            "Absolute output dir; each task writes to <out_dir>/<task-id>/. Defaults to MESHY_OUT_DIR or ./assets/raw/meshy relative to the server's CWD. Prefer an absolute path.",
          ),
        overwrite: z.boolean().default(false).describe("Re-download even if the file exists."),
        include_thumbnail: z.boolean().default(false).describe("Also download the thumbnail render."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async (raw) => {
      const a = raw as {
        kind: string;
        task_id: string;
        out_dir?: string;
        overwrite?: boolean;
        include_thumbnail?: boolean;
      };
      const kind = resolveKind(a.kind);
      const task = await client.getTask(kind, a.task_id);
      const status = String(task.status).toUpperCase();
      if (status !== "SUCCEEDED") {
        return fail(
          `Task ${a.task_id} is ${task.status}, not SUCCEEDED — nothing to download yet. Poll with meshy_get_task.`,
        );
      }
      if (!task.model_urls?.glb) {
        return fail(`Task ${a.task_id} is SUCCEEDED but has no GLB url to download.`);
      }
      const outDir = a.out_dir ? path.resolve(a.out_dir) : defaultOutDir;
      const result = await downloadTaskAssets(client, task, {
        outDir,
        overwrite: a.overwrite,
        includeThumbnail: a.include_thumbnail,
        kind,
      });

      // Keep the manifest in sync with the bulk-pull script.
      const manifestPath = path.join(outDir, "manifest.json");
      const nowIso = new Date().toISOString();
      const manifest = await readManifest(manifestPath, nowIso);
      manifest.tasks[task.id] = buildEntry(task, kind, result, nowIso);
      manifest.generated_at = nowIso;
      await writeManifest(manifestPath, manifest);

      const downloaded = result.files.filter((f) => !f.skipped).length;
      const skipped = result.files.filter((f) => f.skipped).length;
      return ok({
        task_id: task.id,
        kind,
        dir: result.dir,
        downloaded,
        skipped,
        manifest: manifestPath,
        files: result.files.map((f) => ({
          role: f.role,
          filename: f.filename,
          bytes: f.bytes,
          skipped: f.skipped,
        })),
      });
    },
  });

  return tools;
}

/** Canonical set of tool names this server exposes. */
export const TOOL_NAMES = [
  "meshy_text_to_3d",
  "meshy_image_to_3d",
  "meshy_text_to_texture",
  "meshy_get_task",
  "meshy_list_tasks",
  "meshy_download_task",
] as const;
