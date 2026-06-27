import { describe, it, expect } from 'vitest';
import {
  telegraphTier,
  countFriendlyNear,
  targetRevealed,
  buildTelegraphReport,
  telegraphLeadMs,
  telegraphPressureRow,
  severityLabel,
  resolveStrike,
  TELEGRAPH_PRESENCE_RADIUS,
  TELEGRAPH_SUSPECTED_MUSCLE,
  TELEGRAPH_CONFIRMED_MUSCLE,
  TELEGRAPH_TIER_LEAD_BONUS_MS,
  type PlayerIntel,
  type TelegraphReport,
} from '../src/sim/telegraph';
import { createFog, revealAround } from '../src/sim/fog';
import { UNKNOWN, VISIBLE_ONLY } from '../src/sim/opPreviewTypes';
import { RIVAL_RETREAT_TUNING, strikeLeadMs } from '../src/sim/rivalOffense';

const intel = (p: Partial<PlayerIntel>): PlayerIntel => ({
  friendlyNearby: 0, targetRevealed: false, controlsDistrict: false, ...p,
});

// ── VISIBILITY TIERS gate correctly ─────────────────────────────────────────────────────────────────────
describe('visibility tiers — graduate by the player\'s OWN intel', () => {
  it('rumor when blind: no eyes-on, no nearby muscle, not your block', () => {
    expect(telegraphTier(intel({}))).toBe('rumor');
  });

  it('suspected on ANY single signal: presence, eyes-on, or control', () => {
    expect(telegraphTier(intel({ friendlyNearby: TELEGRAPH_SUSPECTED_MUSCLE }))).toBe('suspected');
    expect(telegraphTier(intel({ targetRevealed: true }))).toBe('suspected');
    expect(telegraphTier(intel({ controlsDistrict: true }))).toBe('suspected');
  });

  it('confirmed needs eyes-on AND real presence', () => {
    // eyes-on + enough muscle → confirmed
    expect(telegraphTier(intel({ targetRevealed: true, friendlyNearby: TELEGRAPH_CONFIRMED_MUSCLE }))).toBe('confirmed');
    // eyes-on + some muscle on a block you own → confirmed
    expect(telegraphTier(intel({ targetRevealed: true, friendlyNearby: 1, controlsDistrict: true }))).toBe('confirmed');
  });

  it('NEVER omniscient: heavy presence on a tile you canNOT see tops out at suspected', () => {
    expect(telegraphTier(intel({ friendlyNearby: 99, controlsDistrict: true, targetRevealed: false }))).toBe('suspected');
  });

  it('countFriendlyNear respects the presence radius', () => {
    const target = { gx: 10, gy: 10 };
    const friendly = [
      { gx: 10, gy: 10 },                                    // on target
      { gx: 10 + TELEGRAPH_PRESENCE_RADIUS, gy: 10 },        // exactly on the edge (inclusive)
      { gx: 10 + TELEGRAPH_PRESENCE_RADIUS + 1, gy: 10 },    // just outside
    ];
    expect(countFriendlyNear(friendly, target)).toBe(2);
  });

  it('targetRevealed reuses the EXISTING fog layer', () => {
    const fog = createFog();
    revealAround(fog, 5, 5, 2, 64, 64);
    expect(targetRevealed(fog, { gx: 5, gy: 5 })).toBe(true);
    expect(targetRevealed(fog, { gx: 40, gy: 40 })).toBe(false);
  });
});

// ── TELEGRAPH fires BEFORE resolution; the reaction WINDOW exists ────────────────────────────────────────
describe('telegraph window — fires before resolution, scales with intel', () => {
  it('every tier yields a positive reaction window (the telegraph precedes the strike)', () => {
    for (const tier of ['rumor', 'suspected', 'confirmed'] as const) {
      const r = buildTelegraphReport(tier, 'payout', 0.5, { districtName: 'Dockside' });
      expect(r.leadMs).toBeGreaterThan(0);
    }
  });

  it('better intel ⇒ EARLIER warning (longer window) for the same threat', () => {
    const rumor = buildTelegraphReport('rumor', 'payout', 0.5, { districtName: 'Dockside' }).leadMs;
    const suspected = buildTelegraphReport('suspected', 'payout', 0.5, { districtName: 'Dockside' }).leadMs;
    const confirmed = buildTelegraphReport('confirmed', 'payout', 0.5, { districtName: 'Dockside' }).leadMs;
    expect(suspected).toBeGreaterThan(rumor);
    expect(confirmed).toBeGreaterThan(suspected);
  });

  it('lead = the rival consequence curve PLUS the tier intel bonus (in sequence with rival-offense)', () => {
    expect(telegraphLeadMs('rumor', 0.5)).toBe(strikeLeadMs(0.5) + TELEGRAPH_TIER_LEAD_BONUS_MS.rumor);
    expect(telegraphLeadMs('confirmed', 0.5)).toBe(strikeLeadMs(0.5) + TELEGRAPH_TIER_LEAD_BONUS_MS.confirmed);
  });

  it('severity wording bands the consequence', () => {
    expect(severityLabel(0.1)).toBe('minor');
    expect(severityLabel(0.5)).toBe('serious');
    expect(severityLabel(0.9)).toBe('grave');
  });
});

