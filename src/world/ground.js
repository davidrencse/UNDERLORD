// Spatial queries against streamed OpenStreetMap tiles: is a point inside a building or water,
// where is the nearest road, and how does a column of vehicles lie along the street network.
// All maths runs in each tile's local east/north metres, the frame the tile worker emits.
// The grid itself is built in the worker (tileWorker.js buildIndex) as flat typed arrays, so the
// queries here allocate nothing and never touch a Map.
import { DEG } from '../util/geo.js';

const R = 6371000;
const CELL = 80; // metres — must match tileWorker.js
const OFF = 4000;

const cellOf = (v) => Math.floor((v + OFF) / CELL);

// Wraps the worker-built index with the tile's projection constants and damage state.
export function indexTile(d) {
  const ix = d.ix;
  ix.kx = Math.cos(d.cLat * DEG) * DEG * R;
  ix.ky = DEG * R;
  ix.destroyed = new Uint8Array(d.fInfo.length / 6);
  return ix;
}

export const toLocal = (t, lat, lon) => [(lon - t.cLon) * t.ix.kx, (lat - t.cLat) * t.ix.ky];
export const toLL = (t, x, y) => ({ lat: t.cLat + y / t.ix.ky, lon: t.cLon + x / t.ix.kx });

function pointInRing(fRing, fInfo, i, x, y) {
  const s = fInfo[i * 6], n = fInfo[i * 6 + 1];
  let inside = false;
  for (let a = 0, b = n - 1; a < n; b = a++) {
    const xa = fRing[(s + a) * 2], ya = fRing[(s + a) * 2 + 1], xb = fRing[(s + b) * 2], yb = fRing[(s + b) * 2 + 1];
    if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

// Cells are visited x-major, then y, items ascending — the order every query below relies on
// for its first-hit / strictly-nearest tie-breaking.
export function buildingAt(t, x, y, pad = 0) {
  const ix = t.ix, { bOff, bItems, bbox, destroyed, gx0, gy0, nx, ny } = ix;
  const fRing = t.fRing, fInfo = t.fInfo;
  const cx0 = Math.max(gx0, cellOf(x - pad)), cx1 = Math.min(gx0 + nx - 1, cellOf(x + pad));
  const cy0 = Math.max(gy0, cellOf(y - pad)), cy1 = Math.min(gy0 + ny - 1, cellOf(y + pad));
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
    const c = (cx - gx0) * ny + (cy - gy0);
    for (let k = bOff[c], e = bOff[c + 1]; k < e; k++) {
      const i = bItems[k];
      if (destroyed[i]) continue;
      const o = i * 4;
      if (x < bbox[o] - pad || y < bbox[o + 1] - pad || x > bbox[o + 2] + pad || y > bbox[o + 3] + pad) continue;
      if (pointInRing(fRing, fInfo, i, x, y)) return i;
    }
  }
  return -1;
}

export function inWater(t, x, y) {
  const w = t.wPos, { wOff, wItems, gx0, gy0, nx, ny } = t.ix;
  const cx = cellOf(x), cy = cellOf(y);
  if (cx < gx0 || cy < gy0 || cx >= gx0 + nx || cy >= gy0 + ny) return false;
  const c = (cx - gx0) * ny + (cy - gy0);
  for (let k = wOff[c], e = wOff[c + 1]; k < e; k++) {
    const o = wItems[k] * 9;
    const ax = w[o], ay = w[o + 1], bx = w[o + 3], by = w[o + 4], qx = w[o + 6], qy = w[o + 7];
    const d = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy);
    if (!d) continue;
    const l1 = ((by - qy) * (x - qx) + (qx - bx) * (y - qy)) / d, l2 = ((qy - ay) * (x - qx) + (ax - qx) * (y - qy)) / d;
    if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) return true;
  }
  return false;
}

// Nearest point on a drivable road segment (rail excluded), within maxM metres.
export function nearestRoad(t, x, y, maxM) {
  const r = t.rPos, rank = t.rRank, { rOff, rItems, gx0, gy0, nx, ny } = t.ix;
  let seg = -1, bu = 0, bx_ = 0, by_ = 0, bd = maxM * maxM;
  const cx0 = Math.max(gx0, cellOf(x - maxM)), cx1 = Math.min(gx0 + nx - 1, cellOf(x + maxM));
  const cy0 = Math.max(gy0, cellOf(y - maxM)), cy1 = Math.min(gy0 + ny - 1, cellOf(y + maxM));
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
    const c = (cx - gx0) * ny + (cy - gy0);
    for (let k = rOff[c], e = rOff[c + 1]; k < e; k++) {
      const i = rItems[k];
      if (!rank[i]) continue;
      const o = i * 6, ax = r[o], ay = r[o + 1], dx = r[o + 3] - ax, dy = r[o + 4] - ay, L = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
      const px = ax + dx * u, py = ay + dy * u, d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; seg = i; bu = u; bx_ = px; by_ = py; }
    }
  }
  return seg < 0 ? null : { seg, u: bu, x: bx_, y: by_, dist: Math.sqrt(bd) };
}

