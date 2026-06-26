// OPERATION-OUTCOME PREVIEWS · RENDER FORMATTER (state/math — never pixels). The tone→colour law maps in one
// place; the glance card carries the title + glance rows; HOLD-ALT appends the detail; a blocked preview
// still renders its blocker (never a silent dead verb).
import { describe, it, expect } from 'vitest';
import { formatPreviewLines, toneColor, type PreviewPalette } from '../src/scenes/operationPreview';
import type { OpPreview } from '../src/sim/opPreviewTypes';

const PAL: PreviewPalette = { brass: '#B', amber: '#A', danger: '#D', bone: '#N' };

const sample: OpPreview = {
  verb: 'extort_front', title: 'Extort front', blocked: false,
  glance: [
    { label: 'Result', value: 'front folds → it pays you', tone: 'good' },
    { label: 'Then', value: '+4 heat/tick', tone: 'risk' },
  ],
  detail: [{ label: 'Certainty', value: '100% on completion', tone: 'neutral' }],
};

describe('tone → colour law (single source)', () => {
  it('good=brass, risk=amber, block=danger, neutral/undefined=bone', () => {
    expect(toneColor('good', PAL)).toBe('#B');
    expect(toneColor('risk', PAL)).toBe('#A');
    expect(toneColor('block', PAL)).toBe('#D');
    expect(toneColor('neutral', PAL)).toBe('#N');
    expect(toneColor(undefined, PAL)).toBe('#N');
  });
});

describe('glance vs HOLD-ALT detail', () => {
  it('glance only → title + glance rows + an [ALT] hint, no detail rows', () => {
    const lines = formatPreviewLines(sample, false, PAL);
    expect(lines[0].text).toBe('EXTORT FRONT');
    expect(lines[0].bold).toBe(true);
    expect(lines.some((l) => /front folds/.test(l.text))).toBe(true);
    expect(lines.some((l) => /\[ALT\] for detail/.test(l.text))).toBe(true);
    expect(lines.some((l) => /100% on completion/.test(l.text))).toBe(false); // detail hidden
  });
  it('hold detail → the detail rows appear under a divider', () => {
    const lines = formatPreviewLines(sample, true, PAL);
    expect(lines.some((l) => /100% on completion/.test(l.text))).toBe(true);
  });
  it('the risk row resolves to the amber (warning) colour, not static danger', () => {
    const lines = formatPreviewLines(sample, false, PAL);
    const risk = lines.find((l) => /heat\/tick/.test(l.text));
    expect(risk?.color).toBe('#A');
  });
});

describe('a blocked preview still renders its blocker (never a silent dead verb)', () => {
  it('title goes danger-coloured and the blocker shows', () => {
    const blocked: OpPreview = {
      verb: 'federal_heat_action', title: 'Federal lockout', blocked: true, blocker: 'need The Bureau ≥ 20',
      glance: [{ label: 'Blocked', value: 'need The Bureau ≥ 20', tone: 'block' }], detail: [],
    };
    const lines = formatPreviewLines(blocked, false, PAL);
    expect(lines[0].color).toBe('#D');
    expect(lines.some((l) => /need The Bureau/.test(l.text))).toBe(true);
  });
});
