import * as THREE from 'three';
import { EARTH_KM, DEG, rng, hashString } from '../util/geo.js';
import { cityFrame } from './civilians.js';

// Civilian street traffic: cars, vans and buses driving the loaded OSM streets (or a procedural
// city's grid) at true scale, kept to the right of each road's centreline.
const SHOW_BELOW = 0.0005; // about 3 km from the ground
const MAX_CARS = 2500;
const FADE_M = 6; // vehicles grow in and shrink out over this distance at a street's ends
const GRID_PERIOD = 240; // procedural streets repeat their traffic pattern every this many metres
// Real traffic is overwhelmingly white, silver, grey and black, which also suits the grey city.
const PAINT = [0.9, 0.82, 0.72, 0.6, 0.48, 0.36, 0.24, 0.14];
const GLASS = 0.3, TYRE = 0.12;

// Side profiles (x forward, z up) extruded across the vehicle's width, plus wheels. Vertex
// colours carry the part shade; the instance colour is the paint.
const KINDS = {
  sedan: { width: 1.8, glassWidth: 1.6, wheelR: 0.32, wheelX: [1.35, -1.35],
    body: [[-2.25, 0.22], [2.25, 0.22], [2.28, 0.62], [2.05, 0.8], [0.85, 0.88], [-1.85, 0.9], [-2.25, 0.82]],
    glass: [[-1.9, 0.86], [0.9, 0.86], [0.28, 1.38], [-1.0, 1.4]] },
  van: { width: 1.95, glassWidth: 1.99, wheelR: 0.36, wheelX: [1.6, -1.55],
    body: [[-2.45, 0.28], [2.45, 0.28], [2.45, 0.95], [1.6, 1.05], [1.1, 1.92], [-2.45, 1.96]],
    glass: [[-2.2, 1.28], [1.63, 1.08], [1.2, 1.8], [-2.2, 1.8]] },
  bus: { width: 2.5, glassWidth: 2.54, wheelR: 0.5, wheelX: [3.9, -3.6],
    body: [[-5.9, 0.35], [5.9, 0.35], [5.95, 3.0], [-5.9, 3.0]],
    glass: [[-5.6, 1.55], [5.98, 1.1], [5.98, 2.65], [-5.6, 2.65]] },
};
const KIND_NAMES = Object.keys(KINDS);

function vehicleGeometry(k) {
  const positions = [], colors = [];
  const add = (geometry, shade) => {
    const p = geometry.toNonIndexed().attributes.position.array;
    for (let i = 0; i < p.length; i++) { positions.push(p[i]); colors.push(shade); }
  };
  const profile = (pts, width, shade) => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))),
      { depth: width, bevelEnabled: false });
    g.rotateX(Math.PI / 2).translate(0, width / 2, 0); // shape y -> up, extrusion -> across
    add(g, shade);
  };
  profile(k.body, k.width, 1);
  profile(k.glass, k.glassWidth, GLASS);
  for (const x of k.wheelX) for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(k.wheelR, k.wheelR, 0.24, 8).translate(x, side * (k.width / 2 - 0.1), k.wheelR), TYRE);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// Streets as polylines (consecutive segments of one OSM line), each with its lanes of traffic.
// Built once per tile. Lanes keep one speed so vehicles in them never pass through each other.
export function streetLanes(tile) {
  const road = tile.rPos, rank = tile.rRank, line = tile.rLine;
  const streets = [];
  const random = rng(tile.key ^ 0x5bd1e995);
  for (let i = 0; i < rank.length;) {
    const r = rank[i], pts = [road[i * 6], road[i * 6 + 1]];
    let j = i;
    for (;;) {
      pts.push(road[j * 6 + 3], road[j * 6 + 4]);
      const k = j + 1;
      if (k >= rank.length || line?.[k] !== line?.[j] || road[k * 6] !== road[j * 6 + 3] || road[k * 6 + 1] !== road[j * 6 + 4]) break;
      j = k;
    }
    i = j + 1;
    if (r < 4) continue; // rail, transit, footpaths
    const street = polyline(tile, pts, true);
    if (street.len < 25) continue;
    const lanes = r >= 10 ? [[1, 2], [1, 5.5]] : r >= 7 ? [[1, 3.5], [-1, 3.5]] : [[1, 1.8], [-1, 1.8]];
    const gap = r >= 9 ? 26 : r >= 7 ? 36 : 55;
    const speed = r >= 10 ? 24 : r >= 7 ? 13 : 8;
    for (const [dir, off] of lanes) {
      const laneSpeed = speed * (0.85 + random() * 0.3);
      const count = Math.floor((street.len / gap) * (0.4 + random() * 0.9));
      for (let c = 0; c < count; c++) {
        street.cars.push({ dir, off, speed: laneSpeed, s0: ((c + random() * 0.6) * street.len) / count,
          kind: pickKind(r, random), paint: PAINT[Math.floor(random() * PAINT.length)] });
      }
    }
    if (street.cars.length) streets.push(street);
  }
  return streets;
}

