import {
  MESHY_API_BASE,
  MAX_PAGE_SIZE,
  DEFAULT_LIST_PAGE_SIZE,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  TERMINAL_STATUSES,
  endpointPath,
} from "./constants.js";
import type { MeshyTask, TaskKind } from "./types.js";

/** A fetch-compatible function. Injectable so tests never touch the network. */
export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export type SleepLike = (ms: number) => Promise<void>;

const defaultSleep: SleepLike = (ms) => new Promise((r) => setTimeout(r, ms));

/** Error carrying the HTTP status (when there was one). Never contains the API key. */
export class MeshyApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "MeshyApiError";
    this.status = status;
  }
}

export interface MeshyClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Injectable fetch; defaults to the global fetch (Node >= 18). */
  fetchImpl?: FetchLike;
  /** Per-request timeout in ms (default 60s). */
  timeoutMs?: number;
  /** Retries for network errors / 429 / 5xx (default 3). */
  maxRetries?: number;
  sleepImpl?: SleepLike;
  /** Clock, injectable for deterministic poll-timeout tests. */
  nowImpl?: () => number;
}

export interface ListOptions {
  pageNum?: number;
  pageSize?: number;
  sortBy?: string;
}

export interface ListAllOptions {
  pageSize?: number;
  sortBy?: string;
  /** Safety cap so a runaway account can't loop forever (default 1000 pages). */
  maxPages?: number;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onProgress?: (task: MeshyTask) => void;
  signal?: AbortSignal;
}

/** The subset of client behaviour the pull script and MCP tools depend on. */
export interface MeshyClientLike {
  createTask(kind: TaskKind, body: Record<string, unknown>): Promise<string>;
  getTask(kind: TaskKind, id: string): Promise<MeshyTask>;
  listTasks(kind: TaskKind, opts?: ListOptions): Promise<MeshyTask[]>;
  listAllTasks(kind: TaskKind, opts?: ListAllOptions): Promise<MeshyTask[]>;
  pollTask(kind: TaskKind, id: string, opts?: PollOptions): Promise<MeshyTask>;
  downloadArrayBuffer(url: string): Promise<Uint8Array>;
}

/** Clamps a requested page size to (0, MAX_PAGE_SIZE]; NaN/0/negative -> fallback.
 *  Guards against a bad --page-size defeating the "stop on short page" logic. */
export function clampPageSize(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(Math.floor(value), MAX_PAGE_SIZE);
  }
  return fallback;
}

/** Normalizes a list response into a plain array of tasks. Meshy returns a bare
 *  array today, but we defensively unwrap common envelope keys too. */
export function normalizeList(data: unknown): MeshyTask[] {
  if (Array.isArray(data)) return data as MeshyTask[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["result", "data", "tasks", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as MeshyTask[];
    }
  }
  return [];
}

export class MeshyClient implements MeshyClientLike {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleep: SleepLike;
  private readonly now: () => number;

  constructor(opts: MeshyClientOptions) {
    if (!opts.apiKey) {
      throw new MeshyApiError(
        "Missing Meshy API key. Set the MESHY_API_KEY environment variable (or put it in tools/meshy/.env).",
      );
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? MESHY_API_BASE).replace(/\/+$/, "");
    const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
    if (!fetchImpl) {
      throw new MeshyApiError(
        "No fetch implementation available. Node >= 18 is required (or pass fetchImpl).",
      );
    }
    this.fetchImpl = fetchImpl;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.sleep = opts.sleepImpl ?? defaultSleep;
    this.now = opts.nowImpl ?? (() => Date.now());
  }

  /** Replaces any accidental occurrence of the key with a mask. Defence in depth. */
  private redact(message: string): string {
    if (!message) return message;
    return message.split(this.apiKey).join("***");
  }

