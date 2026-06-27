// EARNED-INTEL / DOSSIER (lane D) — pure, at the STATE level (no Phaser). The three load-bearing guarantees:
// (1) earning records timestamped entries with confidence; (2) aging decays confidence; (3) NO-X-RAY — the
// types carry no live-position field, and a hidden-rival query returns only aged/learned data, never live.
import { describe, it, expect } from 'vitest';
import {
  createDossier, recordIntel, canLearn, advanceIntel, decayedConfidence, ageOf, stalenessOf,
  pruneCold, queryDossier, dossierSubjects,
  INTEL_TIP_INTERVAL, INTEL_DECAY_TICKS, INTEL_CHANNEL_CONFIDENCE, INTEL_AMBIENT_CONFIDENCE,
  type IntelObservation, type DossierEntry, type DossierViewRow,
} from '../src/sim/intel';

const obs = (over: Partial<IntelObservation>): IntelObservation => ({
  greasedChannels: [], rivals: ['rival-a', 'rival-b'], rivalDistrict: {}, ...over,
});

// ── (1) EARNING records timestamped entries with confidence ──────────────────────────────────────────────
describe('earning — greased channels record timestamped, confident tips', () => {
  it('a greased police channel learns each rival\'s last-known district, stamped + confident', () => {
    const d = advanceIntel(createDossier(), obs({
      greasedChannels: ['police'], rivalDistrict: { 'rival-a': 'district-2', 'rival-b': 'district-6' },
    }), 7);
    const a = d.entries.find((e) => e.subjectId === 'rival-a')!;
    expect(a.category).toBe('enforcer-presence');
    expect(a.learnedTick).toBe(7);                       // timestamped
    expect(a.lastKnownDistrictId).toBe('district-2');    // district-level, frozen at learn time
    expect(a.baseConfidence).toBe(INTEL_CHANNEL_CONFIDENCE); // confident
    expect(d.entries.some((e) => e.subjectId === 'rival-b')).toBe(true);
  });

  it('each channel maps to its own category; feds/judges/politicians carry no district', () => {
    const d = advanceIntel(createDossier(), obs({
      greasedChannels: ['judges', 'politicians', 'feds'], rivals: ['rival-a'],
      rivalDistrict: { 'rival-a': 'district-2' },
    }), 1);
    const cats = d.entries.filter((e) => e.subjectId === 'rival-a').map((e) => e.category).sort();
    expect(cats).toEqual(['federal-standing', 'legal-exposure', 'political-ties']);
    for (const e of d.entries) expect(e.lastKnownDistrictId).toBeUndefined(); // non-location categories
  });

  it('collectors passing / controlled districts yield low-confidence ambient sightings', () => {
    const d = advanceIntel(createDossier(), obs({
      rivals: ['rival-a'], rivalDistrict: { 'rival-a': 'district-3' }, collectorDistricts: ['district-3'],
    }), 2);
    const e = d.entries.find((e) => e.category === 'ambient-activity')!;
    expect(e.subjectId).toBe('rival-a');
    expect(e.lastKnownDistrictId).toBe('district-3');
    expect(e.baseConfidence).toBe(INTEL_AMBIENT_CONFIDENCE);
    expect(e.baseConfidence).toBeLessThan(INTEL_CHANNEL_CONFIDENCE);
  });

  it('is AGED, not live: a tip is not re-learned until the interval elapses (district stays frozen)', () => {
    let d = advanceIntel(createDossier(), obs({
      greasedChannels: ['police'], rivals: ['rival-a'], rivalDistrict: { 'rival-a': 'district-2' },
    }), 0);
    // rival "moves" to district-9 a couple ticks later — within the interval, so NO new tip is learned.
    expect(canLearn(d, 'rival-a', 'enforcer-presence', INTEL_TIP_INTERVAL - 1)).toBe(false);
    d = advanceIntel(d, obs({
      greasedChannels: ['police'], rivals: ['rival-a'], rivalDistrict: { 'rival-a': 'district-9' },
    }), INTEL_TIP_INTERVAL - 1);
    expect(d.entries.find((e) => e.subjectId === 'rival-a')!.lastKnownDistrictId).toBe('district-2'); // frozen
    // once the interval elapses, a fresh tip updates the last-known district.
    expect(canLearn(d, 'rival-a', 'enforcer-presence', INTEL_TIP_INTERVAL)).toBe(true);
    d = advanceIntel(d, obs({
      greasedChannels: ['police'], rivals: ['rival-a'], rivalDistrict: { 'rival-a': 'district-9' },
    }), INTEL_TIP_INTERVAL);
    expect(d.entries.find((e) => e.subjectId === 'rival-a')!.lastKnownDistrictId).toBe('district-9');
  });

  it('recordIntel is immutable and keeps one entry per (subject, category)', () => {
    const d0 = createDossier();
    const d1 = recordIntel(d0, { subjectId: 'r', category: 'legal-exposure', learnedTick: 0, note: 'x', baseConfidence: 0.7 });
    const d2 = recordIntel(d1, { subjectId: 'r', category: 'legal-exposure', learnedTick: 5, note: 'y', baseConfidence: 0.8 });
    expect(d0.entries).toHaveLength(0);                 // original untouched
    expect(d2.entries.filter((e) => e.subjectId === 'r' && e.category === 'legal-exposure')).toHaveLength(1);
    expect(d2.entries[0].note).toBe('y');              // newest snapshot wins
  });
});

