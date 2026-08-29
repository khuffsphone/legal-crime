// TARGETABLE GREASE (Playtest #1 balance fix) — the player can choose WHICH channel to grease, and each
// channel maps to a distinct heat SOURCE, so a lean (single-channel) strategy is viable instead of being
// forced to pay all four. These cover: hottest-channel targeting; that paying the relevant channel actually
// reduces the relevant pressure (via the existing pure sim helpers); that grease hits only the chosen channel;
// and that the targeting carries no positional / rival info (no NO-X-RAY leak).
import { describe, it, expect } from 'vitest';
import { greaseEffectReceipt, hottestChannel, channelPressures, type GreasePressure } from '../src/scenes/greaseTargets';
import { BRIBE_CHANNELS, bustAvoidChance } from '../src/sim/bribery';
import { raidChance, effectiveDecay } from '../src/sim/law';
import { federalExposure } from '../src/sim/federal';
import { applyCommand } from '../src/sim/commands';
import { createInitialState } from '../src/sim/state';

const calm: GreasePressure = { raidRisk: 0, federalExposure: 0, heat: 0, bustArmed: false };

describe('hottestChannel — [G] targets the channel under the most pressure (run lean)', () => {
  it('raid risk hot → POLICE; federal exposure hot → FEDS; heat hot → POLITICIANS', () => {
    expect(hottestChannel({ ...calm, raidRisk: 0.9 })).toBe('police');
    expect(hottestChannel({ ...calm, federalExposure: 95 })).toBe('feds');
    expect(hottestChannel({ ...calm, heat: 95 })).toBe('politicians');
  });
  it('an armed bust is the terminal emergency → JUDGES (springs the boss), over everything else', () => {
    expect(hottestChannel({ raidRisk: 0.5, federalExposure: 60, heat: 80, bustArmed: true })).toBe('judges');
  });
});

describe('each channel maps to its OWN heat source — paying the relevant one reduces the relevant pressure', () => {
  it('POLICE buys down raid chance; POLITICIANS speed heat decay; FEDS cut federal exposure; JUDGES bust survival', () => {
    expect(raidChance(80, 40)).toBeLessThan(raidChance(80, 0));            // more police → fewer raids
    expect(effectiveDecay(40)).toBeGreaterThan(effectiveDecay(0));         // more politicians → faster cool-off
    const fam = createInitialState(1).player;
    fam.heat = 70;
    fam.bribes.feds = 40;
    expect(federalExposure(fam)).toBeLessThan(70);                          // more feds → lower exposure
    expect(bustAvoidChance(40)).toBeGreaterThan(bustAvoidChance(0));        // more judges → survive a bust
  });

  it('a LEAN single-channel play works: concentrating in the hot channel beats spreading the same $ thin', () => {
    // $40 of grease: all into POLICE (the hot channel) vs $10 across all four. Lean cuts raid risk far more.
    const lean = raidChance(80, 40);
    const spread = raidChance(80, 10); // police only got 1 of the 4 rounds under the old forced-cycle
    expect(lean).toBeLessThan(spread);
  });
});

describe('grease applies to the CHOSEN channel only (the rest are untouched)', () => {
  it('setBribe on one channel changes only that channel', () => {
    const s = createInitialState(1);
    s.player.cash = 10_000; // affordable
    applyCommand(s, { type: 'setBribe', familyId: 'player', channel: 'police', amount: 30 });
    expect(s.player.bribes.police).toBe(30);
    expect(s.player.bribes.judges).toBe(0);
    expect(s.player.bribes.politicians).toBe(0);
    expect(s.player.bribes.feds).toBe(0);
  });
});

describe('no NO-X-RAY leak — targeting is abstract (no positional / rival info)', () => {
  it('pressure is keyed ONLY by the four channels and derives from non-positional scalars', () => {
    const keys = Object.keys(channelPressures({ ...calm, heat: 50 })).sort();
    expect(keys).toEqual([...BRIBE_CHANNELS].sort());
    // GreasePressure carries no unit/fog/rival fields — grease can reveal nothing about hidden rivals.
    expect(Object.keys(calm).sort()).toEqual(['bustArmed', 'federalExposure', 'heat', 'raidRisk']);
  });
});

describe('grease receipts keep the four effects truthful', () => {
  const context = { heat: 80, exposureBefore: 90, exposureAfter: 85 };

  it('says The Beat lowers raid odds without promising a Heat/Exposure drop', () => {
    const read = greaseEffectReceipt('police', 0, 10, context);
    expect(read).toMatch(/raid odds/i);
    expect(read).toMatch(/Heat\/Exposure unchanged/i);
  });

  it('names future cooling for City Hall and immediate exposure relief for The Bureau', () => {
    expect(greaseEffectReceipt('politicians', 0, 10, context)).toMatch(/weekly Heat cooling.*future settlements/i);
    expect(greaseEffectReceipt('feds', 0, 10, context)).toMatch(/Exposure 90 → 85/i);
  });
});
