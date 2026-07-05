import { describe, it, expect } from 'vitest';
import {
  parseStep0Context,
  classifyOverlap,
  computeCollisions,
  patternsOverlap,
  patternBaseDir,
  isMagnet,
  severityRank,
  normalize,
  type Lane,
  type Severity,
} from '../tools/step0-check';

// A synthetic registry that exercises every severity band. Uses the exact
// DASHBOARD_STATE_JSON_BEGIN / _END convention the real file uses.
const SYNTHETIC_CONTEXT = `# Step 0 Context (synthetic test fixture)

Some free-form human prose the parser must ignore.

<!-- DASHBOARD_STATE_JSON_BEGIN -->
\`\`\`json
{
  "activeLanes": [
    { "id": "iso-lane",   "owner": "Code",   "files": ["src/scenes/IsoScene.ts"] },
    { "id": "ui-lane",    "owner": "Design", "files": ["src/scenes/ui/*"] },
    { "id": "render-lane","owner": "Cowork", "files": ["src/render/scene.ts", "src/render/*.ts"] },
    { "id": "broad-lane", "owner": "Code",   "files": ["src/**/*.ts"] }
  ]
}
<!-- DASHBOARD_STATE_JSON_END -->
\`\`\`
`;

describe('parseStep0Context', () => {
  it('extracts activeLanes from the DASHBOARD_STATE_JSON block', () => {
    const ctx = parseStep0Context(SYNTHETIC_CONTEXT);
    expect(ctx.activeLanes).toHaveLength(4);
    expect(ctx.activeLanes[0]).toMatchObject({ id: 'iso-lane', owner: 'Code' });
    expect(ctx.activeLanes[0].files).toEqual(['src/scenes/IsoScene.ts']);
  });

  it('returns an empty registry when no JSON block is present', () => {
    expect(parseStep0Context('# just a heading\n\nno json here').activeLanes).toEqual([]);
  });

  it('returns an empty registry when the JSON block is malformed', () => {
    const bad = `<!-- DASHBOARD_STATE_JSON_BEGIN -->\n{ not valid json ]\n<!-- DASHBOARD_STATE_JSON_END -->`;
    expect(parseStep0Context(bad).activeLanes).toEqual([]);
  });

  it('tolerates a raw (unfenced) JSON payload between the markers', () => {
    const raw = `DASHBOARD_STATE_JSON_BEGIN\n{"activeLanes":[{"id":"x","files":["a.ts"]}]}\nDASHBOARD_STATE_JSON_END`;
    const ctx = parseStep0Context(raw);
    expect(ctx.activeLanes).toEqual([{ id: 'x', owner: undefined, files: ['a.ts'] }]);
  });

  it('coerces missing or non-array files to an empty list', () => {
    const raw = `DASHBOARD_STATE_JSON_BEGIN\n{"activeLanes":[{"id":"y"}]}\nDASHBOARD_STATE_JSON_END`;
    expect(parseStep0Context(raw).activeLanes[0].files).toEqual([]);
  });
});

describe('normalize', () => {
  it('converts backslashes and strips leading ./', () => {
    expect(normalize('.\\src\\sim\\tick.ts')).toBe('src/sim/tick.ts');
  });
});

describe('isMagnet', () => {
  it('flags canonical basename magnets regardless of directory', () => {
    expect(isMagnet('src/scenes/IsoScene.ts')).toBe(true);
    expect(isMagnet('src/sim/tick.ts')).toBe(true);
    expect(isMagnet('anywhere/save.ts')).toBe(true);
    expect(isMagnet('src/sim/applyCommand.ts')).toBe(true);
  });

  it('flags the canonical src/scenes/ui/* glob and files under it', () => {
    expect(isMagnet('src/scenes/ui/*')).toBe(true);
    expect(isMagnet('src/scenes/ui/statusDashboard.ts')).toBe(true);
  });

  it('flags churn-discovered suffix magnets by full path (not bare basename)', () => {
    expect(isMagnet('src/sim/index.ts')).toBe(true);
    expect(isMagnet('src/sim/constants.ts')).toBe(true);
    // A generic index.ts elsewhere must NOT be a magnet.
    expect(isMagnet('src/scenes/index.ts')).toBe(false);
  });

  it('does not flag ordinary files', () => {
    expect(isMagnet('src/render/scene.ts')).toBe(false);
    expect(isMagnet('README.md')).toBe(false);
  });
});

describe('patternBaseDir', () => {
  it('resolves the directory scope of concrete files and globs', () => {
    expect(patternBaseDir('src/render/scene.ts')).toBe('src/render');
    expect(patternBaseDir('src/render/*.ts')).toBe('src/render');
    expect(patternBaseDir('src/**/*.ts')).toBe('src');
    expect(patternBaseDir('foo.ts')).toBe('.');
  });
});

