// Lane G — the CENTRAL KEYBIND MAP. Single source of truth for the REMAPPABLE actions' keys, plus the
// conflict logic that makes a remap SAFE. Pure & dependency-free (no Phaser, no browser globals), so it
// unit-tests cleanly. The input layer (IsoScene) resolves each remappable action's key from here; the
// SettingsPanel reads/writes it; persistence lives in settings.ts.
//
// THE "NO NEW CONFLICTS" GUARANTEE: a great many keys are already bound by the engine (panels, combat,
// digits, system). Rather than rebuild the entire input layer, Lane G exposes a curated set of single-
// purpose REMAPPABLE actions, and `applyRemap` REFUSES any target key that is reserved by the engine or
// already held by another remappable action. A new collision therefore can never be introduced.

/** The actions a player may rebind. Deliberately a curated, single-purpose subset — the structural keys
 * (digits/verbs 1-6, Ctrl+digit groups, Tab, Space, Esc, F5/F9, combat S/I/A, panel toggles) keep their
 * fixed bindings and are treated as RESERVED below. */
export type KeyAction =
  | 'extort'
  | 'collect'
  | 'reinvest'
  | 'grease'
  | 'frameCity'
  | 'centerSelection'
  | 'jumpToAlert'
  | 'skipWeek';

export const KEY_ACTIONS: readonly KeyAction[] = [
  'extort', 'collect', 'reinvest', 'grease', 'frameCity', 'centerSelection', 'jumpToAlert', 'skipWeek',
];

export const KEY_ACTION_LABELS: Record<KeyAction, string> = {
  extort: 'Extort front',
  collect: 'Collect take',
  reinvest: 'Reinvest',
  grease: 'Grease a channel',
  frameCity: 'Frame the city',
  centerSelection: 'Center on selection',
  jumpToAlert: 'Jump to latest alert',
  skipWeek: 'Skip the week',
};

/** Phaser keydown TOKENS (the part after `keydown-`). Letters are A–Z; `.` is PERIOD. These mirror the
 * literals IsoScene registers, so resolving a binding to its token plugs straight into `keyboard.on`. */
export const DEFAULT_KEYBINDS: Record<KeyAction, string> = {
  extort: 'E',
  collect: 'C',
  reinvest: 'R',
  grease: 'G',
  frameCity: 'Z',
  centerSelection: 'D',
  jumpToAlert: 'Q',
  skipWeek: 'PERIOD',
};

/** Keys the engine binds to NON-remappable actions (panels, combat, system, digits, camera, pacing). A
 * remap target landing on any of these is refused — that's how the guarantee covers the WHOLE keymap, not
 * just the remappable subset. (The remappable defaults E/C/R/G/Z/D/Q/PERIOD are owned by the map, so they
 * are intentionally NOT listed here.) */
export const RESERVED_KEYS: readonly string[] = [
  // panel toggles & misc command letters
  'F', 'S', 'I', 'A', 'T', 'L', 'K', 'H', 'B', 'V', 'O', 'X', 'U', 'M', 'N', 'Y', 'J', 'P', 'W',
  // system / camera / pacing — incl. the cursor keys polled every frame for camera pan, and the bare
  // modifiers (binding a lone modifier would collide with Shift+Tab / marquee-add, or be a dead key).
  'SPACE', 'ESC', 'TAB', 'ALT', 'CTRL', 'SHIFT', 'META', 'BACKTICK', 'PLUS', 'EQUALS', 'MINUS',
  'UP', 'DOWN', 'LEFT', 'RIGHT',
  // digits (verbs / control groups) + mute
  'ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  // reserved for save/load even though unbound on this base
  'F5', 'F9',
];

const DIGIT_TOKEN: Record<string, string> = {
  '0': 'ZERO', '1': 'ONE', '2': 'TWO', '3': 'THREE', '4': 'FOUR',
  '5': 'FIVE', '6': 'SIX', '7': 'SEVEN', '8': 'EIGHT', '9': 'NINE',
};

const PUNCT_TOKEN: Record<string, string> = {
  '.': 'PERIOD', ',': 'COMMA', '/': 'FORWARD_SLASH', ';': 'SEMICOLON', "'": 'QUOTES',
  '[': 'OPEN_BRACKET', ']': 'CLOSED_BRACKET', '\\': 'BACK_SLASH', '`': 'BACKTICK',
  '-': 'MINUS', '=': 'EQUALS', '+': 'PLUS', ' ': 'SPACE',
};

const NAMED_TOKEN: Record<string, string> = {
  ' ': 'SPACE', 'SPACEBAR': 'SPACE', 'SPACE': 'SPACE',
  'ESCAPE': 'ESC', 'ESC': 'ESC', 'TAB': 'TAB', 'ENTER': 'ENTER', 'RETURN': 'ENTER',
  'BACKSPACE': 'BACKSPACE', 'DELETE': 'DELETE', 'DEL': 'DELETE',
  'ARROWUP': 'UP', 'ARROWDOWN': 'DOWN', 'ARROWLEFT': 'LEFT', 'ARROWRIGHT': 'RIGHT',
  'ALT': 'ALT', 'CONTROL': 'CTRL', 'CTRL': 'CTRL', 'SHIFT': 'SHIFT', 'META': 'META',
};

