#!/usr/bin/env node
/**
 * step0-check — pre-task collision guard for Code / Cowork sessions.
 *
 * A Code session runs `npx tsx tools/step0-check.ts <files it will touch...>` at the
 * very start of a task, BEFORE editing anything. The script reports the current git
 * state and intersects the declared files against the active-lane registry in
 * `.claude/step0-context.md`. If any declared file collides with a known
 * collision-magnet module, the process exits 1 so the session fails loudly instead of
 * stepping on a lane another agent (or the human) already owns.
 *
 * Design notes:
 *  - Pure Node/TS. No Phaser / Vite / game-runtime imports — this file must stay
 *    importable in a plain `node`/`tsx`/`vitest` context with zero side effects at
 *    import time (the CLI only runs when the module is the process entrypoint).
 *  - The severity matrix and magnet list mirror the dashboard v2 collision detector.
 *    See tools/step0-check.README.md for the full CLI + file-format documentation.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = 'none' | 'low' | 'medium' | 'high' | 'stop';

export interface Lane {
  id?: string;
  owner?: string;
  files: string[];
}

export interface Step0Context {
  activeLanes: Lane[];
}

export interface Overlap {
  declared: string;
  laneFile: string;
  laneId: string;
  severity: Severity;
}

export interface CollisionReport {
  overlaps: Overlap[];
  maxSeverity: Severity;
  exitCode: 0 | 1;
}

// ---------------------------------------------------------------------------
// Collision magnets
// ---------------------------------------------------------------------------

/**
 * Canonical collision-magnet basenames from the dashboard v2 spec. Any declared or
 * lane file whose basename matches one of these is treated as a `stop`.
 */
export const CANONICAL_MAGNET_BASENAMES: readonly string[] = [
  'IsoScene.ts',
  'save.ts',
  'tick.ts',
  'applyCommand.ts',
];

/** Canonical magnet directory globs from the dashboard v2 spec. */
export const CANONICAL_MAGNET_GLOBS: readonly string[] = ['src/scenes/ui/*'];

/**
 * Extra magnets discovered by churn analysis on `rts/isometric-conversion`
 * (`git log --name-only | sort | uniq -c`). These are the highest-churn shared
 * modules outside the canonical list; documented in the README so K can prune them.
 * Matched by path suffix (not bare basename) to avoid false positives on generic
 * names like `index.ts`.
 */
export const DISCOVERED_MAGNET_SUFFIXES: readonly string[] = [
  'src/sim/index.ts',
  'src/sim/constants.ts',
  'src/sim/types.ts',
  'src/sim/state.ts',
];

// ---------------------------------------------------------------------------
// Path / glob helpers (pure, string-level — no filesystem globbing)
// ---------------------------------------------------------------------------

/** Normalize a path/glob to forward slashes with no leading `./`. */
export function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function hasGlob(p: string): boolean {
  return /[*?]/.test(p);
}

