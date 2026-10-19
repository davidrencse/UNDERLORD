import { feature, mesh } from 'topojson-client';
import { geoArea, geoCentroid, geoBounds } from 'd3-geo';
import { parseNations, DEPENDENCIES } from '../data/nations.js';
import { EARTH_KM } from '../util/geo.js';

export const MAP_W = 4096;
export const MAP_H = 2048;

// Scanline-fill polygons into a byte raster without anti-aliasing, so each pixel holds exactly one id.
// polys: [{ rings: [[ [lon,lat], ... ], ...], value }], bbox: [west, south, east, north]
export function rasterize(polys, W, H, bbox = [-180, -90, 180, 90], out = new Uint8Array(W * H)) {
  for (const { rings, value } of polys) scanPolygon(rings, W, H, bbox, (base, a, b) => out.fill(value, base + a, base + b + 1));
  return out;
}

// Scratch buffers shared by every scan: edge crossings as (row, x) pairs, then bucketed by row.
let rowBuf = new Int32Array(1 << 15), xBuf = new Float64Array(1 << 15), sorted = new Float64Array(1 << 15);
let rowStart = new Int32Array(2049);

// Even-odd scanline fill of one polygon (all of its rings together); calls span(rowBase, x0, x1)
// for every inclusive run of covered pixels, rows in ascending order.
function scanPolygon(srcRings, W, H, bbox, span) {
  const w = bbox[0], s = bbox[1], e = bbox[2], n = bbox[3];
  const sx = W / (e - w), sy = H / (n - s);
  let m = 0, jlo = H, jhi = -1;
  for (const src of srcRings) {
    for (const ring of unwrapRing(src)) {
      for (let i = 0, len = ring.length; i < len; i++) {
        const p0 = ring[i], p1 = ring[i + 1 === len ? 0 : i + 1];
        const x0 = (p0[0] - w) * sx, y0 = (n - p0[1]) * sy;
        const x1 = (p1[0] - w) * sx, y1 = (n - p1[1]) * sy;
        if (y0 === y1) continue;
        const ymin = y0 < y1 ? y0 : y1, ymax = y0 < y1 ? y1 : y0;
        const j0 = Math.max(0, Math.ceil(ymin - 0.5)), j1 = Math.min(H - 1, Math.ceil(ymax - 0.5) - 1);
        if (j1 < j0) continue;
        const k = (x1 - x0) / (y1 - y0);
        if (m + (j1 - j0 + 1) > xBuf.length) growEdges(m + (j1 - j0 + 1));
        for (let j = j0; j <= j1; j++) { rowBuf[m] = j; xBuf[m++] = x0 + (j + 0.5 - y0) * k; }
        if (j0 < jlo) jlo = j0;
        if (j1 > jhi) jhi = j1;
      }
    }
  }
  if (m === 0) return;
  // Counting sort of the crossings by row.
  const nr = jhi - jlo + 1;
  if (rowStart.length < nr + 1) rowStart = new Int32Array(nr + 1);
  rowStart.fill(0, 0, nr + 1);
  for (let q = 0; q < m; q++) rowStart[rowBuf[q] - jlo + 1]++;
  for (let r = 0; r < nr; r++) rowStart[r + 1] += rowStart[r];
  if (sorted.length < m) sorted = new Float64Array(xBuf.length);
  for (let q = 0; q < m; q++) sorted[rowStart[rowBuf[q] - jlo]++] = xBuf[q];
  // rowStart[r] now holds the end of row r (the start of row r + 1).
  let a0 = 0;
  for (let r = 0; r < nr; r++) {
    const a1 = rowStart[r];
    const cnt = a1 - a0;
    if (cnt >= 2) {
      if (cnt <= 24) {
        for (let p = a0 + 1; p < a1; p++) {
          const v = sorted[p];
          let q = p - 1;
          while (q >= a0 && sorted[q] > v) { sorted[q + 1] = sorted[q]; q--; }
          sorted[q + 1] = v;
        }
      } else sorted.subarray(a0, a1).sort();
      const base = (r + jlo) * W;
      for (let q = a0; q + 1 < a1; q += 2) {
        const a = Math.max(0, Math.ceil(sorted[q] - 0.5)), b = Math.min(W - 1, Math.ceil(sorted[q + 1] - 0.5) - 1);
        if (a <= b) span(base, a, b);
      }
    }
    a0 = a1;
  }
}

