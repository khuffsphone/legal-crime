# Octane Racer × Meshy AI integration

Two tools that live entirely under `tools/meshy/` (no `src/`, no game code):

1. **`pull_assets.ts`** — bulk-pull every completed Meshy task's GLB + textures to disk.
2. **`mcp-server/`** — an MCP server so an agent can *generate* models from Meshy directly.

Both share one Meshy API client (`src/client.ts`).

## Project canon (enforced)

- **GLB only** — never FBX/OBJ/USDZ. Every generate call forces `target_formats:["glb"]`.
- **RAW output** — textures are stored byte-for-byte as Meshy returns them. **pngquant is banned**; nothing here recompresses.
- **Isometric pipeline is downstream** — `fixedOrthoScale 2.8284` / camera yaw 60° pitch 45° is applied later **in Blender**, not at Meshy.

## Setup

```bash
cd tools/meshy
npm install
cp .env.example .env      # then edit .env and paste your MESHY_API_KEY
```

The API key is read from **`MESHY_API_KEY` only** — from your shell env or `tools/meshy/.env`
(which is gitignored). It is never hardcoded, printed, or committed.

## Part 1 — bulk pull (usable immediately)

Lists every **SUCCEEDED** task on the account and downloads each GLB (+ textures) into
`assets/raw/meshy/<task-id>/`, skipping anything already on disk, and writes
`assets/raw/meshy/manifest.json`.

```bash
npm run pull                       # pull everything, skip existing
npm run pull -- --dry-run          # show what WOULD be pulled; write nothing
npm run pull -- --since 2026-01-01 # only tasks created on/after a date
npm run pull -- --mode text        # only text-to-3d (all|text|image|texture)
npm run pull -- --out ./tmp/meshy  # custom output dir
npm run pull -- --thumbnails       # also fetch thumbnail renders
npm run pull -- --overwrite        # re-download even if present
```

`assets/raw/meshy/` is gitignored (raw binaries stay local). The pull prints a summary table:

```
TASK ID       MODE              NEW  SKIP  PROMPT
------------  ----------------  ---  ----  ------------------------
018f0a1b2c3d  text-to-3d/refine  2    0    a weathered orange traffic cone
...
```

## Part 2 — MCP server (agentic generation)

Tools exposed: `meshy_text_to_3d`, `meshy_image_to_3d`, `meshy_text_to_texture`,
`meshy_get_task`, `meshy_list_tasks`, `meshy_download_task`. Long jobs poll-and-report by
default (progress on stderr); if a job outlives the poll timeout you get the current
progress plus a `task_id` to keep polling.

```bash
npm run build        # compile to dist/ (recommended for a stable connect path)
npm run mcp          # or run straight from TS via tsx (dev)
npm test             # vitest — mocks the HTTP layer, never hits the live API
```

### Connect from Claude Desktop

1. `npm install && npm run build` here.
2. Copy the `meshy` block from `claude_desktop_config.example.json` into your
   `claude_desktop_config.json` under `mcpServers`, replacing the **absolute** paths and the
   API key (or set `MESHY_API_KEY` in `.env` and drop it from the config).
3. Restart Claude Desktop.

To skip the build, point `command`/`args` at tsx instead:
`"command": "npx", "args": ["-y", "tsx", "<abs>/tools/meshy/mcp-server/index.ts"]`.

## Layout

```
tools/meshy/
├── pull_assets.ts              # Part 1 CLI entry
├── src/
│   ├── client.ts               # shared Meshy API client (auth, pagination, polling, download)
│   ├── pull.ts                 # bulk-pull orchestration
│   ├── download.ts             # asset targeting + skip/atomic write
│   ├── manifest.ts             # manifest read/merge/write
│   ├── constants.ts / canon.ts / types.ts / env.ts
├── mcp-server/
│   ├── index.ts                # stdio server bootstrap
│   ├── tools.ts                # the six tool definitions
│   └── format.ts               # response formatting
├── test/                       # vitest (HTTP layer fully mocked)
├── .env.example                # copy to .env
└── claude_desktop_config.example.json
```
