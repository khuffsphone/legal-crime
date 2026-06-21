// RTS-24 — THE MARKET (trade mini-game). Pure & deterministic; imports NO Phaser. A small set of
// Prohibition vice commodities with live prices driven by a SUPPLY↔DEMAND gauge that narrates
// itself in mob English. You BUY low / SELL high with a house SPREAD and a live preview; your
// trades visibly MOVE the market (a footprint); events spike demand elsewhere. This is where the
// extort→collect surplus finally has somewhere to go. WRAPS the economy — buy/sell touch cash +
// inventory only; advanceMarket eases prices each week. tick is untouched.

import { MARKET_DRIFT, MARKET_FOOTPRINT, MARKET_PRICE_MIN, MARKET_SPREAD } from './constants';
import { clampDirty, creditCrimeIncome } from './laundering';
import type { GameState, MarketGood, MarketState } from './types';

interface GoodDef { id: string; name: string; basePrice: number; }
const GOODS: ReadonlyArray<GoodDef> = [
  { id: 'booze', name: 'Bootleg Liquor', basePrice: 60 },
  { id: 'beer', name: 'Bathtub Beer', basePrice: 25 },
  { id: 'cigars', name: 'Cuban Cigars', basePrice: 90 },
  { id: 'sugar', name: 'Sugar (still feed)', basePrice: 15 },
];

/** A fresh market: every good at its base price, supply/demand balanced at 50. Deterministic. */
export function createMarket(): MarketState {
  return { goods: GOODS.map((g) => ({ id: g.id, name: g.name, basePrice: g.basePrice, price: g.basePrice, supply: 50, demand: 50 })) };
}

/** Lazily ensure a market exists on the state (opt-in; absent ⇒ created on first use). */
export function ensureMarket(state: GameState): MarketState {
  if (!state.market) state.market = createMarket();
  return state.market;
}

export function marketGood(state: GameState, id: string): MarketGood | undefined {
  return state.market?.goods.find((g) => g.id === id);
}

/** Recompute a good's price from its supply/demand gauge (demand up → dearer; supply up → cheaper). */
function recompute(g: MarketGood): void {
  const ratio = (0.6 + g.demand / 100) / (0.6 + g.supply / 100);
  g.price = Math.max(MARKET_PRICE_MIN, Math.round(g.basePrice * ratio));
}

/** The supply↔demand gauge as plain English (the self-narrating market read). */
export function supplyDemandRead(g: MarketGood): string {
  const d = g.demand - g.supply;
  if (d >= 35) return 'demand far outstrips supply — prices SOARING';
  if (d >= 12) return 'demand is hot — prices climbing';
  if (d <= -35) return 'a glut on the street — prices CRASHING';
  if (d <= -12) return 'well supplied — prices easing';
  return 'a steady market — prices near fair';
}

export type TradeSide = 'buy' | 'sell';

export interface TradePreview {
  side: TradeSide;
  qty: number;
  /** Per-unit price AFTER the spread. */
  unitPrice: number;
  /** Total cash in/out. */
  total: number;
  /** The mid price and the price the trade would move it to (your footprint). */
  mid: number;
  newPrice: number;
  /** The house spread, in cash per unit. */
  spreadPerUnit: number;
}

/** Live preview of a trade incl. the spread and your footprint on the price. Pure read — falls back
 * to a default market when none exists yet (so a preview works before the first trade). */
export function tradePreview(state: GameState, id: string, qty: number, side: TradeSide): TradePreview | null {
  const g = (state.market ?? createMarket()).goods.find((x) => x.id === id);
  if (!g || qty <= 0) return null;
  const mid = g.price;
  const unitPrice = side === 'buy' ? Math.round(mid * (1 + MARKET_SPREAD)) : Math.round(mid * (1 - MARKET_SPREAD));
  const total = unitPrice * qty;
  // footprint: buying lifts demand, selling lifts supply — then the price re-derives.
  const sim: MarketGood = { ...g };
  if (side === 'buy') sim.demand = Math.min(100, sim.demand + MARKET_FOOTPRINT * qty);
  else sim.supply = Math.min(100, sim.supply + MARKET_FOOTPRINT * qty);
  recompute(sim);
  return { side, qty, unitPrice, total, mid, newPrice: sim.price, spreadPerUnit: Math.round(mid * MARKET_SPREAD) };
}

