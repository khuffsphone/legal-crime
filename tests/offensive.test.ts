import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/sim/state';
import {
  canRaid, canSabotage, canAssassinate, canLockout,
  resolveRaid, resolveSabotage, resolveAssassinate, resolveLockout,
} from '../src/sim/offense';
import {
  hqIntegrityOf, damageHQ, evaluateEndgame, playerCollapsed, rivalWeakness, weakestRival,
} from '../src/sim/endgame';
import { resolveStrategicPulse } from '../src/sim/strategy';
import { updateAndObserve } from '../src/sim/realtime';
import { incidentsByType } from '../src/sim/ledger';
import {
  RAID_COST, ASSASSINATE_COST, ASSASSINATE_MIN_STRENGTH, LOCKOUT_COST, LOCKOUT_BUREAU_REQ,
  LOCKOUT_DURATION, AGGRO_HQ_STRIKE, RIVAL_HQ_STRIKE_DAMAGE, HQ_MAX,
} from '../src/sim/constants';
import type { GameState, Family, Gangster } from '../src/sim/types';

function big(seed = 1): GameState { return createInitialState(seed, { bigCity: true }); }
function crew(fam: Family, skills: number[]): void {
  fam.gangsters = skills.map((sk, i): Gangster => ({ id: `${fam.id}-x${i}`, name: 'x', skill: sk, loyalty: 60, upkeep: 0, assignment: { type: 'idle' } }));
}
function hold(s: GameState, id: string, fid: string, pts = 60): void { s.districts.find((d) => d.id === id)!.control[fid] = pts; }

describe('offense gating — earned, channel-aware', () => {
  it('raid needs crew, cash, a SECURED home block (RTS-19), and a rival to hit', () => {
    const s = big();
    expect(canRaid(s, 'district-2').ok).toBe(false); // no crew
    crew(s.player, [4, 4]); s.player.cash = 3000;
    // RTS-19 pacing: you must hold a block of your own before projecting force onto rival turf.
    expect(canRaid(s, 'district-2').ok).toBe(false);
    expect(canRaid(s, 'district-2').reason).toBe('secure a home block first');
    hold(s, 'district-0', 'player', 60); // secure the home corner
    expect(canRaid(s, 'district-2').ok).toBe(true); // rival-a is in district-2
    s.player.cash = RAID_COST - 1;
    expect(canRaid(s, 'district-2').ok).toBe(false);
  });

  it('a hot crew cooldown (RTS-19) refuses the next offence until the men regroup', () => {
    const s = big(); crew(s.player, [4, 4]); s.player.cash = 5000; hold(s, 'district-0', 'player', 60);
    expect(canRaid(s, 'district-2').ok).toBe(true);
    s.offenseCooldown = 10; // a job just went down
    const g = canRaid(s, 'district-2');
    expect(g.ok).toBe(false);
    expect(g.reason).toContain('regrouping');
    s.offenseCooldown = 0;
    expect(canRaid(s, 'district-2').ok).toBe(true);
  });

  it('assassination needs muscle + cash; lockout needs The Bureau + cash', () => {
    const s = big();
    crew(s.player, [3, 3]); s.player.cash = 5000; // strength 6 < 12
    expect(canAssassinate(s, 'rival-a').ok).toBe(false);
    crew(s.player, [6, 6, 4]); // strength 16 ≥ 12
    expect(canAssassinate(s, 'rival-a').ok).toBe(true);

    expect(canLockout(s, 'rival-a').ok).toBe(false); // no Bureau
    s.player.bribes.feds = LOCKOUT_BUREAU_REQ;
    expect(canLockout(s, 'rival-a').ok).toBe(true);
  });
});

