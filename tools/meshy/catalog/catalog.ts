#!/usr/bin/env -S npx tsx
/**
 * Meshy character catalog — render thumbnails + scaffold a labeling catalog.
 *
 * Walks assets/raw/meshy/, renders a front+3/4 orthographic composite thumbnail
 * per GLB (via Blender, reusing tools/blender/render_iso_common.py), and writes:
 *   assets/raw/meshy/_catalog/<task-id>.png   (composite thumbnails)
 *   assets/raw/meshy/_catalog/catalog.json    (frozen schema; EMPTY descriptors)
 *   assets/raw/meshy/_catalog/gallery.md       (inline contact sheet for a vision pass)
 *
 * It does NOT rename anything. Descriptors are left empty for a downstream vision
 * labeling pass. Idempotent: existing thumbnails are skipped and already-labeled
 * descriptors are preserved on re-run.
 *
 * Usage:
 *   npm run catalog                 # render + scaffold everything
 *   npm run catalog -- --no-render  # scaffold/refresh catalog.json + gallery.md only
 *   npm run catalog -- --overwrite  # re-render existing thumbnails
 *   npm run catalog -- --root <dir> --blender /path/to/blender --canvas 512
 */
import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog, CATALOG_DIRNAME } from "./src/build.js";
import { renderGallery } from "./src/gallery.js";
import { planRenderJobs, runRender } from "./src/render.js";
import { readPullManifest, scanMeshyRoot } from "./src/scan.js";
import type { Catalog } from "./src/types.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function findUp(start: string, marker: string): string | null {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** The catalog package root (has package.json + render_catalog.py) — source or dist. */
const PKG_ROOT = findUp(SCRIPT_DIR, "package.json") ?? SCRIPT_DIR;
/** Repo root (has .git); used only to default the meshy root. */
const REPO_ROOT = findUp(SCRIPT_DIR, ".git") ?? path.resolve(PKG_ROOT, "../../..");
const RENDER_SCRIPT = path.join(PKG_ROOT, "render_catalog.py");

interface CliArgs {
  root: string;
  render: boolean;
  overwrite: boolean;
  blender: string;
  canvas: number;
  engine: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    root: path.resolve(REPO_ROOT, "assets/raw/meshy"),
    render: true,
    overwrite: false,
    blender: process.env.BLENDER_BIN || "blender",
    canvas: 512,
    engine: "BLENDER_EEVEE",
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case "--root":
        args.root = path.resolve(process.cwd(), next());
        break;
      case "--no-render":
        args.render = false;
        break;
      case "--overwrite":
        args.overwrite = true;
        break;
      case "--blender":
        args.blender = next();
        break;
      case "--canvas": {
        const n = Number(next());
        if (!Number.isFinite(n) || n < 64) throw new Error("--canvas must be a number >= 64");
        args.canvas = Math.floor(n);
        break;
      }
      case "--engine":
        args.engine = next();
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg} (try --help)`);
    }
  }
  return args;
}

const HELP = `Meshy character catalog — render thumbnails + scaffold a labeling catalog (does NOT rename)

Options:
  --root <dir>      Meshy assets root (default: <repo>/assets/raw/meshy)
  --no-render       Skip Blender; (re)write catalog.json + gallery.md only
  --overwrite       Re-render thumbnails that already exist
  --blender <path>  Blender binary (default: $BLENDER_BIN or "blender")
  --canvas <px>     Per-view render size (default: 512)
  --engine <name>   Render engine (default: BLENDER_EEVEE)
  -h, --help        Show this help

Outputs to <root>/_catalog/: <task-id>.png thumbnails, catalog.json, gallery.md.
`;

async function readExistingCatalog(catalogJson: string): Promise<Catalog | null> {
  try {
    const raw = await fs.readFile(catalogJson, "utf8");
    const parsed = JSON.parse(raw) as Catalog;
    return parsed && Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeAtomic(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, file);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  const meshyRoot = args.root;
  const catalogDir = path.join(meshyRoot, CATALOG_DIRNAME);
  const catalogJson = path.join(catalogDir, "catalog.json");
  const galleryMd = path.join(catalogDir, "gallery.md");

  console.log(`Meshy catalog → ${catalogDir}${args.render ? "" : "  (--no-render)"}`);

  const assets = await scanMeshyRoot(meshyRoot);
  if (assets.length === 0) {
    console.error(
      `No GLBs found under ${meshyRoot}. (Pull or hand-download Meshy models into <task-id>/model.glb first.)`,
    );
  }
  const manifest = await readPullManifest(meshyRoot);
  const existing = await readExistingCatalog(catalogJson);
  const nowIso = new Date().toISOString();
  const catalog = buildCatalog(assets, manifest, { meshyRoot, nowIso, existing });
  console.log(`Found ${catalog.count} GLB(s) across ${new Set(catalog.entries.map((e) => e.task_id)).size} task dir(s).`);

  if (args.render && catalog.entries.length > 0) {
    if (!existsSync(RENDER_SCRIPT)) {
      console.error(`Render script missing: ${RENDER_SCRIPT} (writing scaffold only).`);
    } else {
      const jobs = await planRenderJobs(catalog.entries, { meshyRoot, overwrite: args.overwrite });
      console.log(`Rendering ${jobs.length} thumbnail(s) (${catalog.entries.length - jobs.length} already present)…`);
      const results = await runRender(jobs, {
        blenderBin: args.blender,
        scriptPath: RENDER_SCRIPT,
        catalogDir,
        canvas: args.canvas,
        engine: args.engine,
        logger: (m) => console.log(m),
      });
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        console.log(`Rendered ${ok}/${results.length}. Failed: ${failed.map((f) => `${f.task_id} (${f.reason ?? "?"})`).join(", ")}`);
      } else if (results.length) {
        console.log(`Rendered ${ok}/${results.length}.`);
      }
    }
  }

  // Which thumbnails actually exist on disk (for the gallery's "not rendered yet" flag).
  const rendered = new Set<string>();
  for (const e of catalog.entries) {
    if (existsSync(path.resolve(meshyRoot, e.thumbnail_path))) rendered.add(e.thumbnail_path);
  }

  await writeAtomic(catalogJson, `${JSON.stringify(catalog, null, 2)}\n`);
  await writeAtomic(galleryMd, renderGallery(catalog, rendered));

  console.log(`\nWrote:\n  ${catalogJson}\n  ${galleryMd}`);
  console.log(
    `${rendered.size}/${catalog.count} thumbnail(s) present. Descriptors are EMPTY — label via the gallery, then a pass-2 script can rename from catalog.json.`,
  );
}

main().catch((err: unknown) => {
  console.error(`\nFATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
