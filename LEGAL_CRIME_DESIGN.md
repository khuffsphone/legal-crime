# Legal Crime — Design Document

> Authoritative architecture, data model, and mechanics for the Legal Crime Remake.
> This document was authored at project bootstrap (the repo arrived empty). It encodes
> the architecture and mechanics required to drive the strictly-ordered phase plan in
> `LEGAL_CRIME_PLAN.md`. Where the brief named a mechanic but not its numbers, concrete
> values were chosen here and are treated as canonical going forward.

## 1. Concept

Legal Crime is a single-player, turn-based organized-crime management game set in a city
of districts. The player runs a criminal family: extorting businesses, running illegal
operations behind legal fronts, recruiting gangsters, seizing territory, managing police
heat through bribery, and warring with rival AI families. The player wins by dominating
the city and loses by going bankrupt, getting killed, or getting busted.

Time advances in discrete **ticks** (a "week"). Each tick resolves income, expenses,
heat, law pressure, rival actions, and conflict outcomes.

## 2. Architectural rules (non-negotiable)

- **`/src/sim` is pure.** It contains zero Phaser imports and zero DOM/browser
  dependencies. All game logic lives here as plain functions over plain data. It is
  fully unit-tested.
- **`/src/scenes` renders the sim.** Phaser scenes read sim state and dispatch commands.
  Rendering never contains game rules.
- **Determinism.** The simulation is driven by a seeded RNG. `createInitialState(seed)`
  plus an identical ordered list of commands/ticks always produces an identical state.
  No `Math.random`, no `Date.now`, no wall-clock reads inside `/src/sim`.
- **Command pattern.** All mutations of state happen through `applyCommand(state, cmd)`
  or through `tick(state)`. Both return a new (or in-place, but deterministic) state.
  The reducer is the single source of truth for rules.

## 3. Core data model

All types live in `src/sim/types.ts`. The canonical aggregate is `GameState`.

```
GameState {
  seed: number
  rngState: number          // serialized PRNG cursor — state is fully reproducible
  tick: number              // current week, starts at 0
  status: 'playing' | 'won' | 'lost'
  lossReason?: 'bankrupt' | 'dead' | 'busted'
  player: Family            // the human-controlled family (id 'player')
  rivals: Family[]          // AI families
  districts: District[]
  log: GameEvent[]          // append-only structured event log for UI/debug
}

Family {
  id: string
  name: string
  isPlayer: boolean
  cash: number
  heat: number              // 0..100 police attention
  gangsters: Gangster[]
  alive: boolean            // boss alive; false => family eliminated
  bribeLevel: number        // standing bribe (0..) reduces heat gain & raid odds
}

Gangster {
  id: string
  name: string
  skill: number             // 1..10, affects combat & operation yield
  loyalty: number           // 0..100, low loyalty can defect/desert
  upkeep: number            // cash per tick
  assignment: GangsterAssignment   // 'idle' | districtId for guard | operationId
}

District {
  id: string
  name: string
  // control: familyId -> control points (0..100). Sums are NOT forced to 100;
  // dominant family is the one with the most points above CONTROL_HOLD threshold.
  control: Record<string, number>
  businesses: Business[]
  policePresence: number    // 0..100, raises heat cost of operating here
}

Business {
  id: string
  name: string
  kind: BusinessKind        // 'legal' front vs illegal operation type
  baseIncome: number        // per tick gross
  extortedBy?: string       // familyId currently extorting (legal businesses)
  ownerFamily?: string      // familyId running an illegal operation
  heatPerTick: number       // heat generated while operating (illegal)
}
```

`BusinessKind`: `'front' | 'numbers' | 'smuggling' | 'speakeasy' | 'protection'`.
`'front'` businesses are legitimate and can be extorted. The others are illegal
operations a family establishes (Phase 3).

## 4. Mechanics by system

### 4.1 Economy & tick (Phase 1)
- Each tick: family income = extortion income + illegal-operation income; expenses =
  gangster upkeep + bribe upkeep. `cash += income - expenses`.
- Income from a legal front being extorted = `floor(baseIncome * EXTORT_RATE)`.
- Tick advances `tick += 1` after resolving economy (and, in later phases, heat, law,
  rivals, conflict — in a fixed order documented in §5).

### 4.2 Extortion (Phase 2)
- A family extorts a `front` business in a district where it has control ≥
  `EXTORT_MIN_CONTROL`. Command `extort{familyId, businessId}`.
- Success chance scales with control and assigned muscle; failure adds heat and may
  fail to set `extortedBy`. Extorted businesses pay `EXTORT_RATE` of base income each
  tick to the extorting family.