// ── (2) AGING / DECAY reduces confidence over time ───────────────────────────────────────────────────────
describe('aging — confidence decays and entries grow stale, then cold', () => {
  const entry: DossierEntry = { subjectId: 'r', category: 'enforcer-presence', learnedTick: 0, lastKnownDistrictId: 'd1', note: 'n', baseConfidence: INTEL_CHANNEL_CONFIDENCE };

  it('decayedConfidence falls monotonically from base to zero across the decay window', () => {
    const c0 = decayedConfidence(entry, 0);
    const cMid = decayedConfidence(entry, INTEL_DECAY_TICKS / 2);
    const cEnd = decayedConfidence(entry, INTEL_DECAY_TICKS);
    expect(c0).toBeCloseTo(INTEL_CHANNEL_CONFIDENCE, 5);
    expect(cMid).toBeCloseTo(INTEL_CHANNEL_CONFIDENCE / 2, 5);
    expect(cEnd).toBe(0);
    expect(cMid).toBeLessThan(c0);
    expect(cEnd).toBeLessThan(cMid);
  });

  it('staleness bands advance with age', () => {
    expect(stalenessOf(0)).toBe('fresh');
    expect(stalenessOf(5)).toBe('aging');
    expect(stalenessOf(12)).toBe('stale');
    expect(stalenessOf(INTEL_DECAY_TICKS)).toBe('cold');
    expect(ageOf(entry, 10)).toBe(10);
  });

  it('pruneCold drops fully-decayed entries', () => {
    const d = recordIntel(createDossier(), entry);
    expect(pruneCold(d, INTEL_DECAY_TICKS / 2).entries).toHaveLength(1); // still warm
    expect(pruneCold(d, INTEL_DECAY_TICKS).entries).toHaveLength(0);     // cold → pruned
  });

  it('a query reflects the decayed confidence + staleness at the query tick', () => {
    const d = recordIntel(createDossier(), entry);
    const fresh = queryDossier(d, 'r', 1).rows[0];
    const old = queryDossier(d, 'r', INTEL_DECAY_TICKS / 2).rows[0];
    expect(fresh.confidence).toBeGreaterThan(old.confidence);
    expect(old.staleness).not.toBe('fresh');
  });
});

// ── (3) NO-X-RAY — structural + behavioural ──────────────────────────────────────────────────────────────
describe('NO-X-RAY — the dossier can never express or return a live rival position', () => {
  // bans any field that could carry a LIVE position — coords/tiles or a "live/current" marker. (Note: the
  // allowed `lastKnownDistrictId` is district-level + learn-stamped; "Known" must not trip the check, so no
  // loose `now`/`here` tokens here.)
  const POSITION_FIELD = /pos|coord|tile|gx|gy|^x$|^y$|\blive\b|current/i;

  it('DossierEntry has NO live-position field (only district-level, frozen last-known)', () => {
    const e: DossierEntry = { subjectId: 'r', category: 'enforcer-presence', learnedTick: 3, lastKnownDistrictId: 'district-2', note: 'n', baseConfidence: 0.7 };
    for (const k of Object.keys(e)) expect(k).not.toMatch(POSITION_FIELD);
    // the one location field is explicitly district-level + learn-stamped (not "current"/"live").
    expect('lastKnownDistrictId' in e).toBe(true);
    expect('learnedTick' in e).toBe(true);
  });

  it('a DossierViewRow exposes no live-position field either', () => {
    const d = recordIntel(createDossier(), { subjectId: 'r', category: 'enforcer-presence', learnedTick: 0, lastKnownDistrictId: 'district-2', note: 'n', baseConfidence: 0.7 });
    const row: DossierViewRow = queryDossier(d, 'r', 1).rows[0];
    for (const k of Object.keys(row)) expect(k).not.toMatch(POSITION_FIELD);
  });

  it('a currently-hidden rival query returns ONLY aged, learned data — never the live position', () => {
    // Learn rival-a in district-2 at tick 0.
    let d = advanceIntel(createDossier(), obs({
      greasedChannels: ['police'], rivals: ['rival-a'], rivalDistrict: { 'rival-a': 'district-2' },
    }), 0);
    // The rival has since moved to district-9 and is now fog-hidden. We feed the new live position, but within
    // the aged interval nothing is re-learned — and the QUERY never reads live state regardless.
    const liveNow = 'district-9';
    d = advanceIntel(d, obs({
      greasedChannels: [], rivals: ['rival-a'], rivalDistrict: { 'rival-a': liveNow },
    }), 2);
    const view = queryDossier(d, 'rival-a', 2);
    const row = view.rows[0];
    expect(row.lastKnownDistrictId).toBe('district-2');  // the LEARNED (stale) district, stamped at tick 0
    expect(row.lastKnownDistrictId).not.toBe(liveNow);   // never the live/current district
    expect(row.ageTicks).toBe(2);                        // shown as aged
    // nothing anywhere in the view serialises the live position.
    expect(JSON.stringify(view)).not.toContain(liveNow);
  });

  it('dossierSubjects lists learned subjects (read-only helper for the panel)', () => {
    const d = advanceIntel(createDossier(), obs({
      greasedChannels: ['judges'], rivals: ['rival-a', 'rival-b'], rivalDistrict: {},
    }), 0);
    expect(dossierSubjects(d).sort()).toEqual(['rival-a', 'rival-b']);
  });
});
