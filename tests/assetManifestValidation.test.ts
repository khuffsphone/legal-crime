import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createAssetManifestValidator,
  formatAssetManifestValidation,
  parseAssetManifestJson,
  validateAssetManifestDocument,
  validateAssetManifestSemantics,
  type AssetManifestDocument,
} from '../scripts/validate-asset-manifests';

function readJson(relativePath: string): unknown {
  const url = new URL(relativePath, import.meta.url);
  return parseAssetManifestJson(readFileSync(url, 'utf8'), url.pathname);
}

function productionManifest(): AssetManifestDocument {
  return structuredClone(readJson('../docs/production/assets/fp01-asset-manifest.json')) as AssetManifestDocument;
}

describe('FP-01 asset manifest JSON Schema', () => {
  const schema = readJson('../docs/production/assets/asset-manifest.schema.json');
  const validator = createAssetManifestValidator(schema);

  it('meta-validates the schema and accepts both committed manifests', () => {
    for (const file of [
      '../docs/production/assets/asset-manifest.template.json',
      '../docs/production/assets/fp01-asset-manifest.json',
    ]) {
      const result = validateAssetManifestDocument(readJson(file), validator, file);
      expect(result.issues).toEqual([]);
    }
  });

  it('reports actionable schema paths for structurally invalid records', () => {
    const invalid = readJson('../docs/production/assets/asset-manifest.template.json') as Record<string, unknown>;
    delete invalid.owner;
    const result = validateAssetManifestDocument(invalid, validator, 'missing-owner.json');
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'schema',
      sourceName: 'missing-owner.json',
      path: '/owner',
    }));
  });
});

describe('FP-01 asset manifest semantic gate', () => {
  it('rejects duplicate identifiers, dangling lineage, and unbacked runtime paths', () => {
    const manifest = productionManifest();
    manifest.assets[1].assetId = manifest.assets[0].assetId;
    manifest.assets[1].integration.inGameKey = manifest.assets[0].integration.inGameKey;
    manifest.assets[0].provenance.sourceAssetIds = ['fp01.model.missing.01'];
    manifest.assets[0].creativeBrief.referenceAssetIds = ['fp01.image.missing.01'];
    manifest.assets[0].integration.runtimePath = 'public/assets/proprietor.glb';

    const issues = validateAssetManifestSemantics(manifest, 'fixture.json');
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate-asset-id', assetId: manifest.assets[0].assetId }),
      expect.objectContaining({ code: 'duplicate-in-game-key' }),
      expect.objectContaining({ code: 'dangling-source-asset' }),
      expect.objectContaining({ code: 'dangling-reference-asset' }),
      expect.objectContaining({ code: 'runtime-path-mismatch' }),
    ]));
  });

  it('requires measured duration and valid loop points before audio approval', () => {
    const manifest = productionManifest();
    const music = manifest.assets.find((asset) => asset.kind === 'music');
    expect(music).toBeDefined();
    if (!music) return;
    music.lifecycleState = 'approved';
    music.approval.state = 'approved';

    let issues = validateAssetManifestSemantics(manifest);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'approved-duration-missing', assetId: music.assetId }),
      expect.objectContaining({ code: 'loop-points-missing', assetId: music.assetId }),
    ]));

    music.technical.temporal.durationSeconds = 10;
    music.technical.temporal.loop.startSeconds = 8;
    music.technical.temporal.loop.endSeconds = 5;
    issues = validateAssetManifestSemantics(manifest);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'loop-order-invalid', assetId: music.assetId }));

    music.technical.temporal.loop.startSeconds = 2;
    music.technical.temporal.loop.endSeconds = 12;
    issues = validateAssetManifestSemantics(manifest);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'loop-bounds-invalid', assetId: music.assetId }));

    music.technical.temporal.loop.endSeconds = 10;
    expect(validateAssetManifestSemantics(manifest)).toEqual([]);
  });

  it('accepts an exact runtime-file match and formats failures for CI logs', () => {
    const manifest = productionManifest();
    const asset = manifest.assets[0];
    asset.integration.runtimePath = 'public/assets/proprietor.glb';
    asset.files.push({ role: 'runtime', path: asset.integration.runtimePath });
    expect(validateAssetManifestSemantics(manifest)).toEqual([]);

    const report = formatAssetManifestValidation([{
      sourceName: 'fixture.json',
      assetCount: 1,
      issues: [{
        code: 'runtime-path-mismatch',
        sourceName: 'fixture.json',
        path: '/assets/0/integration/runtimePath',
        message: 'runtime file missing',
      }],
    }]);
    expect(report).toContain('RUNTIME-PATH-MISMATCH');
    expect(report).toContain('fixture.json/assets/0/integration/runtimePath');
  });
});
