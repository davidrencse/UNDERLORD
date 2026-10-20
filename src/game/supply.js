// Supply hubs and the supply each land formation draws from them, after Hearts of Iron IV:
// formations draw from the best hub they can reach over friendly ground; a hub's throughput is
// shared by everyone drawing on it; and a formation whose route home is cut runs dry.
//
// Hubs are railheads in the larger cities and the naval bases. Throughput is in division
// equivalents: a hub of capacity 12 keeps twelve divisions fully supplied.

import { haversine, interpolate } from '../util/geo.js';

export const SUPPLY = {
  fullKm: 300, // full supply within this distance of a hub by rail and road
  zeroKm: 1000, // nothing gets through beyond this
  cutSamples: 2, // enemy-held samples (every 20 km) on the route before it counts as cut
  cutFactor: 0.08, // what still trickles through a cut route
  buildDays: 20,
  buildPP: 25,
  buildCap: 15,
  minGapKm: 80,
  captureDays: 30, // a captured hub works at half capacity until repaired
};

export const reach = (km) => (km <= SUPPLY.fullKm ? 1 : Math.max(0, 1 - (km - SUPPLY.fullKm) / (SUPPLY.zeroKm - SUPPLY.fullKm)));

// Starting hubs: every capital, the larger cities, and naval bases not already covered.
export function seedHubs(nations, cities, bases) {
  const hubs = [];
  const add = (h) => {
    if (hubs.some((o) => o.owner === h.owner && haversine(o, h) < 150)) return;
    hubs.push({ id: hubs.length + 1, ctrl: h.owner, damagedUntil: 0, readyAt: 0, load: 0, ...h });
  };
  const byIso = new Map();
  for (const c of cities) (byIso.get(c.iso3) ?? byIso.set(c.iso3, []).get(c.iso3)).push(c);
  for (const n of nations) {
    const list = (byIso.get(n.iso3) ?? []).slice().sort((a, b) => b.pop - a.pop).slice(0, 7);
    const seat = list.find((c) => haversine(c, n.capital) < 60);
    add({ owner: n.index, lat: n.capital.lat, lon: n.capital.lon, name: seat ? seat.name : `${n.name} capital`, cap: 24 + Math.min(24, Math.sqrt(n.gdp) / 2), kind: 'capital' });
    for (const c of list) add({ owner: n.index, lat: c.lat, lon: c.lon, name: c.name, cap: 8 + 4 * Math.sqrt(c.pop), kind: 'city' });
  }
  const idx = new Map(nations.map((n) => [n.iso3, n.index]));
  for (const b of bases) if (idx.has(b.iso3)) add({ owner: idx.get(b.iso3), lat: b.lat, lon: b.lon, name: b.name.replace(/ \(.+\)/, ''), cap: 10, kind: 'port' });
  return hubs;
}

export function hubCap(h, time) {
  if (h.readyAt > time) return 0;
  return h.cap * (h.damagedUntil > time ? 0.5 : 1);
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
// nation may draw from; `isEnemyOf(owner)` returns a predicate over control values.
export function computeSupply(list, hubs, { time, control, pixelOf, usable, isEnemyOf }) {
  for (const h of hubs) h.load = 0;
  const picks = [];
  for (const s of list) {
    const cands = usable(s.owner);
    let best = null, bestV = -1;
    if (cands.length) {
      // The three nearest working hubs are enough: anything further is worse on distance alone.
      const near = cands.map((h) => ({ h, d: haversine(s, h) })).sort((a, b) => a.d - b.d).slice(0, 3);
      const enemy = isEnemyOf(s.owner);
      let bestScore = -1;
      for (const { h, d } of near) {
        let v = reach(d);
        if (v <= 0) continue;
        if (routeCut(s, h, control, pixelOf, enemy)) v *= SUPPLY.cutFactor;
        // Greedy and load-aware: a slightly further hub with spare throughput beats a full one.
        const score = v * Math.min(1, hubCap(h, time) / (h.load + s.divs));
        if (score > bestScore) { bestScore = score; bestV = v; best = h; }
      }
    }
    picks.push(best, Math.max(0, bestV));
    if (best) best.load += s.divs;
  }
  for (let i = 0; i < list.length; i++) {
    const h = picks[i * 2], v = picks[i * 2 + 1], s = list[i];
    s.hub = h ? h.id : 0;
    if (!h) { s.supply = 0.05; continue; }
    const share = Math.min(1, hubCap(h, time) / Math.max(1e-6, h.load));
    s.supply = Math.max(0.05, Math.min(1, v * share));
  }
}
