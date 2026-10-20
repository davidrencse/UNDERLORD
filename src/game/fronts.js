// Front lines traced off the control raster, in the manner of Hearts of Iron IV: wherever a
// pixel held by one side touches a pixel held by the other, that pixel is on the front. The
// pixels are chained into ordered polylines so formations can be spread evenly along them.
//
// Pure functions over a control raster (one byte per pixel, nation index); no game state.

import { haversine, destination, bearing } from '../util/geo.js';

const DEGK = Math.PI / 180;

// Pixel window around a point: half-height `dLat` degrees, half-width scaled by latitude.
export function windowAround(p, dLat, W, H) {
  const dLon = Math.min(180, dLat / Math.max(0.2, Math.cos(p.lat * DEGK)));
  const y0 = Math.max(0, Math.floor(((90 - (p.lat + dLat)) / 180) * H));
  const y1 = Math.min(H - 1, Math.ceil(((90 - (p.lat - dLat)) / 180) * H));
  const cx = ((p.lon + 180) / 360) * W, hw = (dLon / 360) * W;
  return { x0: Math.floor(cx - hw), x1: Math.ceil(cx + hw), y0, y1 };
}

const toLL = (x, y, W, H) => ({ lat: 90 - ((y + 0.5) / H) * 180, lon: ((((((x + 0.5) / W) * 360) % 360) + 360) % 360) - 180 });

// Contact pixels on `mine`'s side of the line, as unwrapped window coordinates {x, y}.
// `mine` and `theirs` are 256-entry lookup tables over nation indices.
export function contactPixels(control, W, H, win, mine, theirs) {
  const out = [];
  for (let y = win.y0; y <= win.y1; y++) {
    const row = y * W;
    for (let x = win.x0; x <= win.x1; x++) {
      const xi = ((x % W) + W) % W;
      if (!mine[control[row + xi]]) continue;
      const l = row + ((xi - 1 + W) % W), r = row + ((xi + 1) % W);
      if (theirs[control[l]] || theirs[control[r]] || (y > 0 && theirs[control[row - W + xi]]) || (y < H - 1 && theirs[control[row + W + xi]])) out.push({ x, y });
    }
  }
  return out;
}

// Chains contact pixels into ordered runs: start from an end (a pixel with few neighbours),
// keep stepping to the nearest unvisited pixel within `reach`, and swallow the pixels beside
// the path so a two-pixel-thick border becomes one line.
export function chain(pixels, reach = 3) {
  const key = (x, y) => (y + 4096) * 65536 + (x + 32768);
  const grid = new Map();
  pixels.forEach((p, i) => grid.set(key(p.x, p.y), i));
  const used = new Uint8Array(pixels.length);
  const near = (p, r, fn) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const j = grid.get(key(p.x + dx, p.y + dy));
      if (j !== undefined) fn(j, dx, dy);
    }
  };
  const degree = pixels.map((p) => { let d = 0; near(p, 1, () => d++); return d; });
  const order = pixels.map((_, i) => i).sort((a, b) => degree[a] - degree[b] || pixels[a].y - pixels[b].y || pixels[a].x - pixels[b].x);
  const runs = [];
  for (const start of order) {
    if (used[start]) continue;
    const run = [];
    let cur = start, px = 0, py = 0;
    while (cur >= 0) {
      const p = pixels[cur];
      used[cur] = 1;
      run.push(p);
      near(p, 1, (j) => { used[j] = 1; });
      let best = -1, bd = Infinity;
      near(p, reach, (j, dx, dy) => {
        if (used[j]) return;
        // Prefer carrying on in the direction already travelled.
        const d = dx * dx + dy * dy - (px * dx + py * dy) * 0.35;
        if (d < bd) { bd = d; best = j; }
      });
      if (best >= 0) { px = pixels[best].x - p.x; py = pixels[best].y - p.y; const l = Math.hypot(px, py) || 1; px /= l; py /= l; }
      cur = best;
    }
    if (run.length >= 3) runs.push(run);
  }
  return runs;
}

