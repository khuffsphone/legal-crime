// Initial-state construction. Pure & deterministic: createInitialState(seed) always
// produces the same world for the same seed.

import { STARTING_CREW_UPKEEP } from './constants';
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

// Phase 19 balance: a touch more early-game runway so a run doesn't end abruptly while the
// player is still establishing income. (was 2000.)
const STARTING_CASH = 3000;

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
export function createInitialState(
  seed: number,
  options?: { shocks?: boolean; startingCrew?: boolean; tutorialFreeRuns?: number },
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
    player.gangsters.push(
      { id: 'player-g-0', name: 'Sal', skill: 3, loyalty: 70, upkeep: STARTING_CREW_UPKEEP, assignment: { type: 'guard', districtId: 'district-0' } },
      { id: 'player-g-1', name: 'Vito', skill: 3, loyalty: 70, upkeep: STARTING_CREW_UPKEEP, assignment: { type: 'guard', districtId: 'district-0' } },
    );
  }

  const districts: District[] = DISTRICT_NAMES.map((name, di) => {
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
    return {
      id,
      name,
      control,
      policePresence: rng.nextInt(10, 40),
      businesses,
    };
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
    incidents: [],
    incidentSeq: 0,
    incidentLogCursor: 0,
    log: [],
  };
}
