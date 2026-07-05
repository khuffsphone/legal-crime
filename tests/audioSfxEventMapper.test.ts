// Ticket B — the SFX event mapper. Guards the important event→SFX mappings against the LIVE sim shapes
// (CombatEvent, InterceptionEvent, EmbodiedExtortionEvent, GameEvent, EndgameResult): per-weapon hit keys,
// the downed thud, faction-aware interceptions (rival-vs-rival is SILENT), extortion outcomes, the federal
// ladder, and the endgame stings. Read-only: the mapper never mutates its inputs.
import { describe, it, expect } from 'vitest';
import type {
  CombatEvent, EmbodiedExtortionEvent, EndgameResult, GameEvent, InterceptionEvent, UpdateResult,
} from '../src/sim';
import {
  cueFor, mapCombatEvents, mapEndgame, mapExtortionEvents, mapFrame, mapInterceptions, mapLogEvents,
} from '../src/scenes/audio/sfxEventMapper';

const PLAYER = 'player';

function combatEv(kind: 'hit' | 'down', weapon?: CombatEvent['weapon']): CombatEvent {
  return { kind, attackerId: 'a1', unitId: 'u1', faction: 'rival-1', gx: 7, gy: 9, ...(weapon ? { weapon } : {}) };
}

function extortEv(over: Partial<EmbodiedExtortionEvent>): EmbodiedExtortionEvent {
  return {
    actId: 'act1', thugId: 't1', frontId: 'biz1', kind: 'shakedown',
    state: 'resolve', prevState: 'shakedown', progress: 1,
    converted: false, retook: false, sabotaged: false, failed: false,
    ...over,
  };
}

describe('sfx event mapper — combat beats (positional)', () => {
  it('maps a hit to the per-weapon contract key, LOCAL with the struck tile', () => {
    const [pistol] = mapCombatEvents([combatEv('hit', 'pistol')]);
    expect(pistol.key).toBe('sfx_hit_pistol');
    expect(pistol.spatial).toBe('local');
    expect(pistol.pos).toEqual({ gx: 7, gy: 9 });
    expect(pistol.cooldownKey).toBe('hit:pistol');
    const [fists] = mapCombatEvents([combatEv('hit')]); // no weapon tier ⇒ fists
    expect(fists.key).toBe('sfx_hit_fists');
  });

  it('maps a down to the dull thud (never a kill flourish), LOCAL + higher priority than a hit', () => {
    const [down] = mapCombatEvents([combatEv('down', 'rifle')]);
    expect(down.key).toBe('sfx_down_thud');
    expect(down.spatial).toBe('local');
    expect(down.pos).toEqual({ gx: 7, gy: 9 });
    const [hit] = mapCombatEvents([combatEv('hit', 'rifle')]);
    expect(down.priority).toBeLessThan(hit.priority); // lower number = more important
  });
});

describe('sfx event mapper — interceptions (faction-aware; NO tile on the event)', () => {
  const ev = (attackerFaction: string, victimFaction: string): InterceptionEvent =>
    ({ attackerId: 'e1', collectorId: 'c1', attackerFaction, victimFaction, amount: 120 });

  it("the player's collector robbed → a report; the player's own ambush → a report", () => {
    const robbed = mapInterceptions([ev('rival-1', PLAYER)], PLAYER);
    expect(robbed).toHaveLength(1);
    expect(robbed[0].key).toBe('tommygun');
    expect(robbed[0].spatial).toBe('global'); // no tile on the event — never positional
    const ambush = mapInterceptions([ev(PLAYER, 'rival-2')], PLAYER);
    expect(ambush).toHaveLength(1);
    expect(ambush[0].cooldownKey).not.toBe(robbed[0].cooldownKey); // distinct spam identities
  });

  it('rival-vs-rival interception emits NOTHING (hidden-rival activity is silent)', () => {
    expect(mapInterceptions([ev('rival-1', 'rival-2')], PLAYER)).toEqual([]);
  });
});

describe('sfx event mapper — extortion transitions (player-issued)', () => {
  it('converted / retook → the extort cue keyed per front; sabotage → the pistol report', () => {
    const [conv] = mapExtortionEvents([extortEv({ converted: true })]);
    expect(conv.key).toBe('extort');
    expect(conv.cooldownKey).toBe('extort:biz1');
    const [retook] = mapExtortionEvents([extortEv({ retook: true })]);
    expect(retook.key).toBe('extort');
    const [sab] = mapExtortionEvents([extortEv({ kind: 'sabotage', sabotaged: true })]);
    expect(sab.key).toBe('pistol');
  });

  it('in-progress churn and failures stay silent', () => {
    expect(mapExtortionEvents([extortEv({ state: 'engage', prevState: 'approach' })])).toEqual([]);
    expect(mapExtortionEvents([extortEv({ failed: true, state: 'failed' })])).toEqual([]);
  });
});

