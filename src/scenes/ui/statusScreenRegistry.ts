// STATUS UI — Phase 0, Ticket 1: the 25-screen metadata REGISTRY (spec "Status Screens & Command UI"
// §6/§7 + §9 fields). Pure data, Phaser-free — no rendering, no shell, no gameplay mutation. This is the
// single source of truth the later shell + screen-body dispatches read; only the top-10 (§8) get working
// bodies in the first production pass, the rest exist as metadata-first placeholders (§13).
//
// `dataSources` here are INDICATIVE source notes (domain/selector level). The authoritative, verified
// field→selector map (with file:line + NO-X-RAY fog flags) for the top-10 lives in
// docs/status-ui/DATA_RECON.md — that recon determines what each body can read vs. what needs new plumbing.

/** Top navigation categories (spec §3). */
export type NavGroup = 'Command' | 'City' | 'Money' | 'Crew' | 'Rackets' | 'Law' | 'War';
export const NAV_GROUPS: readonly NavGroup[] = ['Command', 'City', 'Money', 'Crew', 'Rackets', 'Law', 'War'];

/** MVP status (spec §7 column, widened to every value the table uses). */
export type MvpStatus = 'yes' | 'placeholder' | 'useful' | 'later' | 'optional' | 'debug';
export const MVP_STATUSES: readonly MvpStatus[] = ['yes', 'placeholder', 'useful', 'later', 'optional', 'debug'];

/** Implementation-complexity estimate (spec §9 field). ⚠ The spec DEFINES this field but does not tabulate
 * per-screen values — these are CC estimates (map/overlay + fog-sensitive + missing-data screens rank high,
 * list screens with existing selectors rank low), for sequencing the later body dispatches. */
export type RiskLevel = 'low' | 'medium' | 'high';
export const RISK_LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high'];

/** One screen's registry metadata (spec §9). */
export interface StatusScreen {
  /** Stable programmatic key. */
  id: string;
  /** Player-facing title. */
  title: string;
  navGroup: NavGroup;
  /** Implementation/playability priority (spec §7, 1 = highest). */
  priority: number;
  /** Optional keyboard shortcut (the spec assigns none per-screen; reserved). */
  hotkey?: string;
  /** Indicative sim selectors / scene state / ledger / debug metadata the screen reads. Authoritative
   * field-level map for the top-10 is docs/status-ui/DATA_RECON.md. */
  dataSources: string[];
  /** Initial filter chips the screen offers (spec §6 per-screen Filters; [] when the spec lists none). */
  defaultFilters: string[];
  /** Whether rows can center the camera on their source (district/business/unit/incident/cop/route). */
  jumpToMapSupport: boolean;
  /** Whether the screen is hidden outside debug/dev. */
  debugOnly: boolean;
  mvpStatus: MvpStatus;
  riskLevel: RiskLevel;
}

