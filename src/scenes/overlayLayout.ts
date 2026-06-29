// OVERLAY LAYOUT — pure (Phaser-free) sizing for the intro/help OVERLAY panel (B2). The panel's border must be
// sized to its CONTENT so text never overflows the box (the playtest bug was a fixed-size panel with a body
// that grew past it). The scene measures its text blocks, this fits a panel around them, and the result is
// guaranteed to CONTAIN every block — at any UI scale, since uniform scaling preserves containment.

export interface TextSize { w: number; h: number; }

export interface OverlayLayout {
  /** Panel border size (centred on the overlay origin). */
  panelW: number;
  panelH: number;
  /** The TOP-edge y of each stacked element, in panel-centre coordinates (each element is centred on x=0 with
   * its originY at the top). ys[i] corresponds to sizes[i]. */
  ys: number[];
}

export interface OverlayFitOpts {
  /** Horizontal padding inside the border. */
  padX?: number;
  /** Vertical padding inside the border. */
  padY?: number;
  /** Vertical gap between stacked elements. */
  gap?: number;
}

/**
 * Stack the measured text blocks vertically and size a panel to CONTAIN them with padding (B2). The returned
 * panel always contains every block (panelW ≥ widest block + 2·padX; panelH spans all blocks + gaps + 2·padY).
 * Blocks are centred on x=0 with originY at the top; ys[i] is the top of block i. Pure.
 */
export function fitOverlayPanel(sizes: readonly TextSize[], opts: OverlayFitOpts = {}): OverlayLayout {
  const padX = opts.padX ?? 28, padY = opts.padY ?? 22, gap = opts.gap ?? 12;
  const contentW = sizes.reduce((m, s) => Math.max(m, s.w), 0);
  const contentH = sizes.reduce((sum, s) => sum + s.h, 0) + gap * Math.max(0, sizes.length - 1);
  const panelW = contentW + padX * 2;
  const panelH = contentH + padY * 2;
  const ys: number[] = [];
  let y = -panelH / 2 + padY;
  for (const s of sizes) { ys.push(y); y += s.h + gap; }
  return { panelW, panelH, ys };
}

/**
 * Whether a panel (centred at origin) fully contains a stacked block of `sizes` placed at `ys` (each centred on
 * x=0, originY at the top) — i.e. no text overflows the border. Used by tests to assert the no-overflow
 * invariant across content sizes / UI scales. Pure.
 */
export function panelContains(panelW: number, panelH: number, sizes: readonly TextSize[], ys: readonly number[]): boolean {
  const eps = 1e-6;
  const halfW = panelW / 2, top = -panelH / 2, bottom = panelH / 2;
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i], y = ys[i];
    if (s.w / 2 > halfW + eps) return false;     // horizontal overflow
    if (y < top - eps) return false;             // above the top border
    if (y + s.h > bottom + eps) return false;    // below the bottom border
  }
  return true;
}
