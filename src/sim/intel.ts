// EARNED-INTEL / DOSSIER (lane D). PURE & deterministic; imports NO Phaser (passes the /src/sim purity
// invariant). A dossier the player BUILDS OVER TIME about rivals — strength/known rackets/bribery ties/last-
// known district — earned through the existing economy (the four bribery channels, collectors, district
// control) and AGED so it is never live surveillance. It tells the player what they have LEARNED, not what is
// happening live. Data-in / data-out only; the scene observes earning events and calls these pure functions.
//
// ⭐ NO-X-RAY IS ABSOLUTE — and here it is a STRUCTURAL guarantee, exactly like telegraph.ts:
//   • DossierEntry has NO FIELD that can express a live rival position. The ONLY location-ish fact is
//     `lastKnownDistrictId` — DISTRICT-LEVEL (never a coordinate/tile), stamped with `learnedTick`, and
//     FROZEN at learn time. It is overwritten ONLY when a NEW tip is learned (throttled by INTEL_TIP_INTERVAL,
//     so it is always aged), NEVER recomputed from the rival's current position. queryDossier never reads live
//     state — it only ages what was already learned. A currently fog-hidden rival therefore surfaces the stale
//     district from when you learned it, never their current one.
//   • Confidence DECAYS with age (decayedConfidence) so old entries visibly become unreliable.
//   • This module drives NO markers/silhouettes/SFX/telegraphs — it returns read-only text/stat rows.

import type { BribeChannel } from './types';

// ── categories of earned intel (one per earning source) ──────────────────────────────────────────────────
export type IntelCategory =
  | 'enforcer-presence' // police channel: a rival's enforcer LAST-KNOWN district (the only location fact)
  | 'legal-exposure'    // judges channel: a rival's legal exposure
  | 'political-ties'    // politicians channel: a rival's political / bribery ties
  | 'federal-standing'  // feds channel: a rival's federal-heat standing
  | 'ambient-activity'; // collectors passing / district control: low-confidence "activity seen" in a district

/** Visible staleness band for an aged entry — the renderer shows this so the player sees reliability fade. */
export type Staleness = 'fresh' | 'aging' | 'stale' | 'cold';

// ── tuning (lane-local; canon-review before any balance change) ───────────────────────────────────────────
/** Ticks before the SAME subject+category can be re-learned — what makes intel AGED, not live surveillance. */
export const INTEL_TIP_INTERVAL = 4;
/** Ticks over which a tip's confidence decays linearly to zero (then it is pruned as cold). */
export const INTEL_DECAY_TICKS = 24;
/** Base confidence (0..1) of a PAID bribery-channel tip vs an AMBIENT collector/control sighting. */
export const INTEL_CHANNEL_CONFIDENCE = 0.75;
export const INTEL_AMBIENT_CONFIDENCE = 0.45;
/** Age (ticks) band edges for the staleness indicator. */
export const INTEL_FRESH_TICKS = 3;
export const INTEL_AGING_TICKS = 8;
export const INTEL_STALE_TICKS = 16;

const CHANNEL_CATEGORY: Record<BribeChannel, IntelCategory> = {
  police: 'enforcer-presence',
  judges: 'legal-exposure',
  politicians: 'political-ties',
  feds: 'federal-standing',
};

// ── the dossier data model (NO-X-RAY by construction) ────────────────────────────────────────────────────
/**
 * One learned fact about a rival. STRUCTURAL NO-X-RAY: there is intentionally NO field here that can hold a
 * live position — no x/y, no tile, no coordinate, no "current" anything. `lastKnownDistrictId` is the ONLY
 * location-ish field: district-level, stamped at `learnedTick`, frozen, and only ever a value that was
 * observed at learn time.
 */
export interface DossierEntry {
  subjectId: string;          // the rival family this fact is about
  category: IntelCategory;
  learnedTick: number;        // the tick this fact was LEARNED (drives age + staleness)
  /** Aged, district-level last-known location — frozen at learn time. Absent for non-location categories. */
  lastKnownDistrictId?: string;
  note: string;               // a short learned fact, text only
  baseConfidence: number;     // 0..1 confidence AT learn time (decays with age in queries)
}