/** The 25 functional status screens (spec §6/§7), ordered by the §7 priority column. */
export const STATUS_SCREENS: readonly StatusScreen[] = [
  {
    id: 'commandDashboard', title: 'Main Command Dashboard', navGroup: 'Command', priority: 1,
    dataSources: ['player.cash', 'player.dirtyCash', 'familyIncome', 'familyExpenses', 'familyNet', 'player.heat', 'federalExposure', 'fedWarningTier', 'districtsHeld', 'contested', 'totalUncollected', 'alerts(scene)', 'firstObjective', 'state.incidents'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'high',
  },
  {
    id: 'heatBeatMeter', title: 'Heat / Beat Meter', navGroup: 'Law', priority: 2,
    dataSources: ['player.heat', 'heat-source breakdown', 'districtStatus.policePresence', 'raidChance', 'effectiveDecay', 'beatCopReports(missing)'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'medium',
  },
  {
    id: 'federalLadder', title: 'Federal Ladder', navGroup: 'Law', priority: 3,
    dataSources: ['federalExposure', 'fedWarningTier', 'FEDERAL_LADDER', 'dirtyExposurePoints', 'fedExposureRelief', 'player.bustArmed', 'player.fedImminentTicks', 'ledger(federal)'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'medium',
  },
  {
    id: 'thugRoster', title: 'Thug Roster', navGroup: 'Crew', priority: 4,
    dataSources: ['player crew (MovableUnit)', 'unit role/skill/loyalty/upkeep/weapon', 'unitTile', 'downedBodies'],
    defaultFilters: ['idle', 'assigned', 'wounded', 'lowLoyalty', 'specialists', 'collectors'],
    jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'medium',
  },
  {
    id: 'controlMap', title: 'Control Map', navGroup: 'City', priority: 5,
    dataSources: ['districtStatus', 'districtsHeld', 'contested', 'businesses/fronts', 'rackets', 'HQ tiles', 'districtStatus.policePresence', 'routes'],
    defaultFilters: ['control', 'income', 'heat', 'fronts', 'contested', 'routes'], // §6.5 overlay modes
    jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'high',
  },
  {
    id: 'districtDossier', title: 'District Dossier', navGroup: 'City', priority: 6,
    dataSources: ['district wealth/archetype', 'control shares', 'businesses', 'rackets', 'districtStatus.policePresence', 'heatSensitivity', 'collectors', 'state.incidents', 'citizens(later)'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'high',
  },
  {
    id: 'racketOperations', title: 'Racket Operations', navGroup: 'Rackets', priority: 7,
    dataSources: ['allBusinesses', 'operationIncome', 'operationHeat', 'uncollectedOf', 'isShutDown', 'businessActions(upgrade)'],
    defaultFilters: ['byDistrict', 'byType', 'profitable', 'highHeat', 'shutdown', 'upgradeable', 'uncollected'],
    jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'medium',
  },
  {
    id: 'frontsExtortion', title: 'Fronts / Extortion', navGroup: 'Rackets', priority: 8,
    dataSources: ['fronts/businesses', 'business.extortedBy', 'isRivalHeldFront', 'previewExtortFront', 'extortionActs', 'district control'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'medium',
  },
  {
    id: 'moneyLedger', title: 'Money Ledger', navGroup: 'Money', priority: 9,
    dataSources: ['player.cash', 'player.dirtyCash', 'familyIncome', 'familyExpenses', 'familyNet', 'player.bribes(retainers)', 'upkeep', 'debt', 'totalUncollected', 'launderCapacity'],
    defaultFilters: [], jumpToMapSupport: false, debugOnly: false, mvpStatus: 'yes', riskLevel: 'medium',
  },
  {
    id: 'dirtyCashLaundering', title: 'Dirty Cash / Laundering', navGroup: 'Money', priority: 10,
    dataSources: ['player.dirtyCash', 'cleanCash', 'launderCapacity', 'launderFee', 'dirtyExposurePoints', 'fronts(laundering)'],
    defaultFilters: [], jumpToMapSupport: false, debugOnly: false, mvpStatus: 'yes', riskLevel: 'low',
  },
  {
    id: 'briberyChannels', title: 'Bribery Channels', navGroup: 'Law', priority: 11,
    dataSources: ['player.bribes(police/judges/politicians/feds)', 'bribeBracket', 'retainer cost', 'per-channel effect'],
    defaultFilters: [], jumpToMapSupport: false, debugOnly: false, mvpStatus: 'yes', riskLevel: 'low',
  },
  {
    id: 'beatCopStreetLaw', title: 'Beat Cop / Street Law', navGroup: 'Law', priority: 12,
    dataSources: ['beatCops(?cops)', 'copBehavior reports(missing)', 'districtStatus.policePresence', 'patrol overlay'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'placeholder', riskLevel: 'high',
  },
  {
    id: 'incidentLedger', title: 'Incident Ledger', navGroup: 'Command', priority: 13,
    dataSources: ['state.incidents', 'IncidentRecord', 'incidentsByType', 'IncidentType'],
    defaultFilters: ['money', 'law', 'turf', 'crew', 'threat', 'market', 'civic', 'all'],
    jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'low',
  },
  {
    id: 'alertsInbox', title: 'Alerts / Inbox', navGroup: 'Command', priority: 14,
    dataSources: ['alerts(scene)', 'incidentNeedsYou', 'alertCategory', 'collectorThreat', 'topFederalWarning'],
    defaultFilters: ['danger', 'warning', 'opportunity', 'info'],
    jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'medium',
  },
  {
    id: 'collectionRoutes', title: 'Collection Routes', navGroup: 'Money', priority: 15,
    dataSources: ['routeStops', 'routeStatus', 'collectors', 'uncollectedOf', 'districtStatus.policePresence', 'rival threats', 'route phase'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'useful', riskLevel: 'medium',
  },
  {
    id: 'rivalFamilies', title: 'Rival Families', navGroup: 'War', priority: 16,
    dataSources: ['state.rivals', 'rival control shares(fog)', 'rival rackets(fog)', 'aggression', 'rival crew(fog)', 'recent attacks', 'rival HQ(fog)'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'high',
  },
  {
    id: 'warConflict', title: 'War / Conflict', navGroup: 'War', priority: 17,
    dataSources: ['contests', 'contested districts', 'muscle balance', 'recent combat', 'downedBodies', 'retaliation risk'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'useful', riskLevel: 'high',
  },
  {
    id: 'recruitment', title: 'Recruitment', navGroup: 'Crew', priority: 18,
    dataSources: ['available recruits', 'recruit cost', 'skill/loyalty/traits', 'weapon eligibility', 'upkeep'],
    defaultFilters: [], jumpToMapSupport: false, debugOnly: false, mvpStatus: 'useful', riskLevel: 'medium',
  },
  {
    id: 'weaponsSpecialists', title: 'Weapons / Specialists', navGroup: 'Crew', priority: 19,
    dataSources: ['weapon tiers', 'WEAPON_TUNING', 'hitmen/demolitions', 'cost', 'heat implications', 'assigned crew'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'later', riskLevel: 'medium',
  },
  {
    id: 'marketSupply', title: 'Market / Supply', navGroup: 'Money', priority: 20,
    dataSources: ['market(?market)', 'supply/demand/price', 'inventory', 'buy/sell history', 'market shocks'],
    defaultFilters: [], jumpToMapSupport: false, debugOnly: false, mvpStatus: 'optional', riskLevel: 'medium',
  },
  {
    id: 'civicInfluence', title: 'Civic Influence', navGroup: 'City', priority: 21,
    dataSources: ['influence score(missing)', 'civic events', 'city-hall progress(missing)', 'politician bribe effects', 'legal-front value'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'later', riskLevel: 'high',
  },
  {
    id: 'environmentalAtmosphere', title: 'Environmental Atmosphere', navGroup: 'City', priority: 22,
    dataSources: ['district ambience/archetype', 'prop density', 'citizen density', 'sound bed', 'streetscape metadata'],
    defaultFilters: [], jumpToMapSupport: false, debugOnly: true, mvpStatus: 'debug', riskLevel: 'medium',
  },
  {
    id: 'newspaperPublicReputation', title: 'Newspaper / Public Reputation', navGroup: 'Command', priority: 23,
    dataSources: ['state.incidents → headlines(generator missing)', 'reputation'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'later', riskLevel: 'high',
  },
  {
    id: 'objectivesCampaign', title: 'Objectives / Campaign Progress', navGroup: 'Command', priority: 24,
    dataSources: ['firstObjective', 'tutorialCard', 'TUTORIAL_STEPS', 'victory path', 'fail conditions'],
    defaultFilters: [], jumpToMapSupport: true, debugOnly: false, mvpStatus: 'yes', riskLevel: 'medium',
  },
  {
    id: 'settingsOverlays', title: 'Settings / Overlays', navGroup: 'City', priority: 25,
    dataSources: ['overlay toggles(scene)', 'audio settings', 'debug flags'],
    defaultFilters: [], jumpToMapSupport: false, debugOnly: false, mvpStatus: 'yes', riskLevel: 'low',
  },
];

/** Lookup a screen by id (undefined if absent). */
export function statusScreenById(id: string): StatusScreen | undefined {
  return STATUS_SCREENS.find((s) => s.id === id);
}

/** All screens in a nav group, in priority order. */
export function statusScreensByGroup(group: NavGroup): StatusScreen[] {
  return STATUS_SCREENS.filter((s) => s.navGroup === group).sort((a, b) => a.priority - b.priority);
}

/** Spec §8 — the ten screens to build first, in the spec's ranked build order (a specific subset, NOT
 * simply the priority-≤10 or all-'yes' screens). This is the set the data recon (DATA_RECON.md) covers. */
export const TOP_10_SCREEN_IDS: readonly string[] = [
  'commandDashboard', 'controlMap', 'moneyLedger', 'heatBeatMeter', 'federalLadder',
  'thugRoster', 'racketOperations', 'frontsExtortion', 'incidentLedger', 'districtDossier',
];

/** The §8 top-10 screens in ranked build order. */
export function topTenScreens(): StatusScreen[] {
  return TOP_10_SCREEN_IDS.map((id) => statusScreenById(id)).filter((s): s is StatusScreen => s !== undefined);
}

/** Every screen flagged mvpStatus 'yes' (a broader set than the §8 top-10), in priority order. */
export function mvpStatusScreens(): StatusScreen[] {
  return STATUS_SCREENS.filter((s) => s.mvpStatus === 'yes').sort((a, b) => a.priority - b.priority);
}
