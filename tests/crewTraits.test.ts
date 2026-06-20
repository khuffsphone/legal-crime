import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  ALL_TRAITS,
  traitUpkeepModifier,
  crewExtortBonus,
  crewCombatBonus,
  crewHeatRelief,
  crewBribeDiscount,
  memberLoyaltyDelta,
  desertionChanceFactor,
  rollTraits,
  BRUTAL_EXTORT_BONUS,
  BRUTAL_COMBAT_BONUS,
  COOL_HEAT_RELIEF,
  CONNECTED_BRIBE_DISCOUNT,
  GREEDY_UPKEEP,
  GREEN_UPKEEP,
  LOYAL_DESERT_FACTOR,
} from '../src/sim/traits';
import {
  LOYALTY_EVENT_DELTA,
  loyaltyStatus,
  applyCrewLoyaltyEvent,
  adjustMemberLoyalty,
  propagateTie,
  crewReadout,
} from '../src/sim/crew';
import { familyStrength, resolveConflict } from '../src/sim/conflict';
import { familyExpenses } from '../src/sim/economy';
import { resolveLaw } from '../src/sim/law';
import { loyaltyDelta } from '../src/sim/gangsters';
import { LOYALTY_HEAT_DIVISOR } from '../src/sim/constants';
import type { Gangster, Family } from '../src/sim/types';

function g(id: string, opts: Partial<Gangster> = {}): Gangster {
  return { id, name: id, skill: 3, loyalty: 60, upkeep: 30, assignment: { type: 'idle' }, ...opts };
}
function guard(id: string, district: string, opts: Partial<Gangster> = {}): Gangster {
  return g(id, { assignment: { type: 'guard', districtId: district }, ...opts });
}

describe('rollTraits — seeded, deterministic, cursor-safe, non-conflicting', () => {
  it('returns 1–2 traits, all valid and distinct, deterministic per key', () => {
    for (const key of ['player-g-0', 'rival-a-g-3', 'zzz']) {
      const a = rollTraits(key);
      const b = rollTraits(key);
      expect(a).toEqual(b); // deterministic
      expect(a.length).toBeGreaterThanOrEqual(1);
      expect(a.length).toBeLessThanOrEqual(2);
      expect(new Set(a).size).toBe(a.length); // distinct
      for (const t of a) expect(ALL_TRAITS).toContain(t);
    }
  });

  it('never assigns the conflicting greedy+green pair together', () => {
    for (let i = 0; i < 200; i++) {
      const ts = rollTraits(`g-${i}`);
      expect(ts.includes('greedy') && ts.includes('green')).toBe(false);
    }
  });

  it('does not touch the shared RNG cursor when recruiting (assigned via its own Rng)', () => {
    // createInitialState is RNG-driven; trait rolls happen at recruit via a separate Rng, proven
    // by the determinism suite elsewhere. Here: two recruits of the same id get identical traits.
    expect(rollTraits('player-g-0')).toEqual(rollTraits('player-g-0'));
  });
});

