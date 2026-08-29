#!/usr/bin/env -S npx vite-node --script
/**
 * FP-01 audio import gate.
 *
 * This deliberately reads src/scenes/audio.ts as source instead of importing it: importing the
 * runtime catalog also imports Phaser, while the production gate needs to work in a headless CI
 * process. Run from anywhere with:
 *
 *   npx vite-node --script scripts/validate-audio-assets.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const AUDIO_ASSET_CATEGORIES = ['sfx', 'music', 'ambience', 'cinematic', 'vo'] as const;
export type AudioAssetCategory = (typeof AUDIO_ASSET_CATEGORIES)[number];

export interface CoreAudioCatalogClip {
  key: string;
  file: string;
  bus: string;
  synth: boolean;
  line: number;
}

export interface AudioAssetPolicy {
  maxEventSfxSeconds: number;
  /** Per-key production classification. Core `music`, `ambience`, and `vo` buses need no override. */
  categories: Readonly<Record<string, AudioAssetCategory>>;
}

export type AudioAssetIssueCode =
  | 'duplicate-key'
  | 'unknown-policy-key'
  | 'empty-file-without-synth'
  | 'invalid-file-path'
  | 'missing-file'
  | 'duration-unreadable'
  | 'event-sfx-too-long';

export interface AudioAssetIssue {
  code: AudioAssetIssueCode;
  key: string;
  file: string;
  line: number;
  category: AudioAssetCategory;
  durationSeconds?: number;
  detail?: string;
}

export interface AudioAssetValidationResult {
  catalogEntries: number;
  fileBackedEntries: number;
  issues: AudioAssetIssue[];
}

export interface ValidateAudioAssetOptions {
  audioDir: string;
  policy: AudioAssetPolicy;
  fileExists?: (path: string) => boolean;
  durationSeconds?: (path: string) => number;
}

const CATEGORY_SET: ReadonlySet<string> = new Set(AUDIO_ASSET_CATEGORIES);

function propertyNamed(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find((property): property is ts.PropertyAssignment => {
    if (!ts.isPropertyAssignment(property)) return false;
    const propertyName = property.name;
    if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) return propertyName.text === name;
    return false;
  });
}

function staticString(object: ts.ObjectLiteralExpression, name: string, label: string): string {
  const property = propertyNamed(object, name);
  if (!property || !ts.isStringLiteralLike(property.initializer)) {
    throw new Error(`${label}.${name} must be a static string literal`);
  }
  return property.initializer.text;
}

function staticBoolean(object: ts.ObjectLiteralExpression, name: string, label: string): boolean {
  const property = propertyNamed(object, name);
  if (!property) return false;
  if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) return false;
  throw new Error(`${label}.${name} must be a static boolean literal`);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** Extract a literal catalog without executing Phaser or any other game code. */
export function parseCoreAudioCatalog(
  sourceText: string,
  sourceName = 'src/scenes/audio.ts',
  catalogVariable = 'LIBRARY',
): CoreAudioCatalogClip[] {
  const source = ts.createSourceFile(sourceName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let declaration: ts.VariableDeclaration | undefined;

  const visit = (node: ts.Node): void => {
    if (
      !declaration
      && ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === catalogVariable
    ) declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (!declaration?.initializer) throw new Error(`Could not find initialized ${catalogVariable} catalog in ${sourceName}`);
  const initializer = unwrapExpression(declaration.initializer);
  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`${catalogVariable} in ${sourceName} must be a static array literal`);
  }

  return initializer.elements.map((element, index) => {
    const value = unwrapExpression(element);
    if (!ts.isObjectLiteralExpression(value)) {
      throw new Error(`${catalogVariable}[${index}] in ${sourceName} must be a static object literal`);
    }
    const label = `${catalogVariable}[${index}]`;
    return {
      key: staticString(value, 'key', label),
      file: staticString(value, 'file', label),
      bus: staticString(value, 'bus', label),
      synth: staticBoolean(value, 'synth', label),
      line: source.getLineAndCharacterOfPosition(value.getStart(source)).line + 1,
    };
  });
}