/** Normalise a raw key (a `KeyboardEvent.key`, or a stored token) to a canonical Phaser keydown token.
 * Returns '' for anything we won't bind (so callers can reject it). Pure. */
export function normalizeKey(raw: string): string {
  if (!raw) return '';
  if (raw === ' ' || raw === 'Spacebar') return 'SPACE'; // the space key trims to empty otherwise
  const s = raw.trim();
  if (s.length === 0) return '';
  if (s.length === 1) {
    const u = s.toUpperCase();
    if (u >= 'A' && u <= 'Z') return u;
    if (u >= '0' && u <= '9') return DIGIT_TOKEN[u];
    return PUNCT_TOKEN[s] ?? '';
  }
  const up = s.toUpperCase();
  if (NAMED_TOKEN[up]) return NAMED_TOKEN[up];
  // already a canonical token (e.g. 'PERIOD', 'OPEN_BRACKET') or a single function key (F1..F12)
  if (/^[A-Z][A-Z0-9_]*$/.test(up)) return up;
  return '';
}

/** A short human label for a token, for the settings UI ('PERIOD' → '.', 'E' → 'E'). Pure. */
export function keyLabel(token: string): string {
  const k = normalizeKey(token);
  if (!k) return '—';
  const inv: Record<string, string> = {
    PERIOD: '.', COMMA: ',', FORWARD_SLASH: '/', SEMICOLON: ';', QUOTES: "'",
    OPEN_BRACKET: '[', CLOSED_BRACKET: ']', BACK_SLASH: '\\', BACKTICK: '`',
    MINUS: '-', EQUALS: '=', PLUS: '+', SPACE: 'Space', ESC: 'Esc', TAB: 'Tab',
    ENTER: 'Enter', BACKSPACE: 'Backspace', DELETE: 'Del',
    UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→',
  };
  return inv[k] ?? k;
}

/** The effective key for each action: the defaults overlaid with any VALID persisted remap. Any invalid
 * remap (reserved key, or one that would duplicate another action) is dropped, so the resolved map is
 * ALWAYS conflict-free — even if localStorage was hand-edited to a bad state. Pure. */
export function resolveKeybinds(remaps?: Partial<Record<KeyAction, string>> | null): Record<KeyAction, string> {
  const map: Record<KeyAction, string> = { ...DEFAULT_KEYBINDS };
  if (!remaps) return map;
  for (const action of KEY_ACTIONS) {
    const want = remaps[action];
    if (!want) continue;
    const key = normalizeKey(want);
    if (!key) continue;
    if (RESERVED_KEYS.includes(key)) continue;
    const takenBy = KEY_ACTIONS.find((a) => a !== action && map[a] === key);
    if (takenBy) continue;
    map[action] = key;
  }
  return map;
}

/** Why `key` cannot be bound to `action` given the current map — or null if it is a legal remap. Pure. */
export function keybindConflict(
  map: Record<KeyAction, string>,
  action: KeyAction,
  key: string,
): string | null {
  const k = normalizeKey(key);
  if (!k) return 'unrecognised key';
  if (RESERVED_KEYS.includes(k)) return `${keyLabel(k)} is reserved by the game`;
  const clash = KEY_ACTIONS.find((a) => a !== action && map[a] === k);
  if (clash) return `${keyLabel(k)} is already bound to ${KEY_ACTION_LABELS[clash]}`;
  return null;
}

export interface RemapResult {
  ok: boolean;
  map: Record<KeyAction, string>;
  reason?: string;
}

/** Apply a remap, REFUSING on any conflict so a new collision can never be introduced. On success returns
 * a fresh map; on failure returns the unchanged map plus the human reason. Pure. */
export function applyRemap(map: Record<KeyAction, string>, action: KeyAction, key: string): RemapResult {
  const why = keybindConflict(map, action, key);
  if (why) return { ok: false, map, reason: why };
  return { ok: true, map: { ...map, [action]: normalizeKey(key) } };
}

/** Reset one action to its factory key (always legal — defaults are conflict-free by construction). Pure. */
export function resetKeybind(map: Record<KeyAction, string>, action: KeyAction): Record<KeyAction, string> {
  return { ...map, [action]: DEFAULT_KEYBINDS[action] };
}

/** Any duplicate-key collisions in a map. A resolved/default map always returns []; used by tests and as a
 * defensive check. Pure. */
export function keybindConflicts(map: Record<KeyAction, string>): Array<{ key: string; actions: KeyAction[] }> {
  const byKey = new Map<string, KeyAction[]>();
  for (const a of KEY_ACTIONS) {
    const arr = byKey.get(map[a]) ?? [];
    arr.push(a);
    byKey.set(map[a], arr);
  }
  return [...byKey.entries()].filter(([, as]) => as.length > 1).map(([key, actions]) => ({ key, actions }));
}

/** The remap overlay to persist: only the entries that DIFFER from the factory default (keeps the saved
 * blob minimal and lets future default changes flow through). Pure. */
export function remapOverlay(map: Record<KeyAction, string>): Partial<Record<KeyAction, string>> {
  const out: Partial<Record<KeyAction, string>> = {};
  for (const a of KEY_ACTIONS) if (map[a] !== DEFAULT_KEYBINDS[a]) out[a] = map[a];
  return out;
}
