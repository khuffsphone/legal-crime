// Ticket D — the priority + cooldown queue reducer. Guards duplicate-spam suppression (same cooldownKey
// ⇒ one voice per window), priority-1 preservation (never load-shed), low-priority-LOCAL-first shedding
// under load, cooldown expiry, and purity/determinism (caller-supplied clock, inputs untouched).
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COOLDOWN_MS, DEFAULT_MAX_VOICES_PER_STEP, createCueQueueState, reduceCueQueue,
} from '../src/scenes/audio/cueQueue';
import { cueFor, type AudioCueDescriptor } from '../src/scenes/audio/sfxEventMapper';

const hit = (n = 0): AudioCueDescriptor => cueFor('sfx_hit_rifle', 'hit:rifle', `spam${n}`, { gx: 1, gy: 1 });
const cash = (): AudioCueDescriptor => cueFor('cashdrop', 'cash', 'bank');
const siren = (): AudioCueDescriptor => cueFor('siren', 'raid', 'raid');       // priority 1
const mutiny = (): AudioCueDescriptor => cueFor('mutiny', 'mutiny', 'mutiny'); // priority 1
const extort = (): AudioCueDescriptor => cueFor('extort', 'extort:b1', 'extort'); // p3 global
const door = (): AudioCueDescriptor => cueFor('door', 'door', 'door');         // p4 global
const wire = (): AudioCueDescriptor => cueFor('wire_routine', 'wire:r', 'wire'); // p4 hud

describe('cue queue — duplicate-spam suppression', () => {
  it('collapses an in-batch burst of the same cooldownKey to ONE voice', () => {
    const r = reduceCueQueue(createCueQueueState(), [hit(1), hit(2), hit(3), hit(4)], 1000);
    expect(r.play).toHaveLength(1);
    expect(r.dropped.filter((d) => d.reason === 'duplicate-in-batch')).toHaveLength(3);
  });

  it('suppresses a repeat within the cooldown window, allows it after expiry', () => {
    let state = createCueQueueState();
    const first = reduceCueQueue(state, [hit()], 1000);
    expect(first.play).toHaveLength(1);
    state = first.state;
    // 100ms later — inside combat's 150ms window ⇒ suppressed
    const tooSoon = reduceCueQueue(state, [hit()], 1100);
    expect(tooSoon.play).toHaveLength(0);
    expect(tooSoon.dropped[0].reason).toBe('cooldown');
    // window elapsed ⇒ plays again
    const later = reduceCueQueue(tooSoon.state, [hit()], 1000 + DEFAULT_COOLDOWN_MS.combat + 1);
    expect(later.play).toHaveLength(1);
  });

  it('different cooldownKeys never suppress each other', () => {
    const r = reduceCueQueue(createCueQueueState(), [hit(), cash(), extort()], 1000);
    expect(r.play).toHaveLength(3);
  });

  it('dedupe applies to priority-1 spam too (spam suppression is about identity, not rank)', () => {
    const r = reduceCueQueue(createCueQueueState(), [siren(), siren(), siren()], 1000);
    expect(r.play).toHaveLength(1);
  });

  it('an in-batch duplicate keeps the HIGHER-priority cue', () => {
    const low = { ...cueFor('sfx_hit_fists', 'shared', 'low', { gx: 0, gy: 0 }) };          // p3
    const high = { ...cueFor('sfx_down_thud', 'shared', 'high', { gx: 0, gy: 0 }) };        // p2
    const r = reduceCueQueue(createCueQueueState(), [low, high], 1000);
    expect(r.play.map((c) => c.key)).toEqual(['sfx_down_thud']);
  });
});

describe('cue queue — priority + load shedding', () => {
  it('preserves EVERY priority-1 cue under load, even beyond the voice cap', () => {
    const flood = [siren(), mutiny(), hit(1), cash(), extort(), door(), wire()];
    const r = reduceCueQueue(createCueQueueState(), flood, 1000, { maxVoicesPerStep: 2 });
    const played = r.play.map((c) => c.key);
    expect(played).toContain('siren');
    expect(played).toContain('mutiny'); // both P1 survive even with cap 2
  });

  it('drops low-priority LOCAL texture first under load (global info outranks local on ties)', () => {
    // cap 2: extort (p3 global) + one of the p4s should survive over... construct precisely:
    // candidates: hit p3 LOCAL, extort p3 GLOBAL, door p4 global, wire p4 hud → cap 2 ⇒
    // sort: (p3 global extort) < (p3 local hit) < (p4 door) < (p4 wire) ⇒ play extort+hit; drop door+wire?
    // The ticket's rule is about locals shedding first ON EQUAL priority: extort beats hit at p3.
    const r = reduceCueQueue(createCueQueueState(), [hit(), extort(), door(), wire()], 1000, { maxVoicesPerStep: 1 });
    expect(r.play.map((c) => c.key)).toEqual(['extort']); // global p3 outranks local p3; p4s shed
    const dropped = r.dropped.filter((d) => d.reason === 'load').map((d) => d.cue.key);
    expect(dropped).toContain('sfx_hit_rifle'); // the local texture shed
    expect(dropped).toContain('door');
    expect(dropped).toContain('wire_routine');
  });

  it('orders the played list by priority (1 first), stable within a rank', () => {
    const r = reduceCueQueue(createCueQueueState(), [door(), hit(), siren()], 1000);
    expect(r.play.map((c) => c.key)).toEqual(['siren', 'sfx_hit_rifle', 'door']);
  });

  it('respects the default voice cap', () => {
    const distinct = [hit(), cash(), extort(), door(), wire()]; // 5 distinct keys, none P1
    const r = reduceCueQueue(createCueQueueState(), distinct, 1000);
    expect(r.play.length).toBe(DEFAULT_MAX_VOICES_PER_STEP);
    expect(r.dropped.filter((d) => d.reason === 'load')).toHaveLength(5 - DEFAULT_MAX_VOICES_PER_STEP);
  });
});

describe('cue queue — purity & determinism', () => {
  it('is a pure reducer: inputs untouched, same inputs ⇒ same outputs', () => {
    const state = createCueQueueState();
    const cues = Object.freeze([hit(), cash()]);
    const a = reduceCueQueue(state, cues, 500);
    const b = reduceCueQueue(state, cues, 500);
    expect(a.play.map((c) => c.key)).toEqual(b.play.map((c) => c.key));
    expect(state.hotUntilMs).toEqual({}); // original state object untouched
  });

  it('prunes expired cooldown keys so the record stays bounded', () => {
    let state = createCueQueueState();
    state = reduceCueQueue(state, [hit()], 1000).state;
    expect(Object.keys(state.hotUntilMs)).toContain('hit:rifle');
    // far in the future, playing something else — the stale key is pruned
    state = reduceCueQueue(state, [cash()], 60_000).state;
    expect(Object.keys(state.hotUntilMs)).not.toContain('hit:rifle');
  });

  it('ambient category never arms a cooldown (beds are loops, not cues)', () => {
    expect(DEFAULT_COOLDOWN_MS.ambient).toBe(0);
  });
});