export interface TradeResult { ok: boolean; reason: string; total?: number; }

function inv(state: GameState): Record<string, number> {
  if (!state.player.inventory) state.player.inventory = {};
  return state.player.inventory;
}

/** BUY `qty` of a good: pay cash (with spread), add to inventory, lift demand → price (footprint). */
export function buyGood(state: GameState, id: string, qty: number): TradeResult {
  ensureMarket(state);
  const g = marketGood(state, id);
  const pv = tradePreview(state, id, qty, 'buy');
  if (!g || !pv) return { ok: false, reason: 'no such good' };
  if (state.player.cash < pv.total) return { ok: false, reason: `need $${pv.total}` };
  state.player.cash -= pv.total;
  clampDirty(state.player);
  inv(state)[id] = (inv(state)[id] ?? 0) + qty;
  g.demand = Math.min(100, g.demand + MARKET_FOOTPRINT * qty);
  recompute(g);
  state.log.push({ tick: state.tick, kind: 'market-buy', message: `Bought ${qty} ${g.name} for $${pv.total} ($${pv.unitPrice}/ea)`, data: { id, qty, total: pv.total } });
  return { ok: true, reason: 'ok', total: pv.total };
}

/** SELL `qty` of a good you hold: credit cash (dirty), lift supply → price down (footprint). */
export function sellGood(state: GameState, id: string, qty: number): TradeResult {
  ensureMarket(state);
  const g = marketGood(state, id);
  const have = inv(state)[id] ?? 0;
  if (!g) return { ok: false, reason: 'no such good' };
  if (have < qty || qty <= 0) return { ok: false, reason: `only hold ${have}` };
  const pv = tradePreview(state, id, qty, 'sell')!;
  inv(state)[id] = have - qty;
  creditCrimeIncome(state.player, pv.total); // trade proceeds are dirty
  g.supply = Math.min(100, g.supply + MARKET_FOOTPRINT * qty);
  recompute(g);
  state.log.push({ tick: state.tick, kind: 'market-sell', message: `Sold ${qty} ${g.name} for $${pv.total} ($${pv.unitPrice}/ea)`, data: { id, qty, total: pv.total } });
  return { ok: true, reason: 'ok', total: pv.total };
}

/** Ease every good's supply/demand back toward balance each week (prices drift toward base). WRAPS
 * settlement — called from the wrapper on a week boundary, never from tick. Pure. */
export function advanceMarket(state: GameState): void {
  if (!state.market) return;
  for (const g of state.market.goods) {
    g.demand = g.demand + (50 - g.demand) * MARKET_DRIFT;
    g.supply = g.supply + (50 - g.supply) * MARKET_DRIFT;
    recompute(g);
  }
}

/** Nudge a good's demand (events): +amount demand (or −, a glut). Re-derives price. Pure. */
export function shockDemand(state: GameState, id: string, amount: number): void {
  ensureMarket(state);
  const g = marketGood(state, id);
  if (!g) return;
  g.demand = Math.max(0, Math.min(100, g.demand + amount));
  if (amount < 0) g.supply = Math.max(0, Math.min(100, g.supply - amount));
  recompute(g);
}

export interface MarketRow {
  id: string; name: string; price: number; basePrice: number;
  supply: number; demand: number; read: string; held: number;
  /** ▲/▼/◆ vs base price — the direction-aware read. */
  dir: '▲' | '▼' | '◆';
}

/** The HUD readout for THE MARKET tab — one row per good, self-narrating. Pure read. */
export function marketRows(state: GameState): MarketRow[] {
  const m = state.market ?? createMarket();
  const held = state.player.inventory ?? {};
  return m.goods.map((g) => ({
    id: g.id, name: g.name, price: g.price, basePrice: g.basePrice,
    supply: Math.round(g.supply), demand: Math.round(g.demand), read: supplyDemandRead(g), held: held[g.id] ?? 0,
    dir: g.price > g.basePrice + 1 ? '▲' : g.price < g.basePrice - 1 ? '▼' : '◆',
  }));
}
