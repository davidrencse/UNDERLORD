import * as THREE from 'three';
import { buildModels, buildProxies, MODEL_KINDS, doctrine } from './unitModels.js';
import { TYPES } from '../game/units.js';
import { DIV_FRONT, COLUMN_GAP } from '../game/orbat.js';
import { ll2v, haversine, bearing, interpolate, rng, DEG, EARTH_KM } from '../util/geo.js';

const R_M = EARTH_KM * 1000;
const M_PER_DEG = 111195;

// Models are drawn a little larger than life so a tank still reads at city altitude:
// an Abrams becomes ~30 m long, a division covers a few kilometres, a corps about one city.
export const GROUND_EXAG = 3;
const EXAG = { soldier: 5, destroyer: 1.6, carrier: 1.6, submarine: 1.6 };
const SHOW_BELOW = 0.013; // camera distance in Earth radii (~80 km)
// Instance capacity per model. Ships and aircraft are bounded by their layouts (at most 40
// formations: 14 escorts, 3 submarines, 1 carrier, 96 + 3 jets each); rotors are only ever
// drawn as animated full models, so their stand-in mesh never holds anything.
const CAP = { soldier: 26000, truck: 14000, jet: 4096, destroyer: 640, submarine: 128, carrier: 64, default: 9000 };
const PROXY_CAP = { rotor: 1 };
const LOD_KM = [14, 40]; // camera-to-formation distance thresholds
const LOD_STEP = [1, 3, 9]; // draw every Nth vehicle at each level of detail
const MAX_STACKS = 40;
const REBUILD_BUDGET = 3;
const COLUMN_MAX = 520;
const FULL_M = 1800; // full-detail models inside this camera range, stand-ins beyond
const SOLDIER_M = 2600; // individual soldiers are invisible further out than this
const CULL_M = 70000;

const TINT = {
  own: new THREE.Color(1.0, 0.76, 0.42),
  enemy: new THREE.Color(1.0, 0.46, 0.4),
  ally: new THREE.Color(0.95, 0.96, 0.98),
  neutral: new THREE.Color(0.72, 0.74, 0.77),
};
const TINTS = [TINT.own, TINT.enemy, TINT.ally, TINT.neutral];

const KIND_INDEX = Object.fromEntries(MODEL_KINDS.map((k, i) => [k, i]));
const K_SOLDIER = KIND_INDEX.soldier, K_TRUCK = KIND_INDEX.truck, K_JET = KIND_INDEX.jet, K_HELI = KIND_INDEX.heli, K_ROTOR = KIND_INDEX.rotor;
const EXAG_K = MODEL_KINDS.map((k) => EXAG[k] ?? GROUND_EXAG);
// Cached instances are culled in runs of CHUNK: a run wholly inside or outside the view and one
// level-of-detail band is copied or skipped in one go; only runs straddling a boundary are
// tested vehicle by vehicle. EPS (≈6 mm) keeps the run tests strictly conservative.
const CHUNK = 32;
const EPS = 1e-9;
// The culled, level-of-detail instance lists are kept while the camera holds still (within
// a metre and a tenth of a degree) and no formation changes; only animated aircraft are redrawn.
const STILL_M = 1;
const STILL_COS = Math.cos(0.1 * DEG);