/** Convert a glob (`*`, `**`, `?`) to an anchored RegExp. */
function globToRegExp(glob: string): RegExp {
  const norm = normalize(glob);
  let re = '';
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    if (c === '*') {
      if (norm[i + 1] === '*') {
        re += '.*';
        i++;
        if (norm[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

function matchGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(normalize(path));
}

/**
 * The leading directory of a pattern, up to (but excluding) the first segment that
 * contains a glob char or the trailing filename. Used to compare "same directory
 * scope" for medium-severity overlaps.
 *   src/render/*.ts     -> src/render
 *   src/render/scene.ts -> src/render
 *   src/**\/*.ts        -> src
 *   foo.ts              -> .
 */
export function patternBaseDir(p: string): string {
  const parts = normalize(p).split('/');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (hasGlob(seg)) break;
    if (i === parts.length - 1) break; // final concrete segment is the filename
    out.push(seg);
  }
  return out.join('/') || '.';
}

/**
 * True if a file matches any collision magnet. Accepts both concrete paths and glob
 * patterns; a glob whose base directory is a magnet directory (e.g. `src/scenes/ui/*`)
 * also counts.
 */
export function isMagnet(pattern: string): boolean {
  const p = normalize(pattern);
  const base = p.split('/').pop() ?? p;
  if (CANONICAL_MAGNET_BASENAMES.includes(base)) return true;
  for (const suf of DISCOVERED_MAGNET_SUFFIXES) {
    if (p === suf || p.endsWith('/' + suf)) return true;
  }
  for (const g of CANONICAL_MAGNET_GLOBS) {
    if (p === g) return true;
    if (matchGlob(g, p)) return true; // concrete file living under the magnet dir
    if (patternBaseDir(p) === patternBaseDir(g)) return true; // a glob scoped to that dir
  }
  return false;
}

// ---------------------------------------------------------------------------
// Overlap classification
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: readonly Severity[] = ['none', 'low', 'medium', 'high', 'stop'];

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

/** True if two patterns could refer to an overlapping set of files. */
export function patternsOverlap(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (hasGlob(na) && matchGlob(na, nb)) return true;
  if (hasGlob(nb) && matchGlob(nb, na)) return true;
  return false;
}

/**
 * Severity of a single (declared, laneFile) pair:
 *   stop   - either side is a known collision magnet
 *   high   - same exact file / pattern
 *   medium - overlap within the same directory scope
 *   low    - overlap only through a broad, cross-directory glob
 *   none   - no overlap
 */
export function classifyOverlap(declared: string, laneFile: string): Severity {
  if (!patternsOverlap(declared, laneFile)) return 'none';
  if (isMagnet(declared) || isMagnet(laneFile)) return 'stop';
  const d = normalize(declared);
  const l = normalize(laneFile);
  if (d === l) return 'high';
  if (patternBaseDir(d) === patternBaseDir(l)) return 'medium';
  return 'low';
}

/** Intersect declared files against every active lane and roll up the verdict. */
export function computeCollisions(declared: string[], lanes: Lane[]): CollisionReport {
  const overlaps: Overlap[] = [];
  for (const lane of lanes) {
    const laneId = lane.id ?? lane.owner ?? '(unnamed lane)';
    for (const laneFile of lane.files ?? []) {
      for (const dfile of declared) {
        const severity = classifyOverlap(dfile, laneFile);
        if (severity !== 'none') {
          overlaps.push({ declared: dfile, laneFile, laneId, severity });
        }
      }
    }
  }
  const maxSeverity = overlaps.reduce<Severity>(
    (m, o) => (severityRank(o.severity) > severityRank(m) ? o.severity : m),
    'none',
  );
  const exitCode: 0 | 1 = overlaps.some((o) => o.severity === 'stop') ? 1 : 0;
  return { overlaps, maxSeverity, exitCode };
}

// ---------------------------------------------------------------------------
// .claude/step0-context.md parsing
// ---------------------------------------------------------------------------

const JSON_BEGIN = 'DASHBOARD_STATE_JSON_BEGIN';
const JSON_END = 'DASHBOARD_STATE_JSON_END';

/** Stub written when `.claude/step0-context.md` does not exist yet. */
export const STUB_CONTEXT = `# Step 0 Context — Active Lane Registry

Human-maintained registry of in-flight work lanes. \`tools/step0-check.ts\` reads the
fenced JSON block below to detect when a new task's declared files collide with a lane
that is already owned by another agent or human.

Format: free-form markdown, plus exactly one fenced JSON block delimited by the
\`${JSON_BEGIN}\` / \`${JSON_END}\` markers (the dashboard v2 convention). The JSON is
an object with an \`activeLanes\` array; each lane has an \`id\` (or \`owner\`) and a
\`files\` array of paths/globs it is actively editing.

Example lane:
\`\`\`
{ "id": "rts-iso", "owner": "Code", "files": ["src/scenes/IsoScene.ts", "src/render/*.ts"] }
\`\`\`

<!-- ${JSON_BEGIN} -->
\`\`\`json
{
  "activeLanes": []
}
\`\`\`
<!-- ${JSON_END} -->
`;

function normalizeLane(l: unknown): Lane {
  const rec = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
  const files = Array.isArray(rec.files) ? rec.files.map((f) => String(f)) : [];
  return {
    id: typeof rec.id === 'string' ? rec.id : undefined,
    owner: typeof rec.owner === 'string' ? rec.owner : undefined,
    files,
  };
}

/** Extract the active-lane registry from a step0-context markdown document. */
export function parseStep0Context(md: string): Step0Context {
  const bi = md.indexOf(JSON_BEGIN);
  const ei = md.indexOf(JSON_END);
  if (bi === -1 || ei === -1 || ei < bi) return { activeLanes: [] };

  let block = md.slice(bi + JSON_BEGIN.length, ei).replace(/<!--/g, '').replace(/-->/g, '');

  // Strip an optional ```json ... ``` fence around the payload.
  const fenceStart = block.indexOf('```');
  if (fenceStart !== -1) {
    const after = block.slice(fenceStart + 3);
    const nl = after.indexOf('\n');
    const rest = nl === -1 ? after : after.slice(nl + 1);
    const fenceEnd = rest.indexOf('```');
    block = fenceEnd === -1 ? rest : rest.slice(0, fenceEnd);
  }

  try {
    const parsed: unknown = JSON.parse(block.trim());
    const lanesRaw =
      parsed && typeof parsed === 'object' && Array.isArray((parsed as { activeLanes?: unknown }).activeLanes)
        ? (parsed as { activeLanes: unknown[] }).activeLanes
        : [];
    return { activeLanes: lanesRaw.map(normalizeLane) };
  } catch {
    return { activeLanes: [] };
  }
}

/** Read the registry, creating a stub if the file is absent. */
export function readOrCreateContext(filePath: string): {
  context: Step0Context;
  created: boolean;
} {
  if (existsSync(filePath)) {
    return { context: parseStep0Context(readFileSync(filePath, 'utf8')), created: false };
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, STUB_CONTEXT, 'utf8');
  return { context: { activeLanes: [] }, created: true };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `step0-check — pre-task collision guard

Usage:
  npx tsx tools/step0-check.ts <file-or-glob> [<file-or-glob> ...]

Declares the files/globs this task intends to touch, intersects them against the
active lanes in .claude/step0-context.md, and prints a severity report. Exits 1 if any
declared file collides with a known collision magnet (severity 'stop'), else 0.

Options:
  -h, --help   Show this help and exit.`;

function git(args: string[]): string {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function main(argv: string[]): number {
  const rest = argv.slice(2);
  if (rest.includes('-h') || rest.includes('--help')) {
    console.log(USAGE);
    return 0;
  }
  const declared = rest.filter((a) => !a.startsWith('-'));

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']) || '(unknown)';
  const head = git(['rev-parse', 'HEAD']) || '(unknown)';
  const status = git(['status', '--porcelain']);
  const uncommitted = status ? status.split('\n').filter((l) => l.trim().length > 0) : [];

  const contextPath = resolve(process.cwd(), '.claude', 'step0-context.md');
  const { context, created } = readOrCreateContext(contextPath);
  const report = computeCollisions(declared, context.activeLanes);

  const line = '─'.repeat(60);
  console.log(line);
  console.log('step0-check — pre-task collision guard');
  console.log(line);
  console.log(`branch:            ${branch}`);
  console.log(`HEAD:              ${head}`);
  console.log(`uncommitted files: ${uncommitted.length}`);
  if (uncommitted.length > 0) {
    for (const u of uncommitted.slice(0, 20)) console.log(`  ${u}`);
    if (uncommitted.length > 20) console.log(`  ...and ${uncommitted.length - 20} more`);
  }
  console.log(`registry:          ${contextPath}${created ? ' (created stub)' : ''}`);
  console.log(`active lanes:      ${context.activeLanes.length}`);
  console.log(`declared files:    ${declared.length}${declared.length ? '' : '  (none — pass files/globs as args)'}`);
  for (const d of declared) console.log(`  ${d}`);
  console.log(line);

  if (report.overlaps.length === 0) {
    console.log('collisions:        none');
  } else {
    console.log('collisions (declared  ×  lane file):');
    const sorted = [...report.overlaps].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    for (const o of sorted) {
      console.log(`  [${o.severity.toUpperCase().padEnd(6)}] ${o.declared}  ×  ${o.laneFile}  (lane: ${o.laneId})`);
    }
  }
  console.log(line);
  console.log(`max severity:      ${report.maxSeverity}`);
  if (report.exitCode === 1) {
    console.log('VERDICT:           STOP — declared files hit a known collision magnet. Coordinate before editing.');
  } else {
    console.log('VERDICT:           clear to proceed (no stop-level collisions).');
  }
  console.log(line);

  return report.exitCode;
}

// Run the CLI only when this module is the process entrypoint (not when imported by
// vitest). Works under both `node dist/step0-check.js` and `tsx tools/step0-check.ts`.
const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
const self = fileURLToPath(import.meta.url);
if (invoked && invoked === self) {
  process.exit(main(process.argv));
}