describe('sfx event mapper — state.log entries', () => {
  const log = (kind: string, data?: Record<string, unknown>): GameEvent => ({ tick: 3, kind, message: 'm', ...(data ? { data } : {}) });

  it('maps the federal ladder: tier → the shipped NOTICE/WATCH/RAID clip, RAID at priority 1', () => {
    const [notice] = mapLogEvents([log('fed-warning', { tier: 1 })]);
    expect(notice.key).toBe('federal_notice');
    const [watch] = mapLogEvents([log('fed-warning', { tier: 2 })]);
    expect(watch.key).toBe('federal_watch');
    const [raid] = mapLogEvents([log('fed-warning', { tier: 3 })]);
    expect(raid.key).toBe('federal_raid');
    expect(raid.priority).toBe(1);
    expect(raid.spatial).toBe('hud'); // own-exposure interface cue — bypasses the no-x-ray gate
    const [armed] = mapLogEvents([log('fed-armed')]);
    expect(armed.key).toBe('federal_raid');
  });

  it('maps mutiny, police raids, and HQ strikes to the critical alarms', () => {
    expect(mapLogEvents([log('mutiny')])[0].key).toBe('mutiny');
    for (const k of ['raid-bust', 'raid-cash', 'raid-operation']) {
      const [cue] = mapLogEvents([log(k)]);
      expect(cue.key).toBe('siren');
      expect(cue.priority).toBe(1);
    }
    expect(mapLogEvents([log('hq-struck')])[0].key).toBe('siren');
  });

  it("does NOT map the PLAYER-offensive 'raid' kind (that is an issued verb, not a police raid) nor wrapper-owned kinds", () => {
    expect(mapLogEvents([log('raid')])).toEqual([]);          // recon: 'raid' = player offensive op
    expect(mapLogEvents([log('interception')])).toEqual([]);  // wrapper path owns it (richer shape)
    expect(mapLogEvents([log('extort-success')])).toEqual([]);
    expect(mapLogEvents([log('collector-dispatched')])).toEqual([]);
  });
});

describe('sfx event mapper — endgame + the frame aggregate', () => {
  it('maps every win kind to sting_win and every lose kind to sting_lose (priority 1)', () => {
    const win: EndgameResult = { status: 'won', kind: 'win-dominance', message: 'w' };
    const lose: EndgameResult = { status: 'lost', kind: 'lose-hq', message: 'l' };
    expect(mapEndgame(win)[0].key).toBe('sting_win');
    expect(mapEndgame(lose)[0].key).toBe('sting_lose');
    expect(mapEndgame(lose)[0].priority).toBe(1);
    expect(mapEndgame(null)).toEqual([]);
    expect(mapEndgame(undefined)).toEqual([]);
  });

  it('mapFrame aggregates all sources in stable order and reads inputs without mutating them', () => {
    const result: UpdateResult = {
      weeksFired: 0,
      arrivedUnitIds: ['u9'], // validated-but-unmapped source (no arrival cue in the MVP)
      interceptions: [{ attackerId: 'e', collectorId: 'c', attackerFaction: 'rival-1', victimFaction: PLAYER, amount: 5 }],
      combat: [combatEv('hit', 'shotgun')],
      extortion: [extortEv({ converted: true })],
    };
    const logs = [log0()];
    const frozenResult = Object.freeze(result);
    const cues = mapFrame(frozenResult, logs, null, PLAYER);
    expect(cues.map((c) => c.key)).toEqual(['sfx_hit_shotgun', 'tommygun', 'extort', 'mutiny']);
    // every descriptor is complete
    for (const c of cues) {
      expect(c.category).toBeTruthy();
      expect(c.priority).toBeGreaterThanOrEqual(1);
      expect(['local', 'global', 'hud']).toContain(c.spatial);
      expect(c.cooldownKey.length).toBeGreaterThan(0);
      expect(c.source.length).toBeGreaterThan(0);
      if (c.spatial === 'local') expect(c.pos).toBeTruthy(); // a local cue always carries its tile
    }
    function log0(): GameEvent { return { tick: 1, kind: 'mutiny', message: 'm' }; }
  });

  it('cueFor pulls meta from the spine (single source of truth)', () => {
    const cue = cueFor('mutiny', 'mutiny', 'test');
    expect(cue).toMatchObject({ key: 'mutiny', category: 'crew', priority: 1, spatial: 'global' });
    expect(cue.pos).toBeUndefined();
  });
});
