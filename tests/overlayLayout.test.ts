// OVERLAY LAYOUT (B2) — the intro/help panel must size to its content so text never overflows the border.
// The playtest bug was a FIXED-size panel (600×396) with a body that grew past it. These assert the panel
// always CONTAINS its blocks, including a tall body and across the supported UI-scale range (0.8–1.0).
import { describe, it, expect } from 'vitest';
import { fitOverlayPanel, panelContains, type TextSize } from '../src/scenes/overlayLayout';

const TITLE: TextSize = { w: 280, h: 26 };
const BODY: TextSize = { w: 540, h: 360 };   // the long help body (the block that used to overflow)
const HINT: TextSize = { w: 150, h: 18 };
const BLOCKS = [TITLE, BODY, HINT];

describe('fitOverlayPanel — the border contains every block (no overflow)', () => {
  it('panel is at least as wide/tall as the content plus padding', () => {
    const { panelW, panelH, ys } = fitOverlayPanel(BLOCKS, { padX: 30, padY: 22, gap: 10 });
    expect(panelW).toBeGreaterThanOrEqual(540 + 60);          // widest block + 2·padX
    expect(panelH).toBeGreaterThanOrEqual(26 + 360 + 18 + 44); // all blocks + 2·padY (+gaps)
    expect(panelContains(panelW, panelH, BLOCKS, ys)).toBe(true);
  });

  it('a body BIGGER than the old fixed 600×396 panel still fits (the exact regression)', () => {
    const huge = [TITLE, { w: 720, h: 520 }, HINT];
    const { panelW, panelH, ys } = fitOverlayPanel(huge);
    expect(panelContains(panelW, panelH, huge, ys)).toBe(true);
    expect(panelH).toBeGreaterThan(396); // would have overflowed the old fixed panel
  });

  it('blocks are stacked top→bottom inside the border in order', () => {
    const { ys } = fitOverlayPanel(BLOCKS, { gap: 10 });
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });

  it('contains across the UI-scale range (0.8–1.0) — scaling content + panel uniformly preserves the fit', () => {
    for (const scale of [0.8, 0.9, 1.0]) {
      const scaled = BLOCKS.map((b) => ({ w: b.w * scale, h: b.h * scale }));
      const { panelW, panelH, ys } = fitOverlayPanel(scaled, { padX: 30, padY: 22, gap: 10 });
      expect(panelContains(panelW, panelH, scaled, ys)).toBe(true);
    }
  });
});
