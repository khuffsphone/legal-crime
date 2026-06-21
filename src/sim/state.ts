// Initial-state construction. Pure & deterministic: createInitialState(seed) always
// produces the same world for the same seed.

import { STARTING_CREW_UPKEEP } from './constants';
import { CITY_ARCHETYPES, GRID3_NEIGHBORS } from './city';
import { Rng, seedToCursor } from './rng';
import type { Business, District, Family, GameState } from './types';

const DISTRICT_NAMES = [
  'Dockside',
  'Little Italy',
  'The Heights',
  'Riverside',
  'Old Town',
];

const FRONT_NAMES = [
  'Corner Grocer',
  'Tony\'s Diner',
  'Laundromat',
  'Cigar Shop',
  'Barber Shop',
  'Tailor',
  'Newsstand',
  'Garage',
];

// Phase 19/21 balance: early-game runway so a run doesn't flatline while the player is still
// establishing income. RTS-21: 3000 → 3500 — the extra $500 covers expand-home + a first racket +
// a recruit without dropping to $0 before the economy ramps. (was 2000 → 3000.)
const STARTING_CASH = 3500;

function makeFront(rng: Rng, districtId: string, index: number, namePool: Rng): Business {
  const baseIncome = 80 + namePool.nextInt(0, 8) * 10; // 80..160
  return {
    id: `${districtId}-front-${index}`,
    name: FRONT_NAMES[rng.nextInt(0, FRONT_NAMES.length - 1)],
    kind: 'front',
    baseIncome,
    heatPerTick: 0,
    districtId,
    uncollected: 0,
  };
}

function makeFamily(id: string, name: string, isPlayer: boolean): Family {
  return {
    id,
    name,
    isPlayer,
    cash: STARTING_CASH,
    dirtyCash: 0,
    heat: 0,
    bribeLevel: 0,
    bribes: { police: 0, judges: 0, politicians: 0, feds: 0 },
    debt: 0,
    fedWarningLevel: 0,
    bustArmed: false,
    fedImminentTicks: 0,
    alive: true,
    gangsters: [],
  };
}

/**
 * Build a fresh, fully deterministic world. Five districts, each seeded with several
 * front businesses and a police-presence rating. Player starts in the first district
 * with a small foothold; two rival families seed control in others.
 */
/** RTS-16 — the big 9-district contested city (a 3×3 grid with identities + adjacency). Opt-in
 * (createInitialState({ bigCity: true })) so the legacy 5-district map stays the default. */
function buildBigCity(rng: Rng): District[] {
  return CITY_ARCHETYPES.map((proto, di) => {
    const id = `district-${di}`;
    const businessCount = rng.nextInt(2, 4);
    const businesses: Business[] = [];
    for (let bi = 0; bi < businessCount; bi++) {
      const baseIncome = 50 + proto.wealth * 22 + rng.nextInt(0, 4) * 10; // richer = fatter
      businesses.push({
        id: `${id}-front-${bi}`,
        name: FRONT_NAMES[rng.nextInt(0, FRONT_NAMES.length - 1)],
        kind: 'front',
        baseIncome,
        heatPerTick: 0,
        districtId: id,
        uncollected: 0,
      });
    }
    const control: Record<string, number> = {};
    if (di === 0) control.player = 30; // your home corner
    if (di === 2) control['rival-a'] = 40; // The Moretti home (rich Heights)
    if (di === 6) control['rival-b'] = 40; // The Kowalski home (South Side)
    return {
      id,
      name: proto.name,
      control,
      policePresence: rng.nextInt(10, 30) + Math.round(proto.heatSensitivity * 30),
      businesses,
      wealth: proto.wealth,
      heatSensitivity: proto.heatSensitivity,
      archetype: proto.archetype,
      neighbors: GRID3_NEIGHBORS[di].map((n) => `district-${n}`),
    };
  });
}

export function createInitialState(
  seed: number,
  options?: { shocks?: boolean; startingCrew?: boolean; tutorialFreeRuns?: number; bigCity?: boolean },
): GameState {
  const rng = new Rng(seedToCursor(seed));

  const player = makeFamily('player', 'Player Family', true);
  const rivalA = makeFamily('rival-a', 'The Moretti Family', false);
  const rivalB = makeFamily('rival-b', 'The Kowalski Crew', false);

  // RTS-11 onboarding: optionally seed the player with a small loyal crew so a new player has
  // muscle for the first shakedown AND some defense, instead of starting helpless. Stats are
  // FIXED (no RNG draw), so the seeded PRNG cursor — and every determinism test — is unchanged
  // whether or not the crew is requested. Two guards (< MUTINY_MIN_CREW) cannot mutiny early.
  if (options?.startingCrew) {
    // RTS-14: fixed traits + a tie (no RNG draw, cursor-safe). Sal is Loyal (your old reliable),
    // Vito is Brutal (your muscle); they came up together — allies.
    player.gangsters.push(
      { id: 'player-g-0', name: 'Sal', skill: 3, loyalty: 70, upkeep: STARTING_CREW_UPKEEP, assignment: { type: 'guard', districtId: 'district-0' }, traits: ['loyal'] },
      { id: 'player-g-1', name: 'Vito', skill: 3, loyalty: 70, upkeep: STARTING_CREW_UPKEEP, assignment: { type: 'guard', districtId: 'district-0' }, traits: ['brutal'] },
    );
    player.ties = [{ a: 'player-g-0', b: 'player-g-1', kind: 'ally' }];
  }

  const districts: District[] = options?.bigCity
    ? buildBigCity(rng)
    : DISTRICT_NAMES.map((name, di) => {
        const id = `district-${di}`;
        const businessCount = rng.nextInt(2, 4);
        const businesses: Business[] = [];
        for (let bi = 0; bi < businessCount; bi++) {
          businesses.push(makeFront(rng, id, bi, rng));
        }
        const control: Record<string, number> = {};
        // Player gets a foothold in district 0; rivals seed their home turf.
        if (di === 0) control.player = 30;
        if (di === 2) control['rival-a'] = 40;
        if (di === 4) control['rival-b'] = 40;
        return { id, name, control, policePresence: rng.nextInt(10, 40), businesses };
      });

  return {
    seed,
    rngState: rng.state,
    tick: 0,
    status: 'playing',
    player,
    rivals: [rivalA, rivalB],
    districts,
    pendingHits: [],
    activeShocks: [],
    shocksEnabled: options?.shocks ?? false,
    weekElapsed: 0,
    units: [],
    tutorialFreeRuns: options?.tutorialFreeRuns ?? 0,
    strategyElapsed: 0,
    offenseCooldown: 0,
    incidents: [],
    incidentSeq: 0,
    incidentLogCursor: 0,
    log: [],
  };
}
