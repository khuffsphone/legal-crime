// HUD PHASE 1 — the panel state machine + dossier chips (state/math, never pixels). One drawer at a time:
// toggling opens, toggling the same one closes, opening another REPLACES; ESC/close clears. The strip turns
// live summary data into one labelled chip per drawer.
import { describe, it, expect } from 'vitest';
import {
  initPanels, togglePanel, openPanel, closePanel, isPanelOpen, anyPanelOpen, panelForKey, PANELS,
} from '../src/scenes/hud/panelState';
import { buildDossierChips, dirtyPercent, dossierFitScale, type DossierData } from '../src/scenes/hud/dossierStrip';

describe('panel state — one drawer open at a time', () => {
  it('starts closed', () => {
    const s = initPanels();
    expect(anyPanelOpen(s)).toBe(false);
    expect(s.open).toBeNull();
  });
  it('toggling a panel opens it; toggling the SAME one closes it (its key / ESC)', () => {
    let s = initPanels();
    s = togglePanel(s, 'wire');
    expect(isPanelOpen(s, 'wire')).toBe(true);
    s = togglePanel(s, 'wire');
    expect(anyPanelOpen(s)).toBe(false);
  });
  it('opening a NEW panel REPLACES the current (never two open)', () => {
    let s = openPanel(initPanels(), 'turf');
    expect(isPanelOpen(s, 'turf')).toBe(true);
    s = openPanel(s, 'finance');
    expect(isPanelOpen(s, 'finance')).toBe(true);
    expect(isPanelOpen(s, 'turf')).toBe(false);
    // exactly one (or zero) is ever open
    expect(PANELS.filter((p) => isPanelOpen(s, p.id)).length).toBe(1);
  });
  it('toggling a DIFFERENT panel while one is open swaps to it (still one open)', () => {
    let s = togglePanel(initPanels(), 'wire');
    s = togglePanel(s, 'crew');
    expect(isPanelOpen(s, 'crew')).toBe(true);
    expect(isPanelOpen(s, 'wire')).toBe(false);
  });
  it('close clears whatever is open', () => {
    const s = closePanel(openPanel(initPanels(), 'paths'));
    expect(anyPanelOpen(s)).toBe(false);
  });
  it('the five panel keys map to their drawers (case-insensitive); other keys are null', () => {
    expect(panelForKey('L')).toBe('wire');
    expect(panelForKey('t')).toBe('turf');
    expect(panelForKey('V')).toBe('paths');
    expect(panelForKey('k')).toBe('crew');
    expect(panelForKey('F')).toBe('finance');
    expect(panelForKey('2')).toBeNull(); // [2] stays sabotage — NOT a panel key
    expect(panelForKey('W')).toBeNull();
  });
  it('the keys are collision-free across the five drawers', () => {
    const keys = PANELS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['L', 'T', 'V', 'K', 'F']);
  });
});

describe('dossier chips — one summary line per drawer', () => {
  const data: DossierData = {
    wireUnread: 3, turfHeld: 2, turfTotal: 9, turfContested: 1,
    pathsDom: 4, pathsTotal: 9,
    collectionAuto: 3, collectionWaiting: 180, collectionRoad: 240, collectionRushState: 'ready',
    crewIdle: 5, ledgerDirtyPct: 42,
  };
  it('builds five chips in PANELS order, each with its keycap + summary', () => {
    const chips = buildDossierChips(data);
    expect(chips.map((c) => c.id)).toEqual(['wire', 'turf', 'paths', 'crew', 'finance']);
    expect(chips.map((c) => c.key)).toEqual(['L', 'T', 'V', 'K', 'F']);
    expect(chips[0].label).toBe('Wire · 3 unread');
    expect(chips[1].label).toBe('Turf 2/9 · 1 contested');
    expect(chips[2].label).toBe('AUTO 3 · W$180 · R$240');
    expect(chips[3].label).toBe('Crew · 5 idle');
    expect(chips[4].label).toBe('Ledger · dirty 42%');
  });
  it('makes every collection state explicit in the always-visible Paths chip', () => {
    const base = { ...data, collectionWaiting: 0 };
    expect(buildDossierChips({ ...base, collectionAuto: 0, collectionRoad: 0, collectionRushState: 'nothing-due' })[2].label)
      .toBe('AUTO · first front starts it');
    expect(buildDossierChips({ ...base, collectionRoad: 300, collectionRushState: 'in-flight' })[2].label)
      .toBe('AUTO 3 · IN FLIGHT $300');
    expect(buildDossierChips({ ...base, collectionRoad: 200, collectionRushState: 'nothing-due' })[2].label)
      .toBe('AUTO 3 · R$200');
    expect(buildDossierChips({ ...base, collectionRoad: 0, collectionRushState: 'nothing-due' })[2].label)
      .toBe('AUTO 3 · $0 DUE');
    expect(buildDossierChips({ ...base, collectionWaiting: 180, collectionRoad: 0, collectionRushState: 'ready' })[2].label)
      .toBe('AUTO 3 · W$180 · [C] RUSH');
    for (const sample of [
      buildDossierChips({ ...base, collectionAuto: 0, collectionRoad: 0, collectionRushState: 'nothing-due' })[2].label,
      buildDossierChips({ ...base, collectionRoad: 300, collectionRushState: 'in-flight' })[2].label,
      buildDossierChips({ ...base, collectionWaiting: 180, collectionRoad: 240, collectionRushState: 'ready' })[2].label,
      buildDossierChips({ ...base, collectionAuto: 12, collectionWaiting: 25_000, collectionRoad: 25_000, collectionRushState: 'ready' })[2].label,
    ]) expect(sample.length).toBeLessThanOrEqual(28);
  });
  it('dirtyPercent is a whole-number share of the hoard, 0 when broke', () => {
    expect(dirtyPercent(0, 0)).toBe(0);
    expect(dirtyPercent(50, 50)).toBe(50);
    expect(dirtyPercent(750, 250)).toBe(25);
    expect(dirtyPercent(100, 0)).toBe(0);
  });
  it('fits an oversized one-row strip to its logical viewport without enlarging normal copy', () => {
    expect(dossierFitScale(700, 110, 1000)).toBe(1);
    const scale = dossierFitScale(900, 110, 940);
    expect(scale).toBeLessThan(1);
    expect(900 * scale + 110).toBeLessThanOrEqual(920);
  });
});
