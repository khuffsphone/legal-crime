// Pure, deterministic PRNG. No Phaser, no browser globals, no Math.random.
//
// Implements mulberry32 with an explicit, serializable uint32 state cursor. The
// generator is value-based: callers pass the current cursor and receive the next value
// plus the advanced cursor, OR use the stateful `Rng` wrapper that stores the cursor.
// Storing only a single uint32 means a GameState is fully reproducible from (seed, cursor).

export interface RngStep {
  value: number; // float in [0, 1)
  state: number; // next cursor (uint32)
}

/** Advance a mulberry32 cursor once, returning the float and the next cursor. */
export function mulberry32(state: number): RngStep {
  let a = state >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a >>> 0 };
}

/**
 * Stateful RNG wrapper around a cursor. Construct from a cursor (e.g. GameState.rngState),
 * draw values, then read `.state` back out to persist. Mutating only this object keeps
 * the sim deterministic so long as draws happen in a fixed order.
 */
export class Rng {
  private cursor: number;

  constructor(state: number) {
    this.cursor = state >>> 0;
  }

  /** Current serializable cursor. */
  get state(): number {
    return this.cursor >>> 0;
  }

  /** Next float in [0, 1). */
  nextFloat(): number {
    const step = mulberry32(this.cursor);
    this.cursor = step.state;
    return step.value;
  }

  /** Integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number {
    if (max < min) throw new Error(`nextInt: max (${max}) < min (${min})`);
    const span = max - min + 1;
    return min + Math.floor(this.nextFloat() * span);
  }

  /** True with probability p (clamped to [0,1]). */
  chance(p: number): boolean {
    const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
    return this.nextFloat() < clamped;
  }

  /** Pick a uniformly random element. Throws on empty arrays. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: empty array');
    return items[this.nextInt(0, items.length - 1)];
  }
}

/**
 * Derive an initial cursor from a seed. We run mulberry32 once so that a seed of 0 does
 * not produce a degenerate first draw, and so seeds map to well-spread cursors.
 */
export function seedToCursor(seed: number): number {
  return mulberry32(seed >>> 0).state;
}
