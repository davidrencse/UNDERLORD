// Decodes one OpenMapTiles vector tile (OpenFreeMap planet) into city geometry, off the main thread.
// Output coordinates are metres in a local east/north/up frame centred on the tile, so the main
// thread can place each tile with one matrix and keep Float32 precision at street level.
// Building height rules follow WatchTower's threeBuildingLayer.
// The worker also builds the tile's spatial index (see ground.js), so the main thread only wraps
// the transferred typed arrays when a tile lands.
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import earcut from 'earcut';

const R = 6371000;
const DEG = Math.PI / 180;
const ROAD_TONE = { motorway: 1, trunk: 0.95, primary: 0.85, secondary: 0.7, tertiary: 0.55, minor: 0.38, rail: 0.5, transit: 0.45 };
const LIGHT_STEP = { motorway: 22, trunk: 24, primary: 28, secondary: 34, tertiary: 42, minor: 60 };
const U16 = 65535; // building colours ship as normalised Uint16 RGBA (8 bytes/vertex, not 12); error < 1e-5

// Spatial index constants — ground.js reads the grid these produce.
const CELL = 80; // metres
const OFF = 4000; // tiles are ~2.4 km wide; offset keeps cell indices positive
const cellOf = (v) => Math.floor((v + OFF) / CELL);

const num = (v) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : null; };

function heightOf(p) {
  const explicit = num(p.render_height ?? p.height);
  const levels = num(p.render_levels ?? p.levels);
  return Math.min(600, Math.max(3, explicit ?? (levels == null ? 9 : levels * 3)));
}
function baseOf(p, h) {
  const explicit = num(p.render_min_height ?? p.min_height);
  return Math.min(h - 0.5, Math.max(0, explicit ?? 0));
}

function ringArea(r) {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j].x - r[i].x) * (r[i].y + r[j].y);
  return s;
}
// Split MVT rings into polygons (outer ring followed by its holes), as vector-tile's toGeoJSON does.
function classify(rings) {
  const polys = [];
  let poly = null, ccw;
  for (const r of rings) {
    const a = ringArea(r);
    if (a === 0) continue;
    if (ccw === undefined) ccw = a < 0;
    if (ccw === a < 0) { if (poly) polys.push(poly); poly = [r]; } else if (poly) poly.push(r);
  }
  if (poly) polys.push(poly);
  return polys;
}

// Growable typed array: no boxed JS-array growth, one exact-size copy at the end.
class Buf {
  constructor(T, n = 4096) { this.T = T; this.a = new T(n); this.n = 0; }
  need(k) {
    if (this.n + k <= this.a.length) return this.a;
    let m = this.a.length * 2;
    while (m < this.n + k) m *= 2;
    const b = new this.T(m);
    b.set(this.a.subarray(0, this.n));
    return (this.a = b);
  }
  out() { return this.a.slice(0, this.n); }
}

// Projection from tile pixels to local metres. Every vertex coordinate is an integer in tile
// pixels, so each axis is memoised in a table (latOf is an atan/sinh per call otherwise).
function projector(z, x, y) {
  const n = 2 ** z;
  const lonOf = (u) => ((x + u) / n) * 360 - 180;
  const latOf = (v) => Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + v)) / n))) / DEG;
  const cLat = latOf(0.5), cLon = lonOf(0.5);
  const kx = Math.cos(cLat * DEG) * DEG * R, ky = DEG * R;
  let ext = -1, lo = 0, mxT = null, myT = null;
  const setExt = (e) => {
    if (e === ext) return;
    ext = e; lo = -e; // tile buffers are far smaller than one extent
    mxT = new Float64Array(e * 3 + 1).fill(NaN);
    myT = new Float64Array(e * 3 + 1).fill(NaN);
  };
  const mx = (px) => {
    const i = px - lo;
    if (i >= 0 && i < mxT.length) { let v = mxT[i]; if (v !== v) v = mxT[i] = (lonOf(px / ext) - cLon) * kx; return v; }
    return (lonOf(px / ext) - cLon) * kx;
  };
  const my = (py) => {
    const i = py - lo;
    if (i >= 0 && i < myT.length) { let v = myT[i]; if (v !== v) v = myT[i] = (latOf(py / ext) - cLat) * ky; return v; }
    return (latOf(py / ext) - cLat) * ky;
  };
  return { cLat, cLon, setExt, mx, my };
}

