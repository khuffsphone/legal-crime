// STATUS UI — Phase 1: the top-10 screen BODIES. Each builder is a pure (state, vis) -> ScreenView; it
// SURFACES existing sim state (read-only, no mutation) and routes EVERY fog-sensitive read through the
// StatusVisibility funnel (NO-X-RAY). SAFE fields (own funds/crew/heat/federal ladder/own turf) read
// directly; FOG fields (rival identity/ownership/position, cop positions, unscouted-district detail,
// located incidents) mask to an `unknown` row when the funnel says hidden — the underlying rival/cop/
// unscouted record is never surfaced. Field→source mapping + fog flags: docs/status-ui/DATA_RECON.md.
//
// This module must NEVER read state.rivals[] / businesses[].ownerFamily / state.beatCops[].pos to SURFACE
// a fog-sensitive value without a vis.* gate. Own-ownership tests (businessEarner(b) === player.id) are
// SAFE (they reveal only what the player owns). Phaser-free.

import {
  familyIncome, familyExpenses, playerWeeklyNet, cleanCash, extortionIncome, operationIncome,
  totalUncollected, launderCapacity, heatFromDirty, raidChance, effectiveDecay, crewBribeDiscount,
  federalExposure, fedWarningTier, federalTierLabel, FEDERAL_LADDER, dirtyExposurePoints, fedExposureRelief,
  topFederalWarning, firstObjective, districtStatusOf, districtsHeldBy, districtIdentity, districtValue,
  inspectDistrict, businessEarner, businessAccrual, operationHeat, uncollectedOf, tierOf, isShutDown,
  extortProgress, crewReadout, expandTargetDistrictId,
  HEAT_MAX, FED_ARM_DELAY, FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3,
  type GameState, type Business, type District,
} from '../../sim';
import { resolveIncidentVisibility } from '../info/incidentVisibility';
import type { StatusVisibility } from './statusVisibility';
import { money, deltaStr, pct, unknownRow, type ScreenRow, type ScreenSection, type ScreenView } from './screenView';

// ── shared helpers ───────────────────────────────────────────────────────────────────────────────
const PLAYER = (s: GameState): string => s.player.id;
/** SAFE own-ownership test — reveals only what the player owns, never a rival identity. */
const ownsBusiness = (s: GameState, b: Business): boolean => businessEarner(b) === PLAYER(s);
const districtIndex = (s: GameState, d: District): number => s.districts.indexOf(d);
const allBiz = (s: GameState): { biz: Business; district: District }[] =>
  s.districts.flatMap((d) => d.businesses.map((biz) => ({ biz, district: d })));
/** District ids the player holds (own turf — always "scouted"). */
const heldIds = (s: GameState): Set<string> => new Set(districtsHeldBy(s, PLAYER(s)).map((d) => d.id));
/** A district's detail is knowable: the player holds it, or the funnel says its tiles are scouted. */
const scouted = (vis: StatusVisibility, held: Set<string>, id: string): boolean =>
  held.has(id) || vis.districtScouted(id);

/** The latest economic-settlement deltas (own — from the player's own settlement incident data). Used for
 * the dashboard's cash/heat/exposure deltas, which have no selector (they live in the settlement record). */
function settlementDeltas(state: GameState): { heat?: number; exposure?: number; clean?: number; dirty?: number } {
  // Scan the complete bounded ledger. Hidden rival activity must not crowd an older, player-visible
  // settlement out of this read and thereby become an indirect event-count signal.
  const settle = [...state.incidents].reverse().find((i) => i.type === 'settlement');
  const d = (settle?.data ?? {}) as Record<string, unknown>;
  const num = (k: string): number | undefined => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  return { heat: num('heatDelta'), exposure: num('exposureDelta'), clean: num('cleanDelta'), dirty: num('dirtyDelta') };
}