// Range [lo, hi) of road-segment ids whose endpoint rounds to (x, y), in ix.eSeg.
function endsAt(ix, x, y) {
  const key = (Math.round(x) + 1e5) * 2e5 + (Math.round(y) + 1e5);
  const keys = ix.eKey;
  let lo = 0, hi = keys.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (keys[m] < key) lo = m + 1; else hi = m; }
  return lo < keys.length && keys[lo] === key ? lo : -1;
}

// Lays `n` points `gap` metres apart along the road network, starting at a road point and walking
// away from `headingDeg` (the column faces the heading, so its tail trails behind on the road).
export function roadColumn(t, start, headingDeg, n, gap) {
  const r = t.rPos, ix = t.ix, rank = t.rRank;
  const h = headingDeg * DEG, fx = Math.sin(h), fy = Math.cos(h);
  let seg = start.seg;
  let o = seg * 6;
  // Walk toward whichever end lies behind the column.
  let toB = (r[o + 3] - r[o]) * fx + (r[o + 4] - r[o + 1]) * fy < 0;
  let x = start.x, y = start.y;
  const out = [];
  let need = 0;
  const visited = new Set([seg]);
  for (let guard = 0; out.length < n && guard < n * 12; guard++) {
    o = seg * 6;
    const ex = toB ? r[o + 3] : r[o], ey = toB ? r[o + 4] : r[o + 1];
    let dx = ex - x, dy = ey - y;
    const len = Math.hypot(dx, dy);
    dx /= len || 1; dy /= len || 1;
    let walked = 0;
    while (out.length < n && need <= len - walked) {
      walked += need;
      out.push({ x: x + dx * walked, y: y + dy * walked, yaw: Math.atan2(-dx, -dy) / DEG });
      need = gap;
    }
    need -= len - walked;
    // Continue onto the connected segment that bends least.
    const k = endsAt(ix, ex, ey);
    let next = -1, bestDot = -2, nextToB = toB;
    if (k >= 0) for (let q = ix.eOff[k], qe = ix.eOff[k + 1]; q < qe; q++) {
      const c = ix.eSeg[q];
      if (visited.has(c) || !rank[c]) continue;
      const co = c * 6;
      const fromA = Math.abs(r[co] - ex) < 1.5 && Math.abs(r[co + 1] - ey) < 1.5;
      const nx = fromA ? r[co + 3] - r[co] : r[co] - r[co + 3], ny = fromA ? r[co + 4] - r[co + 1] : r[co + 1] - r[co + 4];
      const dot = (nx * dx + ny * dy) / (Math.hypot(nx, ny) || 1);
      if (dot > bestDot) { bestDot = dot; next = c; nextToB = fromA; }
    }
    if (next < 0) break;
    toB = nextToB;
    seg = next; visited.add(seg);
    x = ex; y = ey;
  }
  return out;
}

// Collapses every standing building whose centre lies within radius; returns the rubble points.
// Only the vertex spans of the collapsed buildings are re-uploaded to the GPU.
export function damageTile(t, x, y, radius) {
  const ix = t.ix, out = [];
  if (!t.bAttr) return out;
  const pos = t.bAttr.array, col = t.cAttr.array, info = t.fInfo;
  const { bOff, bItems, centre, destroyed, gx0, gy0, nx, ny } = ix;
  const r2 = radius * radius;
  const cx0 = Math.max(gx0, cellOf(x - radius)), cx1 = Math.min(gx0 + nx - 1, cellOf(x + radius));
  const cy0 = Math.max(gy0, cellOf(y - radius)), cy1 = Math.min(gy0 + ny - 1, cellOf(y + radius));
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
    const c = (cx - gx0) * ny + (cy - gy0);
    for (let k = bOff[c], e = bOff[c + 1]; k < e; k++) {
      const i = bItems[k];
      if (destroyed[i]) continue;
      const bx = centre[i * 2], by = centre[i * 2 + 1];
      if ((bx - x) ** 2 + (by - y) ** 2 > r2) continue;
      destroyed[i] = 1;
      const v0 = info[i * 6 + 2], v1 = info[i * 6 + 3], base = info[i * 6 + 4], h = info[i * 6 + 5];
      for (let v = v0; v < v1; v++) {
        const z = pos[v * 3 + 2];
        // Rubble: a jagged stump a fraction of the old height, charred.
        pos[v * 3 + 2] = base + (z - base) * (0.08 + ((v * 7919) % 13) / 100);
        // Colours are normalised Uint16 RGBA (see tileWorker.js); round rather than truncate.
        const c = v * 4;
        col[c] = Math.round(col[c] * 0.62); col[c + 1] = Math.round(col[c + 1] * 0.56); col[c + 2] = Math.round(col[c + 2] * 0.5);
      }
      if (v1 > v0) { t.bAttr.addUpdateRange(v0 * 3, (v1 - v0) * 3); t.cAttr.addUpdateRange(v0 * 4, (v1 - v0) * 4); }
      out.push({ x: bx, y: by, h });
    }
  }
  if (out.length) { t.bAttr.needsUpdate = true; t.cAttr.needsUpdate = true; }
  return out;
}