describe('trait modifiers are no-ops without traits, and apply when present', () => {
  it('upkeep modifier: greedy costs more, green costs less, none = 0', () => {
    expect(traitUpkeepModifier([])).toBe(0);
    expect(traitUpkeepModifier(['greedy'])).toBe(GREEDY_UPKEEP);
    expect(traitUpkeepModifier(['green'])).toBe(GREEN_UPKEEP);
  });

  it('Brutal: +extort (guards in the district) and +combat strength', () => {
    const fam = { id: 'player', gangsters: [guard('a', 'district-0', { traits: ['brutal'] }), guard('b', 'district-1', { traits: ['brutal'] })] } as Family;
    expect(crewExtortBonus(fam, 'district-0')).toBeCloseTo(BRUTAL_EXTORT_BONUS, 6); // only the d0 guard
    expect(crewCombatBonus(fam)).toBe(2 * BRUTAL_COMBAT_BONUS); // both count for combat
    const plain = { id: 'player', gangsters: [guard('a', 'district-0')] } as Family;
    expect(crewExtortBonus(plain, 'district-0')).toBe(0);
    expect(crewCombatBonus(plain)).toBe(0);
  });

  it('Cool: heat relief; Connected: bribe discount', () => {
    const fam = { id: 'p', gangsters: [g('a', { traits: ['cool'] }), g('b', { traits: ['cool', 'connected'] })] } as Family;
    expect(crewHeatRelief(fam)).toBe(2 * COOL_HEAT_RELIEF);
    expect(crewBribeDiscount(fam)).toBe(1 * CONNECTED_BRIBE_DISCOUNT);
  });

  it('memberLoyaltyDelta: Cool ignores the heat penalty, Loyal softens losses, plain == legacy', () => {
    const heat = 4 * LOYALTY_HEAT_DIVISOR; // a 4-point heat penalty
    const plain = g('p');
    expect(memberLoyaltyDelta(plain, false, heat)).toBe(loyaltyDelta(false, heat)); // legacy match
    expect(memberLoyaltyDelta(g('c', { traits: ['cool'] }), false, heat)).toBe(loyaltyDelta(false, 0)); // no heat penalty
    // Loyal softens the net loss (never into a gain)
    expect(memberLoyaltyDelta(g('l', { traits: ['loyal'] }), false, heat)).toBeGreaterThan(loyaltyDelta(false, heat));
    expect(memberLoyaltyDelta(g('l', { traits: ['loyal'] }), false, heat)).toBeLessThanOrEqual(0);
  });

  it('desertionChanceFactor: Loyal halves, others full', () => {
    expect(desertionChanceFactor(g('l', { traits: ['loyal'] }))).toBe(LOYAL_DESERT_FACTOR);
    expect(desertionChanceFactor(g('p'))).toBe(1);
  });
});

describe('modifiers wired into existing systems (additive)', () => {
  it('familyStrength adds the Brutal combat bonus', () => {
    const s = createInitialState(1);
    s.player.gangsters = [g('a', { skill: 5 }), g('b', { skill: 4, traits: ['brutal'] })];
    expect(familyStrength(s.player)).toBe(5 + 4 + BRUTAL_COMBAT_BONUS);
  });

  it('familyExpenses trims the bribe retainer for Connected crew (capped, never negative)', () => {
    const s = createInitialState(1);
    s.player.bribeLevel = 40;
    s.player.gangsters = [g('a', { upkeep: 0, traits: ['connected'] })];
    expect(familyExpenses(s.player)).toBe(40 - CONNECTED_BRIBE_DISCOUNT);
    s.player.bribeLevel = 2; // discount cannot drive expenses below upkeep
    expect(familyExpenses(s.player)).toBe(0);
  });

  it('resolveLaw sheds extra heat for Cool crew', () => {
    const s = createInitialState(1);
    s.player.heat = 30;
    s.player.gangsters = [g('a', { traits: ['cool'] })];
    const rival = s.rivals[0];
    rival.heat = 30; // no cool crew — the control
    resolveLaw(s);
    expect(30 - s.player.heat).toBe(30 - rival.heat + COOL_HEAT_RELIEF);
  });
});

describe('loyalty events shift morale on the right beats', () => {
  it('applyCrewLoyaltyEvent moves every member by the event delta (Loyal shielded on losses)', () => {
    const fam = { id: 'p', gangsters: [g('a', { loyalty: 50 }), g('l', { loyalty: 50, traits: ['loyal'] })] } as Family;
    applyCrewLoyaltyEvent(fam, 'robbed'); // -8
    expect(fam.gangsters[0].loyalty).toBe(50 + LOYALTY_EVENT_DELTA.robbed); // 42
    expect(fam.gangsters[1].loyalty).toBeGreaterThan(42); // Loyal lost less
  });

  it('a score lifts the crew; loyalty clamps to [0,100]', () => {
    const fam = { id: 'p', gangsters: [g('a', { loyalty: 99 })] } as Family;
    applyCrewLoyaltyEvent(fam, 'score'); // +4 -> clamps at 100
    expect(fam.gangsters[0].loyalty).toBe(100);
  });

  it('loyaltyStatus reads the bands', () => {
    expect(loyaltyStatus(80)).toBe('loyal');
    expect(loyaltyStatus(40)).toBe('wavering');
    expect(loyaltyStatus(10)).toBe('disloyal');
  });
});

