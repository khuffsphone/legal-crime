# STATUS — Meshy integration (lane: meshy-integration)

**Repo:** `khuffsphone/legal-crime` · **Branch:** `claude/meshy-mcp` (off `rts/isometric-conversion`) · **PR:** [#73](https://github.com/khuffsphone/legal-crime/pull/73) · **Owns:** `tools/meshy/**` only (zero repo contention — STEP 0 scanned all 67 branches). **PR is DO NOT MERGE — K connects locally.**

## Download 403 fix (meshy-download-fix lane)
Live symptom: `--dry-run` listed 61 image-to-3d tasks / 366 files fine, but the real pull failed `FATAL: Failed to download asset (HTTP 403)` on the first file.
Root cause was **not** the auth header (the downloader already sent none). A 403 on the *newest* file argues against expiry; the real culprit is Node's `fetch` sending **no User-Agent**, which Meshy's CDN (Cloudflare) 403s. Fix:
- Asset downloads now send a browser-ish **`User-Agent`** (override via `MESHY_DOWNLOAD_UA`) and still **no `Authorization`** header (pre-signed URLs).
- One-shot **re-fetch-by-id on 401/403/404** → retry with a fresh pre-signed URL (handles genuinely stale list URLs).
- Errors now name the **host + status** with the **signature query string and key redacted** (was an opaque `HTTP 403`).
- Verified end-to-end through real Node `fetch` against a local server that 403s on auth-present OR UA-absent — download succeeds, error is redacted. **58 tests pass.** K: just re-run `npm run pull`.

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
