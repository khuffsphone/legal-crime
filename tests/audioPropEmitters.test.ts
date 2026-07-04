// AUDIO E-H — Tickets G1 (emitter catalog) + G2 (planner/gating/LOD/attenuation/scheduler). Mutation-
// table driven; the rhythm scheduler's determinism (same seed ⇒ same schedule) is asserted directly.
import { describe, it, expect } from 'vitest';
import {
  LEGACY_PROP_FAMILY, PROP_CLIP_KEYS, PROP_EMITTERS, emitterTreatment, legacyEmitterSources,
  type EmitterSource,
} from '../src/scenes/audio/propEmitterCatalog';
import {
  ANCHOR_FADE_OUT_MS, MAX_ANCHOR_LOOPS, RHYTHM_COOLDOWN_MAX_MS, RHYTHM_COOLDOWN_MIN_MS,
  RHYTHM_GLOBAL_MIN_GAP_MS, audioLod, createEmitterPlannerState, emitterGainDb, emitterPan, planEmitters,
  type EmitterPlanInputs, type EmitterPlannerState,
} from '../src/scenes/audio/propEmitterPlanner';
import { FAMILY_IDS } from '../src/scenes/env/streetscapeTaxonomy';
import type { PropPlacement } from '../src/sim';

describe('G1 — emitter catalog (mutation table)', () => {
  it('MUTATION missing-other-role-treatment: ALL 28 families have an explicit treatment', () => {
    expect(Object.keys(PROP_EMITTERS).sort()).toEqual([...FAMILY_IDS].sort());
    for (const id of FAMILY_IDS) expect(PROP_EMITTERS[id].kind).toMatch(/^(anchorLoop|rhythmOneShot|silent)$/);
  });

  it('MUTATION anchor-demoted-to-rhythm: the 4 anchors are loops, ranked fountain > news > statue > tree', () => {
    const anchors = FAMILY_IDS.filter((id) => PROP_EMITTERS[id].kind === 'anchorLoop');
    expect(anchors.sort()).toEqual(['fountain', 'news_stand', 'statue_monument', 'street_tree']);
    const rank = (id: string) => (PROP_EMITTERS[id as never] as { rank: number }).rank;
    expect(rank('fountain')).toBeLessThan(rank('news_stand'));
    expect(rank('news_stand')).toBeLessThan(rank('statue_monument'));
    expect(rank('statue_monument')).toBeLessThan(rank('street_tree'));
    expect((PROP_EMITTERS.street_tree as { maxPerScreen: number }).maxPerScreen).toBe(2);
    expect((PROP_EMITTERS.fountain as { maxPerScreen: number }).maxPerScreen).toBe(1);
  });

  it('MUTATION filler-given-clip-key: the 13 silent families carry NO clip key', () => {
    const silent = FAMILY_IDS.filter((id) => PROP_EMITTERS[id].kind === 'silent');
    expect(silent).toHaveLength(13);
    for (const id of silent) expect('clipKey' in PROP_EMITTERS[id]).toBe(false);
  });

  it('MUTATION police-call-box-chatter: police_call_box is SILENT with the false-implication rationale', () => {
    const t = PROP_EMITTERS.police_call_box;
    expect(t.kind).toBe('silent');
    expect((t as { reason: string }).reason).toMatch(/police/i);
  });

  it('MUTATION prop-key-renamed: exactly the 15 F.3 clip keys', () => {
    expect([...PROP_CLIP_KEYS].sort()).toEqual([
      'prop_awning_flap', 'prop_bench_creak', 'prop_blade_sign_creak', 'prop_delivery_truck_settle',
      'prop_fountain_loop', 'prop_hedge_shrub_rustle', 'prop_news_stand_loop', 'prop_parked_car_settle',
      'prop_produce_stall_rustle', 'prop_statue_monument_loop', 'prop_street_lamp_tick',
      'prop_street_tree_loop', 'prop_traffic_signal_relay', 'prop_utility_pole_buzz', 'prop_vendor_cart_clatter',
    ]);
    expect(emitterTreatment('not_a_family')).toBeUndefined();
  });

  it('R1 legacy adapter: lamppost/tree/car/bench map; hydrant/mailbox/fence stay silent', () => {
    expect(LEGACY_PROP_FAMILY).toEqual({
      lamppost: 'street_lamp', tree: 'street_tree', car: 'parked_car', bench: 'bench',
      hydrant: null, mailbox: null, fence: null,
    });
    const placements: PropPlacement[] = [
      { kind: 'lamppost', gx: 1, gy: 2 }, { kind: 'tree', gx: 3, gy: 4 },
      { kind: 'hydrant', gx: 5, gy: 6 }, { kind: 'fence', gx: 7, gy: 8 },
    ];
    const sources = legacyEmitterSources(placements);
    expect(sources.map((s) => s.family)).toEqual(['street_lamp', 'street_tree']);
    expect(sources[0].id).toBe('legacy:street_lamp:1,2'); // stable pooling identity
  });
});

