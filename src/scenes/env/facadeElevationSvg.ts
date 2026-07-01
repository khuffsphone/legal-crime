// facadeElevationSvg.ts — PURE renderer: a FacadePlan → a flat ELEVATION preview as an SVG string. Phase-1
// visualisation only (the in-engine path skews the plan onto the iso lit-wall — Phase 2). No Phaser, no DOM.
// The elevation is 1:1 in the plan's vertical pixels, with a px ruler and a FIGURE_PX (56) character beside
// the entry so the door-clearance read (doc §9.3) is visible. Colours are the noir kit palette (faction is
// NEVER baked into the body — it lives on the base-plate at runtime).

import type { FacadePlan, FacadeBand, FacadeOpening } from './facadeKit';
import { FIGURE_PX, BAY_RUN_PX } from './facadeKit';

const FILL: Record<string, string> = {
  parapet: '#2b2622',
  brickUpper: '#4a3b30',
  signHost: '#1a1611',
  transom: '#3a2f27',
  glass: '#d9a441',
  storefrontBar: '#241d17',
};
const BRASS = '#b8862b';
const BRASS_HI = '#e3c36a';
const AMBER = '#e0b04a';
const INK = '#14110f';
const MORTAR = '#6a584a';
const BONE = '#cbb78f';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bandSvg(b: FacadeBand, w: number): string {
  const fill = FILL[b.role] ?? '#3a2f27';
  let s = `<rect x="0" y="${b.yTopPx}" width="${w}" height="${b.hPx}" fill="${fill}"/>`;
  if (b.role === 'brickUpper') {
    // running-bond mortar courses every ~8px
    for (let yy = b.yTopPx + 8; yy < b.yTopPx + b.hPx; yy += 8) {
      s += `<line x1="0" y1="${yy}" x2="${w}" y2="${yy}" stroke="${MORTAR}" stroke-width="1" opacity="0.35"/>`;
    }
  }
  if (b.role === 'parapet') {
    s += `<rect x="0" y="${b.yTopPx + b.hPx - 4}" width="${w}" height="4" fill="${BRASS}" opacity="0.85"/>`;
  }
  return s;
}

function openingSvg(o: FacadeOpening): string {
  if (o.role === 'glass' || o.role === 'window') {
    const isSign = o.bayIndex === -1;
    const fill = isSign ? INK : AMBER;
    let s = `<rect x="${o.xPx}" y="${o.yBottomPx - o.hPx}" width="${o.wPx}" height="${o.hPx}" fill="${fill}"/>`;
    if (isSign) {
      s += `<rect x="${o.xPx}" y="${o.yBottomPx - o.hPx}" width="${o.wPx}" height="${o.hPx}" fill="none" stroke="${BRASS}" stroke-width="1.5"/>`;
    } else {
      s += `<rect x="${o.xPx}" y="${o.yBottomPx - o.hPx}" width="${o.wPx}" height="${o.hPx}" fill="none" stroke="${BRASS}" stroke-width="1" opacity="0.6"/>`;
    }
    return s;
  }
  // door
  return `<rect x="${o.xPx}" y="${o.yBottomPx - o.hPx}" width="${o.wPx}" height="${o.hPx}" fill="${INK}" stroke="${BRASS}" stroke-width="1.5"/>`;
}

/** A tiny standing-figure silhouette FIGURE_PX tall, feet at (footX, groundY). Proves door clearance. */
function figureSvg(footX: number, groundY: number): string {
  const h = FIGURE_PX;
  const top = groundY - h;
  const headR = 5;
  return [
    `<g opacity="0.9">`,
    `<ellipse cx="${footX}" cy="${groundY + 2}" rx="10" ry="3" fill="#000" opacity="0.4"/>`,           // shadow
    `<rect x="${footX - 6}" y="${top + headR * 2}" width="12" height="${h - headR * 2 - 8}" rx="3" fill="#36383f"/>`, // coat
    `<rect x="${footX - 6}" y="${groundY - 8}" width="5" height="8" fill="#2e3138"/>`,                  // leg L
    `<rect x="${footX + 1}" y="${groundY - 8}" width="5" height="8" fill="#2e3138"/>`,                  // leg R
    `<circle cx="${footX}" cy="${top + headR}" r="${headR}" fill="#c9a57e"/>`,                          // head
    `<rect x="${footX - 7}" y="${top + headR - 2}" width="14" height="3" fill="#241d17"/>`,             // fedora brim
    `<rect x="${footX - 4}" y="${top - 3}" width="8" height="5" fill="#241d17"/>`,                      // crown
    `</g>`,
  ].join('');
}

export interface ElevationSvgOpts {
  /** left margin for the px ruler. */
  rulerW?: number;
  /** show the FIGURE_PX character beside the entry. */
  showFigure?: boolean;
  title?: string;
}

/** Render a FacadePlan as a standalone elevation SVG string (viewable in any browser). Pure. */
export function facadeElevationSvg(plan: FacadePlan, opts: ElevationSvgOpts = {}): string {
  const rulerW = opts.rulerW ?? 44;
  const figW = opts.showFigure === false ? 0 : 40;
  const pad = 16;
  const W = rulerW + plan.widthPx + figW + pad * 2;
  const H = plan.heightPx + pad * 2 + 22;
  const ox = rulerW + pad;
  const oy = pad + 14;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="monospace">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#0e0c0b"/>`);
  if (opts.title) parts.push(`<text x="${ox}" y="12" fill="${BONE}" font-size="11">${esc(opts.title)}</text>`);

  // px ruler down the left (every V_SNAP*... marks; label every 20px)
  parts.push(`<g stroke="${MORTAR}" opacity="0.5">`);
  for (let d = 0; d <= plan.heightPx; d += 20) {
    const y = oy + d;
    parts.push(`<line x1="${ox - 6}" y1="${y}" x2="${ox}" y2="${y}"/>`);
  }
  parts.push(`</g><g fill="${BONE}" font-size="8">`);
  for (let d = 0; d <= plan.heightPx; d += 20) {
    parts.push(`<text x="4" y="${oy + (plan.heightPx - d) + 3}">${d}px</text>`); // 0 at ground, up the wall
  }
  parts.push(`</g>`);

  // the facade
  parts.push(`<g transform="translate(${ox},${oy})">`);
  for (const b of plan.bands) parts.push(bandSvg(b, plan.widthPx));
  for (const o of plan.openings) parts.push(openingSvg(o));
  // bay separators (pilaster hints) + a brass ground line
  parts.push(`<g stroke="${BRASS}" opacity="0.35">`);
  for (let b = 1; b < plan.frontageTiles; b++) {
    parts.push(`<line x1="${b * BAY_RUN_PX}" y1="0" x2="${b * BAY_RUN_PX}" y2="${plan.heightPx}" stroke-width="1"/>`);
  }
  parts.push(`</g>`);
  parts.push(`<line x1="0" y1="${plan.heightPx}" x2="${plan.widthPx}" y2="${plan.heightPx}" stroke="${BRASS_HI}" stroke-width="1.5" opacity="0.6"/>`);
  parts.push(`</g>`);

  // scale figure beside the entry (feet on the ground line)
  if (opts.showFigure !== false) {
    parts.push(figureSvg(ox + plan.widthPx + 20, oy + plan.heightPx));
  }

  parts.push(`</svg>`);
  return parts.join('');
}
