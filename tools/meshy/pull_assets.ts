#!/usr/bin/env -S npx tsx
/**
 * Octane Racer — Meshy bulk asset pull.
 *
 * Lists every COMPLETED (SUCCEEDED) task on the Meshy account and downloads its
 * GLB + textures RAW (no recompression — pngquant is banned) into
 *   assets/raw/meshy/<task-id>/
 * skipping anything already on disk, and writes a manifest.json.
 *
 * The API key is read from MESHY_API_KEY (env or tools/meshy/.env) ONLY.
 *
 * Usage:
 *   npm run pull -- [--since <date|epoch>] [--mode <all|text|image|texture>]
 *                   [--out <dir>] [--dry-run] [--overwrite] [--thumbnails]
 *                   [--page-size <n>]
 *
 * Examples:
 *   npm run pull                              # pull everything, skip existing
 *   npm run pull -- --dry-run                 # show what would be pulled
 *   npm run pull -- --since 2026-01-01        # only tasks created since a date
 *   npm run pull -- --mode text --out ./tmp   # only text-to-3d, custom dir
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { MeshyClient } from "./src/client.js";
import { API_KEY_ENV } from "./src/constants.js";
import { loadDotEnv } from "./src/env.js";
import { pullAssets, type PullSummary } from "./src/pull.js";
import type { TaskKind } from "./src/types.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walks up from `start` to the tools/meshy package root (the dir containing
 * package.json), so paths resolve correctly whether this runs via tsx (source,
 * SCRIPT_DIR = tools/meshy) or node (built, SCRIPT_DIR = tools/meshy/dist).
 */
function findPackageRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** tools/meshy — the package root. Repo assets live at PKG_ROOT/../../assets. */
const PKG_ROOT = findPackageRoot(SCRIPT_DIR);

const MODE_MAP: Record<string, TaskKind[]> = {
  all: ["text-to-3d", "image-to-3d", "retexture"],
  text: ["text-to-3d"],
  "text-to-3d": ["text-to-3d"],
  image: ["image-to-3d"],
  "image-to-3d": ["image-to-3d"],
  texture: ["retexture"],
  retexture: ["retexture"],
};

interface CliArgs {
  mode: string;
  since?: number;
  out: string;
  dryRun: boolean;
  overwrite: boolean;
  thumbnails: boolean;
  pageSize?: number;
  help: boolean;
}

function parseSince(value: string): number {
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    // Heuristic: <1e12 looks like seconds, otherwise milliseconds.
    return n < 1e12 ? n * 1000 : n;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`Could not parse --since value: "${value}" (use YYYY-MM-DD or an epoch).`);
  }
  return ms;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    mode: "all",
    out: path.resolve(PKG_ROOT, "../../assets/raw/meshy"),
    dryRun: false,
    overwrite: false,
    thumbnails: false,
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
      case "--mode":
        args.mode = next().toLowerCase();
        break;
      case "--since":
        args.since = parseSince(next());
        break;
      case "--out":
        args.out = path.resolve(process.cwd(), next());
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--overwrite":
        args.overwrite = true;
        break;
      case "--thumbnails":
        args.thumbnails = true;
        break;
      case "--page-size": {
        const n = Number(next());
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error("--page-size must be a positive number (max 50)");
        }
        args.pageSize = n;
        break;
      }
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

const HELP = `Octane Racer — Meshy bulk asset pull

Options:
  --mode <all|text|image|texture>   Which task families to pull (default: all)
  --since <date|epoch>              Only tasks created on/after this date
  --out <dir>                       Output dir (default: assets/raw/meshy)
  --dry-run                         List what would be pulled; write nothing
  --overwrite                       Re-download even if the file exists
  --thumbnails                      Also download the thumbnail render
  --page-size <n>                   List page size (max 50)
  -h, --help                        Show this help

Environment:
  MESHY_API_KEY   Required. Set in your shell or in tools/meshy/.env
  MESHY_API_BASE  Optional API base override (default https://api.meshy.ai)
`;

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function printSummary(summary: PullSummary): void {
  const rows = summary.pulled;
  console.log("");
  if (rows.length === 0) {
    console.log("No completed tasks matched the filters.");
  } else {
    const header = ["TASK ID", "MODE", "NEW", "SKIP", "PROMPT"];
    const data = rows.map((r) => [
      r.id.slice(0, 12),
      r.mode,
      String(r.filesDownloaded),
      String(r.filesSkipped),
      truncate(r.prompt || "—", 44),
    ]);
    const widths = header.map((h, col) =>
      Math.max(h.length, ...data.map((row) => row[col]!.length)),
    );
    const fmt = (cols: string[]) =>
      cols.map((c, col) => c.padEnd(widths[col]!)).join("  ");
    console.log(fmt(header));
    console.log(widths.map((w) => "-".repeat(w)).join("  "));
    for (const row of data) console.log(fmt(row));
  }
  console.log("");
  const verb = summary.dryRun ? "would download" : "downloaded";
  console.log(
    `${summary.dryRun ? "[dry-run] " : ""}${rows.length} task(s): ${verb} ${summary.totalDownloaded} file(s), skipped ${summary.totalSkipped} existing.`,
  );
  if (!summary.dryRun) console.log(`Manifest: ${summary.manifestPath}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  loadDotEnv(path.join(PKG_ROOT, ".env"));
  const apiKey = process.env[API_KEY_ENV];
  if (!apiKey) {
    console.error(
      `ERROR: ${API_KEY_ENV} is not set. Export it or add it to tools/meshy/.env (see .env.example).`,
    );
    process.exit(1);
  }

  const kinds = MODE_MAP[args.mode];
  if (!kinds) {
    console.error(`ERROR: unknown --mode "${args.mode}". Use all|text|image|texture.`);
    process.exit(1);
  }

  const client = new MeshyClient({ apiKey });
  console.log(
    `Meshy pull → ${args.out}${args.dryRun ? "  (dry-run)" : ""}\nMode: ${args.mode} (${kinds.join(", ")})${args.since ? `\nSince: ${new Date(args.since).toISOString()}` : ""}\n`,
  );

  const summary = await pullAssets(client, {
    kinds,
    since: args.since,
    outDir: args.out,
    dryRun: args.dryRun,
    overwrite: args.overwrite,
    includeThumbnail: args.thumbnails,
    pageSize: args.pageSize,
    logger: (msg) => console.log(msg),
  });

  printSummary(summary);
}

main().catch((err: unknown) => {
  console.error(`\nFATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
