// OPERATION-OUTCOME PREVIEWS · RENDER FORMATTER (Phaser-free, testable). Turns a pure OpPreview view-model
// into drawable rows — this is where the TONE → COLOUR mapping lives, in ONE place, reading the existing
// palette (no new colour constants). The colour LAW:
//   • good   → brass (the player's money/win colour)
//   • risk   → war-amber (the contested/warning colour) — NOT static danger-red identity
//   • block  → danger — but only ever on this TRANSIENT hover card (appears/clears with the cursor), never
//     a persistent wash; the danger colour stays a MOTION/attention beat, not a static label on the map
//   • neutral→ bone (a plain readout)
// The card itself (a hover-driven overlay that fades in/out) is the motion; the rows inside are its content.

import type { OpPreview, PreviewRow, PreviewTone } from '../sim/opPreviewTypes';

/** The four palette hooks the formatter needs — supplied by the scene from the existing SPEC/NOIR tables. */
export interface PreviewPalette {
  brass: string;
  amber: string;
  danger: string;
  bone: string;
}

/** A drawable row: humanised text + the resolved colour + whether it is a heading-weight line. */
export interface PreviewLine {
  text: string;
  color: string;
  bold: boolean;
}

/** Map a row tone to a palette colour (the single source of the colour law for previews). */
export function toneColor(tone: PreviewTone | undefined, pal: PreviewPalette): string {
  switch (tone) {
    case 'good': return pal.brass;
    case 'risk': return pal.amber;
    case 'block': return pal.danger;
    default: return pal.bone;
  }
}

function rowLine(r: PreviewRow, pal: PreviewPalette): PreviewLine {
  return { text: `${r.label}: ${r.value}`, color: toneColor(r.tone, pal), bold: false };
}

/**
 * Flatten a preview into drawable lines. The GLANCE card is the title + the ≤4 glance rows; HOLD-ALT appends
 * a divider + the detail rows. A blocked preview still renders (its glance leads with the blocker), so the
 * player always sees WHY an order is refused — never a dead, silent verb.
 */
export function formatPreviewLines(preview: OpPreview, showDetail: boolean, pal: PreviewPalette): PreviewLine[] {
  const lines: PreviewLine[] = [
    { text: preview.title.toUpperCase(), color: preview.blocked ? pal.danger : pal.brass, bold: true },
  ];
  for (const r of preview.glance) lines.push(rowLine(r, pal));
  if (showDetail && preview.detail.length > 0) {
    lines.push({ text: '— hold detail —', color: pal.bone, bold: false });
    for (const r of preview.detail) lines.push(rowLine(r, pal));
  } else if (preview.detail.length > 0) {
    lines.push({ text: '[ALT] for detail', color: pal.bone, bold: false });
  }
  return lines;
}