export interface IntelDossier {
  /** At most one entry per (subject, category) — the most recently learned snapshot. */
  entries: DossierEntry[];
  /** Per (subject:category) the tick a tip was last recorded — throttles re-learning so intel stays aged. */
  lastLearned: Record<string, number>;
}

export function createDossier(): IntelDossier {
  return { entries: [], lastLearned: {} };
}

function keyOf(subjectId: string, category: IntelCategory): string {
  return `${subjectId}:${category}`;
}

// ── recording (earning) ──────────────────────────────────────────────────────────────────────────────────
/**
 * Record a learned tip — immutable: returns a NEW dossier with the entry added, REPLACING any prior entry for
 * the same (subject, category) so the dossier holds the latest learned snapshot (and stays bounded). Also
 * stamps lastLearned for the throttle. Pure.
 */
export function recordIntel(dossier: IntelDossier, entry: DossierEntry): IntelDossier {
  const k = keyOf(entry.subjectId, entry.category);
  const entries = dossier.entries.filter((e) => keyOf(e.subjectId, e.category) !== k);
  entries.push({ ...entry });
  return { entries, lastLearned: { ...dossier.lastLearned, [k]: entry.learnedTick } };
}

/** Whether a fresh tip for (subject, category) may be learned at `tick` — i.e. the aged interval has elapsed. */
export function canLearn(dossier: IntelDossier, subjectId: string, category: IntelCategory, tick: number): boolean {
  const last = dossier.lastLearned[keyOf(subjectId, category)];
  return last === undefined || tick - last >= INTEL_TIP_INTERVAL;
}

// ── aging / decay ────────────────────────────────────────────────────────────────────────────────────────
/** The age in ticks of an entry at `tick` (never negative). */
export function ageOf(entry: DossierEntry, tick: number): number {
  return Math.max(0, tick - entry.learnedTick);
}

/** Confidence decayed by age: linear from baseConfidence at learn time to 0 after INTEL_DECAY_TICKS. Pure. */
export function decayedConfidence(entry: DossierEntry, tick: number): number {
  const frac = 1 - ageOf(entry, tick) / INTEL_DECAY_TICKS;
  return Math.max(0, Math.min(1, entry.baseConfidence * Math.max(0, frac)));
}

/** The visible staleness band for an age. */
export function stalenessOf(ageTicks: number): Staleness {
  if (ageTicks <= INTEL_FRESH_TICKS) return 'fresh';
  if (ageTicks <= INTEL_AGING_TICKS) return 'aging';
  if (ageTicks <= INTEL_STALE_TICKS) return 'stale';
  return 'cold';
}

/** Drop entries that have fully decayed (cold) at `tick`. Keeps the dossier bounded. Pure (new dossier). */
export function pruneCold(dossier: IntelDossier, tick: number): IntelDossier {
  const entries = dossier.entries.filter((e) => decayedConfidence(e, tick) > 0);
  if (entries.length === dossier.entries.length) return dossier;
  return { entries, lastLearned: dossier.lastLearned };
}

// ── querying (read-only view; NEVER touches live state) ──────────────────────────────────────────────────
export interface DossierViewRow {
  category: IntelCategory;
  note: string;
  /** Aged, frozen, district-level — the only location fact; never a live position. */
  lastKnownDistrictId?: string;
  ageTicks: number;
  confidence: number; // decayed 0..1
  staleness: Staleness;
}

export interface DossierView {
  subjectId: string;
  /** Rows for everything LEARNED about this subject, strongest (most confident) first. */
  rows: DossierViewRow[];
}

/**
 * The read-only dossier view for one subject at `tick`. It ONLY ages already-learned entries — it does not and
 * cannot read the rival's live position. A currently-hidden rival yields exactly its aged, timestamped learned
 * rows (the frozen last-known district included), never anything live. Pure.
 */
