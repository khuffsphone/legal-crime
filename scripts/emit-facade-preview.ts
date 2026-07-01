// Emit low-tier facade ELEVATION previews (SVG) from the pure kit — a Phase-1 visual proof of the corrected
// tile-calibrated constants. Run: npx vite-node scripts/emit-facade-preview.ts
// Writes docs/env-kit/preview/*.svg. Pure/offline; not part of the app bundle.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeLowTierFacade, type LowTierOptions } from '../src/scenes/env/facadeKit';
import { facadeElevationSvg } from '../src/scenes/env/facadeElevationSvg';

const OUT = join(process.cwd(), 'docs', 'env-kit', 'preview');
mkdirSync(OUT, { recursive: true });

const variants: Array<{ name: string; title: string; opts: LowTierOptions }> = [
  { name: 'low_2fl_glass_2bay', title: 'LOW · 2 floors · glass storefront · 2-bay · commercial door', opts: { floors: 2, frontageTiles: 2, storefront: 'glass', door: 'commercial' } },
  { name: 'low_1fl_bar_3bay', title: 'LOW · 1 floor · bar/opaque front · 3-bay · residential door', opts: { floors: 1, frontageTiles: 3, storefront: 'bar', door: 'residential' } },
  { name: 'low_2fl_glass_3bay', title: 'LOW · 2 floors · glass storefront · 3-bay · commercial door', opts: { floors: 2, frontageTiles: 3, storefront: 'glass', door: 'commercial' } },
];

for (const v of variants) {
  const plan = composeLowTierFacade(v.opts);
  const svg = facadeElevationSvg(plan, { title: v.title, showFigure: true });
  const path = join(OUT, `${v.name}.svg`);
  writeFileSync(path, svg);
  console.log(`wrote ${path}  (${plan.widthPx}×${plan.heightPx}px, ${plan.bands.length} bands, ${plan.openings.length} openings)`);
}
console.log('DONE');
