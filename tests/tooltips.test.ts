// Lane — CONTEXTUAL HUD TOOLTIPS. The content map + region helper that feed IsoScene's existing single
// tooltip renderer. Pure data + pure helpers (no Phaser), so it's unit-tested directly. The dossier keys
// must stay in sync with the bottom-strip drawer ids (PanelId).

import { describe, it, expect } from 'vitest';
import { HUD_TIPS, hudTip, tipRegion } from '../src/scenes/ui/tooltips';
import { PANELS } from '../src/scenes/hud/panelState';

describe('HUD_TIPS content map', () => {
  it('covers the consigliere toast and every dossier-strip drawer', () => {
    expect(typeof HUD_TIPS.consigliere).toBe('string');
    // one dossier.* tip per PanelId (wire/turf/paths/crew/finance), kept in sync with the strip.
    for (const p of PANELS) {
      expect(HUD_TIPS[`dossier.${p.id}`], `missing tip for dossier.${p.id}`).toBeTruthy();
    }
  });

  it('every tip is concise plain language (non-empty, not a wall of text)', () => {
    for (const [key, text] of Object.entries(HUD_TIPS)) {
      expect(text.length, `${key} too short`).toBeGreaterThan(12);
      expect(text.length, `${key} too long for a glance`).toBeLessThan(260);
    }
  });
});

describe('hudTip lookup', () => {
  it('returns the explanation for a known key and undefined for an unknown one', () => {
    expect(hudTip('consigliere')).toBe(HUD_TIPS.consigliere);
    expect(hudTip('dossier.wire')).toBe(HUD_TIPS['dossier.wire']);
    expect(hudTip('nope')).toBeUndefined();
  });
});

describe('tipRegion — builds a hudRegions-compatible zone', () => {
  it('returns {x,y,w,h,explain} for a known key', () => {
    const r = tipRegion(12, 236, 300, 60, 'consigliere');
    expect(r).toEqual({ x: 12, y: 236, w: 300, h: 60, explain: HUD_TIPS.consigliere });
  });

  it('returns null for an unknown key so callers can register additively without guarding', () => {
    expect(tipRegion(0, 0, 10, 10, 'dossier.nonexistent')).toBeNull();
  });

  it('maps each dossier chip id to a real region', () => {
    for (const p of PANELS) {
      const r = tipRegion(0, 0, 50, 28, `dossier.${p.id}`);
      expect(r, `no region for dossier.${p.id}`).not.toBeNull();
      expect(r!.explain.length).toBeGreaterThan(12);
    }
  });
});
