# STATUS — Meshy integration (lane: meshy-integration)

**Repo:** `khuffsphone/legal-crime` · **Branch:** `claude/meshy-mcp` (off `rts/isometric-conversion`) · **PR:** [#73](https://github.com/khuffsphone/legal-crime/pull/73) · **Owns:** `tools/meshy/**` only (zero repo contention — STEP 0 scanned all 67 branches). **PR is DO NOT MERGE — K connects locally.**

## Download 403 fix — CONFIRMED: stale pre-signed URLs (meshy-download-fix lane)
Live symptom: `--dry-run` listed 61 image-to-3d tasks / 366 files fine, but the real pull failed `403` on the first file at `https://assets.meshy.ai/.../output/model.glb`.

**Confirmed cause:** Meshy pre-signed download links expire (**~3 days**, Enterprise = permanent). K's 61 tasks are OLD, so the `model_url` **baked into the LIST response is already dead**. Not an auth-header issue.

**Fix — re-fetch a fresh URL before downloading (REQUIRED going forward):**
- The pull path now does **GET task-by-id immediately before downloading** each task (`GET /openapi/v1/image-to-3d/{id}`, and the equivalent for text-to-3d / retexture) to mint **fresh** signed URLs, then downloads from those — never from the (stale) list URL. Skipped in `--dry-run`. Manifest records the fresh URLs.
- Safety net: a download that still hits **401/403/404** re-fetches the task **once more** for a fresh URL and retries, then fails with a **redacted host + task id** (signature query string + API key stripped).
- Batching: tasks are processed **sequentially** with a polite delay (default **200 ms**, `--delay <ms>`) so we don't hammer the API on large accounts.
- Downloads also send a browser-ish **`User-Agent`** (override `MESHY_DOWNLOAD_UA`) and never an `Authorization` header (pre-signed URLs).
- Verified end-to-end through real Node `fetch`: a local mock where the LIST url is STALE (403) and get-by-id mints a FRESH url — the pull downloads via the fresh url and records it. **59 tests pass.** K: just re-run `npm run pull`.
> Note: if a task is older than the asset-retention window, even a fresh get-by-id can't recover it — that task must be re-run in Meshy. The error will now name the task id so those are identifiable.

## What shipped
- **Part 1 — bulk pull** (`tools/meshy/pull_assets.ts`): lists all SUCCEEDED tasks, downloads GLB + textures RAW to `assets/raw/meshy/<task-id>/`, skips existing, writes `manifest.json`. Flags: `--since --mode --out --dry-run --overwrite --thumbnails --page-size`. Usable immediately after checkout — no merge required.
- **Part 2 — MCP server** (`tools/meshy/mcp-server/`): tools `meshy_text_to_3d`, `meshy_image_to_3d`, `meshy_text_to_texture`, `meshy_get_task`, `meshy_list_tasks`, `meshy_download_task`. Poll-and-report on long jobs.
- Canon enforced in tool descriptions + code: **GLB only** (`target_formats:["glb"]` forced), **RAW / pngquant banned**, **ortho pipeline (2.8284 / cam 60-45) is downstream in Blender**.
- Verified: full build green, MCP `initialize`+`tools/list` handshake registers all 6 tools, **58 vitest tests pass** (HTTP layer mocked — no live API).

## Secret handling
Key read from `MESHY_API_KEY` **only** (shell env or `tools/meshy/.env`, gitignored). Never hardcoded/printed/committed. Client redacts the key from any error message. Ship file: `tools/meshy/.env.example`.

## Connect & run (K, locally)
```bash
cd tools/meshy
npm install
cp .env.example .env        # paste the rotated MESHY_API_KEY into .env

# Part 1 — pull existing assets (works today):
npm run pull -- --dry-run   # preview
npm run pull                # download to ../../assets/raw/meshy/

# Part 2 — MCP server:
npm run build
#  -> merge claude_desktop_config.example.json's `meshy` block into your
#     claude_desktop_config.json (fix the ABSOLUTE paths + key), restart Claude Desktop.
npm test                    # optional: 58 tests, all mocked
```

## Notes / caveats
- Meshy docs (`docs.meshy.ai`) are blocked by this sandbox's egress policy; endpoints were verified via web search against the live API reference. Live calls happen only on K's machine.
- Endpoints used: `POST/GET /openapi/v2/text-to-3d` (preview→refine), `/openapi/v1/image-to-3d`, `/openapi/v1/retexture`. List returns a page array; create returns `{result:<id>}`; poll GET by id.
- `assets/raw/meshy/` (and its `manifest.json`) are gitignored — raw binaries stay local by design.