// Front segments near `centre`: polylines of {lat, lon, out} where `out` is the bearing that
// points across the line toward the other side. Segments shorter than `minKm` are dropped.
export function traceFront(control, W, H, centre, mine, theirs, { dLat = 9, minKm = 25 } = {}) {
  const win = windowAround(centre, dLat, W, H);
  const pix = contactPixels(control, W, H, win, mine, theirs);
  if (!pix.length) return [];
  const segs = [];
  for (const run of chain(pix)) {
    // Light smoothing takes the stair steps out of the raster edge.
    const pts = run.map((p, i) => {
      let sx = 0, sy = 0, k = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(run.length - 1, i + 2); j++) { sx += run[j].x; sy += run[j].y; k++; }
      return toLL(sx / k, sy / k, W, H);
    });
    // Bearing toward the other side: the mean offset to their pixels in a 7×7 window.
    run.forEach((p, i) => {
      let ex = 0, ey = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const y = p.y + dy;
        if (y < 0 || y >= H) continue;
        const x = (((p.x + dx) % W) + W) % W;
        if (theirs[control[y * W + x]]) { ex += dx; ey += dy; }
      }
      pts[i].out = Math.atan2(ex * Math.cos(pts[i].lat * DEGK), -ey) / DEGK;
    });
    let km = 0;
    for (let i = 1; i < pts.length; i++) km += haversine(pts[i - 1], pts[i]);
    if (km >= minKm) segs.push(thin(pts, 8));
  }
  return segs;
}

// Keeps a vertex roughly every `km` kilometres.
function thin(pts, km) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += haversine(pts[i - 1], pts[i]);
    if (acc >= km || i === pts.length - 1) { out.push(pts[i]); acc = 0; }
  }
  return out;
}

export function lineKm(pts) {
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += haversine(pts[i - 1], pts[i]);
  return km;
}

// `n` points spread evenly by length across one or more polylines (gaps between them are
// skipped). Each point carries the bearing of the line there (`along`) and, where the input
// has one, the bearing toward the far side (`out`).
export function spread(segs, n) {
  const lens = segs.map(lineKm);
  const total = lens.reduce((a, b) => a + b, 0);
  if (!n || !segs.length) return [];
  if (total < 1e-6) return Array.from({ length: n }, () => ({ ...segs[0][0], along: 0 }));
  const out = [];
  for (let k = 0; k < n; k++) {
    let d = ((k + 0.5) / n) * total, s = 0;
    while (s < segs.length - 1 && d > lens[s]) { d -= lens[s]; s++; }
    const pts = segs[s];
    let i = 1;
    for (; i < pts.length; i++) {
      const l = haversine(pts[i - 1], pts[i]);
      if (d <= l || i === pts.length - 1) {
        const a = pts[i - 1], b = pts[i], t = l > 0 ? Math.min(1, d / l) : 0;
        out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, along: bearing(a, b), out: a.out ?? b.out, seg: s });
        break;
      }
      d -= l;
    }
    if (pts.length === 1) out.push({ ...pts[0], along: 0, seg: s });
  }
  return out;
}

// Position of a point along the polylines, in km from the start, for ordering formations so
// the leftmost takes the leftmost slot and nobody crosses behind the line.
export function paramAlong(segs, p) {
  let best = Infinity, at = 0, base = 0;
  for (const pts of segs) {
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) acc += haversine(pts[i - 1], pts[i]);
      const d = haversine(pts[i], p);
      if (d < best) { best = d; at = base + acc; }
    }
    base += acc + 1;
  }
  return at;
}

// Pulls a slot back from the contact line by `km` (away from the far side).
export function setBack(slot, km) {
  return slot.out == null ? { lat: slot.lat, lon: slot.lon } : destination(slot, slot.out + 180, km);
}
