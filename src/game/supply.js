// Supply hubs and the supply each land formation draws from them, after Hearts of Iron IV:
// formations draw from the best hub they can reach over friendly ground; a hub's throughput is
// shared by everyone drawing on it; and a formation whose route home is cut runs dry.
//
// Every city is a natural hub, levelled 1-5 by its population (the capital one level higher);
// naval bases are level-2 ports. Anywhere else the player has to build a hub, and any hub can be
// upgraded. A hub's level sets its throughput (in divisions) and how far its railheads reach.

import { haversine, interpolate } from '../util/geo.js';

export const SUPPLY = {
  maxLevel: 5,
  spanKm: 500, // past its full-supply radius a hub's reach fades to nothing over this distance
  cutSamples: 2, // enemy-held samples (every 20 km) on the route before it counts as cut
  cutFactor: 0.08, // what still trickles through a cut route
  buildLevel: 2, // a new hub opens at this level
  buildDays: 20,
  buildPP: 20,
  upgradeDays: 15,
  minGapKm: 60,
  captureDays: 30, // a captured hub works at half capacity until repaired
};

// Divisions a hub of each level keeps fully supplied, and its full-supply radius.
export const LEVEL_CAP = [0, 4, 8, 13, 19, 26];
export const fullKm = (level) => 150 + 50 * level;
export const upgradePP = (level) => 10 * level; // to go from `level` to `level + 1`

// Natural level of a city of `pop` million.
export const cityLevel = (pop) => (pop >= 10 ? 5 : pop >= 4 ? 4 : pop >= 1.5 ? 3 : pop >= 0.5 ? 2 : 1);

export const reach = (km, level = 3) => {
  const full = fullKm(level);
  return km <= full ? 1 : Math.max(0, 1 - (km - full) / SUPPLY.spanKm);
};

// Starting hubs: every listed city (largest first, one per 40 km), the capital, and ports.
export function seedHubs(nations, cities, bases) {
  const hubs = [];
  const add = (h) => {
    if (hubs.some((o) => o.owner === h.owner && haversine(o, h) < 40)) return;
    hubs.push({ id: hubs.length + 1, ctrl: h.owner, damagedUntil: 0, readyAt: 0, upgradeAt: 0, load: 0, ...h });
  };
  const byIso = new Map();
  for (const c of cities) (byIso.get(c.iso3) ?? byIso.set(c.iso3, []).get(c.iso3)).push(c);
  for (const n of nations) {
    const list = (byIso.get(n.iso3) ?? []).slice().sort((a, b) => b.pop - a.pop);
    const seat = list.find((c) => haversine(c, n.capital) < 60);
    add({ owner: n.index, lat: n.capital.lat, lon: n.capital.lon, name: seat ? seat.name : `${n.name} capital`, level: Math.min(SUPPLY.maxLevel, (seat ? cityLevel(seat.pop) : 2) + 1), kind: 'capital' });
    for (const c of list) add({ owner: n.index, lat: c.lat, lon: c.lon, name: c.name, level: cityLevel(c.pop), kind: 'city' });
  }
  const idx = new Map(nations.map((n) => [n.iso3, n.index]));
  for (const b of bases) if (idx.has(b.iso3)) add({ owner: idx.get(b.iso3), lat: b.lat, lon: b.lon, name: b.name.replace(/ \(.+\)/, ''), level: 2, kind: 'port' });
  return hubs;
}

export function hubCap(h, time) {
  if (h.readyAt > time) return 0;
  return LEVEL_CAP[h.level] * (h.damagedUntil > time ? 0.5 : 1);
}

// Fraction of the route from p to hub h that runs through ground held by an enemy of `owner`.
export function routeCut(p, h, control, pixelOf, isEnemy) {
  const km = haversine(p, h);
  const steps = Math.max(1, Math.ceil(km / 20));
  let bad = 0;
  for (let i = 1; i < steps; i++) {
    const q = interpolate(p, h, i / steps);
    if (isEnemy(control[pixelOf(q.lat, q.lon)]) && ++bad >= SUPPLY.cutSamples) return true;
  }
  return false;
}

// Assigns each formation a hub and a supply level in [0, 1]. `usable(owner)` lists the hubs a
// nation may draw from; `isEnemyOf(owner)` returns a predicate over control values, or null for a
// nation at peace (no route can be cut).
export function computeSupply(list, hubs, { time, control, pixelOf, usable, isEnemyOf }) {
  for (const h of hubs) h.load = 0;
  const picks = [];
  for (const s of list) {
    const cands = usable(s.owner);
    // Logistics companies cut what a division draws.
    const use = s.divs * (1 + (s.tpl?.stats.fx.supply ?? 0));
    let best = null, bestV = -1;
    if (cands.length) {
      // The five nearest working hubs: a big hub a little further off can beat a small one close by.
      const near = cands.map((h) => ({ h, d: haversine(s, h) })).sort((a, b) => a.d - b.d).slice(0, 5);
      const enemy = isEnemyOf(s.owner);
      let bestScore = -1;
      for (const { h, d } of near) {
        let v = reach(d, h.level);
        if (v <= 0) continue;
        if (enemy && routeCut(s, h, control, pixelOf, enemy)) v *= SUPPLY.cutFactor;
        // Greedy and load-aware: a slightly further hub with spare throughput beats a full one.
        const score = v * Math.min(1, hubCap(h, time) / (h.load + use));
        if (score > bestScore) { bestScore = score; bestV = v; best = h; }
      }
    }
    picks.push(best, Math.max(0, bestV));
    if (best) best.load += use;
  }
  for (let i = 0; i < list.length; i++) {
    const h = picks[i * 2], v = picks[i * 2 + 1], s = list[i];
    s.hub = h ? h.id : 0;
    if (!h) { s.supply = 0.05; continue; }
    const share = Math.min(1, hubCap(h, time) / Math.max(1e-6, h.load));
    s.supply = Math.max(0.05, Math.min(1, v * share));
  }
}