export function parseAudioAssetPolicy(json: string, sourceName = 'audio-asset-policy.json'): AudioAssetPolicy {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    throw new Error(`${sourceName} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${sourceName} must be a JSON object`);

  const record = raw as Record<string, unknown>;
  const max = record.maxEventSfxSeconds;
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) {
    throw new Error(`${sourceName}.maxEventSfxSeconds must be a positive finite number`);
  }
  const categoryValue = record.categories ?? {};
  if (!categoryValue || typeof categoryValue !== 'object' || Array.isArray(categoryValue)) {
    throw new Error(`${sourceName}.categories must be an object keyed by audio key`);
  }

  const categories: Record<string, AudioAssetCategory> = {};
  for (const [key, value] of Object.entries(categoryValue as Record<string, unknown>)) {
    if (typeof value !== 'string' || !CATEGORY_SET.has(value)) {
      throw new Error(`${sourceName}.categories.${key} must be one of ${AUDIO_ASSET_CATEGORIES.join(', ')}`);
    }
    categories[key] = value as AudioAssetCategory;
  }
  return { maxEventSfxSeconds: max, categories };
}

/** Probe a physical asset without decoding or playing it. */
export function probeAudioDurationSeconds(path: string, ffprobeCommand = 'ffprobe'): number {
  const result = spawnSync(
    ffprobeCommand,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) throw new Error(result.stderr.trim() || `ffprobe exited ${String(result.status)}`);
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration < 0) throw new Error(`ffprobe returned invalid duration '${result.stdout.trim()}'`);
  return duration;
}