// ── 1. Main Command Dashboard ──────────────────────────────────────────────────────────────────
export function buildCommandDashboard(state: GameState, _vis: StatusVisibility): ScreenView {
  const p = state.player;
  const held = districtsHeldBy(state, p.id).length;
  const total = state.districts.length;
  const contested = state.contests?.length ?? 0; // contests are invasions of the player's turf — own-knowable
  const d = settlementDeltas(state);
  const warn = topFederalWarning(state);
  const obj = firstObjective(state);
  const income = familyIncome(state, p.id);
  const expenses = familyExpenses(p);
  const sections: ScreenSection[] = [
    {
      heading: 'MONEY',
      rows: [
        { kind: 'value', label: 'Clean cash', value: money(cleanCash(p)), delta: deltaStr(d.clean), tone: 'brass' },
        { kind: 'value', label: 'Dirty cash', value: money(p.dirtyCash), delta: deltaStr(d.dirty), tone: 'money' },
        { kind: 'value', label: 'Weekly net', value: money(playerWeeklyNet(state)), tone: playerWeeklyNet(state) >= 0 ? 'brass' : 'blood' },
        { kind: 'value', label: 'Income / Expenses', value: `${money(income)} / ${money(expenses)}`, tone: 'neutral' },
        { kind: 'value', label: 'Uncollected', value: money(totalUncollected(state, p.id)), tone: 'money' },
      ],
    },
    {
      heading: 'THE LAW',
      rows: [
        { kind: 'meter', label: 'Heat', value: p.heat, max: HEAT_MAX, tone: 'blood' },
        { kind: 'value', label: 'Heat', value: `${Math.round(p.heat)}`, delta: deltaStr(d.heat), tone: 'blood' },
        { kind: 'meter', label: 'Federal exposure', value: federalExposure(p), max: 100, thresholds: [FED_WARN_TIER_1, FED_WARN_TIER_2, FED_WARN_TIER_3], tone: 'law' },
        { kind: 'value', label: 'Federal tier', value: federalTierLabel(fedWarningTier(federalExposure(p))), delta: deltaStr(d.exposure), tone: 'law' },
        warn ? { kind: 'value', label: 'Warning', value: warn.message, tone: 'blood' } : { kind: 'note', text: 'No federal heat.' },
      ],
    },
    {
      heading: 'THE CITY',
      rows: [
        { kind: 'value', label: 'Control', value: `${pct(total > 0 ? held / total : 0)} (${held}/${total})`, tone: 'brass' },
        contested > 0
          ? { kind: 'value', label: 'Contested', value: `${contested} under attack`, tone: 'blood' }
          : { kind: 'note', text: 'No turf contested.' },
      ],
    },
    { heading: 'OBJECTIVE', rows: [{ kind: 'value', label: obj.title, value: '', tone: 'brass' }, { kind: 'note', text: obj.detail }] },
  ];
  return { id: 'commandDashboard', title: 'Command Dashboard', sections };
}

// ── 2. Control Map ───────────────────────────────────────────────────────────────────────────────
export function buildControlMap(state: GameState, vis: StatusVisibility): ScreenView {
  const held = heldIds(state);
  const districtRows: ScreenRow[] = state.districts.map((d) => {
    if (!scouted(vis, held, d.id)) return unknownRow(d.name, 'unscouted — no eyes on this block');
    const row = districtStatusOf(state, d.id); // scouted ⇒ rival owner/share is legitimately visible
    if (!row) return unknownRow(d.name);
    const tone = row.status === 'HELD' ? 'brass' : row.status === 'RIVAL' ? 'blood' : row.status === 'CONTESTED' ? 'blood' : 'neutral';
    return { kind: 'value', label: d.name, value: `${row.tag || row.status} · ${pct(row.pct)}`, tone };
  });
  // Cop markers — ONLY the ones the fog funnel says are drawable (copMarkerVisible). Never an unrevealed cop.
  const cops = (state.beatCops ?? []).filter((c) => vis.copVisible(c));
  const copRows: ScreenRow[] = cops.length > 0
    ? cops.map((c) => ({ kind: 'value' as const, label: 'Beat cop', value: `spotted @ ${Math.round(c.pos.gx)},${Math.round(c.pos.gy)}`, tone: 'law' as const, jump: { gx: Math.round(c.pos.gx), gy: Math.round(c.pos.gy) } }))
    : [{ kind: 'note' as const, text: 'No police spotted on revealed streets.' }];
  const target = expandTargetDistrictId(state); // player's OWN expansion intent — safe
  return {
    id: 'controlMap',
    title: 'Control Map',
    sections: [
      { heading: 'DISTRICTS', rows: districtRows },
      { heading: 'POLICE (revealed only)', rows: copRows },
      { heading: 'EXPANSION', rows: [target ? { kind: 'value', label: 'Next push', value: state.districts.find((d) => d.id === target)?.name ?? target, tone: 'brass' } : { kind: 'note', text: 'No expansion target.' }] },
    ],
  };
}

