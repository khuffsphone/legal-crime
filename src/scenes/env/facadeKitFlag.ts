// facadeKitFlag.ts — the reversible opt-in for the Phase-2 vector storefront facades. Mirrors ?sprites:
// OFF by default, so the current drawFacade look is untouched until K flips ?facadekit ON. This is the
// rollback valve for the all-at-once low-tier replace — the old path stays intact and reachable at any time.

const TRUTHY = new Set(['1', 'true', 'yes', 'on', '']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

/**
 * Is the vector facade kit requested? `?facadekit` (or any non-falsy value) turns it ON; absent or a falsy
 * value (`0`/`false`/`no`/`off`) leaves the current procedural facade untouched. Pure; tolerant of junk input.
 */
export function facadeKitRequested(search: string): boolean {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get('facadekit');
  } catch {
    return false;
  }
  if (raw === null) return false;
  const v = raw.toLowerCase();
  if (FALSY.has(v)) return false;
  return TRUTHY.has(v) || true; // any other non-falsy value still opts in
}
