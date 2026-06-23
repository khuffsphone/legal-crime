// RTS-30a — DISTRICT STATUS (the reworked "control"). Pure & deterministic; imports NO Phaser.
// ⚠ CANON CHANGE: control is no longer a spend-to-extort budget (that meter is RETIRED) — it is now
// a STATUS READOUT: which districts you HOLD (≥ a threshold of their businesses extorted/owned), are
// ESTABLISHING, are NEUTRAL, or a RIVAL holds. This is the board state the future turf war (RTS-30c)
// hangs on; CONTESTED is reserved for that slice. No gating happens here — pacing comes from space +
// slow movement, not a control spend.

import { HOLD_THRESHOLD } from './constants';
import { businessEarner } from './economy';
import type { District, GameState } from './types';

export type DistrictHoldStatus = 'HELD' | 'ESTABLISHING' | 'NEUTRAL' | 'RIVAL' | 'CONTESTED';

export interface DistrictRow {
  id: string;
  name: string;
  status: DistrictHoldStatus;
  /** Player businesses held / total in the district. */
  bizHeld: number;
  bizTotal: number;
  /** 0..1 player share. */
  pct: number;
  /** The owning family id when HELD/RIVAL, else null. */
  owner: string | null;
  ownerName: string | null;
  /** A plain-English tag for the row ("✓ secure", "establishing 40%", their family name…). */
  tag: string;
  /** Pip glyph: ●(held/rival) ◐(establishing) ○(neutral). */
  pip: '●' | '◐' | '○';
}

function rivalShare(state: GameState, d: District): { id: string; name: string; held: number } {
  const counts = new Map<string, number>();
  for (const b of d.businesses) {
    const e = businessEarner(b);
    if (e && e !== state.player.id) counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  let best = { id: '', name: '', held: 0 };
  for (const [id, held] of counts) if (held > best.held) {
    const fam = state.rivals.find((r) => r.id === id);
    best = { id, name: fam?.name ?? id, held };
  }
  return best;
}

/** The status row for one district under the new vocabulary. Pure read. */
export function districtStatusOf(state: GameState, districtId: string): DistrictRow | null {
  const d = state.districts.find((x) => x.id === districtId);
  if (!d) return null;
  const total = d.businesses.length;
  const held = d.businesses.filter((b) => businessEarner(b) === state.player.id).length;
  const pct = total > 0 ? held / total : 0;
  const rival = rivalShare(state, d);
  const rivalPct = total > 0 ? rival.held / total : 0;

  // RTS-30c-1: an active turf-war contest overrides the at-rest status — the district reads CONTESTED
  // (amber) so the player sees the war at a glance; bizHeld/pct stay the inspectable truth underneath.
  const contested = !!state.contests?.some((c) => c.districtId === d.id);

  let status: DistrictHoldStatus, owner: string | null = null, ownerName: string | null = null, tag: string, pip: DistrictRow['pip'];
  if (contested) {
    const leadByPlayer = held >= rival.held;
    status = 'CONTESTED';
    owner = leadByPlayer ? state.player.id : (rival.id || null);
    ownerName = leadByPlayer ? state.player.name : (rival.name || null);
    tag = `⚔ contested ${Math.round(pct * 100)}%`;
    pip = '◐';
  } else if (total > 0 && pct >= HOLD_THRESHOLD) {
    status = 'HELD'; owner = state.player.id; ownerName = state.player.name; tag = '✓ secure'; pip = '●';
  } else if (total > 0 && rivalPct >= HOLD_THRESHOLD && rival.held > held) {
    status = 'RIVAL'; owner = rival.id; ownerName = rival.name; tag = rival.name.replace('The ', ''); pip = '●';
  } else if (held > 0) {
    status = 'ESTABLISHING'; tag = `establishing ${Math.round(pct * 100)}%`; pip = '◐';
  } else {
    status = 'NEUTRAL'; tag = ''; pip = '○';
  }
  return { id: d.id, name: d.name, status, bizHeld: held, bizTotal: total, pct, owner, ownerName, tag, pip };
}

/** The whole-city roster (THE CITY — WHAT'S YOURS), in district order. Pure read. */
export function cityRoster(state: GameState): DistrictRow[] {
  return state.districts.map((d) => districtStatusOf(state, d.id)).filter((r): r is DistrictRow => r !== null);
}

export interface CitySummary { held: number; total: number; contested: number; rival: number; establishing: number; }

/** The one-glance summary line: held/total districts, contested, rival-held. */
export function citySummary(state: GameState): CitySummary {
  const rows = cityRoster(state);
  return {
    total: rows.length,
    held: rows.filter((r) => r.status === 'HELD').length,
    contested: rows.filter((r) => r.status === 'CONTESTED').length,
    rival: rows.filter((r) => r.status === 'RIVAL').length,
    establishing: rows.filter((r) => r.status === 'ESTABLISHING').length,
  };
}