// ── 3. Money Ledger (all SAFE — own money) ────────────────────────────────────────────────────────
export function buildMoneyLedger(state: GameState, _vis: StatusVisibility): ScreenView {
  const p = state.player;
  const upkeep = p.gangsters.reduce((sum, g) => sum + g.upkeep, 0);
  const retainer = Math.max(0, p.bribeLevel - crewBribeDiscount(p));
  return {
    id: 'moneyLedger',
    title: 'Money Ledger',
    sections: [
      {
        heading: 'CASH POSITION',
        rows: [
          { kind: 'value', label: 'Clean cash', value: money(cleanCash(p)), tone: 'brass' },
          { kind: 'value', label: 'Dirty cash', value: money(p.dirtyCash), tone: 'money' },
          { kind: 'value', label: 'Debt', value: money(p.debt), tone: p.debt > 0 ? 'blood' : 'neutral' },
        ],
      },
      {
        heading: 'WEEKLY INCOME',
        rows: [
          { kind: 'source', label: 'Extortion', contribution: money(extortionIncome(state, p.id)), tone: 'money' },
          { kind: 'source', label: 'Operations', contribution: money(operationIncome(state, p.id)), tone: 'money' },
          { kind: 'value', label: 'Gross income', value: money(familyIncome(state, p.id)), tone: 'brass' },
        ],
      },
      {
        heading: 'WEEKLY EXPENSES',
        rows: [
          { kind: 'source', label: 'Crew upkeep', contribution: money(upkeep), tone: 'neutral' },
          { kind: 'source', label: 'Bribe retainers', contribution: money(retainer), tone: 'law' },
          { kind: 'value', label: 'Total expenses', value: money(familyExpenses(p)), tone: 'blood' },
        ],
      },
      {
        heading: 'NET + PENDING',
        rows: [
          { kind: 'value', label: 'Weekly net', value: money(playerWeeklyNet(state)), tone: playerWeeklyNet(state) >= 0 ? 'brass' : 'blood' },
          { kind: 'value', label: 'Uncollected', value: money(totalUncollected(state, p.id)), tone: 'money' },
          { kind: 'value', label: 'Laundering capacity', value: money(launderCapacity(state, p.id)), tone: 'money' },
        ],
      },
    ],
  };
}

// ── 4. Heat / Beat Meter ──────────────────────────────────────────────────────────────────────────
export function buildHeatBeatMeter(state: GameState, vis: StatusVisibility): ScreenView {
  const p = state.player;
  const held = heldIds(state);
  // Own operation heat (SAFE own-ownership test); heat is a single scalar in the sim, so only these two
  // sources are itemizable — the rest fold into the scalar (see DATA_RECON: extort/collect/offense heat
  // are applied inline, never stored per-source). We say so rather than fabricate a breakdown.
  const opHeat = allBiz(state)
    .filter(({ biz }) => ownsBusiness(state, biz) && biz.kind !== 'front')
    .reduce((sum, { biz, district }) => sum + operationHeat(biz, district), 0);
  const districtRows: ScreenRow[] = state.districts.map((d) => {
    if (!scouted(vis, held, d.id)) return unknownRow(d.name, 'police presence unknown — unscouted');
    const insp = inspectDistrict(state, d.id);
    return { kind: 'value', label: d.name, value: `police ${Math.round(insp?.policePresence ?? 0)}`, tone: 'law' };
  });
  return {
    id: 'heatBeatMeter',
    title: 'Heat / Beat Meter',
    sections: [
      { heading: 'STREET HEAT', rows: [
        { kind: 'meter', label: 'Heat', value: p.heat, max: HEAT_MAX, tone: 'blood' },
        { kind: 'value', label: 'Raid risk', value: pct(raidChance(p.heat, p.bribes.police)), tone: 'blood' },
        { kind: 'value', label: 'Weekly decay', value: `−${Math.round(effectiveDecay(p.bribes.politicians))}`, tone: 'neutral' },
      ] },
      { heading: 'SOURCES (itemizable)', rows: [
        { kind: 'source', label: 'Illegal operations', contribution: `+${Math.round(opHeat)}/tick`, tone: 'blood' },
        { kind: 'source', label: 'Dirty-cash hoard', contribution: `+${Math.round(heatFromDirty(p.dirtyCash))}/tick`, tone: 'money' },
        { kind: 'note', text: 'Extortion / collections / violence heat fold into the scalar total (not itemized in-sim). Beat-cop reports: not yet implemented.' },
      ] },
      { heading: 'DISTRICT POLICE (revealed only)', rows: districtRows },
    ],
  };
}