export function assertFfprobeAvailable(ffprobeCommand = 'ffprobe'): void {
  const result = spawnSync(ffprobeCommand, ['-version'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.error) throw new Error(`${ffprobeCommand} is required to measure audio duration: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${ffprobeCommand} -version exited ${String(result.status)}`);
}

export function categoryForClip(
  clip: CoreAudioCatalogClip,
  categories: Readonly<Record<string, AudioAssetCategory>>,
): AudioAssetCategory {
  const override = categories[clip.key];
  if (override) return override;
  if (clip.bus === 'music' || clip.bus === 'ambience' || clip.bus === 'vo') return clip.bus;
  return 'sfx';
}

/** Validate every non-empty physical file reference in the core catalog. */
export function validateAudioAssets(
  clips: readonly CoreAudioCatalogClip[],
  options: ValidateAudioAssetOptions,
): AudioAssetValidationResult {
  const fileExists = options.fileExists ?? existsSync;
  const durationSeconds = options.durationSeconds ?? probeAudioDurationSeconds;
  const audioRoot = resolve(options.audioDir);
  const issues: AudioAssetIssue[] = [];
  let fileBackedEntries = 0;
  const seenKeys = new Set<string>();
  const catalogKeys = new Set(clips.map((clip) => clip.key));

  for (const [key, category] of Object.entries(options.policy.categories)) {
    if (!catalogKeys.has(key)) {
      issues.push({ code: 'unknown-policy-key', key, file: '', line: 0, category });
    }
  }

  for (const clip of clips) {
    const category = categoryForClip(clip, options.policy.categories);
    if (seenKeys.has(clip.key)) {
      issues.push({ code: 'duplicate-key', key: clip.key, file: clip.file, line: clip.line, category });
    }
    seenKeys.add(clip.key);
    if (clip.file === '') {
      if (!clip.synth) issues.push({ code: 'empty-file-without-synth', key: clip.key, file: clip.file, line: clip.line, category });
      continue;
    }
    fileBackedEntries += 1;
    const assetPath = resolve(audioRoot, clip.file);
    const fromRoot = relative(audioRoot, assetPath);
    if (fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) {
      issues.push({ code: 'invalid-file-path', key: clip.key, file: clip.file, line: clip.line, category });
      continue;
    }
    if (!fileExists(assetPath)) {
      issues.push({ code: 'missing-file', key: clip.key, file: clip.file, line: clip.line, category });
      continue;
    }

    let duration: number;
    try {
      duration = durationSeconds(assetPath);
      if (!Number.isFinite(duration) || duration < 0) throw new Error(`invalid duration ${String(duration)}`);
    } catch (error) {
      issues.push({
        code: 'duration-unreadable', key: clip.key, file: clip.file, line: clip.line, category,
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (category === 'sfx' && duration > options.policy.maxEventSfxSeconds) {
      issues.push({
        code: 'event-sfx-too-long', key: clip.key, file: clip.file, line: clip.line, category,
        durationSeconds: duration,
      });
    }
  }

  return { catalogEntries: clips.length, fileBackedEntries, issues };
}

export function formatAudioAssetValidation(result: AudioAssetValidationResult, policy: AudioAssetPolicy): string {
  if (result.issues.length === 0) {
    return `Audio asset validation passed: ${result.fileBackedEntries} physical files checked.`;
  }
  const lines = [
    `Audio asset validation failed: ${result.issues.length} issue(s) across ${result.fileBackedEntries} physical files.`,
  ];
  for (const issue of result.issues) {
    const at = `${issue.key} (${issue.file}, catalog line ${issue.line})`;
    if (issue.code === 'duplicate-key') lines.push(`  DUP KEY    ${at}`);
    else if (issue.code === 'unknown-policy-key') lines.push(`  BAD POLICY ${issue.key}: category override has no catalog entry`);
    else if (issue.code === 'empty-file-without-synth') lines.push(`  NO SOURCE  ${at}: empty file requires synth:true`);
    else if (issue.code === 'missing-file') lines.push(`  MISSING    ${at}`);
    else if (issue.code === 'invalid-file-path') lines.push(`  BAD PATH   ${at}`);
    else if (issue.code === 'duration-unreadable') lines.push(`  UNREADABLE ${at}: ${issue.detail ?? 'duration unavailable'}`);
    else lines.push(
      `  TOO LONG   ${at}: ${issue.durationSeconds?.toFixed(3)}s; event SFX limit is ${policy.maxEventSfxSeconds}s`,
    );
  }
  lines.push('Long-form clips must be explicitly categorized as music, ambience, cinematic, or vo.');
  return lines.join('\n');
}

interface CliPaths { catalog: string; audioDir: string; policy: string; help: boolean; }

function parseCliPaths(args: readonly string[], projectRoot: string): CliPaths {
  const paths: CliPaths = {
    catalog: resolve(projectRoot, 'src/scenes/audio.ts'),
    audioDir: resolve(projectRoot, 'public/audio'),
    policy: resolve(projectRoot, 'scripts/audio-asset-policy.json'),
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') { paths.help = true; continue; }
    if (arg !== '--catalog' && arg !== '--audio-dir' && arg !== '--policy') throw new Error(`Unknown argument: ${arg}`);
    const value = args[index + 1];
    if (!value) throw new Error(`${arg} requires a path`);
    index += 1;
    const resolved = resolve(process.cwd(), value);
    if (arg === '--catalog') paths.catalog = resolved;
    else if (arg === '--audio-dir') paths.audioDir = resolved;
    else paths.policy = resolved;
  }
  return paths;
}

export function runAudioAssetValidationCli(args: readonly string[] = process.argv.slice(2)): number {
  try {
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const paths = parseCliPaths(args, projectRoot);
    if (paths.help) {
      console.log('Usage: npx vite-node --script scripts/validate-audio-assets.ts [--catalog path] [--audio-dir path] [--policy path]');
      return 0;
    }
    const clips = parseCoreAudioCatalog(readFileSync(paths.catalog, 'utf8'), paths.catalog);
    const policy = parseAudioAssetPolicy(readFileSync(paths.policy, 'utf8'), paths.policy);
    assertFfprobeAvailable();
    const result = validateAudioAssets(clips, { audioDir: paths.audioDir, policy });
    console.log(formatAudioAssetValidation(result, policy));
    return result.issues.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(`Audio asset validation could not run: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) process.exitCode = runAudioAssetValidationCli();
