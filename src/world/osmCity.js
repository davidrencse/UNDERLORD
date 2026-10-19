import * as THREE from 'three';
import { ll2v, destination, haversine, DEG, EARTH_KM } from '../util/geo.js';
import { pointsVert, pointsFrag } from './cityLayer.js';
import { indexTile, toLL, buildingAt, inWater, nearestRoad, roadColumn, damageTile } from './ground.js';

// Streams real buildings, roads and water for wherever the camera is, from OpenFreeMap's free
// planet tiles (OpenStreetMap data, OpenMapTiles schema) — the same source WatchTower,
// recon-app and crimtracker use. Works for any city on Earth; no API key.
const TILEJSON = 'https://tiles.openfreemap.org/planet';
const Z = 14;
const N = 2 ** Z;
const SHOW_BELOW = 0.03; // camera distance in Earth radii (~190 km)
const MAX_TILES = 130;
const CACHE = 260;
const INFLIGHT = 14;
const WORKERS = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 2));
const R_M = EARTH_KM * 1000;
const KM_PER_DEG_MIN = 111.0; // just under the true 111.19, for a conservative latitude pre-check
// Tiles are culled against the view frustum with a sphere around their geometry, padded so a
// street-light sprite or road line straddling the screen edge is never cut early.
const CULL_PAD_M = 250;

const tileX = (lon) => Math.floor(((lon + 180) / 360) * N);
const tileY = (lat) => { const r = lat * DEG; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N); };
const wrapX = (x) => ((x % N) + N) % N;
const keyOf = (x, y) => y * N + x; // numeric tile key (x already wrapped)
const tileCenter = (x, y) => ({ lat: Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / N))) / DEG, lon: ((x + 0.5) / N) * 360 - 180 });

// probe() answers are immutable, so they are shared instead of allocated per call.
const PROBE = [
  Object.freeze({ loaded: true, building: false, water: false }), Object.freeze({ loaded: true, building: true, water: false }),
  Object.freeze({ loaded: true, building: false, water: true }), Object.freeze({ loaded: true, building: true, water: true }),
];
const NOT_LOADED = Object.freeze({ loaded: false, building: false, water: false });

export class OsmCity {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.tiles = new Map();
    this.queue = [];
    this.wanted = new Set();
    this.inflight = 0;
    this.ready = false;
    this.failed = false;
    this.stats = { loaded: 0, buildings: 0 };
    this.version = 0; // bumps whenever ground data changes, so dependants can re-snap
    this.damageLog = []; // { lat, lon, r } — re-applied to tiles that load later
    this.onRubble = () => {};
    this._view = [NaN, NaN, NaN, NaN, NaN]; // camera state the wanted set was computed for
    this._lastKey = -1; this._lastTile = null; // one-entry cache for ground queries

