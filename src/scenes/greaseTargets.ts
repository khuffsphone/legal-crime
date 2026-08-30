// TARGETABLE GREASE (Playtest #1 balance fix) — pure, Phaser-free targeting for the four bribe channels. The
// degenerate strategy the playtest exposed: grease was a BLIND CYCLE (each [G] bumped "the next" channel), so
// to keep heat down the player was forced to pay ALL FOUR every week — which starved every non-mayor win path.
//
// The four channels ALREADY map to distinct heat SOURCES in the sim (police→raid chance, politicians→heat
// decay, judges→bust survival, feds→federal exposure). This module lets the scene pick WHICH channel to grease
// — directly (click a channel) or via [G] targeting the HOTTEST one — so a lean player greases only what's hot.
// It does NOT touch the sim's heat model (tick/law/commands are sacred); it only decides the target channel.

import { BRIBE_CHANNELS, bustAvoidChance } from '../sim/bribery';
import { HEAT_MAX } from '../sim/constants';
import { effectiveDecay, raidChance } from '../sim/law';
import type { BribeChannel } from '../sim';

/** Current pressure readings, each addressed by ONE channel. Sourced from the existing pure sim helpers. */
export interface GreasePressure {
  /** Raid probability (0..1) — bought down by POLICE (The Beat). */
  raidRisk: number;
  /** Federal exposure (0..100) — bought down by FEDS (The Bureau). */
  federalExposure: number;
  /** Raw heat (0..HEAT_MAX) — cooled faster by POLITICIANS (City Hall, decay). */
  heat: number;
  /** A bust is armed — survived by JUDGES (The Bench, springs the boss). */
  bustArmed: boolean;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Normalised [0,1] pressure on each channel — how badly each one needs greasing right now. An armed bust is the
 * terminal emergency, so judges reads max while it holds. Pure.
 */
export function channelPressures(p: GreasePressure): Record<BribeChannel, number> {
  const heatMax = HEAT_MAX > 0 ? HEAT_MAX : 100;
  return {
    police: clamp01(p.raidRisk),
    judges: p.bustArmed ? 1 : 0,
    politicians: clamp01(p.heat / heatMax),
    feds: clamp01(p.federalExposure / 100),
  };
}

/**
 * The single channel under the MOST pressure — the one a lean player should grease, so [G] can target the hot
 * channel instead of blindly cycling all four. Ties resolve in BRIBE_CHANNELS order (stable, deterministic).
 * Pure.
 */
export function hottestChannel(p: GreasePressure): BribeChannel {
  const score = channelPressures(p);
  let best: BribeChannel = BRIBE_CHANNELS[0];
  for (const c of BRIBE_CHANNELS) if (score[c] > score[best]) best = c;
  return best;
}

export interface GreaseReceiptContext {
  heat: number;
  exposureBefore: number;
  exposureAfter: number;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** Exact player-facing effect of a successful channel increase. Keeps Heat, raid risk, and Federal
 * Exposure distinct so the receipt can never promise that The Beat lowers the visible exposure meter. */
export function greaseEffectReceipt(
  channel: BribeChannel,
  beforeLevel: number,
  afterLevel: number,
  context: GreaseReceiptContext,
): string {
  switch (channel) {
    case 'police':
      return `raid odds ${percent(raidChance(context.heat, beforeLevel))} → ${percent(raidChance(context.heat, afterLevel))}; Heat/Exposure unchanged`;
    case 'judges':
      return `bust survival ${percent(bustAvoidChance(beforeLevel))} → ${percent(bustAvoidChance(afterLevel))}; Heat/Exposure unchanged`;
    case 'politicians':
      return `weekly Heat cooling ${effectiveDecay(beforeLevel)} → ${effectiveDecay(afterLevel)} on future settlements`;
    case 'feds':
      return `Exposure ${context.exposureBefore} → ${context.exposureAfter}; raw Heat unchanged`;
  }
}
