import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInitialState } from '../src/sim/state';
import {
  NOIR_PALETTE,
  NOIR_FONT,
  bribeChannelLabel,
  shockFlavor,
  tierName,
  heatLabel,
  moneyLine,
  statusNarration,
} from '../src/scenes/theme';
import { newGame, narrate, playerView, statusView, districtViews } from '../src/scenes/adapter';
import { applyCommand } from '../src/sim/commands';

describe('Fedora Noir theme constants', () => {
  it('exposes the canonical palette and a mono font', () => {
    expect(NOIR_PALETTE.ink).toBe('#14110f');
    expect(NOIR_PALETTE.brass).toBe('#c79a4b');
    expect(NOIR_PALETTE.bone).toBe('#e8e2d4');
    expect(NOIR_FONT).toMatch(/mono/i);
  });
});

describe('noir flavor strings', () => {
  it('names each bribery channel', () => {
    expect(bribeChannelLabel('police')).toBe('The Beat');
    expect(bribeChannelLabel('judges')).toBe('The Bench');
    expect(bribeChannelLabel('politicians')).toBe('City Hall');
    expect(bribeChannelLabel('feds')).toBe('The Bureau');
  });

  it('names each shock', () => {
    expect(shockFlavor('crackdown')).toBe('Police Crackdown');
    expect(shockFlavor('audit')).toBe('Federal Audit');
    expect(shockFlavor('gangWar')).toBe('Gang War');
    expect(shockFlavor('speakeasyRaid')).toBe('Speakeasy Raid');
  });

  it('names operation tiers and heat bands', () => {
    expect(tierName(1)).toBe('Street');
    expect(tierName(2)).toBe('Block');
    expect(tierName(3)).toBe('Empire');
    expect(heatLabel(0)).toBe('Quiet');
    expect(heatLabel(50)).toBe('Heated');
    expect(heatLabel(95)).toBe('Marked');
  });

  it('frames clean/dirty money', () => {
    expect(moneyLine(700, 300)).toBe('Clean $700 · Dirty $300');
  });
});

describe('status narration', () => {
  it('narrates the week while playing and the end on each loss/win', () => {
    const s = createInitialState(1);
    expect(statusNarration(s)).toBe('Week 0 — the city sleeps with one eye open.');
    expect(narrate(s)).toBe(statusNarration(s)); // adapter convenience matches

    s.status = 'won';
    expect(statusNarration(s)).toMatch(/city is yours/i);

    s.status = 'lost';
    s.lossReason = 'busted';
    expect(statusNarration(s)).toMatch(/Bureau/);
    s.lossReason = 'bankrupt';
    expect(statusNarration(s)).toMatch(/shark/i);
    s.lossReason = 'dead';
    expect(statusNarration(s)).toMatch(/river/i);
  });
});

describe('adapter exposes the enriched view model for the reskin', () => {
  it('player view carries clean/dirty/debt/uncollected and bribe channels', () => {
    const s = newGame(1);
    s.player.cash = 1000;
    s.player.dirtyCash = 400;
    s.player.debt = 250;
    s.player.bribes.judges = 30;
    const v = playerView(s);
    expect(v.cleanCash).toBe(600);
    expect(v.dirtyCash).toBe(400);
    expect(v.debt).toBe(250);
    expect(v.bribes.judges).toBe(30);
  });

  it('district view carries player operation tiers and uncollected', () => {
    const s = newGame(1);
    s.player.cash = 20000;
    applyCommand(s, { type: 'establishOperation', familyId: 'player', districtId: 'district-0', kind: 'numbers' });
    const op = s.districts[0].businesses.at(-1)!;
    applyCommand(s, { type: 'upgradeOperation', familyId: 'player', businessId: op.id });
    const view = districtViews(s).find((d) => d.id === 'district-0')!;
    expect(view.playerOperationTiers).toContain(2);
  });

  it('status view lists active shocks for the HUD', () => {
    const s = newGame(1, { shocks: true });
    s.activeShocks = [{ kind: 'crackdown', ticksRemaining: 2 }];
    expect(statusView(s).shocks).toEqual([{ kind: 'crackdown', ticksRemaining: 2 }]);
  });
});

describe('architecture invariant still holds after the reskin', () => {
  it('no file under src/sim imports phaser, and the theme lives outside the sim', () => {
    const simDir = join(process.cwd(), 'src', 'sim');
    const offenders: string[] = [];
    for (const file of readdirSync(simDir)) {
      if (!file.endsWith('.ts')) continue;
      const src = readFileSync(join(simDir, file), 'utf8');
      if (/\bfrom\s+['"]phaser['"]/i.test(src) || /\brequire\(\s*['"]phaser['"]\s*\)/i.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
    // The theme module is a scene concern, not a sim concern.
    expect(readdirSync(simDir)).not.toContain('theme.ts');
  });
});