  private backoffMs(attempt: number, res?: Response): number {
    const retryAfter = res?.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds)) return Math.min(seconds * 1000, 30_000);
    }
    return Math.min(1000 * 2 ** attempt, 15_000);
  }

  private describeHttpError(status: number, body: string): string {
    let detail = "";
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      detail = parsed.message || parsed.error || "";
    } catch {
      detail = body ? body.slice(0, 300) : "";
    }
    const base = `Meshy API error ${status}`;
    switch (status) {
      case 400:
        return `${base}: Bad request${detail ? ` — ${detail}` : ""}. Check the request parameters.`;
      case 401:
        return `${base}: Unauthorized — MESHY_API_KEY is missing, invalid, or expired.`;
      case 402:
        return `${base}: Payment required — insufficient Meshy credits for this task.`;
      case 403:
        return `${base}: Forbidden — this API key cannot access the resource.`;
      case 404:
        return `${base}: Not found — the task id or endpoint does not exist.`;
      case 429:
        return `${base}: Rate limited — Meshy allows ~20 req/s; back off and retry.`;
      default:
        return detail ? `${base}: ${detail}` : base;
    }
  }

  /** Core HTTP with timeout + retry. Auth header is attached here and only here. */
  async request<T>(
    method: string,
    path: string,
    opts: { query?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    let bodyStr: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyStr = JSON.stringify(opts.body);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url.toString(), {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          const text = await res.text();
          if (!text) return undefined as T;
          try {
            return JSON.parse(text) as T;
          } catch {
            return text as unknown as T;
          }
        }

        const errBody = await res.text().catch(() => "");
        const retriable = res.status === 429 || res.status >= 500;
        if (retriable && attempt < this.maxRetries) {
          await this.sleep(this.backoffMs(attempt, res));
          continue;
        }
        throw new MeshyApiError(this.redact(this.describeHttpError(res.status, errBody)), res.status);
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof MeshyApiError) throw err;
        lastError = err;
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new MeshyApiError(this.redact(`Network error calling Meshy (${method} ${path}): ${msg}`));
      }
    }
    throw new MeshyApiError(this.redact(`Request to Meshy failed after retries: ${String(lastError)}`));
  }

  /** Creates a task and returns its id (from the `result` field). */
  async createTask(kind: TaskKind, body: Record<string, unknown>): Promise<string> {
    const data = await this.request<{ result?: string; id?: string }>(
      "POST",
      endpointPath(kind),
      { body },
    );
    const id = data?.result ?? data?.id;
    if (!id) {
      throw new MeshyApiError(
        `Meshy did not return a task id for ${kind}. Response: ${JSON.stringify(data).slice(0, 200)}`,
      );
    }
    return id;
  }

  async getTask(kind: TaskKind, id: string): Promise<MeshyTask> {
    return this.request<MeshyTask>("GET", endpointPath(kind, id));
  }

  async listTasks(kind: TaskKind, opts: ListOptions = {}): Promise<MeshyTask[]> {
    const data = await this.request<unknown>("GET", endpointPath(kind), {
      query: {
        page_num: opts.pageNum ?? 1,
        page_size: clampPageSize(opts.pageSize, DEFAULT_LIST_PAGE_SIZE),
        sort_by: opts.sortBy ?? "-created_at",
      },
    });
    return normalizeList(data);
  }

  /** Async iterator over every task of a kind, walking pages until a short page. */
  async *iterateTasks(kind: TaskKind, opts: ListAllOptions = {}): AsyncGenerator<MeshyTask> {
    const pageSize = clampPageSize(opts.pageSize, MAX_PAGE_SIZE);
    const maxPages = opts.maxPages ?? 1000;
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await this.listTasks(kind, { pageNum, pageSize, sortBy: opts.sortBy });
      for (const task of page) yield task;
      if (page.length < pageSize) break; // last page reached
    }
  }

  async listAllTasks(kind: TaskKind, opts: ListAllOptions = {}): Promise<MeshyTask[]> {
    const out: MeshyTask[] = [];
    for await (const task of this.iterateTasks(kind, opts)) out.push(task);
    return out;
  }

  /**
   * Polls a task until it reaches a terminal status or the timeout elapses. On
   * timeout the LAST-seen task is returned (never throws) so callers can report
   * progress and let the user resume polling.
   */
  async pollTask(kind: TaskKind, id: string, opts: PollOptions = {}): Promise<MeshyTask> {
    const interval = opts.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeout = opts.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const start = this.now();
    for (;;) {
      const task = await this.getTask(kind, id);
      opts.onProgress?.(task);
      if (TERMINAL_STATUSES.has(String(task.status).toUpperCase())) return task;
      if (opts.signal?.aborted) return task;
      if (this.now() - start >= timeout) return task;
      await this.sleep(interval);
    }
  }

  /**
   * Downloads a binary asset (GLB/texture) into memory. Meshy asset URLs are
   * pre-signed, so NO Authorization header is sent (adding one breaks the S3
   * signature). Bytes are returned untouched — no recompression (pngquant ban).
   */
  async downloadArrayBuffer(url: string): Promise<Uint8Array> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(this.timeoutMs, 120_000));
    try {
      const res = await this.fetchImpl(url, { method: "GET", signal: controller.signal });
      if (!res.ok) {
        throw new MeshyApiError(`Failed to download asset (HTTP ${res.status}).`, res.status);
      }
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      if (err instanceof MeshyApiError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new MeshyApiError(this.redact(`Failed to download asset: ${msg}`));
    } finally {
      clearTimeout(timer);
    }
  }
}