export function queryDossier(dossier: IntelDossier, subjectId: string, tick: number): DossierView {
  const rows: DossierViewRow[] = dossier.entries
    .filter((e) => e.subjectId === subjectId)
    .map((e) => {
      const ageTicks = ageOf(e, tick);
      return {
        category: e.category,
        note: e.note,
        lastKnownDistrictId: e.lastKnownDistrictId,
        ageTicks,
        confidence: decayedConfidence(e, tick),
        staleness: stalenessOf(ageTicks),
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
  return { subjectId, rows };
}

/** Subject ids the dossier currently holds any entry for (for the panel to iterate). Pure. */
export function dossierSubjects(dossier: IntelDossier): string[] {
  const seen: string[] = [];
  for (const e of dossier.entries) if (!seen.includes(e.subjectId)) seen.push(e.subjectId);
  return seen;
}

// ── earning driver (called from the SCENE update loop, NOT the sim tick) ──────────────────────────────────
/**
 * A plain, scene-derived snapshot of what is observable THIS tick. All district values are district ids the
 * scene computed; there are no coordinates here either. Optional fields default to "nothing observed".
 */
export interface IntelObservation {
  /** Bribery channels the player currently greases (>0) — each yields its category of aged intel. */
  greasedChannels: readonly BribeChannel[];
  /** The rival family ids to learn about. */
  rivals: readonly string[];
  /** Each rival's currently-observed presence district (scene-derived); frozen into a learned tip. */
  rivalDistrict: Readonly<Record<string, string | undefined>>;
  /** Optional richer learned facts per category per rival (e.g. "legal exposure: high"); used as the note. */
  rivalFacts?: Partial<Record<IntelCategory, Readonly<Record<string, string>>>>;
  /** Districts a player collector currently occupies — ambient "activity seen" source. */
  collectorDistricts?: readonly string[];
  /** Districts the player controls — ambient adjacency source. */
  controlledDistricts?: readonly string[];
}

function defaultNote(category: IntelCategory, districtId?: string): string {
  switch (category) {
    case 'enforcer-presence': return `enforcers last seen in ${districtId ?? 'parts unknown'}`;
    case 'legal-exposure': return 'legal exposure on the books';
    case 'political-ties': return 'political / bribery ties noted';
    case 'federal-standing': return 'federal-heat standing reported';
    case 'ambient-activity': return `activity seen in ${districtId ?? 'the district'}`;
  }
}

/**
 * Advance the dossier for one observed tick: record any NEW tips the player has EARNED (greased channels;
 * collectors passing a district a rival is in; a rival active in a district the player controls), each throttled
 * by INTEL_TIP_INTERVAL so the data stays aged, then prune fully-decayed entries. Pure (dossier in → new dossier
 * out). Aging itself is computed at query time, so a frame that records nothing is effectively a no-op.
 */
export function advanceIntel(dossier: IntelDossier, obs: IntelObservation, tick: number): IntelDossier {
  let d = dossier;

  // (1) paid bribery channels — each greased channel earns its category of aged intel on each rival.
  for (const ch of obs.greasedChannels) {
    const category = CHANNEL_CATEGORY[ch];
    for (const rid of obs.rivals) {
      if (!canLearn(d, rid, category, tick)) continue;
      const districtId = category === 'enforcer-presence' ? obs.rivalDistrict[rid] : undefined;
      d = recordIntel(d, {
        subjectId: rid, category, learnedTick: tick,
        lastKnownDistrictId: districtId,
        note: obs.rivalFacts?.[category]?.[rid] ?? defaultNote(category, districtId),
        baseConfidence: INTEL_CHANNEL_CONFIDENCE,
      });
    }
  }

  // (2) ambient — a player collector passing through, OR a district the player controls, where a rival is
  // currently present, yields a low-confidence "activity seen" sighting (district-level, frozen).
  const ambientDistricts = new Set<string>([...(obs.collectorDistricts ?? []), ...(obs.controlledDistricts ?? [])]);
  if (ambientDistricts.size > 0) {
    for (const rid of obs.rivals) {
      const rd = obs.rivalDistrict[rid];
      if (rd && ambientDistricts.has(rd) && canLearn(d, rid, 'ambient-activity', tick)) {
        d = recordIntel(d, {
          subjectId: rid, category: 'ambient-activity', learnedTick: tick,
          lastKnownDistrictId: rd, note: defaultNote('ambient-activity', rd),
          baseConfidence: INTEL_AMBIENT_CONFIDENCE,
        });
      }
    }
  }

  return pruneCold(d, tick);
}
