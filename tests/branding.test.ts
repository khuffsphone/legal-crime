// BRASSMERE — the title rename regression lock. The working title is BRASSMERE; this pins the display-title
// constant so the menu/window/legend wordmarks can't silently revert to the old "Legal Crime / Fedora Noir".
import { describe, it, expect } from 'vitest';
import { GAME_TITLE, GAME_SUBTITLE } from '../src/scenes/branding';

describe('BRASSMERE display title', () => {
  it('the display-title constant is "Brassmere"', () => {
    expect(GAME_TITLE).toBe('Brassmere');
  });

  it('has a non-empty subtitle wordmark', () => {
    expect(GAME_SUBTITLE.length).toBeGreaterThan(0);
  });

  it('carries none of the retired public branding (Legal Crime / Fedora)', () => {
    const blob = `${GAME_TITLE} ${GAME_SUBTITLE}`.toLowerCase();
    expect(blob).not.toContain('legal crime');
    expect(blob).not.toContain('fedora');
  });
});