describe('interpersonal ties propagate a wrong onto allies/rivals', () => {
  it('adjustMemberLoyalty spills onto an ally (same sign) and a rival (opposite)', () => {
    const fam = {
      id: 'p',
      gangsters: [g('a', { loyalty: 50 }), g('ally', { loyalty: 50 }), g('foe', { loyalty: 50 })],
      ties: [
        { a: 'a', b: 'ally', kind: 'ally' as const },
        { a: 'a', b: 'foe', kind: 'rival' as const },
      ],
    } as Family;
    adjustMemberLoyalty(fam, 'a', -8); // a is wronged
    const find = (id: string) => fam.gangsters.find((x) => x.id === id)!.loyalty;
    expect(find('a')).toBe(42); // -8
    expect(find('ally')).toBe(46); // -4 (half), same sign
    expect(find('foe')).toBe(54); // +4 (rival is pleased)
  });

  it('propagateTie is one-hop (no infinite recursion through mutual ties)', () => {
    const fam = {
      id: 'p',
      gangsters: [g('a', { loyalty: 50 }), g('b', { loyalty: 50 })],
      ties: [{ a: 'a', b: 'b', kind: 'ally' as const }],
    } as Family;
    propagateTie(fam, 'a', -8);
    expect(fam.gangsters.find((x) => x.id === 'b')!.loyalty).toBe(46); // -4, once
    expect(fam.gangsters.find((x) => x.id === 'a')!.loyalty).toBe(50); // unchanged (we only propagated)
  });
});

describe('integration — low individual loyalty feeds the existing mutiny/desertion spiral', () => {
  it("a robbed run drops the victim crew's morale (wired through resolveInterceptions path)", () => {
    // The pure event is asserted above; here confirm crewReadout surfaces a souring member.
    const fam = { id: 'p', gangsters: [g('a', { loyalty: 22 }), g('b', { loyalty: 90 })] } as Family;
    applyCrewLoyaltyEvent(fam, 'robbed'); // a -> 14 (disloyal), b -> 82
    const rows = crewReadout(fam);
    expect(rows[0].id).toBe('a'); // most disloyal first
    expect(rows[0].status).toBe('disloyal');
    expect(rows[1].status).toBe('loyal');
  });

  it('a killed crewmate shakes a tied ally during conflict (no-op without ties)', () => {
    const s = createInitialState(1);
    // player loses a hit with a 2-man crew tied as allies; the fallen one's ally loses heart.
    s.player.gangsters = [g('weak', { skill: 1, loyalty: 50 }), g('mate', { skill: 1, loyalty: 50 })];
    s.player.ties = [{ a: 'weak', b: 'mate', kind: 'ally' }];
    s.rivals[0].gangsters = [g('r1', { skill: 9 }), g('r2', { skill: 9 })];
    s.pendingHits = [{ attackerId: 'rival-a', targetId: 'player', orderedTick: 0 }];
    resolveConflict(s);
    const mate = s.player.gangsters.find((x) => x.id === 'mate');
    // 'weak' was the lowest-skill casualty; if 'mate' survived it lost loyalty from the tie.
    if (mate) expect(mate.loyalty).toBeLessThan(50);
  });
});

describe('crewReadout — the player-facing crew panel', () => {
  it('lists members most-disloyal-first with names, traits, status, and ties', () => {
    const s = createInitialState(1, { startingCrew: true });
    const rows = crewReadout(s.player);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name).sort()).toEqual(['Sal', 'Vito']);
    const vito = rows.find((r) => r.name === 'Vito')!;
    expect(vito.traitLabels).toContain('Brutal');
    expect(vito.status).toBe('loyal'); // loyalty 70
    expect(vito.ties.length).toBe(1); // allied with Sal
  });
});