// ── G2 planner harness ─────────────────────────────────────────────────────────────────────────
const src = (family: string, gx: number, gy: number): EmitterSource => ({ id: `t:${family}:${gx},${gy}`, family: family as never, gx, gy });
const ALWAYS = () => ({ revealed: true, onScreen: true });

function inputs(over: Partial<EmitterPlanInputs>): EmitterPlanInputs {
  return {
    sources: [], nowMs: 0, audioZoom: 1.0, screenCenter: { gx: 0, gy: 0 }, eligibility: ALWAYS, ...over,
  };
}

describe('G2 — LOD / gating / attenuation (mutation table)', () => {
  it('MUTATION far-emitters-active: FAR stops every loop within 900 ms and schedules NO rhythm', () => {
    let st = createEmitterPlannerState(7);
    const fountain = src('fountain', 0, 0);
    ({ state: st } = planEmitters(st, inputs({ sources: [fountain] })));
    expect(st.anchors).toHaveLength(1);
    const far = planEmitters(st, inputs({ sources: [fountain], audioZoom: 0.5, nowMs: 1000 }));
    expect(far.state.anchors).toHaveLength(0);
    expect(far.intents).toEqual([{ op: 'stopLoop', bus: 'emitters', voiceId: st.anchors[0].voiceId, fadeOutMs: ANCHOR_FADE_OUT_MS }]);
    expect(audioLod(0.64)).toBe('far'); // audio-FAR at 0.65 — at/before the 0.45 visual prop-hide (R2)
    expect(audioLod(0.65)).toBe('mid');
    expect(audioLod(1.16)).toBe('near');
  });

  it('MUTATION gate-skipped / unrevealed-on-screen / revealed-offscreen: only revealed AND on-screen emits', () => {
    const fountain = src('fountain', 0, 0);
    for (const [revealed, onScreen, expected] of [
      [false, true, 0], [true, false, 0], [false, false, 0], [true, true, 1],
    ] as const) {
      const plan = planEmitters(createEmitterPlannerState(1), inputs({
        sources: [fountain], eligibility: () => ({ revealed, onScreen }),
      }));
      expect(plan.intents.filter((i) => i.op === 'playLoop'), `revealed=${revealed} onScreen=${onScreen}`).toHaveLength(expected);
    }
  });

  it('MUTATION >4-anchors: caps at 4 total, tree ≤2, every other anchor family ≤1, diversity first', () => {
    const sources = [
      src('fountain', 0, 0), src('fountain', 1, 0),
      src('street_tree', 0, 1), src('street_tree', 1, 1), src('street_tree', 2, 1),
      src('news_stand', 0, 2), src('news_stand', 1, 2),
      src('statue_monument', 0, 3),
    ];
    const plan = planEmitters(createEmitterPlannerState(1), inputs({ sources }));
    const plays = plan.intents.filter((i) => i.op === 'playLoop');
    expect(plays).toHaveLength(MAX_ANCHOR_LOOPS);
    const fams = plan.state.anchors.map((a) => a.family).sort();
    expect(fams).toEqual(['fountain', 'news_stand', 'statue_monument', 'street_tree']); // one each — diversity before duplicates
  });

  it('keeps a stable existing anchor over an equivalent closer newcomer (anti-churn), re-trimming without restart', () => {
    let st = createEmitterPlannerState(1);
    const treeA = src('street_tree', 4, 4);
    ({ state: st } = planEmitters(st, inputs({ sources: [treeA] })));
    const va = st.anchors[0].voiceId;
    const treeB = src('street_tree', 1, 1); // closer to center, same family/rank
    // one free tree slot (cap 2): B joins, A is NOT churned out
    const plan = planEmitters(st, inputs({ sources: [treeA, treeB] }));
    expect(plan.state.anchors.map((a) => a.voiceId)).toContain(va);
    expect(plan.intents.filter((i) => i.op === 'stopLoop')).toHaveLength(0);
    expect(plan.intents.find((i) => i.op === 'setLoop' && (i as { voiceId: string }).voiceId === va)).toBeTruthy();
  });

  it('G.5 attenuation curve + pan clamp', () => {
    expect(emitterGainDb(0)).toBe(0);
    expect(emitterGainDb(96)).toBe(0);
    expect(emitterGainDb(360)).toBeCloseTo(-9, 6);
    expect(emitterGainDb(640)).toBeCloseTo(-24, 6);
    expect(emitterGainDb(721)).toBeNull(); // hard kill
    expect(emitterGainDb(228)).toBeCloseTo(-4.5, 6); // linear between knots
    expect(emitterPan(0)).toBe(0);
    expect(emitterPan(10_000)).toBe(0.65);
    expect(emitterPan(-10_000)).toBe(-0.65);
  });
});