function pickKind(rank, random) {
  const x = random();
  return rank >= 7 && x < 0.08 ? 2 : x < 0.25 ? 1 : 0;
}

function polyline(tile, pts, fade) {
  const n = pts.length / 2, cum = new Float32Array(n);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let k = 0; k < n; k++) {
    if (k) cum[k] = cum[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]);
    minX = Math.min(minX, pts[k * 2]); maxX = Math.max(maxX, pts[k * 2]);
    minY = Math.min(minY, pts[k * 2 + 1]); maxY = Math.max(maxY, pts[k * 2 + 1]);
  }
  return { tile, pts: Float32Array.from(pts), cum, len: cum[n - 1], fade, cars: [],
    mx: (minX + maxX) / 2, my: (minY + maxY) / 2, rad: Math.hypot(maxX - minX, maxY - minY) / 2 };
}

export class StreetTraffic {
  constructor(scene, osm, cityLayer = null) {
    this.osm = osm;
    this.cityLayer = cityLayer;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
    this.meshes = KIND_NAMES.map((name) => {
      const mesh = new THREE.InstancedMesh(vehicleGeometry(KINDS[name]), material, MAX_CARS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARS * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      return mesh;
    });
    this.streets = [];
    this.lastPick = -Infinity;
    this.lastDraw = -Infinity;
    this.lastVersion = -1;
    this.pickLat = NaN;
    this.pickLon = NaN;
    this.dummy = new THREE.Object3D();
    this.matrix = new THREE.Matrix4();
    this.color = new THREE.Color();
  }

  get count() { return this.meshes.reduce((n, m) => n + m.count, 0); }

  // Procedural cities: traffic on the street grid around the camera. Every chunk of a grid line
  // carries the same pattern, so vehicles leaving one chunk are met by the next chunk's.
  _grid(cam, out, radius) {
    const layer = this.cityLayer;
    if (!layer?.group.visible) return;
    const city = layer.nearest(cam.lat, cam.lon, 35);
    const grid = city && layer.built.get(city.name)?.pedestrianGrid;
    if (!grid) return;
    const cosLat = Math.cos(city.lat * DEG);
    const cx = (cam.lon - city.lon) * 111195 * cosLat, cy = (cam.lat - city.lat) * 111195;
    if (Math.hypot(cx, cy) > grid.radiusM) return;
    const a = grid.angle, ca = Math.cos(a), sa = Math.sin(a);
    const cu = cx * ca + cy * sa, cv = -cx * sa + cy * ca;
    const tile = cityFrame(city), seed = hashString(city.name), sp = grid.spacingM;
    const toXY = (u, v) => [u * ca - v * sa, u * sa + v * ca];
    for (const across of [false, true]) {
      // Lines run along u at v = k * spacing (or along v at u = k * spacing, swapped).
      const [ca0, cb0] = across ? [cv, cu] : [cu, cv];
      for (let k = Math.floor((cb0 - radius) / sp); k <= Math.ceil((cb0 + radius) / sp); k++) {
        const random = rng(seed ^ Math.imul(k, across ? 2654435761 : 73856093));
        const pattern = [];
        for (const dir of [1, -1]) {
          const speed = 8 + random() * 4, count = 2 + Math.floor(random() * 4);
          for (let c = 0; c < count; c++) pattern.push({ dir, off: 2.5, speed,
            s0: ((c + random() * 0.6) * GRID_PERIOD) / count, kind: pickKind(7, random),
            paint: PAINT[Math.floor(random() * PAINT.length)] });
        }
        for (let m = Math.floor((ca0 - radius) / GRID_PERIOD); m <= Math.ceil((ca0 + radius) / GRID_PERIOD); m++) {
          const s0 = m * GRID_PERIOD, s1 = s0 + GRID_PERIOD, line = k * sp;
          const [x0, y0] = across ? toXY(line, s0) : toXY(s0, line);
          const [x1, y1] = across ? toXY(line, s1) : toXY(s1, line);
          if (Math.hypot((x0 + x1) / 2, (y0 + y1) / 2) > grid.radiusM) continue;
          const street = polyline(tile, [x0, y0, x1, y1], false);
          street.cars = pattern;
          const d = Math.hypot(street.mx - cx, street.my - cy) - street.rad;
          if (d < radius) out.push({ street, d });
        }
      }
    }
  }

  _pick(cam, now) {
    if (now - this.lastPick < 0.25 && this.lastVersion === this.osm.version &&
        Math.abs(cam.lat - this.pickLat) < 0.00005 && Math.abs(cam.lon - this.pickLon) < 0.00005) return;
    this.lastPick = now;
    this.lastVersion = this.osm.version;
    this.pickLat = cam.lat;
    this.pickLon = cam.lon;
    const radius = Math.min(2.5, 0.6 + cam.dist * EARTH_KM * 0.8) * 1000;
    const cos = Math.max(0.1, Math.cos(cam.lat * DEG));
    const found = [];
    for (const tile of this.osm.tiles.values()) {
      if (!tile.obj?.visible || !tile.ix) continue;
      const tileN = (tile.cLat - cam.lat) * 111195, tileE = (tile.cLon - cam.lon) * 111195 * cos;
      if (Math.hypot(tileN, tileE) > radius + 2000) continue;
      tile.streetLanes ??= streetLanes(tile);
      for (const street of tile.streetLanes) {
        const d = Math.hypot(tileN + street.my, tileE + street.mx) - street.rad;
        if (d < radius) found.push({ street, d });
      }
    }
    if (found.length < 20) this._grid(cam, found, radius);
    found.sort((a, b) => a.d - b.d);
    this.streets = [];
    let cars = 0;
    for (const { street } of found) {
      if (cars + street.cars.length > MAX_CARS) break;
      this.streets.push(street);
      cars += street.cars.length;
    }
  }

  update(cam, now) {
    const show = cam.dist < SHOW_BELOW && (this.osm.active || this.cityLayer?.group.visible);
    this.group.visible = show;
    if (!show || now - this.lastDraw < 1 / 30) return;
    this.lastDraw = now;
    this._pick(cam, now);
    const dummy = this.dummy, counts = [0, 0, 0];
    for (const st of this.streets) {
      const { pts, cum, len } = st;
      for (const c of st.cars) {
        const s = (((c.s0 + c.speed * now) % len) + len) % len; // distance travelled along the lane
        const fade = st.fade ? Math.min(1, s / FADE_M, (len - s) / FADE_M) : 1;
        if (fade < 0.05) continue;
        const along = c.dir > 0 ? s : len - s;
        let lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= along) lo = mid; else hi = mid; }
        const ax = pts[lo * 2], ay = pts[lo * 2 + 1];
        const seg = cum[hi] - cum[lo] || 1;
        const ux = (pts[hi * 2] - ax) / seg, uy = (pts[hi * 2 + 1] - ay) / seg;
        const hx = ux * c.dir, hy = uy * c.dir; // heading of travel
        const t = along - cum[lo];
        dummy.position.set(ax + ux * t + hy * c.off, ay + uy * t - hx * c.off, 0.05);
        dummy.rotation.set(0, 0, Math.atan2(hy, hx));
        dummy.scale.setScalar(fade);
        dummy.updateMatrix();
        this.matrix.multiplyMatrices(st.tile.obj.matrix, dummy.matrix);
        const mesh = this.meshes[c.kind], i = counts[c.kind]++;
        mesh.setMatrixAt(i, this.matrix);
        mesh.setColorAt(i, this.color.setRGB(c.paint, c.paint, c.paint));
      }
    }
    this.meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = counts[k] > 0;
      mesh.instanceColor.needsUpdate = counts[k] > 0;
    });
  }
}
