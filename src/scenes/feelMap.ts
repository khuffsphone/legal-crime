// RTS-30e — pure FEEL mapping (Phaser-free, DOM-free): which CONTACT vfx / attack motion / corpse
// memory an event or unit maps to. Mirrors audioMap.ts — the "which effect" decisions live here so
// they're unit-tested, and IsoScene just plays what these return. Encodes the RED DISCIPLINE
// (CANON §1): danger-red is MOTION-ONLY (the kill flash / muzzle), rival-red is STATIC identity, and
// a corpse keeps a DIMMED faction memory — never danger-red, never rival-red on a player figure.

import type { WeaponTier } from '../sim';

/** The CONTACT vfx an offensive verb makes at its target — all MOTION pulses, never a static mark:
 *  raid/attack/assassinate = a muzzle-flash clash; sabotage = a brass-line window-shatter; demolish =
 *  the heaviest, a dust-mushroom + soot shock-ring. */
export type CombatVfx = 'muzzle' | 'shatter' | 'dust';

export function combatVfxForVerb(verb: string): CombatVfx {
  switch (verb) {
    case 'sabotage': return 'shatter';
    case 'demolish': return 'dust';
    default: return 'muzzle'; // raid / attack / assassinate / ambush
  }
}

/** A unit's ATTACK motion by weapon: bare-handed muscle (thug / no weapon) = a melee WIND-UP→SWING;
 *  any weapon tier = an AIM→FIRE recoil with the muzzle motion-flash. */
export type AttackMotion = 'melee' | 'ranged';

export function attackMotionForWeapon(weapon?: WeaponTier | string): AttackMotion {
  return weapon && weapon !== 'thug' ? 'ranged' : 'melee';
}

/** The DIMMED faction-memory role a corpse keeps (a desaturated glint — NOT the live identity, NOT
 *  danger-red): yours = dimmed brass, a rival = dimmed static rival band, a civilian = neutral grey.
 *  Returns a visualSpec role key so the scene tints from the one palette. */
export type CorpseMemoryRole = 'brassDim' | 'rival' | 'fog';

export function corpseMemoryRole(faction: 'player' | 'rival' | 'civilian'): CorpseMemoryRole {
  switch (faction) {
    case 'player': return 'brassDim'; // your man — a dimmed brass glint
    case 'rival': return 'rival';     // a rival — their static identity band, dimmed by the scene
    default: return 'fog';            // a civilian — neutral grey
  }
}

/** Whether a combat outcome COST the actor a man (→ play the kill/downed beat): a repelled raid or a
 *  botched hit both lose the weakest crew member (offense.ts). Pure read of the resolver flags. */
export function outcomeDownedAMan(o: { repelled?: boolean; success?: boolean; eliminated?: boolean }): boolean {
  if (o.repelled) return true;            // the raid was thrown back — a man down
  if (o.success === false) return true;   // the hit failed — a man down
  return false;
}

/** The screen-nudge (px) for a beat: the kill is a ~2px nudge; everything else none (the budget keeps
 *  the camera still unless something died). */
export function killNudgePx(): number {
  return 2;
}