// --------------------------------------------------------------------------- layouts
// Local metres around the formation centre: x to the right, z forward. `cat` drives level of
// detail and what goes into a road column: combat, arty, log, dis (dismounts), heli, air, sea.
function layout(s, iso3) {
  const r = rng(s.id * 9973 + 7);
  const out = [];
  const push = (kind, x, z, cat, extra) => out.push({ kind, x: x + (r() - 0.5) * 10, z: z + (r() - 0.5) * 10, yaw: (r() - 0.5) * 0.3, cat, ...extra });
  const t = TYPES[s.type];

  if (t.domain === 'land') {
    const k = s.kit;
    const nd = Math.max(1, Math.min(8, s.divs));
    const mbt = `mbt_${doctrine(iso3)}`;
    for (let d = 0; d < nd; d++) {
      const dx = (d - (nd - 1) / 2) * DIV_FRONT;
      const share = (v) => Math.round(v / nd);
      // Three manoeuvre brigades abreast. Each is built from companies of ~14 vehicles in
      // platoons of four, 60 m between vehicles and ~400 m between company positions.
      const combat = [];
      const order = [[mbt, share(k.mbt)], ['ifv', share(k.ifv)], ['apc', share(k.apc)]];
      for (const [kind, n] of order) for (let i = 0; i < n; i++) combat.push(kind);
      const brigades = [[], [], []];
      combat.forEach((kind, i) => brigades[i % 3].push(kind));
      brigades.forEach((list, b) => {
        const bx = dx + (b - 1) * 1450, bz = 1100 + (b === 1 ? 260 : 0);
        list.sort();
        list.forEach((kind, i) => {
          const c = Math.floor(i / 14), j = i % 14, p = Math.floor(j / 4), q = j % 4;
          const cx = bx + ((c % 3) - 1) * 430, cz = bz - Math.floor(c / 3) * 390;
          const x = cx + (q - 1.5) * 62 + (p % 2) * 31, z = cz - p * 115;
          push(kind, x, z, 'combat');
          // Mechanised infantry dismount beside their vehicles.
          if (kind === 'ifv' || kind === 'apc') {
            for (let m = 0; m < 6; m++) {
              const a = -0.9 + (m / 5) * 1.8;
              push('soldier', x + Math.sin(a) * (16 + (m % 2) * 6), z + 14 + Math.cos(a) * 10, 'dis');
            }
          }
        });
      });
      // Light infantry without vehicles: squads of nine in loose files across the front.
      const foot = s.type === 'inf' || s.type === 'airborne' || s.type === 'marine' ? Math.round(share(k.men) / 150) : 0;
      for (let f = 0; f < foot; f++) {
        const bx = dx + ((f % 6) - 2.5) * 640, bz = 1500 - Math.floor(f / 6) * 140;
        for (let m = 0; m < 9; m++) push('soldier', bx + (m % 3 - 1) * 9, bz - Math.floor(m / 3) * 10, 'dis');
      }
      // Artillery batteries of six guns, 50 m apart, about 1.5 km behind the line.
      const guns = share(k.spg), bats = Math.ceil(guns / 6);
      for (let g = 0; g < guns; g++) {
        const bi = Math.floor(g / 6), j = g % 6;
        push('spg', dx + (bi - (bats - 1) / 2) * 520 + (j - 2.5) * 52, -650 + (j % 2) * 22, 'arty');
      }
      for (let g = 0; g < share(k.mlrs); g++) push('mlrs', dx + ((g % 6) - 2.5) * 95, -1450 - Math.floor(g / 6) * 120, 'arty');
      // Brigade support area: trucks parked in blocks of rows.
      const trucks = share(k.truck);
      for (let i = 0; i < trucks; i++) {
        const blk = Math.floor(i / 60), j = i % 60;
        push('truck', dx + ((blk % 5) - 2) * 520 + ((j % 12) - 5.5) * 28, -2300 - Math.floor(blk / 5) * 420 - Math.floor(j / 12) * 34, 'log');
      }
      for (let i = 0; i < share(k.heli); i++) push('heli', dx + ((i % 8) - 3.5) * 70, -1900 - Math.floor(i / 8) * 80, 'heli', { mode: i % 6 === 0 ? 'hover' : null });
    }
  } else if (s.type === 'air') {
    const planes = Math.min(96, s.planes ?? 24);
    for (let i = 0; i < planes; i++) push('jet', ((i % 8) - 3.5) * 68, -Math.floor(i / 8) * 75, 'air');
    for (let i = 0; i < 3; i++) out.push({ kind: 'jet', x: 0, z: 0, cat: 'air', mode: 'orbit', idx: i });
    for (let i = 0; i < 4; i++) push('heli', -700 + i * 90, -300, 'heli', { mode: i === 0 ? 'hover' : null });
  } else if (s.type === 'fleet') {
    const n = Math.min(14, Math.max(2, s.ships ?? 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rad = i % 2 ? 2400 : 1300;
      push('destroyer', Math.sin(a) * rad, Math.cos(a) * rad, 'sea');
    }
  } else if (s.type === 'carrier') {
    out.push({ kind: 'carrier', x: 0, z: 0, yaw: 0, cat: 'sea' });
    for (const [x, z] of [[-3200, 2400], [3200, 2400], [0, 4800], [-3600, -2600], [3400, -3000], [0, -5200]]) push('destroyer', x, z, 'sea');
    for (let i = 0; i < 3; i++) out.push({ kind: 'jet', x: 0, z: 0, cat: 'air', mode: 'orbit', idx: i });
  } else if (s.type === 'sub') {
    const n = Math.min(3, Math.max(1, Math.round((s.ships ?? 3) / 3)));
    for (let i = 0; i < n; i++) push('submarine', (i - (n - 1) / 2) * 1600, -i * 900, 'sea');
  }
  if (t.domain === 'land' && s.divs < 1) {
    const scale = Math.sqrt(s.divs);
    for (const item of out) { item.x *= scale; item.z *= scale; }
  }
  return out;
}

const COLUMN_ORDER = { combat: 0, arty: 1, log: 2 };

// Per-run bounds of a cached instance list: centre (x, y, z) and radius, in globe units.
function chunkBounds(a) {
  const n = a.length >> 4, out = new Float64Array(Math.ceil(n / CHUNK) * 4);
  for (let s = 0, q = 0; s < n; s += CHUNK, q += 4) {
    const e = Math.min(n, s + CHUNK);
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let o = s * 16; o < e * 16; o += 16) {
      const x = a[o + 12], y = a[o + 13], z = a[o + 14];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    let r2 = 0;
    for (let o = s * 16; o < e * 16; o += 16) {
      const dx = a[o + 12] - cx, dy = a[o + 13] - cy, dz = a[o + 14] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) r2 = d2;
    }
    out[q] = cx; out[q + 1] = cy; out[q + 2] = cz; out[q + 3] = Math.sqrt(r2);
  }
  return out;
}

