# Meshy character catalog

Build a human-readable **catalog** of the hand-downloaded Meshy character GLBs before any
render-swap — render thumbnails + scaffold a labeling sheet. **It does NOT rename anything.**

## What it does

1. Walks `assets/raw/meshy/` — each `<task-id>/` dir with a `model.glb` (+ textures).
2. For each GLB, renders a **front + 3/4 orthographic composite thumbnail** via Blender
   (reusing `tools/blender/render_iso_common.py`: `clear_scene`, ORTHO camera, the NW light rig,
   texture downscale) → `assets/raw/meshy/_catalog/<task-id>.png`. **RAW lossless PNG** (pngquant banned).
3. Writes a **catalog** with EMPTY descriptor fields for a downstream vision-labeling pass:
   - `assets/raw/meshy/_catalog/catalog.json` — machine-readable (frozen schema, below)
   - `assets/raw/meshy/_catalog/gallery.md` — an inline contact sheet (one scrollable page)

Descriptors (apparent sex/age/dress + a proposed archetype) are a **vision judgment** — a headless
script can't infer them, so the tool leaves them empty and renders the thumbnails for a human, or an
LLM reading `gallery.md`, to fill in. Idempotent: existing thumbnails are skipped and already-labeled
descriptors are preserved on re-run.

## Requires

- Node ≥ 18 (for the orchestrator) — `npm install` here.
- **Blender** on `PATH` (or `--blender <path>` / `$BLENDER_BIN`) for the render step. Without it, the
  tool still writes the `catalog.json` + `gallery.md` scaffold (thumbnails flagged "not rendered yet").

## Usage

```bash
cd tools/meshy/catalog
npm install
npm run catalog                 # render thumbnails + scaffold catalog.json + gallery.md
npm run catalog -- --no-render  # scaffold/refresh the catalog only (no Blender)
npm run catalog -- --overwrite  # re-render existing thumbnails
npm run catalog -- --root <dir> --blender /path/to/blender --canvas 512
npm test                        # 23 vitest tests (Blender stubbed — no Blender needed)
```

Default root is `<repo>/assets/raw/meshy`.

## catalog.json schema (FROZEN)

A later **pass-2 rename** script consumes this exact per-entry shape — do not rename fields.

```jsonc
{
  "schema": 1,
  "generated_at": "<iso>",
  "meshy_root": "<abs path>",
  "archetypes": ["thug","gunner","collector","boss","civilian","police","rival"],
  "descriptor_vocab": { "apparent_sex": [...], "apparent_age": [...], "dress": [...], ... },
  "count": <n>,
  "entries": [
    {
      "task_id": "<meshy task-id / dir name>",
      "glb_path": "<task-id>/model.glb",          // relative to meshy_root
      "thumbnail_path": "_catalog/<task-id>.png",  // relative to meshy_root
      "descriptor": {
        "apparent_sex": "",         // male | female | unknown
        "apparent_age": "",         // adult | child | unknown
        "dress": "",                // suit | dress | uniform | workclothes | unknown
        "proposed_archetype": "",   // one of the 7 archetypes above
        "confidence": ""            // low | medium | high
      },
      "notes": "mode=image-to-3d prompt=\"...\" textures=2"
    }
  ]
}
```

## Labeling workflow

1. Run the tool (renders thumbnails, writes the empty scaffold).
2. Open `gallery.md` (or drop the `_catalog/*.png` thumbnails into a chat) and read each figure —
   each image is **front ｜ 3/4**.
3. Fill the `descriptor` fields in `catalog.json` (`proposed_archetype` from the 7 figureStyle archetypes).
4. A separate pass-2 script reads the completed `catalog.json` to rename/organize the assets.

## Caveats

- The **"front" view faces the model's +Y export axis** — a subject exported facing away reads as a
  back view. The 3/4 companion still lets a labeler judge it; add a per-model yaw if needed later.
- Catalog thumbnails keep the GLB's **own PBR texture** (true colour) and frame each subject to fill
  its cell — this is for LABELING, not the game's cel/iso sprite pipeline (no toon/Freestyle, no fixed
  2.8284 ortho scale; that projection is applied by the real render pipeline, downstream).
- `assets/raw/meshy/` (incl. `_catalog/`) is gitignored — thumbnails + catalog stay **local**; only the
  script here is committed.
```