describe('RAID — force, cost, heat, The Bench mitigation', () => {
  it('costs cash + heat, arms the crew cooldown, and shoves presence into the district', () => {
    const s = big(); crew(s.player, [4, 4]); s.player.cash = 3000; hold(s, 'district-0', 'player', 60);
    const cash0 = s.player.cash, heat0 = s.player.heat;
    const res = resolveRaid(s, 'district-2');
    expect(res.ok).toBe(true);
    expect(s.player.cash).toBe(cash0 - RAID_COST);
    expect(s.player.heat).toBeGreaterThan(heat0);
    expect(s.offenseCooldown).toBeGreaterThan(0); // the crew must regroup
    expect(s.rivals[0].aggro).toBeGreaterThan(0); // the rival is provoked
  });

  it('a single raid SOFTENS but does not seize the block (RTS-19)', () => {
    const s = big(); crew(s.player, [4, 4]); s.player.cash = 3000; hold(s, 'district-0', 'player', 60);
    // rival-a holds district-2 with a racket; no player guards there to repel.
    hold(s, 'district-2', 'rival-a', 55);
    s.districts[2].businesses.push({ id: 'rop', name: 'still', kind: 'smuggling', baseIncome: 600, heatPerTick: 10, ownerFamily: 'rival-a', districtId: 'district-2', uncollected: 300, tier: 1 });
    const crew0 = s.player.gangsters.length;
    const res = resolveRaid(s, 'district-2');
    expect(res.ok).toBe(true);
    const op = s.districts[2].businesses.find((b) => b.id === 'rop')!;
    expect(res.captured).toBeFalsy(); // never a takeover from one low-force raid
    expect(op.ownerFamily).toBe('rival-a'); // the racket is NOT seized either way
    if (res.repelled) {
      expect(s.player.gangsters.length).toBe(crew0 - 1); // repelled — a man down, takings untouched
    } else {
      expect(res.disrupted).toBe(true); // knocked them off the block (a softening blow)
      expect(op.uncollected).toBe(0); // ...and scattered their takings
    }
  });

  it('The Bench (judges) cuts the raid heat', () => {
    const heatFrom = (judges: number): number => {
      const s = big(); crew(s.player, [4, 4]); s.player.cash = 3000; hold(s, 'district-0', 'player', 60); s.player.bribes.judges = judges;
      resolveRaid(s, 'district-2');
      return s.player.heat;
    };
    expect(heatFrom(0)).toBeGreaterThan(heatFrom(20));
  });
});

describe('SABOTAGE — interdict a rival economy', () => {
  it('breaks a rival-extorted front', () => {
    const s = big(); crew(s.player, [4]); s.player.cash = 3000;
    const front = s.districts[2].businesses[0];
    front.extortedBy = 'rival-a'; front.uncollected = 120;
    expect(canSabotage(s, front.id).ok).toBe(true);
    const res = resolveSabotage(s, front.id);
    expect(res.ok).toBe(true);
    expect(front.extortedBy).toBeUndefined(); // protection broken
    expect(front.uncollected).toBe(0);
  });

  it('a rival operation is torched or wrecked', () => {
    const s = big(); crew(s.player, [4]); s.player.cash = 3000;
    s.districts[2].businesses.push({ id: 'rop', name: 'still', kind: 'smuggling', baseIncome: 600, heatPerTick: 10, ownerFamily: 'rival-a', districtId: 'district-2', uncollected: 200, tier: 1 });
    const res = resolveSabotage(s, 'rop');
    expect(res.ok).toBe(true);
    const op = s.districts[2].businesses.find((b) => b.id === 'rop');
    expect(op === undefined || op.uncollected === 0).toBe(true); // wrecked or torched
  });
});

describe('ASSASSINATION & HQ — the decapitating blow', () => {
  it('damageHQ reduces integrity and eliminates a family at zero', () => {
    const s = big();
    expect(hqIntegrityOf(s.rivals[0])).toBe(HQ_MAX);
    damageHQ(s, 'rival-a', 30);
    expect(s.rivals[0].hqIntegrity).toBe(70);
    const r = damageHQ(s, 'rival-a', 70);
    expect(r.destroyed).toBe(true);
    expect(s.rivals[0].alive).toBe(false);
    expect(s.log.some((e) => e.kind === 'family-eliminated')).toBe(true);
  });

  it('a funded, muscled hit costs cash+heat and either strikes the HQ or costs a man', () => {
    const s = big(); crew(s.player, [6, 6, 4]); s.player.cash = 5000; // strength 16
    const cash0 = s.player.cash, heat0 = s.player.heat, crew0 = s.player.gangsters.length;
    expect(familyStrengthOk(s)).toBe(true);
    const res = resolveAssassinate(s, 'rival-a');
    expect(res.ok).toBe(true);
    expect(s.player.cash).toBe(cash0 - ASSASSINATE_COST);
    expect(s.player.heat).toBeGreaterThan(heat0);
    if (res.success) expect(hqIntegrityOf(s.rivals[0])).toBeLessThan(HQ_MAX);
    else expect(s.player.gangsters.length).toBe(crew0 - 1); // botched hit cost a man
  });

  it('City Hall (politicians) buys political cover (less heat)', () => {
    const heatFrom = (pol: number): number => {
      const s = big(); crew(s.player, [6, 6, 4]); s.player.cash = 5000; s.player.bribes.politicians = pol;
      resolveAssassinate(s, 'rival-a');
      return s.player.heat;
    };
    expect(heatFrom(0)).toBeGreaterThan(heatFrom(20));
  });
});