function toLLFrom(p, hdg, backM) {
  const h = hdg * DEG;
  return { lat: p.lat - (Math.cos(h) * backM) / M_PER_DEG, lon: p.lon - (Math.sin(h) * backM) / (M_PER_DEG * Math.cos(p.lat * DEG)) };
}

const byDistance = (a, b) => a.d - b.d;

export class ArmyLayer {
  constructor(scene, game, units, osm) {
    this.game = game;
    this.units = units;
    this.osm = osm;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const geos = buildModels();
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const proxies = buildProxies(geos);
    // Each mesh keeps a shadow of the tint written at every instance, so colours are only
    // rewritten (and re-uploaded) where they actually change.
    const make = (geo, cap) => {
      const m = new THREE.InstancedMesh(geo, this.mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false;
      m.setColorAt(0, TINT.neutral);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return { mesh: m, cap, ma: m.instanceMatrix.array, ca: m.instanceColor.array, tint: new Uint8Array(cap).fill(255), n: 0, nStatic: 0, cLo: 0, cHi: -1 };
    };
    this.meshes = {};
    this.proxies = {};
    this._full = [];
    this._prox = [];
    for (const k of MODEL_KINDS) {
      const f = make(geos[k], CAP[k] ?? CAP.default), p = make(proxies[k], PROXY_CAP[k] ?? CAP[k] ?? CAP.default);
      this._full.push(f);
      this._prox.push(p);
      this.meshes[k] = f.mesh;
      this.proxies[k] = p.mesh;
    }
    this._recs = [...this._full, ...this._prox];
    this.layouts = new Map();
    this.cache = new Map();

    this.flashGeo = new THREE.BufferGeometry();
    this.flashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
    this.flashes = new THREE.Points(this.flashGeo, new THREE.PointsMaterial({ color: 0xffc070, size: 5, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flashes.frustumCulled = false;
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 6), 3));
    this.tracers = new THREE.LineSegments(this.tracerGeo, new THREE.LineBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    this.group.add(this.flashes, this.tracers);

    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._centre = { lat: 0, lon: 0 };
    this._pool = [];
    this._near = [];
    // This frame's formations, and the set the static instance lists were last built from.
    this._rS = []; this._rC = []; this._rT = []; this._rHead = []; this._rHdg = [];
    this._pS = []; this._pC = []; this._pT = []; this._pN = 0;
    this._cam = new Float64Array(7);
    this._valid = false;
    this._battle = new Map();
    this._att = []; this._def = [];
    // Scratch instance buffers for _build, one per model kind, grown on demand.
    this._scr = MODEL_KINDS.map(() => new Float32Array(16 * 256));
    this._cnt = new Int32Array(MODEL_KINDS.length);
    this.visibleStacks = 0;
    this.drawn = 0;
  }

  // Heading the formation faces: its route, else the nearest enemy, else a stable default.
  _heading(s) {
    if (s.path.length) return bearing(s, s.path[0]);
    if (s.battle) return bearing(s, s.battle);
    if (s._face != null && this.game.time - (s._faceAt ?? 0) < 86400000) return s._face;
    const enemies = this.game.enemiesOf(s.owner);
    let best = null, bd = 400;
    if (enemies.size) for (const o of this.units.stacks) {
      if (!enemies.has(o.owner)) continue;
      // A latitude gap alone can rule a formation out before the great-circle distance.
      if (Math.abs(o.lat - s.lat) * 111.19 > bd) continue;
      const d = haversine(s, o);
      if (d < bd) { bd = d; best = o; }
    }
    s._face = best ? bearing(s, best) : (s.id * 47) % 360;
    s._faceAt = this.game.time;
    return s._face;
  }

  // Where the formation's head is drawn: interpolated between simulation hours while moving.
  _head(s) {
    if ((s.state === 'moving' || s.state === 'retreat') && s.prev) {
      const f = this.game.paused ? 1 : Math.min(1, Math.max(0, this.game.hourAcc));
      return interpolate(s.prev, s, f);
    }
    return { lat: s.lat, lon: s.lon };
  }

  // Writes one instance matrix: model x → right, y → up, z → forward at (lat, lon).
  _place(arr, o, lat, lon, yawDeg, scale, y = 0, bank = 0) {
    const c = ll2v(lat, lon, 1 + y / R_M, this._v);
    const ux = c.x, uy = c.y, uz = c.z;
    const ul = Math.hypot(ux, uy, uz);
    const upx = ux / ul, upy = uy / ul, upz = uz / ul;
    const lo = lon * DEG;
    const ex = Math.cos(lo), ez = -Math.sin(lo);
    // north = up × east
    const nx = upy * ez, ny = upz * ex - upx * ez, nz = -upy * ex;
    const h = yawDeg * DEG, ch = Math.cos(h), sh = Math.sin(h);
    let fx = nx * ch + ex * sh, fy = ny * ch, fz = nz * ch + ez * sh;
    let rx = ex * ch - nx * sh, ry = -ny * sh, rz = ez * ch - nz * sh;
    let tx = upx, ty = upy, tz = upz;
    if (bank) {
      const cb = Math.cos(bank), sb = Math.sin(bank);
      const nrx = rx * cb + tx * sb, nry = ry * cb + ty * sb, nrz = rz * cb + tz * sb;
      tx = tx * cb - rx * sb; ty = ty * cb - ry * sb; tz = tz * cb - rz * sb;
      rx = nrx; ry = nry; rz = nrz;
    }
    const k = scale / R_M;
    arr[o] = rx * k; arr[o + 1] = ry * k; arr[o + 2] = rz * k; arr[o + 3] = 0;
    arr[o + 4] = tx * k; arr[o + 5] = ty * k; arr[o + 6] = tz * k; arr[o + 7] = 0;
    arr[o + 8] = fx * k; arr[o + 9] = fy * k; arr[o + 10] = fz * k; arr[o + 11] = 0;
    arr[o + 12] = c.x; arr[o + 13] = c.y; arr[o + 14] = c.z; arr[o + 15] = 1;
  }

  _exag(kind) { return EXAG[kind] ?? GROUND_EXAG; }

  // Builds the static instance matrices for one formation, fitted to the streets around it.
  _build(s, head, heading, lod) {
    const n = this.game.nations[s.owner];
    let slots = this.layouts.get(s.id);
    if (!slots || slots.divs !== s.divs) {
      slots = layout(s, n.iso3);
      slots.divs = s.divs;
      for (const x of slots) x.ki = KIND_INDEX[x.kind];
      slots.dynamic = slots.filter((x) => x.mode === 'orbit' || x.mode === 'hover');
      this.layouts.set(s.id, slots);
    }
    const step = LOD_STEP[lod];
    const alive = Math.max(0.15, s.str);
    const scr = this._scr, cnt = this._cnt;
    cnt.fill(0);
    const order = [];
    const pts = [];
    const add = (ki, lat, lon, yaw, y = 0) => {
      const o = cnt[ki] * 16;
      if (o === 0) order.push(ki);
      let a = scr[ki];
      if (o + 16 > a.length) { const b = new Float32Array(a.length * 2); b.set(a); scr[ki] = a = b; }
      this._place(a, o, lat, lon, yaw, EXAG_K[ki], y);
      cnt[ki]++;
      if (pts.length < 18 && ki !== K_TRUCK && ki !== K_SOLDIER) pts.push({ lat, lon });
    };
    const domain = TYPES[s.type].domain;
    const moving = (s.state === 'moving' || s.state === 'retreat') && domain === 'land';
    const osm = this.osm;
    const cosLat = Math.cos(head.lat * DEG);
    const hr = heading * DEG, ch = Math.cos(hr), sh = Math.sin(hr);
    const keep = (i, cat) => {
      if (cat === 'dis') return lod === 0 && !moving;
      const st = cat === 'log' ? step * 3 : step;
      // Losses thin the ranks: a formation at 60% strength shows 60% of its vehicles.
      return i % st === 0 && ((i * 2654435761) >>> 0) / 4294967296 < alive;
    };

    if (moving) {
      // Road march: vehicles follow the street network in a close column behind the head.
      const list = slots.filter((x, i) => x.cat in COLUMN_ORDER && keep(i, x.cat)).sort((a, b) => COLUMN_ORDER[a.cat] - COLUMN_ORDER[b.cat]).slice(0, COLUMN_MAX);
      const gap = COLUMN_GAP * GROUND_EXAG * 0.5 + 20;
      const col = (osm.active && osm.column(head.lat, head.lon, heading, list.length, gap)) || [];
      const last = col[col.length - 1];
      for (let i = 0; i < list.length; i++) {
        // Where the streamed road network runs out, the column carries on across country.
        const p = col[i];
        if (p) add(list[i].ki, p.lat, p.lon, p.yaw);
        else {
          const q = toLLFrom(last ?? head, heading, last ? (i - col.length + 1) * gap : i * gap);
          add(list[i].ki, q.lat, q.lon, heading);
        }
      }
    } else {
      const land = domain === 'land' && osm.active;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.mode || !keep(i, slot.cat)) continue;
        const x = slot.x, z = slot.z;
        let lat = head.lat + (-x * sh + z * ch) / M_PER_DEG;
        let lon = head.lon + (x * ch + z * sh) / (M_PER_DEG * cosLat);
        let yaw = heading + slot.yaw / DEG;
        if (land) {
          // Ground vehicles never sit inside a building or a river: they move to the nearest
          // street, and in built-up blocks they park along the kerb.
          const pr = osm.probe(lat, lon);
          if (pr.loaded) {
            if (pr.building || pr.water) {
              if (slot.ki === K_SOLDIER) continue;
              const rd = osm.road(lat, lon, 260);
              if (!rd) continue;
              lat = rd.lat; lon = rd.lon;
              yaw = Math.abs(((rd.yaw - heading + 540) % 360) - 180) < 90 ? rd.yaw : rd.yaw + 180;
            } else if (slot.ki !== K_SOLDIER && slot.cat !== 'heli') {
              const rd = osm.road(lat, lon, 45);
              if (rd) { lat = rd.lat; lon = rd.lon; yaw = Math.abs(((rd.yaw - heading + 540) % 360) - 180) < 90 ? rd.yaw : rd.yaw + 180; }
            }
          }
        }
        add(slot.ki, lat, lon, yaw, slot.kind === 'submarine' ? -2 : 0);
      }
    }
    const mats = {}, arrs = [], bnds = [];
    for (const ki of order) {
      const a = scr[ki].slice(0, cnt[ki] * 16);
      mats[MODEL_KINDS[ki]] = a;
      arrs.push(a);
      bnds.push(chunkBounds(a));
    }
    // Muzzle-flash anchors, slightly above the ground.
    const ptsV = pts.map((p) => ll2v(p.lat, p.lon, 1 + 3 / R_M));
    return { mats, kinds: order, arrs, bnds, pts, ptsV, dynamic: slots.dynamic };
  }

