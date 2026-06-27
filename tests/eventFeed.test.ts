// LANE K — EVENT FEED (player-knowable world events). The WIRE log is the event feed; this suite locks
// the two things Lane K is responsible for: ⭐ NO-X-RAY (an event can ONLY ever carry player-knowable
// facts — never a hidden rival's identity or position), and that every event records with a TIMESTAMP +
// a SEVERITY. Pure & Phaser-free (the taxonomy + the log store are render-side but import no Phaser).

import { describe, it, expect } from 'vitest';
import {
  EVENT_TAXONOMY, metaFor, bribeEventKind, type EventKind,
} from '../src/scenes/info/infoEvents';
import { initLog, pushLog, type LogEntry } from '../src/scenes/info/logStore';

const ALL_KINDS = Object.keys(EVENT_TAXONOMY) as EventKind[];

// The ONLY fields a logged event is permitted to carry. Critically there is NO actor/source field —
// gx/gy are the location of the PLAYER's own affected asset or an observable beat, never an attacker's.
const ALLOWED_ENTRY_KEYS = new Set<keyof LogEntry>(['id', 'kind', 'tier', 'message', 'gx', 'gy', 't', 'count', 'unread']);
// Names that WOULD leak a hidden rival — none of these may ever appear on a feed event.
const FORBIDDEN_KEYS = ['rivalId', 'attackerId', 'enemyId', 'sourceFamily', 'sourceId', 'familyId', 'rivalGx', 'rivalGy', 'enemyGx', 'enemyGy', 'fromId'];

describe('⭐ NO-X-RAY — events carry player-knowable facts ONLY', () => {
  it('no logged event exposes any field beyond the player-knowable allow-list (no attacker id/pos)', () => {
    for (const kind of ALL_KINDS) {
      let s = initLog();
      s = pushLog(s, { kind, message: 'x', t: 1, gx: 3, gy: 4 });
      const entry = s.entries[0];
      for (const key of Object.keys(entry)) {
        expect(ALLOWED_ENTRY_KEYS.has(key as keyof LogEntry), `event '${kind}' leaked field '${key}'`).toBe(true);
        expect(FORBIDDEN_KEYS).not.toContain(key);
      }
    }
  });

  it('a rival-driven event the player observes is reported as an EFFECT, never as the attacker', () => {
    // district.lost / hq.attack / collector.robbed / rival.telegraph are rival actions. The feed carries
    // the location of the PLAYER's OWN asset (the block/HQ/collector) + a message — and structurally has no
    // slot for who/where the rival is. We assert the contract: a pushed rival-effect event holds only the
    // caller-supplied player-side location, with no extra positional field smuggled in.
    const rivalEffects: EventKind[] = ['district.lost', 'hq.attack', 'collector.robbed', 'rival.telegraph'];
    for (const kind of rivalEffects) {
      let s = initLog();
      s = pushLog(s, { kind, message: 'they hit your speakeasy in the Levee', t: 5, gx: 9, gy: 9 });
      const e = s.entries[0];
      // exactly one location, and it is the one the caller passed (the player's asset) — nothing else.
      expect(e.gx).toBe(9); expect(e.gy).toBe(9);
      expect(Object.keys(e).filter((k) => /g[xy]|pos|loc/i.test(k)).sort()).toEqual(['gx', 'gy']);
    }
  });

  it('federal + bribe events are NON-positional — a rival can never be inferred from them (#3)', () => {
    for (const kind of ['federal.threshold', 'bribe.landed', 'bribe.failed'] as EventKind[]) {
      const m = metaFor(kind);
      expect(m.positional).toBe(false);
      expect(m.alert).toBe(false); // no directional arrow that could point at a hidden actor
      expect(m.ping).toBe(false);  // no minimap ping
    }
  });

  it('the taxonomy stays internally consistent: non-positional ⇒ no alert and no ping', () => {
    for (const [kind, meta] of Object.entries(EVENT_TAXONOMY)) {
      if (!meta.positional) {
        expect(meta.alert, `${kind} non-positional but alerts`).toBe(false);
        expect(meta.ping, `${kind} non-positional but pings`).toBe(false);
      }
    }
  });
});

describe('every event records with a TIMESTAMP + a SEVERITY', () => {
  it('pushLog stamps the caller timestamp and the taxonomy tier on every kind', () => {
    for (const kind of ALL_KINDS) {
      let s = initLog();
      s = pushLog(s, { kind, message: 'x', t: 4242 });
      const e = s.entries[0];
      expect(e.t).toBe(4242);                       // timestamp
      expect(e.tier).toBe(metaFor(kind).tier);      // severity, from the taxonomy
      expect(['info', 'warning', 'critical']).toContain(e.tier);
    }
  });
});

describe('LANE K — the new player-knowable events', () => {
  it('bribeEventKind maps a paid/failed grease to bribe.landed / bribe.failed', () => {
    expect(bribeEventKind(true)).toBe('bribe.landed');
    expect(bribeEventKind(false)).toBe('bribe.failed');
    expect(metaFor('bribe.landed').tier).toBe('info');     // good news
    expect(metaFor('bribe.failed').tier).toBe('warning');  // came up short
  });

  it('collector.banked is positional GOOD news that never spams an arrow or a ping', () => {
    const m = metaFor('collector.banked');
    expect(m.tier).toBe('info');
    expect(m.positional).toBe(true); // click-to-jump to the HQ vault
    expect(m.alert).toBe(false);
    expect(m.ping).toBe(false);
    expect(m.dedupe).toBe(false);    // a state change, not a throttled combat beat
  });

  it('a banked event records like any other (timestamp + severity), with the HQ location', () => {
    let s = initLog();
    s = pushLog(s, { kind: 'collector.banked', message: 'a collector banked $420', t: 7, gx: 12, gy: 8 });
    const e = s.entries[0];
    expect(e.tier).toBe('info');
    expect(e.t).toBe(7);
    expect(e.gx).toBe(12); expect(e.gy).toBe(8);
  });
});