// ── a RETREAT changes the outcome ────────────────────────────────────────────────────────────────────────
describe('player retreat — the response changes the strike outcome', () => {
  // A clear-edge strike (attacker 10 vs defender 5 → 2.0×, above the 1.1 abort gate) LANDS if ignored.
  it('an ignored strike with a clear edge lands', () => {
    const r = resolveStrike(10, 5, { kind: 'none' });
    expect(r.lands).toBe(true);
    expect(r.outcome).toBe('landed');
  });

  it('WITHDRAW makes the same strike whiff (target gone)', () => {
    const r = resolveStrike(10, 5, { kind: 'withdraw' });
    expect(r.lands).toBe(false);
    expect(r.outcome).toBe('whiffed-target-gone');
  });

  it('BRACE (FORTIFIED posture) collapses the edge → the rival breaks off', () => {
    const landed = resolveStrike(10, 5, { kind: 'none' });
    const braced = resolveStrike(10, 5, { kind: 'brace', defenseMult: 3 }); // defender 5→15, 10/15 = 0.67 < 1.1
    expect(landed.lands).toBe(true);
    expect(braced.lands).toBe(false);
    expect(braced.outcome).toBe('aborted-no-edge');
  });

  it('REINFORCE (muscle moved in) past the abort gate breaks the strike off', () => {
    const r = resolveStrike(10, 5, { kind: 'reinforce', addedStrength: 6 }); // defender 5→11, 10/11 = 0.91 < 1.1
    expect(r.lands).toBe(false);
    expect(r.outcome).toBe('aborted-no-edge');
  });

  it('uses the SAME abort gate as the rival\'s own retreat (shared contest surface)', () => {
    // exactly at the gate → not below → still lands; a hair under → breaks off.
    const atGate = resolveStrike(RIVAL_RETREAT_TUNING.abortAdvantage, 1, { kind: 'none' });
    expect(atGate.lands).toBe(true);
    const underGate = resolveStrike(RIVAL_RETREAT_TUNING.abortAdvantage - 0.01, 1, { kind: 'none' });
    expect(underGate.lands).toBe(false);
  });
});

// ── NO-X-RAY is preserved — the hidden rival position NEVER leaks ─────────────────────────────────────────
describe('NO-X-RAY — no telegraph ever leaks the hidden rival position', () => {
  // A rival hidden far away; the player's own threatened asset is a front in Dockside.
  const RIVAL_HIDDEN = { gx: 99, gy: 88 };

  it('a confirmed report describes only the player\'s OWN asset/district — never rival coords', () => {
    const r = buildTelegraphReport('confirmed', 'payout', 0.8, { districtName: 'Dockside', assetLabel: 'the Blue Room' });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain(String(RIVAL_HIDDEN.gx));
    expect(blob).not.toContain(String(RIVAL_HIDDEN.gy));
    expect(r.where).toContain('the Blue Room');
    expect(r.where).toContain('Dockside');
  });

  it('the report type carries no position field at all (x-ray is impossible by construction)', () => {
    const r: TelegraphReport = buildTelegraphReport('rumor', 'proximity', 0.2, { districtName: 'Dockside' });
    const keys = Object.keys(r);
    for (const k of keys) {
      expect(k).not.toMatch(/^(x|y|gx|gy)$|pos|coord|rival|enemy/i);
    }
  });

  it('the pressure row reveals confidence, never a rival count/position', () => {
    expect(telegraphPressureRow('rumor').value).toBe(UNKNOWN);
    expect(telegraphPressureRow('confirmed', false).value).toBe(VISIBLE_ONLY);
    // even a confirmed, visible read is qualitative — no number/coordinate.
    const confirmed = telegraphPressureRow('confirmed', true).value;
    expect(confirmed).toBe('rising — confirmed');
    expect(confirmed).not.toMatch(/[0-9]/);
  });

  it('resolveStrike consumes attacker STRENGTH (a scalar), not a position', () => {
    // sanity: the signature takes numbers; there is no way to pass — or read back — a rival tile.
    const r = resolveStrike(10, 5, { kind: 'none' });
    expect(typeof r.localAdvantage).toBe('number');
    expect(JSON.stringify(r)).not.toContain(String(RIVAL_HIDDEN.gx));
  });
});
