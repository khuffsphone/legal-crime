#!/usr/bin/env -S npx vite-node --script
/**
 * FP-01 asset-production manifest gate.
 *
 * JSON Schema catches structural mistakes. The semantic pass below enforces relationships that
 * JSON Schema cannot express cleanly: unique game keys, valid provenance references, exact runtime
 * file linkage, and measured timing data before a temporal asset can be approved.
 */
import { readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020, { type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export type AssetManifestIssueCode =
  | 'schema'
  | 'duplicate-asset-id'
  | 'duplicate-in-game-key'
  | 'dangling-source-asset'
  | 'dangling-reference-asset'
  | 'runtime-path-mismatch'
  | 'approved-duration-missing'
  | 'loop-points-missing'
  | 'loop-order-invalid'
  | 'loop-bounds-invalid';

export interface AssetManifestIssue {
  code: AssetManifestIssueCode;
  sourceName: string;
  path: string;
  message: string;
  assetId?: string;
}

interface ManifestFileRecord {
  role: string;
  path: string;
}

interface ManifestAssetRecord {
  assetId: string;
  kind: string;
  lifecycleState: string;
  creativeBrief: { referenceAssetIds: string[] };
  provenance: { sourceAssetIds: string[] };
  files: ManifestFileRecord[];
  technical: {
    temporal: {
      durationSeconds: number | null;
      loop: {
        enabled: boolean;
        startSeconds: number | null;
        endSeconds: number | null;
      };
    };
  };
  integration: {
    inGameKey: string;
    runtimePath: string | null;
  };
  approval: { state: string };
}

export interface AssetManifestDocument {
  assets: ManifestAssetRecord[];
}

export interface AssetManifestValidationResult {
  sourceName: string;
  assetCount: number;
  issues: AssetManifestIssue[];
}

const TEMPORAL_KINDS: ReadonlySet<string> = new Set([
  'animation3d',
  'voice',
  'sound-effect',
  'music',
  'ambience',
  'cinematic',
]);
const AUDIO_KINDS: ReadonlySet<string> = new Set(['voice', 'sound-effect', 'music', 'ambience']);

function errorPath(error: ErrorObject): string {
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    return `${error.instancePath}/${error.params.missingProperty}`;
  }
  if (error.keyword === 'additionalProperties' && typeof error.params.additionalProperty === 'string') {
    return `${error.instancePath}/${error.params.additionalProperty}`;
  }
  return error.instancePath || '/';
}

function schemaIssue(error: ErrorObject, sourceName: string): AssetManifestIssue {
  return {
    code: 'schema',
    sourceName,
    path: errorPath(error),
    message: error.message ?? `failed JSON Schema keyword ${error.keyword}`,
  };
}

function schemaErrorsMessage(errors: readonly ErrorObject[] | null | undefined): string {
  if (!errors?.length) return 'unknown JSON Schema error';
  return errors.map((error) => `${errorPath(error)} ${error.message ?? error.keyword}`).join('; ');
}

/** Compile and meta-validate the Draft 2020-12 production schema. */
export function createAssetManifestValidator(
  schema: unknown,
  sourceName = 'asset-manifest.schema.json',
): ValidateFunction<AssetManifestDocument> {
  // The schema intentionally uses conditional property fragments without repeating their parent
  // types. That is valid Draft 2020-12, but Ajv's optional strictTypes lint rejects the pattern.
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true, strictTypes: false });
  addFormats(ajv);
  let validSchema: boolean;
  try {
    const validation = ajv.validateSchema(schema as AnySchema);
    if (typeof validation !== 'boolean') throw new Error('asynchronous schemas are not supported');
    validSchema = validation;
  } catch (error) {
    throw new Error(`${sourceName} is not a valid Draft 2020-12 schema: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!validSchema) {
    throw new Error(`${sourceName} is not a valid Draft 2020-12 schema: ${schemaErrorsMessage(ajv.errors)}`);
  }
  try {
    return ajv.compile<AssetManifestDocument>(schema as AnySchema);
  } catch (error) {
    throw new Error(`${sourceName} could not be compiled: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function pushDuplicateIssues(
  assets: readonly ManifestAssetRecord[],
  sourceName: string,
  value: (asset: ManifestAssetRecord) => string,
  code: 'duplicate-asset-id' | 'duplicate-in-game-key',
  property: 'assetId' | 'integration/inGameKey',
  label: string,
): AssetManifestIssue[] {
  const issues: AssetManifestIssue[] = [];
  const firstIndex = new Map<string, number>();
  assets.forEach((asset, index) => {
    const key = value(asset);
    const original = firstIndex.get(key);
    if (original === undefined) {
      firstIndex.set(key, index);
      return;
    }
    issues.push({
      code,
      sourceName,
      path: `/assets/${index}/${property}`,
      assetId: asset.assetId,
      message: `${label} '${key}' duplicates /assets/${original}/${property}`,
    });
  });
  return issues;
}

/** Validate cross-record and approval semantics after structural schema validation. */
export function validateAssetManifestSemantics(
  manifest: AssetManifestDocument,
  sourceName = 'asset-manifest.json',
): AssetManifestIssue[] {
  const issues: AssetManifestIssue[] = [
    ...pushDuplicateIssues(manifest.assets, sourceName, (asset) => asset.assetId,
      'duplicate-asset-id', 'assetId', 'assetId'),
    ...pushDuplicateIssues(manifest.assets, sourceName, (asset) => asset.integration.inGameKey,
      'duplicate-in-game-key', 'integration/inGameKey', 'inGameKey'),
  ];
  const assetIds = new Set(manifest.assets.map((asset) => asset.assetId));

  manifest.assets.forEach((asset, index) => {
    const assetPath = `/assets/${index}`;
    asset.provenance.sourceAssetIds.forEach((sourceId, sourceIndex) => {
      if (!assetIds.has(sourceId)) {
        issues.push({
          code: 'dangling-source-asset',
          sourceName,
          path: `${assetPath}/provenance/sourceAssetIds/${sourceIndex}`,
          assetId: asset.assetId,
          message: `source asset '${sourceId}' is not declared in this manifest`,
        });
      }
    });
    asset.creativeBrief.referenceAssetIds.forEach((referenceId, referenceIndex) => {
      if (!assetIds.has(referenceId)) {
        issues.push({
          code: 'dangling-reference-asset',
          sourceName,
          path: `${assetPath}/creativeBrief/referenceAssetIds/${referenceIndex}`,
          assetId: asset.assetId,
          message: `reference asset '${referenceId}' is not declared in this manifest`,
        });
      }
    });

    const runtimePath = asset.integration.runtimePath;
    if (runtimePath !== null && !asset.files.some((file) => file.role === 'runtime' && file.path === runtimePath)) {
      issues.push({
        code: 'runtime-path-mismatch',
        sourceName,
        path: `${assetPath}/integration/runtimePath`,
        assetId: asset.assetId,
        message: `runtimePath '${runtimePath}' has no exact files[] entry with role 'runtime'`,
      });
    }

    const approved = asset.lifecycleState === 'approved' || asset.approval.state === 'approved';
    const temporal = asset.technical.temporal;
    const duration = temporal.durationSeconds;
    if (approved && TEMPORAL_KINDS.has(asset.kind) && (duration === null || !Number.isFinite(duration) || duration <= 0)) {
      issues.push({
        code: 'approved-duration-missing',
        sourceName,
        path: `${assetPath}/technical/temporal/durationSeconds`,
        assetId: asset.assetId,
        message: `approved ${asset.kind} assets require a measured positive durationSeconds`,
      });
    }

    const loop = temporal.loop;
    if (!approved || !AUDIO_KINDS.has(asset.kind) || !loop.enabled) return;
    const start = loop.startSeconds;
    const end = loop.endSeconds;
    if (start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end)) {
      issues.push({
        code: 'loop-points-missing',
        sourceName,
        path: `${assetPath}/technical/temporal/loop`,
        assetId: asset.assetId,
        message: 'approved loopable audio requires measured startSeconds and endSeconds',
      });
      return;
    }
    if (start >= end) {
      issues.push({
        code: 'loop-order-invalid',
        sourceName,
        path: `${assetPath}/technical/temporal/loop`,
        assetId: asset.assetId,
        message: `loop startSeconds (${start}) must be less than endSeconds (${end})`,
      });
    }
    if (start < 0 || end <= 0 || (typeof duration === 'number' && Number.isFinite(duration) && end > duration)) {
      issues.push({
        code: 'loop-bounds-invalid',
        sourceName,
        path: `${assetPath}/technical/temporal/loop`,
        assetId: asset.assetId,
        message: `loop [${start}, ${end}] must fit within measured duration ${String(duration)}`,
      });
    }
  });

  return issues;
}

export function validateAssetManifestDocument(
  document: unknown,
  validator: ValidateFunction<AssetManifestDocument>,
  sourceName = 'asset-manifest.json',
): AssetManifestValidationResult {
  if (!validator(document)) {
    return {
      sourceName,
      assetCount: 0,
      issues: (validator.errors ?? []).map((error) => schemaIssue(error, sourceName)),
    };
  }
  return {
    sourceName,
    assetCount: document.assets.length,
    issues: validateAssetManifestSemantics(document, sourceName),
  };
}

export function parseAssetManifestJson(json: string, sourceName: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error(`${sourceName} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function formatAssetManifestValidation(results: readonly AssetManifestValidationResult[]): string {
  const issueCount = results.reduce((sum, result) => sum + result.issues.length, 0);
  const assetCount = results.reduce((sum, result) => sum + result.assetCount, 0);
  if (issueCount === 0) {
    return `Asset manifest validation passed: ${results.length} manifest(s), ${assetCount} asset record(s).`;
  }
  const lines = [`Asset manifest validation failed: ${issueCount} issue(s) in ${results.length} manifest(s).`];
  for (const result of results) {
    for (const issue of result.issues) {
      lines.push(`  ${issue.code.toUpperCase().padEnd(26)} ${issue.sourceName}${issue.path}: ${issue.message}`);
    }
  }
  return lines.join('\n');
}

interface CliPaths {
  schema: string;
  manifests: string[];
  help: boolean;
}

function parseCliPaths(args: readonly string[], projectRoot: string): CliPaths {
  const paths: CliPaths = {
    schema: resolve(projectRoot, 'docs/production/assets/asset-manifest.schema.json'),
    manifests: [
      resolve(projectRoot, 'docs/production/assets/asset-manifest.template.json'),
      resolve(projectRoot, 'docs/production/assets/fp01-asset-manifest.json'),
    ],
    help: false,
  };
  let customManifests = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      paths.help = true;
      continue;
    }
    if (arg !== '--schema' && arg !== '--manifest') throw new Error(`Unknown argument: ${arg}`);
    const value = args[index + 1];
    if (!value) throw new Error(`${arg} requires a path`);
    index += 1;
    const path = resolve(process.cwd(), value);
    if (arg === '--schema') paths.schema = path;
    else {
      if (!customManifests) paths.manifests = [];
      customManifests = true;
      paths.manifests.push(path);
    }
  }
  return paths;
}

export function runAssetManifestValidationCli(args: readonly string[] = process.argv.slice(2)): number {
  try {
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const paths = parseCliPaths(args, projectRoot);
    if (paths.help) {
      console.log('Usage: npx vite-node --script scripts/validate-asset-manifests.ts [--schema path] [--manifest path ...]');
      return 0;
    }
    const schema = parseAssetManifestJson(readFileSync(paths.schema, 'utf8'), paths.schema);
    const validator = createAssetManifestValidator(schema, paths.schema);
    const results = paths.manifests.map((path) => validateAssetManifestDocument(
      parseAssetManifestJson(readFileSync(path, 'utf8'), path),
      validator,
      relative(projectRoot, path) || basename(path),
    ));
    console.log(formatAssetManifestValidation(results));
    return results.some((result) => result.issues.length > 0) ? 1 : 0;
  } catch (error) {
    console.error(`Asset manifest validation could not run: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) process.exitCode = runAssetManifestValidationCli();
