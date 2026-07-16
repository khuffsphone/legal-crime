import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { DownloadTaskResult } from "./download.js";
import type { MeshyTask, TaskKind } from "./types.js";

/** One task's record in the pull manifest. */
export interface ManifestEntry {
  id: string;
  /** Generation family + sub-mode, e.g. "text-to-3d/refine" or "image-to-3d". */
  mode: string;
  kind: TaskKind;
  status: string;
  prompt?: string;
  art_style?: string;
  /** Relative filenames written for this task. */
  files: string[];
  model_urls?: Record<string, string | undefined>;
  thumbnail_url?: string;
  created_at?: number;
  finished_at?: number;
  expires_at?: number;
  /** ISO timestamp of the pull that recorded this entry. */
  pulled_at: string;
}

export interface Manifest {
  schema: 1;
  generated_at: string;
  count: number;
  /** Keyed by task id so re-pulls merge idempotently. */
  tasks: Record<string, ManifestEntry>;
}

export function emptyManifest(generatedAt: string): Manifest {
  return { schema: 1, generated_at: generatedAt, count: 0, tasks: {} };
}

/** Reads a manifest, returning an empty one if the file is missing or corrupt. */
export async function readManifest(file: string, generatedAt: string): Promise<Manifest> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    if (parsed && typeof parsed === "object" && parsed.tasks && typeof parsed.tasks === "object") {
      return {
        schema: 1,
        generated_at: parsed.generated_at ?? generatedAt,
        count: Object.keys(parsed.tasks).length,
        tasks: parsed.tasks as Record<string, ManifestEntry>,
      };
    }
  } catch {
    /* missing or unreadable — start fresh */
  }
  return emptyManifest(generatedAt);
}

/** Atomically writes the manifest (temp file + rename). */
export async function writeManifest(file: string, manifest: Manifest): Promise<void> {
  manifest.count = Object.keys(manifest.tasks).length;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.rename(tmp, file);
}

/** Human-readable mode label combining the kind and any text-to-3d sub-mode. */
export function taskModeLabel(kind: TaskKind, task: MeshyTask): string {
  if (kind === "text-to-3d" && typeof task.mode === "string" && task.mode) {
    return `text-to-3d/${task.mode}`;
  }
  return kind;
}

/** Best-effort human prompt for a task across the different endpoints. */
export function taskPrompt(task: MeshyTask): string {
  return (
    task.prompt ??
    task.object_prompt ??
    task.text_style_prompt ??
    task.style_prompt ??
    task.texture_prompt ??
    ""
  );
}

/** Builds a manifest entry from a completed download. */
export function buildEntry(
  task: MeshyTask,
  kind: TaskKind,
  download: DownloadTaskResult,
  pulledAt: string,
): ManifestEntry {
  return {
    id: task.id,
    mode: taskModeLabel(kind, task),
    kind,
    status: String(task.status),
    prompt: taskPrompt(task) || undefined,
    art_style: task.art_style,
    files: download.files.map((f) => f.filename),
    model_urls: task.model_urls,
    thumbnail_url: task.thumbnail_url,
    created_at: task.created_at,
    finished_at: task.finished_at,
    expires_at: task.expires_at,
    pulled_at: pulledAt,
  };
}
