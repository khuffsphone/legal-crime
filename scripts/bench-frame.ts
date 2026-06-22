// Throwaway micro-benchmark (NOT part of the suite): measures the pure /src/sim "readout" work the
// scene rebuilds every frame in refreshHud/refreshStrategy/refreshFeed/refreshCrew/refreshObjective.
// This is the CPU half of the per-frame cost (the other half is Phaser text rasterization, which is
// measured in-scene via the [P] perf overlay). Run: npx vite-node scripts/bench-frame.ts
import { createInitialState } from '../src/sim/state';
import {
  realtimeHudView, playerWeeklyNet, anyCollectorInDanger, cityStanding, hqIntegrityOf, weakestRival,
  hudPhase, victoryProximity, winPaths, buildReadout, offenseReadout, offensePreview, telegraphedPushes,
  recentIncidents, crewReadout, firstObjective, marketRows, harvestIncidents,
} from '../src/sim';

const s = harvestIncidents(createInitialState(1, { startingCrew: true, tutorialFreeRuns: 1, bigCity: true }));

// one frame's worth of the readout work the scene does every tick of update()
function oneFrameReadouts(): number {
  let acc = 0;
  const hud = realtimeHudView(s); acc += hud.player.crew;
  acc += playerWeeklyNet(s);
  acc += anyCollectorInDanger(s) ? 1 : 0;
  const st = cityStanding(s); acc += st.rows.length;
  acc += hqIntegrityOf(s.player);
  acc += weakestRival(s)?.vulnerability ?? 0;
  acc += hudPhase(s).phase.length;
  const vp = victoryProximity(s); acc += vp.playerWinPct;
  for (const w of winPaths(s)) acc += w.pct + w.read.length + w.advances.length; // strings built
  for (const b of buildReadout(s)) acc += b.cost;
  for (const o of offenseReadout(s)) { acc += o.cost; const pv = offensePreview(o.key); acc += pv.effect.length; }
  for (const t of telegraphedPushes(s)) acc += t.amount;
  for (const r of recentIncidents(s, 9)) acc += r.summary.length;
  for (const m of crewReadout(s.player)) acc += m.loyalty;
  acc += firstObjective(s).title.length;
  for (const row of marketRows(s)) acc += row.price + row.read.length;
  return acc;
}

const WARM = 2000, N = 60_000;
for (let i = 0; i < WARM; i++) oneFrameReadouts();
const t0 = performance.now();
let sink = 0;
for (let i = 0; i < N; i++) sink += oneFrameReadouts();
const t1 = performance.now();
const perFrameMs = (t1 - t0) / N;
console.log(`sink=${sink}`);
console.log(`readout build: ${perFrameMs.toFixed(4)} ms/frame  →  ${(perFrameMs * 60).toFixed(2)} ms/s @60fps  (${(1000 / perFrameMs).toFixed(0)} frames/s headroom if this were the only cost)`);
