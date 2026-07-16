import { CHARACTER_LIMIT } from "../src/constants.js";
import type { MeshyTask, TaskKind } from "../src/types.js";

/** Shape of an MCP tool result we build. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** JSON-stringifies with a hard character cap so responses never flood context. */
export function jsonText(obj: unknown): string {
  const text = JSON.stringify(obj, null, 2);
  if (text.length > CHARACTER_LIMIT) {
    return `${text.slice(0, CHARACTER_LIMIT)}\n… (response truncated at ${CHARACTER_LIMIT} chars)`;
  }
  return text;
}

/** Success result carrying both human text and machine-readable structured data. */
export function ok(structured: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: jsonText(structured) }],
    structuredContent: structured,
  };
}

/** Error result with an actionable message. */
export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Removes undefined values so we never send explicit nulls Meshy may reject. */
export function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Compact, agent-friendly view of a task. */
export function summarizeTask(kind: TaskKind, task: MeshyTask): Record<string, unknown> {
  return {
    task_id: task.id,
    kind,
    mode: task.mode ?? null,
    status: task.status,
    progress: task.progress ?? 0,
    prompt:
      task.prompt ??
      task.object_prompt ??
      task.text_style_prompt ??
      task.style_prompt ??
      null,
    art_style: task.art_style ?? null,
    glb_url: task.model_urls?.glb ?? null,
    model_urls: task.model_urls ?? null,
    texture_urls: task.texture_urls ?? [],
    thumbnail_url: task.thumbnail_url ?? null,
    created_at: task.created_at ?? null,
    finished_at: task.finished_at ?? null,
    expires_at: task.expires_at ? new Date(task.expires_at).toISOString() : null,
    error: task.task_error?.message ?? null,
  };
}