export function decodeTile(buf, z, x, y) {
  const tile = new VectorTile(new Pbf(buf));
  const P = projector(z, x, y);
  const { cLat, cLon, mx, my } = P;

  // ---------------------------------------------------------------- buildings
  const bPos = new Buf(Float32Array, 1 << 16), bCol = new Buf(Uint16Array, 1 << 16);
  // Footprints for collision and damage: [ringStart, ringLen, vertStart, vertEnd, base, height] per building.
  const fRing = new Buf(Float32Array), fInfo = new Buf(Float32Array);
  let count = 0;
  const L0 = -0.62, L1 = 0.78;
  const flat = [], holes = [], ringOff = [], ringLen = [];
  let inside = new Uint8Array(256);
  const bl = tile.layers.building;
  for (let i = 0; bl && i < bl.length; i++) {
    const f = bl.feature(i);
    if (f.type !== 3) continue;
    const h = heightOf(f.properties), b = baseOf(f.properties, h);
    const tone = 0.2 + Math.min(1, h / 220) * 0.3;
    const ext = bl.extent;
    P.setExt(ext);
    for (const poly of classify(f.loadGeometry())) {
      flat.length = 0; holes.length = 0; ringOff.length = 0; ringLen.length = 0;
      for (const ring of poly) {
        let len = ring.length;
        if (len > 1 && ring[0].x === ring[len - 1].x && ring[0].y === ring[len - 1].y) len--;
        if (len < 3) continue;
        const start = flat.length / 2;
        if (ringOff.length) holes.push(start);
        if (start + len > inside.length) { const g = new Uint8Array(Math.max(inside.length * 2, start + len)); g.set(inside); inside = g; }
        for (let j = 0; j < len; j++) {
          const p = ring[j];
          flat.push(mx(p.x), my(p.y));
          inside[start + j] = p.x >= 0 && p.y >= 0 && p.x <= ext && p.y <= ext ? 1 : 0;
        }
        ringOff.push(start); ringLen.push(len);
      }
      if (!ringOff.length) continue;
      const vStart = bPos.n / 3;
      const ringStart = fRing.n / 2;
      const n0 = ringLen[0];
      let fr = fRing.need(n0 * 2);
      for (let k = 0; k < n0 * 2; k++) fr[fRing.n++] = flat[k];
      const tris = earcut(flat, holes);
      const roof = tone * 1.25;
      const cr = Math.round(roof * U16), cr2 = Math.round(roof * 1.02 * U16);
      let pa = bPos.need(tris.length * 3), ca = bCol.need(tris.length * 4);
      let pn = bPos.n, cn = bCol.n;
      for (let t = 0; t < tris.length; t++) {
        const k = tris[t] * 2;
        pa[pn] = flat[k]; pa[pn + 1] = flat[k + 1]; pa[pn + 2] = h;
        ca[cn] = cr; ca[cn + 1] = cr; ca[cn + 2] = cr2; ca[cn + 3] = U16;
        pn += 3; cn += 4;
      }
      bPos.n = pn; bCol.n = cn;
      for (let r = 0; r < ringOff.length; r++) {
        const s = ringOff[r], m = ringLen[r];
        pa = bPos.need(m * 18); ca = bCol.need(m * 24);
        pn = bPos.n; cn = bCol.n;
        for (let j = 0; j < m; j++) {
          const j2 = j + 1 === m ? 0 : j + 1;
          if (!inside[s + j] && !inside[s + j2]) continue; // tile-buffer duplicate
          const ax = flat[(s + j) * 2], ay = flat[(s + j) * 2 + 1], bx = flat[(s + j2) * 2], by = flat[(s + j2) * 2 + 1];
          const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
          const lit = Math.max(0, (dy * L0 - dx * L1) / len);
          const top = tone * (0.5 + lit * 0.55), bot = top * 0.35;
          pa[pn] = ax; pa[pn + 1] = ay; pa[pn + 2] = b;
          pa[pn + 3] = bx; pa[pn + 4] = by; pa[pn + 5] = b;
          pa[pn + 6] = bx; pa[pn + 7] = by; pa[pn + 8] = h;
          pa[pn + 9] = ax; pa[pn + 10] = ay; pa[pn + 11] = b;
          pa[pn + 12] = bx; pa[pn + 13] = by; pa[pn + 14] = h;
          pa[pn + 15] = ax; pa[pn + 16] = ay; pa[pn + 17] = h;
          const T = Math.round(top * U16), B = Math.round(bot * U16);
          // Vertices: bot, bot, top, bot, top, top (RGBA, opaque).
          ca[cn] = ca[cn + 1] = ca[cn + 2] = ca[cn + 4] = ca[cn + 5] = ca[cn + 6] = B;
          ca[cn + 8] = ca[cn + 9] = ca[cn + 10] = T;
          ca[cn + 12] = ca[cn + 13] = ca[cn + 14] = B;
          ca[cn + 16] = ca[cn + 17] = ca[cn + 18] = ca[cn + 20] = ca[cn + 21] = ca[cn + 22] = T;
          ca[cn + 3] = ca[cn + 7] = ca[cn + 11] = ca[cn + 15] = ca[cn + 19] = ca[cn + 23] = U16;
          pn += 18; cn += 24;
        }
        bPos.n = pn; bCol.n = cn;
      }
      const fi = fInfo.need(6);
      fi[fInfo.n] = ringStart; fi[fInfo.n + 1] = n0; fi[fInfo.n + 2] = vStart; fi[fInfo.n + 3] = bPos.n / 3; fi[fInfo.n + 4] = b; fi[fInfo.n + 5] = h;
      fInfo.n += 6;
    }
    count++;
  }

  // ---------------------------------------------------------------- roads and street lights
  const rPos = new Buf(Float32Array), rCol = new Buf(Float32Array), lPos = new Buf(Float32Array), lBri = new Buf(Float32Array), lWarm = new Buf(Float32Array);
  const rLine = new Buf(Uint32Array), rRank = new Buf(Uint8Array); // per segment: which polyline it belongs to, and road class rank
  let lineId = 0;
  const tl = tile.layers.transportation;
  let seed = (x * 73856093) ^ (y * 19349663);
  const rand = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) % 10000) / 10000; };
  for (let i = 0; tl && i < tl.length; i++) {
    const f = tl.feature(i);
    if (f.type !== 2) continue;
    const cls = f.properties.class;
    const tone = ROAD_TONE[cls];
    if (tone == null) continue;
    const ext = tl.extent;
    P.setExt(ext);
    const step = LIGHT_STEP[cls];
    const major = tone >= 0.85;
    const rank = cls === 'rail' || cls === 'transit' ? 0 : Math.round(tone * 10);
    for (const line of f.loadGeometry()) {
      lineId++;
      for (let j = 0; j + 1 < line.length; j++) {
        const p = line[j], q = line[j + 1];
        if (!(p.x >= 0 && p.y >= 0 && p.x <= ext && p.y <= ext) && !(q.x >= 0 && q.y >= 0 && q.x <= ext && q.y <= ext)) continue;
        const ax = mx(p.x), ay = my(p.y), bx = mx(q.x), by = my(q.y);
        const ra = rPos.need(6), rc = rCol.need(6), o = rPos.n;
        ra[o] = ax; ra[o + 1] = ay; ra[o + 2] = 0.8; ra[o + 3] = bx; ra[o + 4] = by; ra[o + 5] = 0.8;
        rc[o] = rc[o + 1] = rc[o + 2] = rc[o + 3] = rc[o + 4] = rc[o + 5] = tone;
        rPos.n = rCol.n = o + 6;
        rLine.need(1)[rLine.n++] = lineId;
        rRank.need(1)[rRank.n++] = rank;
        if (!step) continue;
        const len = Math.hypot(bx - ax, by - ay);
        for (let d = rand() * step; d < len; d += step) {
          const t = d / len;
          const la = lPos.need(3), lo = lPos.n;
          la[lo] = ax + (bx - ax) * t + (rand() - 0.5) * 6;
          la[lo + 1] = ay + (by - ay) * t + (rand() - 0.5) * 6;
          la[lo + 2] = 4;
          lPos.n = lo + 3;
          lBri.need(1)[lBri.n++] = major ? 0.9 : 0.35 + tone * 0.6;
          lWarm.need(1)[lWarm.n++] = major || rand() < 0.1 ? 1 : 0;
        }
      }
    }
  }

  // ---------------------------------------------------------------- water
  const wPos = new Buf(Float32Array);
  const wl = tile.layers.water;
  for (let i = 0; wl && i < wl.length; i++) {
    const f = wl.feature(i);
    if (f.type !== 3) continue;
    P.setExt(wl.extent);
    for (const poly of classify(f.loadGeometry())) {
      flat.length = 0; holes.length = 0;
      for (let ri = 0; ri < poly.length; ri++) {
        if (ri) holes.push(flat.length / 2);
        for (const p of poly[ri]) flat.push(mx(p.x), my(p.y));
      }
      const tris = earcut(flat, holes);
      const wa = wPos.need(tris.length * 3);
      let o = wPos.n;
      for (let t = 0; t < tris.length; t++) { wa[o++] = flat[tris[t] * 2]; wa[o++] = flat[tris[t] * 2 + 1]; wa[o++] = 0.4; }
      wPos.n = o;
    }
  }

  const out = {
    cLat, cLon, buildings: count,
    bPos: bPos.out(), bCol: bCol.out(),
    rPos: rPos.out(), rCol: rCol.out(),
    lPos: lPos.out(), lBri: lBri.out(), lWarm: lWarm.out(),
    wPos: wPos.out(),
    fRing: fRing.out(), fInfo: fInfo.out(),
    rLine: rLine.out(), rRank: rRank.out(),
  };
  out.ix = buildIndex(out);
  out.bounds = boundsOf(out);
  return out;
}