function growEdges(need) {
  let size = xBuf.length;
  while (size < need) size *= 2;
  const r = new Int32Array(size); r.set(rowBuf); rowBuf = r;
  const x = new Float64Array(size); x.set(xBuf); xBuf = x;
}

// A ring that jumps across ±180° is made continuous and drawn once per side of the seam.
// Rings that circle the pole (Antarctica) wind a full 360° and are left as they are.
function unwrapRing(ring) {
  let jumps = false;
  for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) { jumps = true; break; }
  if (!jumps) return [ring];
  const out = [[ring[0][0], ring[0][1]]];
  let off = 0, min = ring[0][0], max = ring[0][0];
  for (let i = 1; i < ring.length; i++) {
    const d = ring[i][0] - ring[i - 1][0];
    if (d > 180) off -= 360; else if (d < -180) off += 360;
    const lon = ring[i][0] + off;
    out.push([lon, ring[i][1]]);
    min = Math.min(min, lon); max = Math.max(max, lon);
  }
  const last = out[out.length - 1][0], first = out[0][0];
  if (Math.abs(last - first) > 180) return [ring];
  const res = [out];
  if (min < -180) res.push(out.map(([x, y]) => [x + 360, y]));
  if (max > 180) res.push(out.map(([x, y]) => [x - 360, y]));
  return res;
}

const WORLD_BBOX = [-180, -90, 180, 90];

// d3's geoBounds is the costliest per-nation step and only city building reads it, so it is
// computed on first use (or while the browser is idle after startup). Same value either way.
const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : null;
function lazyBounds(n) {
  let v;
  Object.defineProperty(n, 'bounds', {
    enumerable: true, configurable: true,
    get() { return v ?? (v = geoBounds({ type: 'FeatureCollection', features: n.features })); },
    set(x) { v = x; },
  });
}

const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

function fallbackNation(key, name, area) {
  const size = Math.max(0.3, Math.min(25, area / 25000));
  return {
    key, iso3: name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), name, leader: 'Head of government', title: '',
    gov: 'Republic', ideology: 'dem', gdp: +(size * 1.6).toFixed(1), pop: +(size * 0.6).toFixed(1), stability: 55,
    warSupport: 15, debt: 55, growth: 2.5, defPct: 1.2, capital: null, faction: null, blocs: [], army: null, spirits: [],
    curated: false,
  };
}

