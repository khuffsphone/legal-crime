// PLAYTEST FIX (Part 1, Finding C) — the FRONT-ACTION CLASSIFIER (state/math, never pixels). RETAKE (a
// rival-HELD block) and DEFEND (your block under contest) must read as DISTINCT verbs, each enabled by the
// right precondition — closing the conceptual gap where a player expected "retake" on a merely contested block.
import { describe, it, expect } from 'vitest';
import { classifyFrontAction, type FrontActionInputs } from '../src/scenes/frontActions';

const OK = { ok: true, reason: 'ready' };
const GUARDED = { ok: false, reason: 'a rival is guarding this block — clear them out' };

function inp(over: Partial<FrontActionInputs> = {}): FrontActionInputs {
  return { rivalHeld: false, extortable: false, playerHeld: false, contested: false, gate: OK, hasSelection: true, ...over };
}

describe('rival-HELD → RETAKE (distinct from defend), gated by the 35d guard gate', () => {
  it('a cleared rival-held front → RETAKE, enabled', () => {
    const p = classifyFrontAction(inp({ rivalHeld: true, gate: OK }));
    expect(p.verb).toBe('retake');
    expect(p.label).toBe('RETAKE');
    expect(p.enabled).toBe(true);
  });
  it('a GUARDED rival-held front → RETAKE, disabled, surfaces the guard reason', () => {
    const p = classifyFrontAction(inp({ rivalHeld: true, gate: GUARDED }));
    expect(p.verb).toBe('retake');
    expect(p.enabled).toBe(false);
    expect(p.hint).toMatch(/guard/i);
  });
});

describe('un-taken → EXTORT', () => {
  it('an extortable front → EXTORT, follows the gate', () => {
    expect(classifyFrontAction(inp({ extortable: true, gate: OK })).verb).toBe('extort');
    expect(classifyFrontAction(inp({ extortable: true, gate: GUARDED })).enabled).toBe(false);
  });
});

describe('player-held + CONTESTED → DEFEND (the conceptual-gap fix, distinct from retake)', () => {
  it('your block under contest → DEFEND, enabled when muscle is selected', () => {
    const p = classifyFrontAction(inp({ playerHeld: true, contested: true, hasSelection: true }));
    expect(p.verb).toBe('defend');
    expect(p.label).toBe('DEFEND');
    expect(p.label).not.toBe('RETAKE'); // legibly distinct
    expect(p.enabled).toBe(true);
    expect(p.hint).toMatch(/hold/i);
  });
  it('DEFEND needs a selection — disabled with a clear prompt otherwise', () => {
    const p = classifyFrontAction(inp({ playerHeld: true, contested: true, hasSelection: false }));
    expect(p.verb).toBe('defend');
    expect(p.enabled).toBe(false);
    expect(p.hint).toMatch(/select/i);
  });
});

describe('quiet player-held / nothing-to-do', () => {
  it('your block, NOT contested → no action, says it already pays', () => {
    const p = classifyFrontAction(inp({ playerHeld: true, contested: false }));
    expect(p.verb).toBe('none');
    expect(p.enabled).toBe(false);
    expect(p.hint).toMatch(/already pays/i);
  });
});
