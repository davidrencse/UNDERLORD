// Military production, after Hearts of Iron IV. A nation's military factories are split across
// production lines; each line builds one real equipment model (data/equipment.js) into the
// national stockpile for that class. Lines start slow and ramp up; a line switched to another model
// of the same class keeps part of its efficiency. Lines are kept in priority order: when the budget
// shrinks and factories are lost, the bottom lines lose them first.
//
// Each class also carries a quality rating: the average standard of the stock, moving toward the
// models being built. Division stats scale with it, so a nation building T-90Ms fields a different
// tank battalion from one building Abrams.
//
// Factories follow defence spending: one per $3bn a year, so raising military funding in the
// ledger adds factories. Training and replacements draw from the stockpile; artillery draws
// ammunition and drone units draw strike drones as they fight.

import { MODELS, MODEL, CLASS_IDS, LICENCE } from '../data/equipment.js';
import { COST } from './templates.js';

export const PRODUCTION = {
  bnPerFactory: 3,
  maxFactories: 160,
  maxPerLine: 25, // factories one line can use
  rampDays: 60, // a new line reaches full efficiency over this long
  startEff: 0.3, // a new line starts here
  switchKeep: 0.6, // share of efficiency kept when a line switches to another model of its class
  maxLines: 16,
};

// With the economy running, factories are real plant (economy.js): spending funds them, but only as
// many run as plant, metals, energy and workers allow.
export const factoriesFor = (n) => n.econ?.milFactories ?? Math.max(1, Math.min(PRODUCTION.maxFactories, Math.round((n.gdp * (n.defPct ?? 1.5)) / 100 / PRODUCTION.bnPerFactory)));
export const assigned = (n) => n.production.lines.reduce((t, l) => t + l.factories, 0);
export const lineOutput = (l) => (Math.min(l.factories, PRODUCTION.maxPerLine) * l.eff) / l.cost; // items per day

// Models a nation may build: its own designs and generic patterns at list cost, and its partners'
// designs under licence. `isPartner(iso3)` says whether the maker is an ally.
export function optionsFor(n, isPartner, time) {
  const out = new Map();
  for (const m of MODELS) {
    if (m.from > time) continue;
    if (m.makers.includes(n.iso3) || m.makers.includes('*')) out.set(m.id, false);
    else if (m.makers.some(isPartner)) out.set(m.id, true);
  }
  return out;
}
export const costOf = (m, licensed) => m.cost * (licensed ? LICENCE : 1);