  update(cam, time) {
    const show = cam.dist < SHOW_BELOW && this.game.player != null;
    this.group.visible = show;
    if (!show) { this._valid = false; return; }
    const camera = cam.camera;
    const camPos = camera.position;
    const range = cam.dist * EARTH_KM * 3 + 25;
    const centre = this._centre;
    centre.lat = cam.lat; centre.lon = cam.lon;
    const player = this.game.player;
    const enemies = this.game.enemiesOf(player);

    // Nearest formations first. A latitude gap alone already puts most of the world's
    // formations out of range, so the great-circle distance is only taken for the rest.
    const stacks = this.units.stacks, pool = this._pool, near = this._near;
    near.length = 0;
    const latLim = (range / (EARTH_KM * DEG)) * (1 + 1e-9) + 1e-9;
    for (let i = 0; i < stacks.length; i++) {
      const s = stacks[i];
      if (Math.abs(s.lat - centre.lat) > latLim) continue;
      const d = haversine(centre, s);
      if (!(d < range)) continue;
      const e = pool[near.length] ?? (pool[near.length] = { s: null, d: 0 });
      e.s = s; e.d = d;
      near.push(e);
    }
    near.sort(byDistance);
    const nNear = Math.min(near.length, MAX_STACKS);
    this.visibleStacks = nNear;

    // Refresh stale layouts, nearest first, within a per-frame budget.
    let budget = REBUILD_BUDGET;
    const rS = this._rS, rC = this._rC, rT = this._rT, rHead = this._rHead, rHdg = this._rHdg;
    const osmVer = this.osm.version, osmAct = this.osm.active;
    for (let k = 0; k < nNear; k++) {
      const s = near[k].s;
      const head = this._head(s);
      const heading = this._heading(s);
      const dKm = ll2v(head.lat, head.lon, 1, this._v).distanceTo(camPos) * EARTH_KM;
      const lod = dKm < LOD_KM[0] ? 0 : dKm < LOD_KM[1] ? 1 : 2;
      const kLat = Math.round(head.lat * 1e4), kLon = Math.round(head.lon * 1e4), kHdg = Math.round(heading / 3), kStr = Math.round(s.str * 20);
      let c = this.cache.get(s.id);
      const keyChanged = !c || c.kLat !== kLat || c.kLon !== kLon || c.kHdg !== kHdg || c.lod !== lod || c.state !== s.state || c.kStr !== kStr || c.active !== osmAct;
      // Re-fit to the streets when the formation moves, or (at most every 1.5 s) when new
      // tiles or fresh rubble change the ground under it. Moving columns refresh 5× a second.
      const stale = !c || (keyChanged && time - c.at > (s.state === 'moving' ? 0.2 : 0)) || (c.ver !== osmVer && time - c.at > 1.5);
      if (stale && (budget > 0 || !c)) {
        budget--;
        c = this._build(s, head, heading, lod);
        c.kLat = kLat; c.kLon = kLon; c.kHdg = kHdg; c.lod = lod; c.state = s.state; c.kStr = kStr; c.active = osmAct;
        c.ver = osmVer; c.at = time;
        this.cache.set(s.id, c);
      }
      rS[k] = s; rC[k] = c; rHead[k] = head; rHdg[k] = heading;
      rT[k] = s.owner === player ? 0 : enemies.has(s.owner) ? 1 : this.game.allied(s.owner, player) ? 2 : 3;
    }
    if (this.cache.size > 300) for (const id of [...this.cache.keys()].slice(0, this.cache.size - 300)) this.cache.delete(id);

    // Per-vehicle level of detail and view-cone culling, so only what can be seen is drawn
    // and only what is close is drawn in full. The result depends only on the camera and the
    // cached layouts, so it is kept for as long as neither changes.
    const fwd = camera.getWorldDirection(this._fwd);
    const cone = Math.cos(((camera.fov * 0.5 * Math.hypot(1, camera.aspect)) + 8) * DEG);
    const cx = camPos.x, cy = camPos.y, cz = camPos.z;
    const pS = this._pS, pC = this._pC, pT = this._pT, snap = this._cam;
    let same = this._valid && nNear === this._pN;
    if (same) for (let k = 0; k < nNear; k++) if (rS[k] !== pS[k] || rC[k] !== pC[k] || rT[k] !== pT[k]) { same = false; break; }
    if (same) {
      const dx = cx - snap[0], dy = cy - snap[1], dz = cz - snap[2];
      if (dx * dx + dy * dy + dz * dz > (STILL_M / R_M) ** 2 || fwd.x * snap[3] + fwd.y * snap[4] + fwd.z * snap[5] < STILL_COS || cone !== snap[6]) same = false;
    }
    const recs = this._recs, full = this._full;
    if (!same) {
      for (const r of recs) r.n = 0;
      this._static(nNear, cx, cy, cz, fwd, cone);
      for (const r of recs) r.nStatic = r.n;
      snap[0] = cx; snap[1] = cy; snap[2] = cz; snap[3] = fwd.x; snap[4] = fwd.y; snap[5] = fwd.z; snap[6] = cone;
      for (let k = 0; k < nNear; k++) { pS[k] = rS[k]; pC[k] = rC[k]; pT[k] = rT[k]; }
      pS.length = pC.length = pT.length = nNear;
      this._pN = nNear;
      this._valid = true;
    } else {
      for (const r of full) r.n = r.nStatic;
    }

    // Aircraft in the pattern and helicopters on station, animated every frame after the
    // static instances.
    const battle = this._battle;
    battle.clear();
    for (let k = 0; k < nNear; k++) {
      const s = rS[k], c = rC[k];
      for (const d of c.dynamic) this._dynamic(d, s, rHead[k], rHdg[k], time, rT[k]);
      if (s.battle) battle.set(s.id, c.ptsV);
    }
    for (let k = nNear; k < rS.length; k++) rS[k] = rC[k] = rHead[k] = null;

    // Upload only the spans written this frame.
    this.drawn = 0;
    for (const r of recs) {
      const m = r.mesh;
      const count = Math.min(r.n, r.cap);
      m.count = count;
      m.visible = count > 0;
      this.drawn += count;
      const from = same ? Math.min(r.nStatic, r.cap) : 0;
      if (count > from) {
        m.instanceMatrix.addUpdateRange(from * 16, (count - from) * 16);
        m.instanceMatrix.needsUpdate = true;
      }
      if (r.cHi >= r.cLo) {
        m.instanceColor.addUpdateRange(r.cLo * 3, (r.cHi - r.cLo + 1) * 3);
        m.instanceColor.needsUpdate = true;
        r.cLo = 0; r.cHi = -1;
      }
    }
    this._combat(battle, time);
  }

