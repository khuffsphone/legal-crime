// RTS-15 — Fedora Noir visual spec. Pure (no Phaser import), so the palette ROLES, motion
// timings, and state thresholds from docs/VISUAL_DIRECTION.md are encoded once and unit-tested.
// Scenes (cityArt, IsoScene) read these so the look stays consistent and the spec's rules —
// "brass/rival/danger/cash are state-only" and "the two reds never share a role" — are enforced.

/** Named hex ROLES (strings, CANON-friendly). World tones dominate; the rest are STATE-ONLY. */
export const SPEC = {
  // world / structure (~90% of the frame)
  soot: '#16130f',
  brickDark: '#5a241b',
  brickLight: '#7e3326',
  fog: '#9a8f80',
  bone: '#e8e2d4',
  shadow: '#0d0b0a',
  windowLit: '#e8c87a',
  // state / identity — never decoration
  brass: '#b8862b', // player + money/value
  brassDim: '#7c5c1d',
  rival: '#9e1b1b', // rival identity (static)
  danger: '#e11d1d', // danger MOTION only (never a static fill)
  cashGreen: '#4e8b5a', // cash in motion
} as const;

export type SpecRole = keyof typeof SPEC;

/** Roles that are STATE-ONLY — they must never be used as static decoration. */
export const STATE_ONLY_ROLES: SpecRole[] = ['brass', 'rival', 'danger', 'cashGreen'];

/** Convert a "#rrggbb" to a Phaser 0xRRGGBB number. */
export function hexNum(c: string): number {
  return Number.parseInt(c.replace('#', ''), 16);
}

/** Animation loop durations (ms). Motion budget: only a danger loop may be ≤1100ms. */
export const MOTION = {
  loyaltyBob: 2400, // loyal — content
  waverRoll: 3200, // wavering — uneasy
  disloyalPulse: 1800, // disloyal — agitated
  wrongedFlash: 1200, // a member just lost loyalty
  coinSpin: 2600, // protection "%" coin
  selectionPulse: 1400, // selection ring
  cashTrail: 2000, // greenback breadcrumb fade
  bankedPunch: 90, // 1.04x camera punch
  leanBeat: 800, // extort stamp + brick dust
  ambushBeat: 750, // muzzle flash + notes
  dayNight: 9000, // veil drift half-cycle
  // RTS-30e action-motion vocabulary (locomotion idles ≥1300; combat beats are event-driven one-shots,
  // and the KILL flash is the only thing that may move fast — ≤1100, fired ONCE, never a loop).
  idleBreath: 1600, // ambient breath/sway on a still unit (an idle loop, ≥1300)
  walkBob: 520, // footstep bob cadence while moving (event-driven locomotion, not an ambient loop)
  runBob: 340, // faster footstep cadence for an urgent/charging unit
  attackRecoil: 260, // wind-up→swing / aim→fire recoil (one-shot)
  hitFlinch: 220, // struck-unit flinch nudge (one-shot)
  killFlash: 900, // the kill muzzle-flash + screen-nudge — the ONE danger beat (≤1100, once)
  corpseStainFade: 4200, // a corpse settles, then fades to a faint stain decal
} as const;

/** The one allowed fast-loop budget: a loop ≤ this reads as DANGER; calm idles are ≥1300ms. */
export const DANGER_LOOP_MAX_MS = 1100;
export const IDLE_LOOP_MIN_MS = 1300;

/** Whether a loop duration reads as a danger cue (the only thing allowed to move fast). */
export function motionIsDanger(loopMs: number): boolean {
  return loopMs <= DANGER_LOOP_MAX_MS;
}

/** Faction identity colour: brass = the player, rival red = a rival. */
export function factionColor(faction: 'player' | 'rival'): string {
  return faction === 'player' ? SPEC.brass : SPEC.rival;
}

/** The cash satchel grows in three tiers with the carried amount. */
export function satchelTier(carrying: number): 1 | 2 | 3 {
  if (carrying >= 600) return 3;
  if (carrying >= 250) return 2;
  return 1;
}

/** Two-stage danger ring colour: amber while merely threatened, danger-red at ambush range. */
export function dangerStageColor(level: 'safe' | 'threatened' | 'ambush'): string {
  return level === 'ambush' ? SPEC.danger : SPEC.brass;
}

/** Federal ladder tier colour (the 50/70/85 reddening). */
export function federalBarColor(tier: number): string {
  if (tier >= 3) return SPEC.danger;
  if (tier >= 2) return '#b5502a';
  if (tier >= 1) return SPEC.brass;
  return SPEC.brassDim;
}

/** Loyalty-band animation key for the [K] roster. */
export function loyaltyMotion(status: 'loyal' | 'wavering' | 'disloyal'): keyof typeof MOTION {
  return status === 'loyal' ? 'loyaltyBob' : status === 'wavering' ? 'waverRoll' : 'disloyalPulse';
}
