// NAMING → BRASSMERE — the user-facing title + city were renamed off "LEGAL CRIME"/"Chicago". These pin the
// display constants (title, city, newspaper masthead) so the old names can't silently creep back. Display
// strings only — the repo slug, package name and code identifiers are intentionally NOT covered.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { GAME_TITLE, CITY_NAME, NEWSPAPER_MASTHEAD, GAME_SUBTITLE } from '../src/scenes/theme';

describe('naming — BRASSMERE everywhere; the city is Brassmere', () => {
  it('the product title is BRASSMERE (no "Legal Crime")', () => {
    expect(GAME_TITLE).toBe('BRASSMERE');
    expect(GAME_TITLE.toLowerCase()).not.toContain('legal crime');
  });

  it('the city is Brassmere (no "Chicago")', () => {
    expect(CITY_NAME).toBe('Brassmere');
    expect(CITY_NAME.toLowerCase()).not.toContain('chicago');
  });

  it('the win newspaper masthead is THE BRASSMERE LEDGER (not THE CHICAGO LEDGER)', () => {
    expect(NEWSPAPER_MASTHEAD).toBe('THE BRASSMERE LEDGER');
    expect(NEWSPAPER_MASTHEAD).not.toContain('CHICAGO');
  });

  it('the subtitle is the Brassmere tagline, NOT the "Fedora Noir" codename (UAT S3)', () => {
    expect(GAME_SUBTITLE).toBe('A Prohibition Noir');
    expect(GAME_SUBTITLE.toLowerCase()).not.toContain('fedora noir');
  });

  it('the browser tab <title> reads Brassmere (no "Legal Crime")', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('<title>Brassmere</title>');
    expect(html.toLowerCase()).not.toContain('<title>legal crime');
  });
});
