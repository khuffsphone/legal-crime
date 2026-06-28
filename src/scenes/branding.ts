// BRASSMERE — user-facing BRAND strings (the single source of truth for the on-screen title/subtitle).
// Pure data, no Phaser — so the regression test imports it directly.
//
// Scope note: this is a DISPLAY rename, not a project rename. "Fedora Noir" remains the LOCKED internal
// aesthetic codename throughout the code (palette/identifiers like NOIR_PALETTE, NOIR_DISPLAY, the `noir`
// art direction) and the docs/CANON; the GitHub repo slug (legal-crime) and the npm package name are also
// unchanged. Only the wordmarks the player actually reads point at BRASSMERE.
//
// The subtitle is a single constant — trivially retunable if the final tagline changes.

/** The display title (proper-noun case). Menu/boot render it upper-cased; the window title uses it as-is. */
export const GAME_TITLE = 'Brassmere';

/** The wordmark subtitle line (succeeds the old "Fedora Noir" line; keeps the locked noir aesthetic). */
export const GAME_SUBTITLE = 'A Prohibition Noir';