// ── 5. Federal Ladder (all SAFE — own) ────────────────────────────────────────────────────────────
export function buildFederalLadder(state: GameState, _vis: StatusVisibility): ScreenView {
  const p = state.player;
  const exposure = federalExposure(p);
  const armTimer = p.bustArmed ? 'ARMED' : `${Math.max(0, p.fedImminentTicks)}/${FED_ARM_DELAY} at imminent`;
  const fedIncidents = [...state.incidents].reverse()
    .filter((i) => i.type === 'federal_warning' || i.type === 'federal_warrant' || i.type === 'federal_cooldown');
  return {
    id: 'federalLadder',
    title: 'Federal Ladder',
    sections: [
      { heading: 'EXPOSURE', rows: [
        { kind: 'meter', label: 'Federal exposure', value: exposure, max: 100, thresholds: FEDERAL_LADDER.map((t) => t.at), tone: 'law' },
        { kind: 'value', label: 'Current tier', value: federalTierLabel(fedWarningTier(exposure)), tone: 'law' },
        { kind: 'value', label: 'Bust arming', value: armTimer, tone: p.bustArmed ? 'blood' : 'neutral' },
      ] },
      { heading: 'CONTRIBUTIONS', rows: [
        { kind: 'source', label: 'Heat', contribution: `+${Math.round(p.heat)}`, tone: 'blood' },
        { kind: 'source', label: 'Dirty-cash hoard', contribution: `+${Math.round(dirtyExposurePoints(p.dirtyCash))}`, tone: 'money' },
        { kind: 'source', label: 'Bureau bribe relief', contribution: `−${Math.round(fedExposureRelief(p.bribes.feds))}`, tone: 'law' },
      ] },
      { heading: 'THRESHOLDS', rows: FEDERAL_LADDER.map((t) => ({ kind: 'value', label: t.label, value: `${t.at}`, tone: exposure >= t.at ? 'blood' : 'neutral' })) },
      { heading: 'RECENT BUREAU LOG', rows: fedIncidents.length > 0 ? fedIncidents.slice(0, 6).map((i) => ({ kind: 'incident', week: i.week, category: 'federal', severity: i.severity, summary: i.summary, tone: 'law' })) : [{ kind: 'note', text: 'No federal activity on record.' }] },
    ],
  };
}

// ── 6. Thug Roster (all SAFE — own crew) ──────────────────────────────────────────────────────────
export function buildThugRoster(state: GameState, _vis: StatusVisibility): ScreenView {
  const crew = crewReadout(state.player); // own roster, sorted most-disloyal-first
  const deployed = state.units.filter((u) => u.factionId === state.player.id).length;
  const rows: ScreenRow[] = crew.length > 0
    ? crew.map((m) => ({
      kind: 'unit', name: m.name, role: m.assignment, primary: `skill ${m.skill} · loyalty ${m.loyalty}`,
      badge: m.status, assignment: m.assignment, tone: m.loyalty < 35 ? 'blood' : 'brass',
    }))
    : [{ kind: 'note', text: 'No crew yet — recruit muscle.' }];
  return {
    id: 'thugRoster',
    title: 'Thug Roster',
    sections: [
      { heading: `CREW (${crew.length}) · deployed ${deployed}`, rows },
    ],
  };
}

