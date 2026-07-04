// Citizen Life P0 (Rider R4) — the PURE citizen MARKER palette + texture-key scheme. Phaser-free so the
// colour law is unit-testable; cityArt.ts consumes these to BAKE the marker textures and ambientLife.ts to
// look them up. R4 LAW: the marker palette is PED_COATS-family warm neutrals — muted browns/tans/stones —
// NEVER the cop blue-grey, NEVER player brass/gold, NEVER rival blood or danger/cash colours. A citizen
// marker must never be mistaken for a beat cop, a crew unit, or a rival.

import { CITIZEN_ROLES, type CitizenRole } from './roles';

/**
 * 13 warm-neutral marker tones — one per role, PED_COATS family (recon §5: PED_COATS = 0x3a3733 / 0x4a4036 /
 * 0x3a2c20 / 0x5a5043) widened with muted mortar/tan/stone/umber. Every tone is WARM (red channel ≥ blue
 * channel) and muted — no brass-gold, no blood-red, no cash-green, and pointedly no cool blue-grey (the cop
 * silhouette colour). Order matches CITIZEN_ROLES.
 */
export const CITIZEN_MARKER_TONES: readonly number[] = [
  0x3a3733, // worker        (PED_COATS[0])
  0x4a4036, // officeClerk   (PED_COATS[1])
  0x3a2c20, // dockworker    (PED_COATS[2] dark brown)
  0x5a5043, // deliveryWorker(PED_COATS[3])
  0x6b5344, // factoryWorker (warm mortar)
  0xc9a883, // shopkeeper    (sandstone)
  0x8a7a5f, // streetVendor  (muted tan)
  0x746856, // domesticWorker(olive-taupe)
  0x9a8f80, // chauffeur     (warm fog stone)
  0x5c4a3a, // churchgoer    (coffee brown)
  0x847259, // entertainer   (khaki)
  0x6e5b48, // child         (walnut)
  0x463b30, // vagrant       (dark umber)
];

/** Cop / cool blue-grey tones the citizen palette must NEVER contain (R4). Exported so the test asserts the
 * discipline directly (mirrors districtIdentity's RESERVED_COLOURS pattern). */
export const FORBIDDEN_MARKER_COLOURS: readonly number[] = [
  0x2b3a4a, 0x33475a, 0x3a4a5a, 0x455a6e, // cool police blue-greys
  0xb8862b, 0xe3c36a, // player brass / highlight
  0x9e1b1b, 0xe11d1d, 0xff5a2c, 0x4e8b5a, // rival blood / danger / muzzle / cash-green
];

/** Marker display scale (matches the ped read ~46–50 px vs the 56 px crew unit — spec §1.3 / §10.2). */
export const CITIZEN_MARKER_SCALE = 2.2;

/** The index of a role in CITIZEN_ROLES (its tone/marker slot). Pure. */
export function roleIndex(role: CitizenRole): number {
  return CITIZEN_ROLES.indexOf(role);
}

/** The warm-neutral marker tone for a role (R4). Pure. */
export function citizenMarkerTone(role: CitizenRole): number {
  return CITIZEN_MARKER_TONES[roleIndex(role)] ?? CITIZEN_MARKER_TONES[0];
}

/** The baked-texture key for a role's marker (plain, or the debug lettered variant). Pure + stable. */
export function citizenMarkerTexKey(roleIdx: number, withLetter: boolean): string {
  return `lcr_citizen_${roleIdx}${withLetter ? '_L' : ''}`;
}