describe('G2 — seeded rhythm scheduler (determinism + rate caps)', () => {
  const lamp = (n: number) => src('street_lamp', n, 0);
  const NEAR = 1.3;

  /** run the planner at the 2 Hz cadence for `ms`, collecting (t, key) of every rhythm fire. */
  function run(seed: number, sources: EmitterSource[], ms: number): { t: number; key: string }[] {
    let st: EmitterPlannerState = createEmitterPlannerState(seed);
    const fires: { t: number; key: string }[] = [];
    for (let t = 0; t <= ms; t += 500) {
      const plan = planEmitters(st, inputs({ sources, nowMs: t, audioZoom: NEAR }));
      st = plan.state;
      for (const i of plan.intents) if (i.op === 'playOneShot') fires.push({ t, key: i.key });
    }
    return fires;
  }

  it('MUTATION determinism: same seed + inputs ⇒ the identical fire schedule; different seed differs', () => {
    const sources = [lamp(1), src('bench', 2, 2), src('awning', 3, 1)];
    const a = run(11, sources, 60_000);
    const b = run(11, sources, 60_000);
    expect(a).toEqual(b); // bit-identical
    expect(a.length).toBeGreaterThan(0); // the schedule actually fires within the window
    const c = run(12, sources, 60_000);
    expect(c).not.toEqual(a); // a different seed reshuffles the street
  });

  it('MUTATION rhythm-rate-cap-exceeded: per-source ≥18 s, first fire ≤42 s, global gap ≥1.5 s', () => {
    // single source: consecutive fires obey the per-source 18-42 s cooldown draw
    const solo = run(5, [lamp(1)], 120_000);
    expect(solo.length).toBeGreaterThanOrEqual(2);
    expect(solo[0].t).toBeGreaterThanOrEqual(RHYTHM_COOLDOWN_MIN_MS);
    expect(solo[0].t).toBeLessThanOrEqual(RHYTHM_COOLDOWN_MAX_MS + 500);
    for (let i = 1; i < solo.length; i++) {
      expect(solo[i].t - solo[i - 1].t).toBeGreaterThanOrEqual(RHYTHM_COOLDOWN_MIN_MS);
    }
    // many families: every pair of global starts ≥1.5 s apart, ≤4 per rolling 10 s
    const many = [lamp(1), src('bench', 2, 0), src('awning', 3, 0), src('utility_pole', 4, 0),
      src('hedge_shrub', 5, 0), src('parked_car', 6, 0), src('blade_sign', 7, 0)];
    const fires = run(9, many, 180_000);
    for (let i = 1; i < fires.length; i++) {
      expect(fires[i].t - fires[i - 1].t).toBeGreaterThanOrEqual(RHYTHM_GLOBAL_MIN_GAP_MS);
    }
    for (const f of fires) {
      const window = fires.filter((g) => g.t > f.t - 10_000 && g.t <= f.t);
      expect(window.length).toBeLessThanOrEqual(4);
    }
  });

  it('same-family sources respect the 8 s family cooldown', () => {
    const fires = run(3, [lamp(1), lamp(2), lamp(3)], 120_000);
    for (let i = 1; i < fires.length; i++) {
      // all three are street_lamp — every consecutive pair is same-family
      expect(fires[i].t - fires[i - 1].t).toBeGreaterThanOrEqual(8_000);
    }
  });

  it('MID zoom schedules NO rhythm (anchors only)', () => {
    let st = createEmitterPlannerState(4);
    const sources = [lamp(1), src('fountain', 0, 0)];
    const fires: string[] = [];
    for (let t = 0; t <= 120_000; t += 500) {
      const plan = planEmitters(st, inputs({ sources, nowMs: t, audioZoom: 1.0 })); // MID
      st = plan.state;
      for (const i of plan.intents) if (i.op === 'playOneShot') fires.push(i.key);
    }
    expect(fires).toEqual([]);
    expect(st.anchors.map((a) => a.family)).toEqual(['fountain']); // the anchor loop still runs at MID
  });
});