describe('patternsOverlap', () => {
  it('matches exact, glob-covers-file, and file-under-glob cases', () => {
    expect(patternsOverlap('a/b.ts', 'a/b.ts')).toBe(true);
    expect(patternsOverlap('src/render/*.ts', 'src/render/scene.ts')).toBe(true);
    expect(patternsOverlap('src/render/scene.ts', 'src/render/*.ts')).toBe(true);
    expect(patternsOverlap('src/**/*.ts', 'src/sim/tick.ts')).toBe(true);
  });

  it('does not match unrelated paths', () => {
    expect(patternsOverlap('src/a.ts', 'src/b.ts')).toBe(false);
    expect(patternsOverlap('src/render/*.ts', 'src/sim/tick.ts')).toBe(false);
  });
});

describe('classifyOverlap — the severity matrix', () => {
  it('none: no overlap', () => {
    expect(classifyOverlap('src/render/a.ts', 'src/render/b.ts')).toBe('none');
  });

  it('low: broad cross-directory glob overlap on a non-magnet', () => {
    // src/**/*.ts covers src/render/scene.ts but base dirs differ (src vs src/render)
    expect(classifyOverlap('src/render/scene.ts', 'src/misc/deep/*.ts')).toBe('none');
    expect(classifyOverlap('src/**/*.ts', 'src/render/scene.ts')).toBe('low');
  });

  it('medium: same-directory glob overlap on a non-magnet', () => {
    expect(classifyOverlap('src/render/*.ts', 'src/render/scene.ts')).toBe('medium');
  });

  it('high: same exact non-magnet file', () => {
    expect(classifyOverlap('src/render/scene.ts', 'src/render/scene.ts')).toBe('high');
  });

  it('stop: overlap that touches a canonical magnet', () => {
    expect(classifyOverlap('src/scenes/IsoScene.ts', 'src/scenes/IsoScene.ts')).toBe('stop');
    expect(classifyOverlap('src/sim/tick.ts', 'src/sim/tick.ts')).toBe('stop');
  });

  it('stop: a broad glob that reaches into the magnet ui directory', () => {
    expect(classifyOverlap('src/scenes/ui/tooltips.ts', 'src/scenes/ui/*')).toBe('stop');
  });

  it('stop: overlap that touches a churn-discovered magnet', () => {
    expect(classifyOverlap('src/sim/constants.ts', 'src/sim/constants.ts')).toBe('stop');
  });
});

describe('severityRank ordering', () => {
  it('ranks none < low < medium < high < stop', () => {
    const order: Severity[] = ['none', 'low', 'medium', 'high', 'stop'];
    for (let i = 1; i < order.length; i++) {
      expect(severityRank(order[i])).toBeGreaterThan(severityRank(order[i - 1]));
    }
  });
});

describe('computeCollisions — exit code contract', () => {
  const lanes: Lane[] = parseStep0Context(SYNTHETIC_CONTEXT).activeLanes;

  it('exits 1 when a declared file hits a stop magnet (IsoScene.ts)', () => {
    const report = computeCollisions(['src/scenes/IsoScene.ts'], lanes);
    expect(report.exitCode).toBe(1);
    expect(report.maxSeverity).toBe('stop');
    expect(report.overlaps.some((o) => o.severity === 'stop')).toBe(true);
  });

  it('exits 1 when a declared file lands in the magnet ui directory', () => {
    const report = computeCollisions(['src/scenes/ui/statusDashboard.ts'], lanes);
    expect(report.exitCode).toBe(1);
  });

  it('exits 0 on a clean declaration with no stop-level collision', () => {
    const report = computeCollisions(['tools/step0-check.ts', 'docs/NOTES.md'], lanes);
    expect(report.exitCode).toBe(0);
    expect(report.maxSeverity).not.toBe('stop');
  });

  it('exits 0 but still reports lower-severity overlaps (render lane)', () => {
    const report = computeCollisions(['src/render/scene.ts'], lanes);
    expect(report.exitCode).toBe(0);
    // hits render-lane's exact file (high) and its *.ts glob (medium) and broad-lane (low)
    expect(report.overlaps.length).toBeGreaterThan(0);
    expect(report.maxSeverity).toBe('high');
  });

  it('exits 0 with no overlaps when declared files touch nothing owned', () => {
    const report = computeCollisions(['unrelated/thing.md'], lanes);
    expect(report.overlaps).toEqual([]);
    expect(report.exitCode).toBe(0);
    expect(report.maxSeverity).toBe('none');
  });
});