  // Writes tint t over instances [a, b) of one mesh wherever it differs from what is there.
  _tint(r, a, b, t) {
    const sh = r.tint;
    let lo = -1, hi = -1;
    for (let i = a; i < b; i++) {
      if (sh[i] === t) continue;
      sh[i] = t;
      if (lo < 0) lo = i;
      hi = i;
    }
    if (lo < 0) return;
    const ca = r.ca, c = TINTS[t];
    for (let i = lo; i <= hi; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
    if (r.cHi < r.cLo) { r.cLo = lo; r.cHi = hi; } else { if (lo < r.cLo) r.cLo = lo; if (hi > r.cHi) r.cHi = hi; }
  }

  // Copies the cached instances of the nearby formations into the meshes, culled to the view
  // and split between full models and stand-ins.
  _static(nNear, cx, cy, cz, fwd, cone) {
    const fx = fwd.x, fy = fwd.y, fz = fwd.z;
    const full2 = (FULL_M / R_M) ** 2, sold2 = (SOLDIER_M / R_M) ** 2, cull2 = (CULL_M / R_M) ** 2, close = 400 / R_M;
    const fullD = FULL_M / R_M, soldD = SOLDIER_M / R_M, cullD = CULL_M / R_M;
    const thMax = Math.acos(cone);
    const rC = this._rC, rT = this._rT, fullR = this._full, proxR = this._prox;
    for (let k = 0; k < nNear; k++) {
      const c = rC[k], t = rT[k];
      for (let j = 0; j < c.kinds.length; j++) {
        const ki = c.kinds[j], arr = c.arrs[j], b = c.bnds[j];
        const F = fullR[ki], P = proxR[ki];
        const soldier = ki === K_SOLDIER;
        const n = arr.length >> 4;
        for (let s0 = 0, q = 0; s0 < n; s0 += CHUNK, q += 4) {
          const e0 = Math.min(n, s0 + CHUNK);
          const ox = b[q] - cx, oy = b[q + 1] - cy, oz = b[q + 2] - cz, rad = b[q + 3] + EPS;
          const dc = Math.sqrt(ox * ox + oy * oy + oz * oz);
          const dmin = dc - rad, dmax = dc + rad;
          if (dmin > cullD || (soldier && dmin > soldD)) continue;
          let inside = false;
          if (dc > rad) {
            const ang = Math.acos(Math.max(-1, Math.min(1, (ox * fx + oy * fy + oz * fz) / dc)));
            const spread = Math.asin(rad / dc);
            if (ang - spread > thMax + 1e-7 && dmin > close) continue;
            inside = ang + spread < thMax - 1e-7;
          }
          if (inside && dmax < cullD && (!soldier || dmax < soldD) && (dmax < fullD || dmin > fullD)) {
            const r = dmax < fullD ? F : P;
            const i0 = r.n, m = Math.min(e0 - s0, r.cap - i0);
            r.n += e0 - s0;
            if (m > 0) {
              r.ma.set(arr.subarray(s0 * 16, (s0 + m) * 16), i0 * 16);
              this._tint(r, i0, i0 + m, t);
            }
            continue;
          }
          for (let o = s0 * 16, oe = e0 * 16; o < oe; o += 16) {
            const dx = arr[o + 12] - cx, dy = arr[o + 13] - cy, dz = arr[o + 14] - cz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > cull2 || (soldier && d2 > sold2)) continue;
            const d = Math.sqrt(d2);
            if (d > close && (dx * fx + dy * fy + dz * fz) / d < cone) continue;
            const r = d2 < full2 ? F : P;
            const i = r.n++;
            if (i >= r.cap) continue;
            const ma = r.ma, w = i * 16;
            for (let e = 0; e < 16; e++) ma[w + e] = arr[o + e];
            if (r.tint[i] !== t) this._tint(r, i, i + 1, t);
          }
        }
      }
    }
  }

