import { describe, it, expect, vi } from "vitest";
import { MeshyClient, MeshyApiError, normalizeList } from "../src/client.js";
import type { FetchLike } from "../src/client.js";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const noSleep = async (): Promise<void> => {};

describe("normalizeList", () => {
  it("returns a bare array unchanged", () => {
    expect(normalizeList([{ id: "a" }])).toHaveLength(1);
  });
  it("unwraps common envelope keys", () => {
    expect(normalizeList({ result: [{ id: "a" }] })).toHaveLength(1);
    expect(normalizeList({ data: [{ id: "b" }] })).toHaveLength(1);
  });
  it("returns [] for unexpected shapes", () => {
    expect(normalizeList({ nope: true })).toEqual([]);
    expect(normalizeList(null)).toEqual([]);
  });
});

describe("MeshyClient list pagination", () => {
  it("walks pages until a short page and aggregates all tasks", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      calls.push({ url, init });
      const pageNum = Number(new URL(url).searchParams.get("page_num"));
      const count = pageNum <= 2 ? 50 : 10; // two full pages, then a short one
      const arr = Array.from({ length: count }, (_, i) => ({
        id: `t-${pageNum}-${i}`,
        status: "SUCCEEDED",
      }));
      return jsonResponse(arr);
    });
    const client = new MeshyClient({ apiKey: "secret-key", fetchImpl, sleepImpl: noSleep });

    const all = await client.listAllTasks("text-to-3d", { pageSize: 50 });

    expect(all).toHaveLength(110);
    expect(calls).toHaveLength(3);
    // hits the v2 text-to-3d list endpoint
    expect(new URL(calls[0]!.url).pathname).toBe("/openapi/v2/text-to-3d");
    // page_num incremented across calls
    expect(new URL(calls[2]!.url).searchParams.get("page_num")).toBe("3");
    // auth header attached
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
  });

  it("caps page_size at 50", async () => {
    let seenPageSize = "";
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      seenPageSize = new URL(url).searchParams.get("page_size") ?? "";
      return jsonResponse([]);
    });
    const client = new MeshyClient({ apiKey: "k", fetchImpl, sleepImpl: noSleep });
    await client.listTasks("image-to-3d", { pageSize: 999 });
    expect(seenPageSize).toBe("50");
  });
});

describe("MeshyClient createTask / getTask", () => {
  it("POSTs to the right endpoint and returns the result id", async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      captured = { url, init };
      return jsonResponse({ result: "task-abc" });
    });
    const client = new MeshyClient({ apiKey: "k", fetchImpl, sleepImpl: noSleep });
    const id = await client.createTask("text-to-3d", { mode: "preview", prompt: "car" });

    expect(id).toBe("task-abc");
    expect(new URL(captured!.url).pathname).toBe("/openapi/v2/text-to-3d");
    expect(captured!.init!.method).toBe("POST");
    expect(JSON.parse(captured!.init!.body as string)).toMatchObject({ mode: "preview", prompt: "car" });
  });

  it("throws when no id is returned", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ nope: true }));
    const client = new MeshyClient({ apiKey: "k", fetchImpl, sleepImpl: noSleep });
    await expect(client.createTask("image-to-3d", {})).rejects.toBeInstanceOf(MeshyApiError);
  });
});

describe("MeshyClient error handling", () => {
  it("maps 404 to an actionable message with status", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ message: "no" }, 404));
    const client = new MeshyClient({ apiKey: "k", fetchImpl, sleepImpl: noSleep, maxRetries: 0 });
    await expect(client.getTask("text-to-3d", "x")).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("Not found"),
    });
  });

  it("retries on 429 then succeeds", async () => {
    let n = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      n += 1;
      return n < 3 ? jsonResponse({ message: "slow" }, 429) : jsonResponse({ id: "ok", status: "SUCCEEDED" });
    });
    const client = new MeshyClient({ apiKey: "k", fetchImpl, sleepImpl: noSleep, maxRetries: 3 });
    const task = await client.getTask("retexture", "id");
    expect(task.id).toBe("ok");
    expect(n).toBe(3);
  });

  it("never leaks the API key in error messages", async () => {
    const key = "super-secret-123";
    const fetchImpl: FetchLike = vi.fn(async () => {
      throw new Error(`connect failed for token ${key}`);
    });
    const client = new MeshyClient({ apiKey: key, fetchImpl, sleepImpl: noSleep, maxRetries: 0 });
    const err = await client.getTask("text-to-3d", "x").catch((e) => e as MeshyApiError);
    expect(err).toBeInstanceOf(MeshyApiError);
    expect(err.message).not.toContain(key);
    expect(err.message).toContain("***");
  });
});

describe("MeshyClient pollTask", () => {
  it("polls until a terminal status and reports progress", async () => {
    const seq = [
      { id: "t", status: "PENDING", progress: 0 },
      { id: "t", status: "IN_PROGRESS", progress: 50 },
      { id: "t", status: "SUCCEEDED", progress: 100 },
    ];
    let i = 0;
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse(seq[Math.min(i++, seq.length - 1)]));
    const client = new MeshyClient({ apiKey: "k", fetchImpl, sleepImpl: noSleep });
    const progress: string[] = [];
    const final = await client.pollTask("text-to-3d", "t", {
      intervalMs: 1,
      onProgress: (t) => progress.push(String(t.status)),
    });
    expect(final.status).toBe("SUCCEEDED");
    expect(progress).toEqual(["PENDING", "IN_PROGRESS", "SUCCEEDED"]);
  });

  it("returns the last task (does not hang) when the timeout elapses", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse({ id: "t", status: "IN_PROGRESS", progress: 20 }));
    let clock = 0;
    const client = new MeshyClient({
      apiKey: "k",
      fetchImpl,
      sleepImpl: noSleep,
      nowImpl: () => {
        const v = clock;
        clock += 10_000; // each read jumps 10s
        return v;
      },
    });
    const final = await client.pollTask("text-to-3d", "t", { intervalMs: 1, timeoutMs: 5_000 });
    expect(final.status).toBe("IN_PROGRESS");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("MeshyClient.downloadArrayBuffer", () => {
  it("downloads bytes WITHOUT sending an Authorization header (pre-signed URL)", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      capturedInit = init;
      return new Response(new Uint8Array([1, 2, 3, 4]));
    });
    const client = new MeshyClient({ apiKey: "k", fetchImpl, sleepImpl: noSleep });
    const bytes = await client.downloadArrayBuffer("https://assets.example.com/model.glb?sig=abc");
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
    const headers = (capturedInit?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("throws MeshyApiError on a failed download", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response("nope", { status: 403 }));
    const client = new MeshyClient({ apiKey: "k", fetchImpl, sleepImpl: noSleep });
    await expect(client.downloadArrayBuffer("https://x/y.glb")).rejects.toBeInstanceOf(MeshyApiError);
  });
});
