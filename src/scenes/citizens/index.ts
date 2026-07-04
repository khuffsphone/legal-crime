// Citizen Life P0 — public surface of the PURE citizen data + planner modules (scene-adjacent, env/-pattern:
// presentation-only, never /src/sim). This barrel is Phaser-free; the only Phaser consumers are ambientLife.ts
// (the pooled agent host) and cityArt.ts (marker bakes). Tests import from here.

export * from './roles';
export * from './planner';
export * from './states';
export * from './caps';
export * from './reactions';
export * from './flags';
export * from './markers';