  _put(ki, lat, lon, yaw, y, bank, t) {
    const r = this._full[ki];
    const i = r.n;
    if (i >= r.cap) return;
    this._place(r.ma, i * 16, lat, lon, yaw, EXAG_K[ki], y, bank);
    if (r.tint[i] !== t) this._tint(r, i, i + 1, t);
    r.n = i + 1;
  }

  _dynamic(d, s, head, heading, time, t) {
    const cosLat = Math.cos(head.lat * DEG);
    const h = heading * DEG, sh = Math.sin(h), ch = Math.cos(h);
    if (d.mode === 'orbit') {
      // Combat air patrol: a racetrack a few kilometres out at 3-4 km altitude.
      const rad = 3500 + d.idx * 900, a = time * 0.12 + d.idx * 2.1 + s.id;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      this._put(K_JET, head.lat + (-x * sh + z * ch) / M_PER_DEG, head.lon + (x * ch + z * sh) / (M_PER_DEG * cosLat), heading - a / DEG, 3200 + d.idx * 400, 0.5, t);
    } else if (d.mode === 'hover') {
      const life = (s.id * 31 + d.x) % 100;
      const x = d.x, z = d.z;
      const lat = head.lat + (-x * sh + z * ch) / M_PER_DEG, lon = head.lon + (x * ch + z * sh) / (M_PER_DEG * cosLat);
      const y = 60 + Math.sin(time * 1.3 + life) * 6;
      this._put(K_HELI, lat, lon, heading, y, 0, t);
      this._put(K_ROTOR, lat, lon, heading + ((time * 900 + life * 10) % 360), y, 0, t);
    }
  }