// ── 7. Racket Operations ────────────────────────────────────────────────────────────────────────
export function buildRacketOperations(state: GameState, vis: StatusVisibility): ScreenView {
  const ops = allBiz(state).filter(({ biz }) => biz.kind !== 'front');
  const rows: ScreenRow[] = [];
  let hiddenActivity = false;
  for (const { biz, district } of ops) {
    if (ownsBusiness(state, biz)) {
      // OWN operation — full detail is safe.
      const shut = isShutDown(biz);
      rows.push({
        kind: 'value', label: `${biz.name} · ${biz.kind}`,
        value: `${district.name} · T${tierOf(biz)} · ${money(businessAccrual(biz))}/tick · +${Math.round(operationHeat(biz, district))}h${shut ? ' · SHUT' : ''}${uncollectedOf(biz) > 0 ? ` · ${money(uncollectedOf(biz))} uncollected` : ''}`,
        tone: shut ? 'blood' : 'brass',
      });
      continue;
    }
    // Rival/other operation — surface ONLY if its tile is revealed (scouted). Else mask.
    if (vis.businessVisible(biz.id)) {
      rows.push({ kind: 'value', label: `${biz.name} · ${biz.kind}`, value: `${district.name} · rival racket · T${tierOf(biz)}`, tone: 'blood' });
      continue;
    }
    hiddenActivity = true;
  }
  // One stable rumor for one-or-many hidden operations: no hidden count, type, district or take.
  if (hiddenActivity) rows.push(unknownRow('Unconfirmed activity', 'Details unavailable beyond the fog.'));
  return { id: 'racketOperations', title: 'Racket Operations', sections: [{ heading: 'OPERATIONS ON RECORD', rows: rows.length > 0 ? rows : [{ kind: 'note', text: 'No operations on record.' }] }] };
}

// ── 8. Fronts / Extortion ─────────────────────────────────────────────────────────────────────────
export function buildFrontsExtortion(state: GameState, vis: StatusVisibility): ScreenView {
  const fronts = allBiz(state).filter(({ biz }) => biz.kind === 'front');
  const mine: ScreenRow[] = [];
  const other: ScreenRow[] = [];
  let hiddenActivity = false;
  for (const { biz, district } of fronts) {
    if (ownsBusiness(state, biz)) {
      // OWN extorted front — full detail safe.
      mine.push({ kind: 'value', label: biz.name, value: `${district.name} · paying · ${money(businessAccrual(biz))}/tick${uncollectedOf(biz) > 0 ? ` · ${money(uncollectedOf(biz))} due` : ''}`, tone: 'brass' });
      continue;
    }
    // Unshaken or rival-held front — reveals block/ownership detail; gate on the funnel.
    if (!vis.businessVisible(biz.id)) { hiddenActivity = true; continue; }
    const prog = extortProgress(state, biz.id);
    const rivalHeld = businessEarner(biz) !== undefined; // visible ⇒ we may read who (scouted)
    other.push({
      kind: 'value', label: biz.name,
      value: `${district.name} · ${rivalHeld ? 'RIVAL-HELD' : 'unshaken'}${prog ? ` · ${prog.visits}/${prog.needed} visits` : ''}`,
      tone: rivalHeld ? 'blood' : 'neutral',
    });
  }
  // Do not emit one masked row per hidden front: that was an exact hidden-cardinality oracle.
  if (hiddenActivity) other.push(unknownRow('Unconfirmed activity', 'Details unavailable beyond the fog.'));
  const acts = state.extortionActs ?? []; // player's own thug orders — safe
  return {
    id: 'frontsExtortion',
    title: 'Fronts / Extortion',
    sections: [
      { heading: `YOUR FRONTS (${mine.length})`, rows: mine.length > 0 ? mine : [{ kind: 'note', text: 'No fronts paying yet.' }] },
      { heading: 'OTHER FRONTS', rows: other.length > 0 ? other : [{ kind: 'note', text: 'Nothing else on your radar.' }] },
      { heading: 'ACTIVE SHAKEDOWNS', rows: acts.length > 0 ? [{ kind: 'value', label: 'In progress', value: `${acts.length} thug${acts.length === 1 ? '' : 's'} out`, tone: 'brass' }] : [{ kind: 'note', text: 'No shakedowns in progress.' }] },
    ],
  };
}

// ── 9. Incident Ledger ────────────────────────────────────────────────────────────────────────────
export function buildIncidentLedger(state: GameState, vis: StatusVisibility, limit = 20): ScreenView {
  const held = heldIds(state);
  // Filter the complete bounded ledger BEFORE applying the visible-row limit. Otherwise a burst of hidden
  // rival events could crowd safe rows out and disclose its cardinality indirectly.
  const ordered = [...state.incidents].reverse();
  const visibility = resolveIncidentVisibility(
    ordered,
    state.player.id,
    (districtId) => scouted(vis, held, districtId),
  );
  const rows: ScreenRow[] = visibility.visible.slice(0, Math.max(0, limit)).map((rec) => ({
    kind: 'incident', week: rec.week, category: rec.type, severity: rec.severity, summary: rec.summary,
  }));
  // Exactly one stable rumor for one-or-many hidden records. It carries no count, type, week or severity.
  if (visibility.hasHiddenActivity) rows.push(unknownRow('Word from another part of town', 'Details remain unconfirmed.'));
  return { id: 'incidentLedger', title: 'Incident Ledger', sections: [{ heading: 'RECENT (newest first)', rows: rows.length > 0 ? rows : [{ kind: 'note', text: 'Quiet so far.' }] }] };
}

