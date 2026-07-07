# STATUS — Meshy asset inventory + thumbnail labeling (lane: meshy-asset-inventory)

**Repo:** `khuffsphone/legal-crime` · **Branch:** `claude/meshy-asset-catalog` (off `rts/isometric-conversion`) · **Owns:** `assets/raw/meshy/**` (read + `_catalog/` output) + `tools/meshy/catalog/**`. **DO NOT MERGE — K runs the render locally.**

**STEP 0 (disjoint confirmed):** remote = legal-crime. Open PRs are disjoint from this lane's paths — #73 (`tools/meshy/**` pull+mcp), #75 (`tools/step0-check.ts`, `.claude/`), #76 (`src/sim`, `src/scenes`). None touch `assets/raw/meshy/**` or `tools/meshy/catalog/**`.

## What shipped (catalog, does NOT rename)
- `tools/meshy/catalog/` — a **self-contained** Node/TS tool (its own package.json/tsconfig/vitest; the base branch has no `tools/meshy` from #73).
- Walks `assets/raw/meshy/`, renders a **front + 3/4 ortho composite thumbnail** per GLB via Blender (reuses `tools/blender/render_iso_common.py` — clear_scene, ORTHO camera, NW lights, texture downscale; RAW lossless PNG, pngquant banned), and writes:
  - `_catalog/<task-id>.png` (composite thumbnails)
  - `_catalog/catalog.json` (FROZEN schema, EMPTY descriptors)
  - `_catalog/gallery.md` (inline contact sheet — one scrollable page, droppable into chat for a vision pass)
- Descriptors (`apparent_sex/apparent_age/dress/proposed_archetype/confidence`) are left **empty** — filled by a vision labeling pass (K or Claude reading `gallery.md`). `proposed_archetype` ∈ the 7 LOCKED figureStyle archetypes: `thug/gunner/collector/boss/civilian/police/rival`.
- Idempotent: existing thumbnails skipped; already-labeled descriptors preserved on re-run.

## Frozen schema (pass-2 rename consumes this)
Per entry: `task_id, glb_path, thumbnail_path, descriptor{apparent_sex, apparent_age, dress, proposed_archetype, confidence}, notes`. Field names are frozen.

## Connect & run (K, locally — GLBs + Blender are K-side)
```bash
cd tools/meshy/catalog
npm install
npm run catalog                 # render thumbnails + scaffold (needs Blender on PATH or --blender <path>)
npm run catalog -- --no-render  # scaffold only, no Blender
# then: open _catalog/gallery.md (or drop the _catalog/*.png into a chat) and fill the
# descriptor fields in _catalog/catalog.json. A later pass-2 script renames from that JSON.
npm test                        # 23 tests, Blender stubbed
```

## Verified (in this sandbox)
- `tsc` clean; **23 vitest tests pass** (scan/build/gallery/render — Blender fully stubbed).
- `render_catalog.py` passes `python3 -m py_compile` (bpy import is runtime-only).
- End-to-end CLI smokes against a fixture: (1) `--no-render` writes the frozen-schema catalog.json + gallery with "not rendered yet" flags; (2) a **fake blender** honoring `render_catalog.py`'s jobs/result contract exercises the real spawn boundary → thumbnails on disk, gallery embeds inline images.

## Caveats / notes
- **Cannot render here:** the real GLBs (`assets/raw/meshy/`, gitignored, K-side) and Blender are not in this cloud sandbox — the Blender render path is built + syntax-checked but only K can run it. This matches the meshy lane pattern.
- The **"front" view** faces the model's +Y export axis; a subject exported facing away reads as a back view (the 3/4 companion still lets a labeler judge it). Add a per-model yaw later if needed.
- `assets/raw/meshy/` (incl. `_catalog/`) is gitignored — thumbnails + catalog stay local; only the script is committed.
- These are **image-to-3d** tasks, so the manifest `prompt` is usually empty → the rendered thumbnail is the primary semantic signal (why descriptors are a vision step, not a heuristic).