// Axis-aligned bounds of everything drawn, [x0, y0, z0, x1, y1, z1], for the tile's bounding sphere.
function boundsOf(d) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const a of [d.bPos, d.rPos, d.lPos, d.wPos]) {
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i], y = a[i + 1], z = a[i + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  return x0 <= x1 ? [x0, y0, z0, x1, y1, z1] : null;
}

// Uniform grid over the tile in compressed-row form: for each list (buildings, roads, water
// triangles), off[cell]..off[cell+1] indexes into items[], in ascending item order — the same
// visiting order the old Map-of-arrays grid had. Road endpoints are indexed by rounded metre
// position for walking from one segment onto the next.
function buildIndex(d) {
  const { fRing, fInfo, rPos, wPos } = d;
  const nb = fInfo.length / 6, nr = rPos.length / 6, nw = wPos.length / 9;
  const bbox = new Float32Array(nb * 4);
  const centre = new Float32Array(nb * 2);
  for (let i = 0; i < nb; i++) {
    const s = fInfo[i * 6], n = fInfo[i * 6 + 1];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sx = 0, sy = 0;
    for (let k = 0; k < n; k++) {
      const x = fRing[(s + k) * 2], y = fRing[(s + k) * 2 + 1];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); sx += x; sy += y;
    }
    bbox[i * 4] = x0; bbox[i * 4 + 1] = y0; bbox[i * 4 + 2] = x1; bbox[i * 4 + 3] = y1;
    centre[i * 2] = sx / n; centre[i * 2 + 1] = sy / n;
  }
  // Cell range of each item: [cx0, cy0, cx1, cy1].
  const span = (n, f) => {
    const s = new Int32Array(n * 4);
    for (let i = 0; i < n; i++) f(i, s, i * 4);
    return s;
  };
  const put = (s, o, x0, y0, x1, y1) => { s[o] = cellOf(x0); s[o + 1] = cellOf(y0); s[o + 2] = cellOf(x1); s[o + 3] = cellOf(y1); };
  const sb = span(nb, (i, s, o) => put(s, o, bbox[i * 4], bbox[i * 4 + 1], bbox[i * 4 + 2], bbox[i * 4 + 3]));
  const sr = span(nr, (i, s, o) => {
    const ax = rPos[i * 6], ay = rPos[i * 6 + 1], bx = rPos[i * 6 + 3], by = rPos[i * 6 + 4];
    put(s, o, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
  });
  const sw = span(nw, (i, s, o) => {
    const k = i * 9;
    put(s, o, Math.min(wPos[k], wPos[k + 3], wPos[k + 6]), Math.min(wPos[k + 1], wPos[k + 4], wPos[k + 7]), Math.max(wPos[k], wPos[k + 3], wPos[k + 6]), Math.max(wPos[k + 1], wPos[k + 4], wPos[k + 7]));
  });
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (const s of [sb, sr, sw]) for (let o = 0; o < s.length; o += 4) {
    if (s[o] < gx0) gx0 = s[o]; if (s[o + 1] < gy0) gy0 = s[o + 1];
    if (s[o + 2] > gx1) gx1 = s[o + 2]; if (s[o + 3] > gy1) gy1 = s[o + 3];
  }
  if (gx0 > gx1) { gx0 = gy0 = 0; gx1 = gy1 = -1; }
  const nx = gx1 - gx0 + 1, ny = gy1 - gy0 + 1, cells = nx * ny;
  const csr = (s) => {
    const off = new Uint32Array(cells + 1);
    for (let o = 0; o < s.length; o += 4) for (let cx = s[o]; cx <= s[o + 2]; cx++) for (let cy = s[o + 1]; cy <= s[o + 3]; cy++) off[(cx - gx0) * ny + (cy - gy0) + 1]++;
    for (let c = 0; c < cells; c++) off[c + 1] += off[c];
    const items = new Uint32Array(off[cells]);
    const fill = off.slice(0, cells);
    for (let o = 0, i = 0; o < s.length; o += 4, i++) for (let cx = s[o]; cx <= s[o + 2]; cx++) for (let cy = s[o + 1]; cy <= s[o + 3]; cy++) items[fill[(cx - gx0) * ny + (cy - gy0)]++] = i;
    return [off, items];
  };
  const [bOff, bItems] = csr(sb), [rOff, rItems] = csr(sr), [wOff, wItems] = csr(sw);

  // Road endpoints keyed by rounded metres; ids (2 * segment + end) sorted by key, then id.
  const ne = nr * 2;
  const key = new Float64Array(ne);
  for (let e = 0; e < ne; e++) {
    const o = (e >> 1) * 6 + (e & 1) * 3;
    key[e] = (Math.round(rPos[o]) + 1e5) * 2e5 + (Math.round(rPos[o + 1]) + 1e5);
  }
  const ids = new Uint32Array(ne);
  for (let e = 0; e < ne; e++) ids[e] = e;
  ids.sort((a, b) => key[a] - key[b] || a - b);
  let nk = 0;
  for (let k = 0; k < ne; k++) if (!k || key[ids[k]] !== key[ids[k - 1]]) nk++;
  const eKey = new Float64Array(nk), eOff = new Uint32Array(nk + 1), eSeg = new Uint32Array(ne);
  for (let k = 0, u = -1; k < ne; k++) {
    if (!k || key[ids[k]] !== key[ids[k - 1]]) { u++; eKey[u] = key[ids[k]]; eOff[u] = k; }
    eSeg[k] = ids[k] >> 1;
  }
  eOff[nk] = ne;
  return { bbox, centre, gx0, gy0, nx, ny, bOff, bItems, rOff, rItems, wOff, wItems, eKey, eOff, eSeg };
}

const transferables = (d) => {
  const list = [d.bPos, d.bCol, d.rPos, d.rCol, d.lPos, d.lBri, d.lWarm, d.wPos, d.fRing, d.fInfo, d.rLine, d.rRank];
  const ix = d.ix;
  list.push(ix.bbox, ix.centre, ix.bOff, ix.bItems, ix.rOff, ix.rItems, ix.wOff, ix.wItems, ix.eKey, ix.eOff, ix.eSeg);
  return list.map((a) => a.buffer);
};

if (typeof self !== 'undefined') {
  self.onmessage = async (e) => {
    const { id, url, z, x, y } = e.data;
    try {
      const res = await fetch(url);
      if (!res.ok) { self.postMessage({ id, empty: true }); return; }
      const out = decodeTile(await res.arrayBuffer(), z, x, y);
      out.id = id;
      self.postMessage(out, transferables(out));
    } catch (err) {
      self.postMessage({ id, error: String(err) });
    }
  };
}