// The model a nation would build in a class: the best it makes itself, else the best licensed,
// else the generic pattern. Consumables are judged on rating per factory-day, since volume wins.
const CONSUMABLE = new Set(['ammo', 'fpv']);
export function preferred(P, cls) {
  let best = null, bestScore = -1;
  for (const [id, lic] of P.options) {
    const m = MODEL[id];
    if (m.cls !== cls) continue;
    const score = (CONSUMABLE.has(cls) ? m.q / costOf(m, lic) : m.q) * (lic ? 0.97 : 1) * (m.makers.includes('*') ? 0.9 : 1);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

export function newLine(P, id, factories, eff = PRODUCTION.startEff) {
  const m = MODEL[id], lic = P.options.get(id);
  return { model: id, cls: m.cls, factories, eff, cost: costOf(m, lic), licensed: !!lic };
}

// Sets up factories, a reserve stockpile (half of what the army fields, and two months of artillery
// fire) and lines in proportion to the value of that army's equipment.
export function seedProduction(n, fielded, options) {
  const P = n.production = { factories: factoriesFor(n), lines: [], stock: {}, quality: {}, options, used: {}, rate: {}, burn: {}, auto: true };
  for (const c of CLASS_IDS) {
    const m = preferred(P, c);
    const lic = m && P.options.get(m.id);
    P.quality[c] = m ? m.q * (lic ? 0.95 : 1) : 0.8;
    P.stock[c] = Math.round((fielded[c] ?? 0) * (c === 'ammo' || c === 'fpv' ? 1 : 0.5));
  }
  const value = {};
  for (const c of CLASS_IDS) value[c] = (fielded[c] ?? 0) * (COST[c] ?? 1) * (c === 'ammo' || c === 'fpv' ? 0.05 : 1);
  autoAssign(n, value, 1);
}

// Spreads the factories over the classes in `want` (factory-days of demand), building the
// preferred model of each. Lines already building that model keep their efficiency.
export function autoAssign(n, want, eff = PRODUCTION.startEff) {
  const P = n.production;
  const keep = new Map(P.lines.map((l) => [l.model, l.eff]));
  const total = CLASS_IDS.reduce((t, c) => t + (want[c] ?? 0), 0);
  P.lines = [];
  const shares = total ? CLASS_IDS.map((c) => ({ c, f: (P.factories * (want[c] ?? 0)) / total })).filter((x) => x.f > 0).sort((a, b) => b.f - a.f) : [{ c: 'rifles', f: P.factories }];
  // Every class in demand gets at least one factory before the big shares are filled, so cheap
  // essentials (rifles, missiles, drones) are never crowded out by tanks.
  const floor = Math.min(shares.length, P.factories);
  let left = P.factories - floor;
  const scale = left / Math.max(1e-9, shares.slice(0, floor).reduce((t, x) => t + Math.max(0, x.f - 1), 0));
  for (const [i, { c, f }] of shares.entries()) {
    const m = preferred(P, c);
    if (!m || i >= floor) continue;
    // Big shares are split over several lines, as no line can use more than its maximum.
    const extra = Math.min(left, Math.round(Math.max(0, f - 1) * Math.min(1, scale)));
    left -= extra;
    let k = 1 + extra;
    while (k > 0 && P.lines.length < PRODUCTION.maxLines) {
      const take = Math.min(k, PRODUCTION.maxPerLine);
      P.lines.push(newLine(P, m.id, take, keep.get(m.id) ?? eff));
      k -= take;
    }
  }
  P.lines.sort((a, b) => b.factories - a.factories);
  if (left > 0 && P.lines.length) for (const l of P.lines) { const add = Math.min(left, PRODUCTION.maxPerLine - l.factories); l.factories += add; left -= add; }
}

export function addLine(n, id) {
  const P = n.production;
  if (!P.options.has(id)) return 'You cannot build that model.';
  if (P.lines.length >= PRODUCTION.maxLines) return `At most ${PRODUCTION.maxLines} lines.`;
  if (assigned(n) >= P.factories) return 'Every factory is already assigned. Take some off another line first.';
  P.lines.push(newLine(P, id, 1));
  P.auto = false;
  return null;
}

export function setFactories(n, i, delta) {
  const P = n.production, l = P.lines[i];
  if (!l) return 'No such line.';
  if (delta > 0) {
    const room = Math.min(P.factories - assigned(n), PRODUCTION.maxPerLine - l.factories);
    if (room <= 0) return l.factories >= PRODUCTION.maxPerLine ? `A line can use at most ${PRODUCTION.maxPerLine} factories.` : 'No free factories.';
    delta = Math.min(delta, room);
  }
  l.factories = Math.max(0, l.factories + delta);
  if (!l.factories) P.lines.splice(i, 1);
  P.auto = false;
  return null;
}

// Moves a line up (-1) or down (+1) the priority order.
export function moveLine(n, i, dir) {
  const L = n.production.lines, j = i + dir;
  if (j < 0 || j >= L.length) return;
  [L[i], L[j]] = [L[j], L[i]];
  n.production.auto = false;
}

// Retools a line for another model: within the same class it keeps part of its efficiency.
export function switchLine(n, i, id) {
  const P = n.production, l = P.lines[i];
  if (!l || !P.options.has(id)) return 'You cannot build that model.';
  const m = MODEL[id];
  const eff = m.cls === l.cls ? Math.max(PRODUCTION.startEff, l.eff * PRODUCTION.switchKeep) : PRODUCTION.startEff;
  P.lines[i] = newLine(P, id, l.factories, eff);
  P.auto = false;
  return null;
}

export function removeLine(n, i) {
  n.production.lines.splice(i, 1);
  n.production.auto = false;
}

// Equipment one full-strength division of template `t` needs, times `k`.
export function needOf(t, k = 1) {
  const out = {};
  for (const [e, v] of Object.entries(t.stats.eq)) out[e] = v * k;
  return out;
}

// Takes what it can of `need` from the stockpile and returns how complete that was (0-1),
// weighted by each item's value, so a shortage of tanks hurts far more than a shortage of rifles.
export function draw(n, need) {
  const P = n.production;
  let got = 0, all = 0;
  for (const [e, v] of Object.entries(need)) {
    if (!(v > 0)) continue;
    const take = Math.min(v, Math.max(0, P.stock[e] ?? 0));
    P.stock[e] = (P.stock[e] ?? 0) - take;
    P.used[e] = (P.used[e] ?? 0) + take;
    const w = (COST[e] ?? 1) + 0.05;
    got += take * w; all += v * w;
  }
  return all > 0 ? got / all : 1;
}

// Takes up to `amount` of one class (ammunition, drones); returns the fraction available.
export function drawClass(n, cls, amount) {
  if (!(amount > 0)) return 1;
  const P = n.production;
  const take = Math.min(amount, Math.max(0, P.stock[cls] ?? 0));
  P.stock[cls] -= take;
  P.used[cls] = (P.used[cls] ?? 0) + take;
  // What was asked for, met or not: the true rate of fire production has to keep up with.
  P.asked = P.asked ?? {};
  P.asked[cls] = (P.asked[cls] ?? 0) + amount;
  return take / amount;
}

// One day of output. Daily made/used totals are kept as moving averages for the screen.
export function produceDay(n) {
  const P = n.production;
  P.factories = factoriesFor(n);
  // Factories lost to a falling budget come off the lowest-priority lines first.
  let over = assigned(n) - P.factories;
  for (let i = P.lines.length - 1; i >= 0 && over > 0; i--) {
    const k = Math.min(P.lines[i].factories, over);
    P.lines[i].factories -= k; over -= k;
  }
  P.lines = P.lines.filter((l) => l.factories > 0);
  const made = {};
  for (const l of P.lines) {
    const out = lineOutput(l);
    const have = Math.max(0, P.stock[l.cls] ?? 0);
    // Stock quality moves toward the model coming off the line.
    P.quality[l.cls] = (P.quality[l.cls] * have + MODEL[l.model].q * out) / Math.max(1e-9, have + out);
    P.stock[l.cls] = (P.stock[l.cls] ?? 0) + out;
    made[l.cls] = (made[l.cls] ?? 0) + out;
    l.eff = Math.min(1, l.eff + (1 - PRODUCTION.startEff) / PRODUCTION.rampDays);
  }
  for (const c of CLASS_IDS) {
    P.rate[c] = (P.rate[c] ?? 0) * 0.9 + (made[c] ?? 0) * 0.1;
    P.burn[c] = (P.burn[c] ?? 0) * 0.9 + (P.used[c] ?? 0) * 0.1;
    P.need = P.need ?? {};
    P.need[c] = (P.need[c] ?? 0) * 0.9 + (P.asked?.[c] ?? 0) * 0.1;
  }
  P.used = {};
  P.asked = {};
}