  _combat(battlePts, time) {
    const fpA = this.flashGeo.attributes.position, tpA = this.tracerGeo.attributes.position;
    const fp = fpA.array, tp = tpA.array;
    let nf = 0, nt = 0;
    const r = rng(Math.floor(time * 12));
    const att = this._att, def = this._def;
    for (const b of this.units.battles) {
      att.length = 0; def.length = 0;
      for (const s of b.att) { const p = battlePts.get(s.id); if (p) for (let i = 0; i < p.length; i++) att.push(p[i]); }
      for (const s of b.def) { const p = battlePts.get(s.id); if (p) for (let i = 0; i < p.length; i++) def.push(p[i]); }
      for (let side = 0; side < 2; side++) {
        const from = side ? def : att, to = side ? att : def;
        if (!from.length) continue;
        for (let i = 0; i < Math.min(14, from.length); i++) {
          if (r() > 0.45) continue;
          const a = from[Math.floor(r() * from.length)];
          if (nf < 600) { const o = nf * 3; fp[o] = a.x; fp[o + 1] = a.y; fp[o + 2] = a.z; nf++; }
          if (to.length && nt < 400 && r() < 0.6) {
            // A short streak travelling along the line of fire, like a shell or tracer round.
            const t = to[Math.floor(r() * to.length)];
            const f = (time * 0.9 + r()) % 1, g = Math.min(1, f + 0.04);
            const o = nt * 6;
            tp[o] = a.x + (t.x - a.x) * f; tp[o + 1] = a.y + (t.y - a.y) * f; tp[o + 2] = a.z + (t.z - a.z) * f;
            tp[o + 3] = a.x + (t.x - a.x) * g; tp[o + 4] = a.y + (t.y - a.y) * g; tp[o + 5] = a.z + (t.z - a.z) * g;
            nt++;
          }
        }
      }
    }
    att.length = 0; def.length = 0;
    this.flashGeo.setDrawRange(0, nf);
    if (nf) { fpA.addUpdateRange(0, nf * 3); fpA.needsUpdate = true; }
    this.tracerGeo.setDrawRange(0, nt * 2);
    if (nt) { tpA.addUpdateRange(0, nt * 6); tpA.needsUpdate = true; }
  }
}