    this.buildMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.roadMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
    this.waterMat = new THREE.MeshBasicMaterial({ color: 0x030405, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.lightUniforms = { uScale: { value: 0.01 }, uOpacity: { value: 1 } };
    this.lightMat = new THREE.ShaderMaterial({ uniforms: this.lightUniforms, vertexShader: pointsVert, fragmentShader: pointsFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    this.workers = Array.from({ length: WORKERS }, () => {
      const w = new Worker(new URL('./tileWorker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._receive(e.data);
      return w;
    });
    this.nextWorker = 0;

    fetch(TILEJSON)
      .then((r) => r.json())
      .then((j) => { this.template = j.tiles[0]; this.ready = true; })
      .catch(() => { this.failed = true; });
  }

  get active() { return this.group.visible && this.ready; }

  update(cam, viewportH) {
    const show = this.ready && cam.dist < SHOW_BELOW;
    this.group.visible = show;
    if (!show) { this._view[0] = NaN; return; }
    this.lightUniforms.uScale.value = viewportH * 0.0000032;

    // The wanted tile set only depends on the camera; while it holds still, just keep the
    // request pipeline fed.
    const v = this._view, tilt = cam.tilt;
    if (v[0] !== cam.lat || v[1] !== cam.lon || v[2] !== cam.dist || v[3] !== cam.heading || v[4] !== tilt) {
      v[0] = cam.lat; v[1] = cam.lon; v[2] = cam.dist; v[3] = cam.heading; v[4] = tilt;
      this._plan(cam, tilt);
    }
    while (this.inflight < INFLIGHT && this.queue.length) this._request(this.queue.shift());
  }

  _plan(cam, tilt) {
    // Look ahead of the target when the camera is tilted toward the horizon.
    const km = cam.dist * EARTH_KM;
    const ahead = Math.tan(tilt) * km * 0.25;
    const focus = ahead > 0.5 ? destination({ lat: cam.lat, lon: cam.lon }, cam.heading, ahead) : { lat: cam.lat, lon: cam.lon };
    const radius = Math.min(16, Math.max(2.5, km * 1.3 + ahead));

    const latSpan = radius / 111.2, lonSpan = radius / (111.2 * Math.max(0.1, Math.cos(focus.lat * DEG)));
    const x0 = tileX(focus.lon - lonSpan), x1 = tileX(focus.lon + lonSpan);
    const y0 = tileY(Math.min(85, focus.lat + latSpan)), y1 = tileY(Math.max(-85, focus.lat - latSpan));
    const want = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const xx = wrapX(tx);
        const d = haversine(focus, tileCenter(xx, ty));
        if (d < radius + 1.5) want.push({ key: keyOf(xx, ty), x: xx, y: ty, d });
      }
    }
    want.sort((a, b) => a.d - b.d);
    want.length = Math.min(want.length, MAX_TILES);

    const wanted = (this.wanted = new Set());
    const now = performance.now();
    // Nearest first: want is already sorted by current distance. A tile that was queued, dropped
    // and wanted again goes back in the queue.
    const queue = [];
    for (const w of want) {
      wanted.add(w.key);
      let t = this.tiles.get(w.key);
      if (!t) this.tiles.set(w.key, (t = { state: 'queued', ...w, used: now }));
      else { t.used = now; t.d = w.d; }
      if (t.state === 'queued') queue.push(w.key);
    }
    this.queue = queue;
    for (const t of this.tiles.values()) if (t.obj) t.obj.visible = wanted.has(t.key);
    this._evict(wanted);
  }

  _request(key) {
    const t = this.tiles.get(key);
    if (!t || t.state !== 'queued') return;
    t.state = 'loading';
    this.inflight++;
    const url = this.template.replace('{z}', Z).replace('{x}', t.x).replace('{y}', t.y);
    this.workers[this.nextWorker++ % this.workers.length].postMessage({ id: key, url, z: Z, x: t.x, y: t.y });
  }

  _receive(d) {
    this.inflight--;
    const t = this.tiles.get(d.id);
    if (!t) return;
    if (d.error || d.empty) { t.state = 'empty'; return; }
    t.state = 'ready';

    // Local ENU metres → globe units, anchored at the tile centre.
    const c = ll2v(d.cLat, d.cLon);
    const up = c.clone().normalize();
    const east = new THREE.Vector3(Math.cos(d.cLon * DEG), 0, -Math.sin(d.cLon * DEG));
    const north = new THREE.Vector3().crossVectors(up, east);
    const m = new THREE.Matrix4().makeBasis(east, north, up).scale(new THREE.Vector3(1 / R_M, 1 / R_M, 1 / R_M)).setPosition(c);

    const obj = new THREE.Group();
    obj.matrixAutoUpdate = false;
    obj.matrix.copy(m);
    obj.visible = this.wanted.has(t.key);
    // One sphere (in tile metres) encloses every layer of the tile; damage only lowers roofs.
    let sphere = null;
    if (d.bounds) {
      const [bx0, by0, bz0, bx1, by1, bz1] = d.bounds;
      const centre = new THREE.Vector3((bx0 + bx1) / 2, (by0 + by1) / 2, (bz0 + bz1) / 2);
      sphere = new THREE.Sphere(centre, Math.hypot(bx1 - bx0, by1 - by0, bz1 - bz0) / 2 + CULL_PAD_M);
    }
    const geos = [];
    const geo = () => { const g = new THREE.BufferGeometry(); if (sphere) g.boundingSphere = sphere.clone(); geos.push(g); return g; };
    const add = (o) => { o.frustumCulled = !!sphere; o.matrixAutoUpdate = false; obj.add(o); };
    if (d.wPos.length) {
      const g = geo();
      g.setAttribute('position', new THREE.BufferAttribute(d.wPos, 3));
      add(new THREE.Mesh(g, this.waterMat));
    }
    if (d.bPos.length) {
      const g = geo();
      g.setAttribute('position', new THREE.BufferAttribute(d.bPos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(d.bCol, 4, true)); // normalised Uint16 RGBA, alpha 1
      add(new THREE.Mesh(g, this.buildMat));
      t.bAttr = g.attributes.position;
      t.cAttr = g.attributes.color;
    }
    if (d.rPos.length) {
      const g = geo();
      g.setAttribute('position', new THREE.BufferAttribute(d.rPos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(d.rCol, 3));
      add(new THREE.LineSegments(g, this.roadMat));
    }
    if (d.lPos.length) {
      const g = geo();
      g.setAttribute('position', new THREE.BufferAttribute(d.lPos, 3));
      g.setAttribute('aB', new THREE.BufferAttribute(d.lBri, 1));
      g.setAttribute('aW', new THREE.BufferAttribute(d.lWarm, 1));
      add(new THREE.Points(g, this.lightMat));
    }
    t.obj = obj;
    t.geos = geos;
    t.buildings = d.buildings;
    Object.assign(t, { cLat: d.cLat, cLon: d.cLon, rPos: d.rPos, rRank: d.rRank, rLine: d.rLine, fRing: d.fRing, fInfo: d.fInfo, wPos: d.wPos });
    t.ix = indexTile(d);
    const lim0 = 2.5;
    for (const dm of this.damageLog) {
      const lim = lim0 + dm.r / 1000;
      if (Math.abs(dm.lat - d.cLat) * KM_PER_DEG_MIN >= lim) continue; // cannot pass the haversine test
      if (haversine(dm, { lat: d.cLat, lon: d.cLon }) < lim) this._damageTile(t, dm, false);
    }
    // Not uploaded yet, so the first upload sends the whole (already damaged) buffer anyway.
    if (t.bAttr) { t.bAttr.clearUpdateRanges(); t.cAttr.clearUpdateRanges(); }
    this.version++;
    this.group.add(obj);
    this.stats.loaded++;
    this.stats.buildings += d.buildings;
  }

  _evict(wanted) {
    if (this.tiles.size <= CACHE) return;
    const old = [];
    for (const t of this.tiles.values()) if (!wanted.has(t.key) && t.state !== 'loading') old.push(t);
    old.sort((a, b) => a.used - b.used);
    for (let i = 0, n = Math.min(old.length, this.tiles.size - CACHE); i < n; i++) {
      const t = old[i];
      if (t.obj) { this.group.remove(t.obj); t.geos.forEach((g) => g.dispose()); this.stats.buildings -= t.buildings; }
      this.tiles.delete(t.key);
    }
    this._lastKey = -1; this._lastTile = null;
  }

  // ---------------------------------------------------------------- ground queries
  _tileAt(lat, lon) {
    const key = keyOf(wrapX(tileX(lon)), tileY(lat));
    let t = this._lastKey === key ? this._lastTile : null;
    if (!t) { t = this.tiles.get(key); if (t) { this._lastKey = key; this._lastTile = t; } }
    return t?.ix ? t : null;
  }

  // What occupies this point on the ground: { loaded, building, water }.
  probe(lat, lon) {
    const t = this._tileAt(lat, lon);
    if (!t) return NOT_LOADED;
    const x = (lon - t.cLon) * t.ix.kx, y = (lat - t.cLat) * t.ix.ky;
    return PROBE[(buildingAt(t, x, y, 3) >= 0 ? 1 : 0) + (inWater(t, x, y) ? 2 : 0)];
  }

  // Nearest drivable road point within maxM metres: { lat, lon, yaw, dist } or null.
  road(lat, lon, maxM) {
    const t = this._tileAt(lat, lon);
    if (!t) return null;
    const r = nearestRoad(t, (lon - t.cLon) * t.ix.kx, (lat - t.cLat) * t.ix.ky, maxM);
    if (!r) return null;
    const o = r.seg * 6;
    const yaw = Math.atan2(t.rPos[o + 3] - t.rPos[o], t.rPos[o + 4] - t.rPos[o + 1]) / DEG;
    return { lat: t.cLat + r.y / t.ix.ky, lon: t.cLon + r.x / t.ix.kx, yaw, dist: r.dist };
  }

  // A road column of n vehicles, `gap` metres apart, trailing behind a head facing headingDeg.
  // Walks tile to tile: when the street runs off one tile, the column picks it up on the next.
  column(lat, lon, headingDeg, n, gap) {
    const out = [];
    let cur = { lat, lon }, hdg = headingDeg;
    for (let hop = 0; hop < 16 && out.length < n; hop++) {
      const t = this._tileAt(cur.lat, cur.lon);
      if (!t) break;
      const start = nearestRoad(t, (cur.lon - t.cLon) * t.ix.kx, (cur.lat - t.cLat) * t.ix.ky, hop ? 90 : 600);
      if (!start) break;
      const pts = roadColumn(t, start, hdg, n - out.length, gap);
      if (!pts.length) break;
      for (const p of pts) out.push({ lat: t.cLat + p.y / t.ix.ky, lon: t.cLon + p.x / t.ix.kx, yaw: p.yaw });
      const last = out[out.length - 1];
      cur = destination(last, last.yaw + 180, gap / 1000);
      hdg = last.yaw;
    }
    return out.length ? out : null;
  }

  // Shell or bomb impact: flattens buildings within r metres, now and in tiles loaded later.
  damage(lat, lon, r) {
    const dm = { lat, lon, r };
    this.damageLog.push(dm);
    if (this.damageLog.length > 8000) this.damageLog.shift();
    // Only the tile under the impact and its neighbours can hold affected buildings.
    const tx = tileX(lon), ty = tileY(lat);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = this.tiles.get(keyOf(wrapX(tx + dx), ty + dy));
      if (t?.ix) this._damageTile(t, dm, true);
    }
  }

  _damageTile(t, dm, live) {
    const rubble = damageTile(t, (dm.lon - t.cLon) * t.ix.kx, (dm.lat - t.cLat) * t.ix.ky, dm.r);
    if (rubble.length) {
      this.version++;
      if (live) this.onRubble(rubble.map((b) => ({ ...toLL(t, b.x, b.y), h: b.h })));
    }
  }

  // Buildings currently drawn, for the HUD.
  visibleBuildings() {
    let n = 0;
    for (const t of this.tiles.values()) if (t.obj?.visible) n += t.buildings;
    return n;
  }
}