// ── 10. District Dossier ───────────────────────────────────────────────────────────────────────────
export function buildDistrictDossier(state: GameState, vis: StatusVisibility, districtId?: string): ScreenView {
  const held = heldIds(state);
  const d = state.districts.find((x) => x.id === districtId)
    ?? districtsHeldBy(state, state.player.id)[0]
    ?? state.districts[0];
  if (!d) return { id: 'districtDossier', title: 'District Dossier', sections: [{ rows: [{ kind: 'note', text: 'No districts.' }] }] };
  const title = `District Dossier — ${d.name}`;
  if (!scouted(vis, held, d.id)) {
    return { id: 'districtDossier', title, sections: [{ heading: d.name.toUpperCase(), rows: [unknownRow(d.name, 'unscouted — get eyes on this neighbourhood first')] }] };
  }
  // Scouted ⇒ full detail is legitimate.
  const idx = districtIndex(state, d);
  const ident = districtIdentity(d, idx);
  const row = districtStatusOf(state, d.id);
  const insp = inspectDistrict(state, d.id);
  const bizRows: ScreenRow[] = d.businesses.map((biz) => {
    if (ownsBusiness(state, biz)) return { kind: 'value', label: `${biz.name} · ${biz.kind}`, value: `${money(businessAccrual(biz))}/tick`, tone: 'brass' };
    // rival/unshaken business in this (scouted) district — the district is revealed, so its businesses are too
    return { kind: 'value', label: `${biz.name} · ${biz.kind}`, value: businessEarner(biz) ? 'rival-earned' : 'unclaimed', tone: businessEarner(biz) ? 'blood' : 'neutral' };
  });
  return {
    id: 'districtDossier',
    title,
    sections: [
      { heading: 'IDENTITY', rows: [
        { kind: 'value', label: 'Archetype', value: ident.archetype, tone: 'neutral' },
        { kind: 'value', label: 'Wealth', value: `${districtValue(d, idx)}/5`, tone: 'money' },
        { kind: 'value', label: 'Heat sensitivity', value: `${Math.round((d.heatSensitivity ?? 0) * 100)}%`, tone: 'law' },
      ] },
      { heading: 'CONTROL', rows: [row
        ? { kind: 'value', label: row.status, value: `${pct(row.pct)} (${row.bizHeld}/${row.bizTotal})${row.ownerName && row.owner !== state.player.id ? ` · ${row.ownerName}` : ''}`, tone: row.status === 'HELD' ? 'brass' : 'blood' }
        : { kind: 'note', text: 'No control data.' }] },
      { heading: 'LAW', rows: [{ kind: 'value', label: 'Police presence', value: `${Math.round(insp?.policePresence ?? d.policePresence)}`, tone: 'law' }] },
      { heading: `BUSINESSES (${d.businesses.length})`, rows: bizRows.length > 0 ? bizRows : [{ kind: 'note', text: 'No businesses.' }] },
    ],
  };
}

// ── dispatcher ──────────────────────────────────────────────────────────────────────────────────
export interface BuildArgs { districtId?: string; incidentLimit?: number; }

/** Build any top-10 screen by id. Returns null for an unknown / not-yet-bodied screen id. */
export function buildScreenView(id: string, state: GameState, vis: StatusVisibility, args: BuildArgs = {}): ScreenView | null {
  switch (id) {
    case 'commandDashboard': return buildCommandDashboard(state, vis);
    case 'controlMap': return buildControlMap(state, vis);
    case 'moneyLedger': return buildMoneyLedger(state, vis);
    case 'heatBeatMeter': return buildHeatBeatMeter(state, vis);
    case 'federalLadder': return buildFederalLadder(state, vis);
    case 'thugRoster': return buildThugRoster(state, vis);
    case 'racketOperations': return buildRacketOperations(state, vis);
    case 'frontsExtortion': return buildFrontsExtortion(state, vis);
    case 'incidentLedger': return buildIncidentLedger(state, vis, args.incidentLimit ?? 20);
    case 'districtDossier': return buildDistrictDossier(state, vis, args.districtId);
    default: return null;
  }
}