- Extorting generates `EXTORT_HEAT` per tick.

### 4.3 Illegal businesses (Phase 3)
- Command `establishOperation{familyId, districtId, kind}` spends `OPERATION_COST[kind]`
  to create an illegal `Business` owned by the family in that district.
- Operations yield `baseIncome` per tick and generate `heatPerTick`, amplified by the
  district's `policePresence`.

### 4.4 Gangster management (Phase 4)
- Command `recruitGangster{familyId}` costs `RECRUIT_COST`, adds a gangster with
  seeded-random skill/loyalty within bounds, upkeep set by skill.
- Command `assignGangster{gangsterId, assignment}`.
- Each tick loyalty drifts: paid upkeep and low heat raise it; unpaid upkeep (cash < 0
  prevented — see bankruptcy) and high heat lower it. Loyalty < `DESERT_LOYALTY` →
  chance to desert (removed).

### 4.5 Territory control (Phase 5)
- Control points per family per district. Command `expandControl{familyId, districtId}`
  spends cash + assigned muscle to add control points (capped 100), can reduce rivals'.
- A family "holds" a district if its control ≥ `CONTROL_HOLD` and is the max.

### 4.6 Heat, bribery & law (Phase 6)
- Heat accumulates from operations/extortion/conflict and decays by `HEAT_DECAY`/tick.
- Command `bribe{familyId, amount}` raises `bribeLevel`, which reduces effective heat
  gain and the probability of a police raid.
- Each tick, if `heat ≥ RAID_THRESHOLD`, a raid may occur (seeded): seizes cash,
  removes an operation, or (at very high heat) busts the boss → loss `busted`.

### 4.7 Rival AI (Phase 7)
- Each rival family runs a deterministic policy each tick (after the player's commands,
  before conflict resolution): recruit, expand, establish operations, or bribe, chosen by
  a scored heuristic over its state, with all randomness drawn from the shared seeded RNG.

### 4.8 Hits & conflict (Phase 8)
- Command `orderHit{attackerFamilyId, targetFamilyId}` assigns muscle to attack a rival.
- Resolution compares attacker vs defender effective strength (sum of assigned gangster
  skill, modified by seeded variance). Outcomes: gangster casualties on either side; a
  decisive win against a weakened family can kill its boss (`alive=false`).
- Hits generate large heat.

### 4.9 Win / loss & game flow (Phase 9)
- **Win:** player holds ≥ `WIN_DISTRICTS` fraction of districts AND all rival bosses
  dead → `status='won'`.
- **Loss:** player `cash < BANKRUPT_FLOOR` for the tick resolution → `bankrupt`;
  player boss killed → `dead`; raid bust → `busted`.
- Game flow: player issues commands for the tick, then `endTurn` runs `tick()` which
  resolves systems in fixed order and re-evaluates win/loss.

### 4.10 Integration scene (Phase 10)
- A Phaser scene renders districts, family stats, and a command bar; dispatches commands
  to the sim and re-renders from returned state. No rules in the scene.

## 5. Fixed tick resolution order

`tick(state)` resolves systems in this exact order (later phases fill in steps):
1. Player passive income & expenses (economy).
2. Illegal operation yields + heat.
3. Extortion income + heat.
4. Gangster loyalty drift & desertion.
5. Rival AI actions.
6. Conflict resolution (pending hits).
7. Heat decay, law/raid checks.
8. Win/loss evaluation.
9. `tick += 1`.

Each phase adds its step without reordering earlier ones, preserving determinism of
prior tests as much as possible (new randomness is drawn after existing draws).

## 6. Constants (canonical)

Defined in `src/sim/constants.ts`. Initial values:

```
EXTORT_RATE          = 0.30
EXTORT_MIN_CONTROL   = 20
EXTORT_HEAT          = 3
OPERATION_COST       = { numbers: 500, smuggling: 1500, speakeasy: 1000, protection: 800 }
RECRUIT_COST         = 400
DESERT_LOYALTY       = 20
CONTROL_HOLD         = 50
HEAT_DECAY           = 2
RAID_THRESHOLD       = 60
BANKRUPT_FLOOR       = -1000
WIN_DISTRICTS        = 0.6
```

## 7. RNG

`src/sim/rng.ts` implements a deterministic mulberry32 PRNG with explicit serializable
state (a single uint32 cursor stored on `GameState.rngState`). Helpers: `nextFloat`
(0..1), `nextInt(min,max)`, `chance(p)`, `pick(array)`. Every stochastic decision in the
sim draws from this generator so that seed + commands fully determine outcomes.
