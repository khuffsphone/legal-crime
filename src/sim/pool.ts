// RTS-30 living-city Pass 1 — a tiny generic OBJECT POOL. Pure & Phaser-free (the agent T may hold a
// Phaser sprite, but the pool itself touches no Phaser API), so the acquire/release/cap discipline is
// unit-tested directly. Pre-allocates `capacity` items at construction; acquire() activates a free one
// (or null when exhausted), release() returns it. ZERO allocation after warm-up — the backing arrays
// are reused via push/pop, which is the whole point for the per-frame ambient-agent budget.

export class Pool<T> {
  readonly capacity: number;
  private readonly freeList: T[] = [];
  private readonly activeList: T[] = [];

  constructor(capacity: number, factory: () => T) {
    this.capacity = Math.max(0, Math.floor(capacity));
    for (let i = 0; i < this.capacity; i++) this.freeList.push(factory());
  }

  /** Activate a free item, or null if the pool is exhausted. O(1), no allocation. */
  acquire(): T | null {
    const o = this.freeList.pop();
    if (o === undefined) return null;
    this.activeList.push(o);
    return o;
  }

  /** Return an active item to the free list (swap-remove). No allocation. */
  release(o: T): void {
    const i = this.activeList.indexOf(o);
    if (i < 0) return;
    const last = this.activeList.length - 1;
    this.activeList[i] = this.activeList[last];
    this.activeList.pop();
    this.freeList.push(o);
  }

  /** The live items (the backing array — treat as read-only; safe to reverse-iterate with release). */
  get active(): readonly T[] { return this.activeList; }
  get activeCount(): number { return this.activeList.length; }
  get freeCount(): number { return this.freeList.length; }
}