describe('LOCKOUT — the Bureau pins a rival', () => {
  it('locks the rival, then freezes + bleeds it on the pulse', () => {
    const s = big(); s.player.cash = 3000; s.player.bribes.feds = LOCKOUT_BUREAU_REQ;
    const res = resolveLockout(s, 'rival-a');
    expect(res.ok).toBe(true);
    expect(s.player.cash).toBe(3000 - LOCKOUT_COST);
    expect(s.rivals[0].lockoutTicks).toBe(LOCKOUT_DURATION);

    const rivalCash0 = s.rivals[0].cash = 2000;
    resolveStrategicPulse(s);
    expect(s.rivals[0].lockoutTicks).toBe(LOCKOUT_DURATION - 1);
    expect(s.rivals[0].cash).toBeLessThan(rivalCash0); // bled while pinned
  });
});

describe('rival escalation — retaliation & HQ strikes', () => {
  it('an enraged, strong rival strikes YOUR HQ', () => {
    const s = big();
    crew(s.rivals[0], [6, 6, 6]); // strength 18 ≥ 12
    s.rivals[0].aggro = AGGRO_HQ_STRIKE + 10;
    const ev = resolveStrategicPulse(s);
    expect(ev.hqStrikes).toContain('rival-a');
    expect(hqIntegrityOf(s.player)).toBe(HQ_MAX - RIVAL_HQ_STRIKE_DAMAGE);
  });
});

describe('endgame — win / lose detection', () => {
  it('WIN: last family standing', () => {
    const s = big();
    s.rivals.forEach((r) => (r.alive = false));
    const e = evaluateEndgame(s);
    expect(e!.kind).toBe('win-last-standing');
    expect(s.status).toBe('won');
  });

  it('WIN: city dominance (hold ≥ threshold)', () => {
    const s = big();
    for (const id of ['district-0', 'district-1', 'district-2', 'district-3', 'district-4', 'district-5']) hold(s, id, 'player', 60);
    expect(evaluateEndgame(s)!.kind).toBe('win-dominance');
  });

  it('LOSE: HQ destroyed', () => {
    const s = big();
    s.player.hqIntegrity = 0;
    const e = evaluateEndgame(s);
    expect(e!.kind).toBe('lose-hq');
    expect(s.status).toBe('lost');
    expect(s.lossReason).toBe('dead');
  });

  it('LOSE: total collapse', () => {
    const s = big();
    s.player.gangsters = []; s.player.cash = 0; s.player.dirtyCash = 0;
    for (const d of s.districts) delete d.control.player;
    expect(playerCollapsed(s)).toBe(true);
    expect(evaluateEndgame(s)!.kind).toBe('lose-collapse');
  });

  it('is a no-op while the contest is live', () => {
    expect(evaluateEndgame(big())).toBeNull();
  });
});

describe('vulnerability read — pick a target', () => {
  it('rivalWeakness ranks soft targets first; weakestRival picks one', () => {
    const s = big();
    s.rivals[1].hqIntegrity = 20; s.rivals[1].cash = 0; s.rivals[1].dirtyCash = 0; s.rivals[1].gangsters = [];
    const rows = rivalWeakness(s);
    expect(rows[0].familyId).toBe('rival-b'); // the battered, broke, crewless one
    expect(weakestRival(s)!.familyId).toBe('rival-b');
  });
});

describe('driver — offense + endgame flow through updateAndObserve', () => {
  it('resolves the endgame and logs offense to The Wire', () => {
    let s = big();
    // assassinate-eliminate rival-a, then push rival-b to fall, then expect a win.
    s.rivals[0].hqIntegrity = 1; s.rivals[1].alive = false;
    damageHQ(s, 'rival-a', 5); // rival-a eliminated -> last family standing
    const obs = updateAndObserve(s, 0.01, 1000, 1000);
    s = obs.state;
    expect(s.status).toBe('won');
    expect(obs.endgame!.status).toBe('won');
    expect(incidentsByType(s, 'family_fallen').length + incidentsByType(s, 'game_over').length).toBeGreaterThan(0);
  });
});

// helper used in the assassination test
function familyStrengthOk(s: GameState): boolean {
  return s.player.gangsters.reduce((a, g) => a + g.skill, 0) >= ASSASSINATE_MIN_STRENGTH;
}