export async function loadWorld(onProgress = () => {}) {
  const [topo, wt, budgetBaselines] = await Promise.all([
    fetch('/data/countries-50m.json').then((r) => r.json()),
    fetch('/data/watchtower.json').then((r) => r.json()).catch(() => ({ countries: {}, flags: [] })),
    fetch('/data/budget-baselines.json').then((r) => r.json()).catch(() => ({ countries: {} })),
  ]);
  onProgress('Tracing borders');
  const data = parseNations();
  const fc = feature(topo, topo.objects.countries);
  const nations = [null];
  const byKey = new Map();

  for (const f of fc.features) {
    const fid = f.id ?? f.properties.name;
    const key = DEPENDENCIES[fid] ?? fid;
    let n = byKey.get(key);
    if (!n) {
      n = data[key] ? { ...data[key] } : fallbackNation(key, f.properties.name, 0);
      n.index = nations.length;
      n.features = [];
      nations.push(n);
      byKey.set(key, n);
    }
    if (!data[key] && fid === key) n.name = f.properties.name;
    n.features.push(f);
    f.properties.nation = n.index;
  }

  for (const n of nations.slice(1)) {
    let best = null, bestA = -1, area = 0;
    for (const f of n.features) {
      for (const poly of polygonsOf(f.geometry)) {
        const a = geoArea({ type: 'Polygon', coordinates: poly });
        const sane = a > 2 * Math.PI ? 4 * Math.PI - a : a; // guard against inverted winding
        area += sane;
        if (sane > bestA) { bestA = sane; best = poly; }
      }
    }
    n.areaKm2 = area * EARTH_KM * EARTH_KM;
    n.mainArea = bestA;
    const c = best ? geoCentroid({ type: 'Polygon', coordinates: best }) : [0, 0];
    n.label = { lat: c[1], lon: c[0] };
    lazyBounds(n);
    if (!n.curated) {
      const fb = fallbackNation(n.key, n.name, n.areaKm2);
      n.gdp = fb.gdp; n.pop = fb.pop; n.iso3 = n.iso3 || fb.iso3;
    }
    if (!n.capital) n.capital = { ...n.label };
    n.inert = n.key === '010';

    const w = wt.countries[n.iso3];
    if (w) {
      n.wt = w;
      if (w.gdpUsd) n.gdp = Math.round(w.gdpUsd / 1e8) / 10;
      if (w.gdpUsd && w.gdpPerCapita) n.pop = Math.round((w.gdpUsd / w.gdpPerCapita) / 1e5) / 10;
      const m = w.military;
      if (m) {
        const inv = m.inventory;
        n.army = {
          active: Math.round(m.active / 1000), mbt: inv.tanks ?? 0, air: (inv.fighters ?? 0) + (inv.attack ?? 0),
          carriers: inv.aircraftCarriers ?? 0, subs: inv.submarines ?? 0,
          ships: (inv.destroyers ?? 0) + (inv.frigates ?? 0) + (inv.corvettes ?? 0), nukes: n.army?.nukes ?? 0,
        };
      }
    }
    n.flag = wt.flags?.includes(n.iso3) ? `/flags/${n.iso3}.png` : null;
  }

  onProgress('Rasterising sovereignty');
  const polys = [];
  for (const n of nations.slice(1)) {
    for (const f of n.features) {
      for (const poly of polygonsOf(f.geometry)) polys.push({ rings: poly, value: n.index });
    }
  }
  const owner = rasterize(polys, MAP_W, MAP_H);
  const control = owner.slice();

  // Occupied Ukraine (WatchTower's DeepState-derived control geometry).
  const ukr = byKey.get('804'), rus = byKey.get('643');
  if (wt.frontline && ukr && rus) {
    // Each ring is filled on its own and the results unioned; applied span by span, without an occupancy raster.
    const u = ukr.index, ru = rus.index;
    const occupy = (base, a, b) => { for (let i = base + a, e = base + b; i <= e; i++) if (owner[i] === u) control[i] = ru; };
    for (const ring of wt.frontline.occupied) scanPolygon([ring], MAP_W, MAP_H, WORLD_BBOX, occupy);
  }

  // Per-nation pixel counts and a reservoir of interior pixels for placing units.
  // Pixels are visited in index order, since the rng sequence depends on it. Open sea is skipped
  // four bytes at a time and same-nation runs are handled together.
  const counts = new Uint32Array(256);
  const samples = nations.map(() => []);
  const len = owner.length;
  const words = owner.byteOffset % 4 === 0 ? new Uint32Array(owner.buffer, owner.byteOffset, len >> 2) : null;
  let seed = 7; // state of rng(7) from util/geo.js, inlined: one draw per pixel once a reservoir is full
  for (let i = 0; i < len;) {
    if (words && (i & 3) === 0 && words[i >> 2] === 0) { i += 4; continue; }
    const v = owner[i];
    if (!v) { i++; continue; }
    let end = i + 1;
    while (end < len && owner[end] === v) end++;
    const res = samples[v];
    let c = counts[v];
    for (; i < end && res.length < 3000; i++, c++) res.push(i);
    for (; i < end; i++) {
      c++;
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const k = Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * c);
      if (k < 3000) res[k] = i;
    }
    counts[v] = c;
  }
  for (const n of nations.slice(1)) { n.pixels = counts[n.index]; n.samples = samples[n.index]; }

  const geomNation = (g) => g.properties.nation;
  const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b && geomNation(a) !== geomNation(b));
  const coast = mesh(topo, topo.objects.countries, (a, b) => a === b);

  if (idle) {
    let q = 1;
    const warm = (dl) => { while (q < nations.length && dl.timeRemaining() > 3) void nations[q++].bounds; if (q < nations.length) idle(warm); };
    idle(warm);
  }

  return { topo, fc, nations, byKey, byIso: new Map(nations.slice(1).map((n) => [n.iso3, n])), owner, control, borders, coast, frontline: wt.frontline, wt, budgetBaselines };
}

export function pixelOf(lat, lon) {
  const x = Math.min(MAP_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MAP_W)));
  const y = Math.min(MAP_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MAP_H)));
  return y * MAP_W + x;
}

export function pixelToLL(i) {
  const x = i % MAP_W, y = Math.floor(i / MAP_W);
  return { lat: 90 - ((y + 0.5) / MAP_H) * 180, lon: ((x + 0.5) / MAP_W) * 360 - 180 };
}

export function meshNation(world, index) {
  return mesh(world.topo, world.topo.objects.countries, (a, b) => (a.properties.nation === index) !== (b.properties.nation === index) || (a === b && a.properties.nation === index));
}
