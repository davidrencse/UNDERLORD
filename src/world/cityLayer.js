import * as THREE from 'three';
import { CITIES } from '../data/places.js';
import { ll2v, rng, hashString, haversine, DEG, EARTH_KM } from '../util/geo.js';
import { rasterize, pixelOf } from './geo.js';

export const pointsVert = /* glsl */ `
attribute float aB; attribute float aW;
uniform float uScale; uniform float uOpacity;
varying float vB; varying float vW;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uScale / -mv.z, 1.0, 3.4) * (0.65 + aB * 0.7);
  vB = aB; vW = aW;
}`;
export const pointsFrag = /* glsl */ `
uniform float uOpacity;
varying float vB; varying float vW;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(c));
  vec3 col = mix(vec3(0.9, 0.94, 1.0), vec3(1.0, 0.7, 0.36), vW);
  gl_FragColor = vec4(col * (0.55 + vB * 0.9), a * uOpacity * (0.45 + vB * 0.55));
}`;

function valueNoise(seed) {
  const h = (x, y) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

const EVENT_TYPES = [
  ['Artillery strike', 'Industrial district'], ['Drone intercept', 'Air-defence sector'], ['Supply depot hit', 'Rail yard'],
  ['Power grid down', 'Substation'], ['Missile strike', 'City centre'], ['Evacuation route', 'Bridge crossing'], ['Command post', 'Underground'],
];
const NODES = [['Mobile data', 'Uplink 8.33.909'], ['Signals intel', 'Relay 2.3.66.510'], ['Satellite', 'Pass 18.0.77.01']];
const KM_PER_DEG_MIN = 111.0; // just under the true 111.19, for a conservative latitude pre-check

// Lon/lat bounds of a border polygon (all rings), cached per polygon. Polygons whose rings jump
// the antimeridian are flagged and always rasterised, as rasterize() unwraps them itself.
const polyBounds = new WeakMap();
function boundsOfPoly(poly) {
  let b = polyBounds.get(poly);
  if (b) return b;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity, wraps = false;
  for (const ring of poly) {
    for (let i = 0; i < ring.length; i++) {
      const x = ring[i][0], y = ring[i][1];
      if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
      if (i && Math.abs(x - ring[i - 1][0]) > 180) wraps = true;
    }
  }
  polyBounds.set(poly, (b = { w, s, e, n, wraps }));
  return b;
}
function boundsOfNation(nation) {
  let b = polyBounds.get(nation.features);
  if (b) return b;
  b = { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity, wraps: false };
  for (const f of nation.features) {
    const g = f.geometry;
    for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      const p = boundsOfPoly(poly);
      b.w = Math.min(b.w, p.w); b.s = Math.min(b.s, p.s); b.e = Math.max(b.e, p.e); b.n = Math.max(b.n, p.n);
      b.wraps ||= p.wraps;
    }
  }
  polyBounds.set(nation.features, b);
  return b;
}

export class CityLayer {
  constructor(scene, world, game) {
    this.world = world;
    this.game = game;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.built = new Map();
    this.labels = [];
    this.pointUniforms = { uScale: { value: 0.012 }, uOpacity: { value: 1 } };
    this.pointMat = new THREE.ShaderMaterial({ uniforms: this.pointUniforms, vertexShader: pointsVert, fragmentShader: pointsFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.buildMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true });
    this.linkMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  }

  nearest(lat, lon, maxKm) {
    let best = null, bd = maxKm;
    const p = { lat, lon };
    for (const c of CITIES) {
      if (Math.abs(c.lat - lat) * KM_PER_DEG_MIN >= bd) continue; // cannot beat bd
      const d = haversine(p, c);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // Procedural lights and blocks are only a fallback for when the OpenStreetMap tiles are unreachable.
  update(cam, viewportH, realCity = false) {
    const dist = cam.dist;
    const show = dist < 0.075;
    this.group.visible = show;
    this.labels = [];
    if (!show) return;
    const fade = 1 - THREE.MathUtils.smoothstep(dist, 0.028, 0.075);
    this.pointUniforms.uOpacity.value = fade;
    this.pointUniforms.uScale.value = viewportH * 0.0000045;
    this.buildMat.opacity = fade;
    const t = { lat: cam.lat, lon: cam.lon };
    const range = 140 + dist * EARTH_KM * 2.2;
    const near = [];
    for (const c of CITIES) {
      if (Math.abs(c.lat - t.lat) * KM_PER_DEG_MIN >= range) continue;
      const d = haversine(t, c);
      if (d < range) near.push([c, d]);
    }
    const want = near.sort((a, b) => a[1] - b[1]).slice(0, 3).map(([c]) => c);
    let builtThisFrame = false;
    for (const c of want) {
      if (!this.built.has(c.name) && !builtThisFrame) { this.built.set(c.name, this.build(c)); builtThisFrame = true; }
    }
    for (const [name, obj] of this.built) {
      const keep = want.some((c) => c.name === name);
      if (!keep && this.built.size > 4) { this.group.remove(obj.group); obj.dispose(); this.built.delete(name); continue; }
      obj.group.visible = keep;
      // The procedural lights and blocks are only filled in once they are actually shown.
      if (!realCity && obj.materialize) { obj.materialize(); obj.materialize = null; }
      for (const o of obj.procedural) o.visible = !realCity;
      // Over the real city, strikes come from the simulation (craters, rubble, fires), so the
      // illustrative strike markers step aside.
      for (const o of obj.group.children) if (o.userData.scripted) o.visible = !realCity;
      if (keep) for (const l of obj.labels) if (!(realCity && l.kind === 'event')) this.labels.push(l);
    }
  }

  build(city) {
    const R = rng(hashString(city.name));
    const noise = valueNoise(hashString(city.name + 'n'));
    const Rk = 5 + 6.5 * Math.sqrt(city.pop);
    const ext = Rk * 2.1;
    const cosφ = Math.cos(city.lat * DEG);
    const latSpan = ext / 111.2, lonSpan = ext / (111.2 * cosφ);
    const bbox = [city.lon - lonSpan, city.lat - latSpan, city.lon + lonSpan, city.lat + latSpan];

    // High-resolution land mask from the vector borders, so lights stop at the coast.
    const M = 512;
    const polys = [];
    for (const n of this.world.nations.slice(1)) {
      // Planar vertex bounds (what rasterize() draws), cached; cheaper than the spherical
      // n.bounds, which is computed lazily for every nation on first use.
      const nb = boundsOfNation(n);
      if (!nb.wraps && (nb.e < bbox[0] || nb.w > bbox[2] || nb.n < bbox[1] || nb.s > bbox[3])) continue;
      for (const f of n.features) {
        const g = f.geometry;
        for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
          // A polygon wholly outside the raster cannot set a pixel; skip it before rasterising.
          const pb = boundsOfPoly(poly);
          if (!pb.wraps && (pb.e < bbox[0] || pb.w > bbox[2] || pb.n < bbox[1] || pb.s > bbox[3])) continue;
          polys.push({ rings: poly, value: 1 });
        }
      }
    }
    const mask = rasterize(polys, M, M, bbox);
    const land = (x, y) => {
      const lat = city.lat + y / 111.2, lon = city.lon + x / (111.2 * cosφ);
      const i = Math.floor(((bbox[3] - lat) / (2 * latSpan)) * M), j = Math.floor(((lon - bbox[0]) / (2 * lonSpan)) * M);
      return i >= 0 && j >= 0 && i < M && j < M ? mask[i * M + j] === 1 : false;
    };

    const arms = [];
    const nArms = 7 + Math.floor(R() * 6);
    for (let k = 0; k < nArms; k++) arms.push((k / nArms) * Math.PI * 2 + (R() - 0.5) * 0.5);
    const density = (x, y) => {
      const r = Math.hypot(x, y);
      let d = Math.exp(-((r / (Rk * 0.55)) ** 2));
      const a = Math.atan2(y, x);
      const fall = Math.exp(-r / (Rk * 1.3));
      for (let k = 0; k < arms.length; k++) {
        let da = Math.abs(a - arms[k]); da = Math.min(da, Math.PI * 2 - da);
        // Beyond this the arm term underflows to exactly 0 and would add nothing.
        if (da * r > 30.05) continue;
        d += Math.exp(-(((da * r) / 1.1) ** 2)) * fall * 0.55;
      }
      return Math.min(1, d) * (0.45 + 0.75 * noise(x / 2.6 + 50, y / 2.6 + 50));
    };

    const segs = [];
    const grid = (theta, sp, reach, thr, keepP) => {
      const ct = Math.cos(theta), st = Math.sin(theta);
      const K = Math.ceil(reach / sp);
      for (let dir = 0; dir < 2; dir++) {
        for (let i = -K; i <= K; i++) {
          for (let j = -K; j < K; j++) {
            let u0 = j * sp, u1 = (j + 1) * sp, v = i * sp + (R() - 0.5) * sp * 0.08;
            const P = (u, vv) => (dir === 0 ? [u * ct - vv * st, u * st + vv * ct] : [vv * ct - u * st, vv * st + u * ct]);
            const [x0, y0] = P(u0, v), [x1, y1] = P(u1, v);
            const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
            if (Math.hypot(mx, my) > reach || R() > keepP) continue;
            // Same draws as before: the threshold roll is taken whether or not the point is land.
            const roll = R();
            if (!land(mx, my)) continue;
            const d = density(mx, my);
            if (d < thr + roll * 0.22) continue;
            segs.push([x0, y0, x1, y1, 0, d]);
          }
        }
      }
    };
    const theta = R() * Math.PI;
    const sp = 0.34 + R() * 0.22;
    grid(theta, sp, Rk * 1.0, 0.1, 1);
    grid(theta + 0.35 + R() * 0.5, sp * 1.7, Rk * 1.6, 0.04, 0.65);

    for (const arm of arms) {
      let a = arm, x = Math.cos(a) * 0.3, y = Math.sin(a) * 0.3, wet = 0;
      for (let r = 0.3; r < Rk * 2; r += 0.45) {
        a += (R() - 0.5) * 0.09;
        const nx = x + Math.cos(a) * 0.45, ny = y + Math.sin(a) * 0.45;
        if (!land(nx, ny)) { if ((wet += 0.45) > 1.5) break; } else wet = 0;
        if (wet === 0) segs.push([x, y, nx, ny, 1, 1]);
        x = nx; y = ny;
      }
    }
    for (const rr of [Rk * 0.38, Rk * 0.82]) {
      const steps = Math.ceil((rr * Math.PI * 2) / 0.4);
      let px = rr, py = 0;
      for (let k = 1; k <= steps; k++) {
        const a = (k / steps) * Math.PI * 2, w = rr * (1 + (noise(Math.cos(a) * 2 + 9, Math.sin(a) * 2 + 9) - 0.5) * 0.25);
        const nx = Math.cos(a) * w, ny = Math.sin(a) * w;
        if (land(nx, ny) && land(px, py)) segs.push([px, py, nx, ny, 1, 0.9]);
        px = nx; py = ny;
      }
    }

    // Lights along roads and scattered through dense blocks. Stored as local km offsets; they are
    // projected onto the globe only if the procedural layer is ever shown.
    let roadLights = 0;
    for (const [x0, y0, x1, y1, kind] of segs) roadLights += Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0) / (kind ? 0.045 : 0.075)));
    const cap = roadLights + Math.ceil(Math.min(30000, roadLights * 0.6));
    const lx = new Float64Array(cap), ly = new Float64Array(cap), bri = new Float32Array(cap), warm = new Float32Array(cap);
    let nl = 0;
    const push = (x, y, b, w) => { lx[nl] = x; ly[nl] = y; bri[nl] = b; warm[nl] = w; nl++; };
    const v = new THREE.Vector3();
    const lightPos = (i, out) => ll2v(city.lat + ly[i] / 111.2, city.lon + lx[i] / (111.2 * cosφ), 1 + 0.004 / EARTH_KM, out);
    for (const [x0, y0, x1, y1, kind, d] of segs) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const step = kind ? 0.045 : 0.075;
      const nn = Math.max(1, Math.floor(len / step));
      for (let k = 0; k < nn; k++) {
        const t = (k + R()) / nn;
        push(x0 + (x1 - x0) * t + (R() - 0.5) * 0.02, y0 + (y1 - y0) * t + (R() - 0.5) * 0.02, kind ? 0.8 + R() * 0.2 : 0.3 + d * 0.6, kind ? 1 : R() < 0.12 ? 1 : 0);
      }
    }
    const scatter = Math.min(30000, nl * 0.6);
    for (let k = 0; k < scatter; k++) {
      const r = Rk * 1.2 * Math.sqrt(R()), a = R() * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      const roll = R();
      if (!land(x, y)) continue;
      const d = density(x, y);
      if (roll > d) continue;
      push(x, y, d * 0.5, 0);
    }
    const geo = new THREE.BufferGeometry();
    const points = new THREE.Points(geo, this.pointMat);
    points.frustumCulled = false;

    // Buildings: blocks between the core grid streets, tallest in the centre.
    const boxes = [];
    const ct = Math.cos(theta), st = Math.sin(theta);
    const K = Math.ceil((Rk * 0.8) / sp);
    for (let i = -K; i < K; i++) for (let j = -K; j < K; j++) {
      const cu = (j + 0.5) * sp, cv = (i + 0.5) * sp;
      const cx = cu * ct - cv * st, cy = cu * st + cv * ct;
      const r = Math.hypot(cx, cy);
      if (r > Rk * 0.8) continue;
      const d = density(cx, cy);
      if (d < 0.3 || R() > d * 1.2 || !land(cx, cy)) continue;
      const count = 1 + Math.floor(R() * 3);
      for (let k = 0; k < count && boxes.length < 7000; k++) {
        const ou = (R() - 0.5) * sp * 0.55, ov = (R() - 0.5) * sp * 0.55;
        const x = cx + ou * ct - ov * st, y = cy + ou * st + ov * ct;
        const core = Math.exp(-r / (Rk * 0.16));
        const h = (0.015 + 0.06 * d + 0.55 * core * R() ** 2.2) * 1.7;
        boxes.push([x, y, sp * (0.14 + R() * 0.24), sp * (0.14 + R() * 0.24), h, 0.35 + R() * 0.25 + core * 0.25]);
      }
    }
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(boxGeo, this.buildMat, Math.max(1, boxes.length));
    inst.count = boxes.length;
    inst.frustumCulled = false;

    // Fills the light positions and block matrices — skipped entirely while the real
    // OpenStreetMap city is drawn instead (update() calls it the first time it is needed).
    const materialize = () => {
      const pos = new Float32Array(nl * 3);
      for (let i = 0; i < nl; i++) { lightPos(i, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aB', new THREE.BufferAttribute(bri.slice(0, nl), 1));
      geo.setAttribute('aW', new THREE.BufferAttribute(warm.slice(0, nl), 1));
      const m = new THREE.Matrix4(), up = new THREE.Vector3(), east = new THREE.Vector3(), north = new THREE.Vector3(), ax = new THREE.Vector3(), az = new THREE.Vector3(), col = new THREE.Color();
      boxes.forEach(([x, y, w, dpt, h, tone], idx) => {
        const lat = city.lat + y / 111.2, lon = city.lon + x / (111.2 * cosφ);
        ll2v(lat, lon, 1, v);
        up.copy(v).normalize();
        east.set(Math.cos(lon * DEG), 0, -Math.sin(lon * DEG));
        north.crossVectors(up, east);
        ax.copy(east).multiplyScalar(ct).addScaledVector(north, st);
        az.crossVectors(ax, up);
        const k = 1 / EARTH_KM;
        m.makeBasis(ax.multiplyScalar(w * k), up.clone().multiplyScalar(h * k), az.multiplyScalar(dpt * k));
        m.setPosition(v);
        inst.setMatrixAt(idx, m);
        inst.setColorAt(idx, col.setScalar(tone));
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    };

    const group = new THREE.Group();
    group.add(points, inst);
    const labels = [{ kind: 'city', pos: ll2v(city.lat, city.lon, 1 + 0.6 / EARTH_KM), title: city.name, sub: `${city.pop >= 1 ? city.pop.toFixed(1) + ' m' : Math.round(city.pop * 1000) + 'k'} metro` }];

    // Intelligence overlay for cities inside an active war: uplinks, data links and strike reports.
    const n = this.world.byIso.get(city.iso3);
    const ctl = this.world.control[pixelOf(city.lat, city.lon)];
    const warZone = n && (this.game.warsOf(n.index).length > 0 || (ctl && ctl !== n.index));
    const extra = [];
    if (warZone) {
      const nodes = NODES.map(([title, sub], k) => {
        const a = -0.6 + k * 0.6, r = Rk * 0.35;
        const lat = city.lat + (Math.sin(a) * r) / 111.2, lon = city.lon + (Math.cos(a) * r) / (111.2 * cosφ);
        const p = ll2v(lat, lon, 1 + (7 + k) / EARTH_KM);
        labels.push({ kind: 'node', pos: p, title, sub });
        return p;
      });
      const lp = [];
      const count = Math.min(150, nl);
      for (let k = 0; k < count; k++) {
        lightPos(Math.floor(R() * nl), v);
        const tgt = nodes[k % nodes.length];
        lp.push(v.x, v.y, v.z, tgt.x, tgt.y, tgt.z);
      }
      for (let k = 0; k < nodes.length - 1; k++) lp.push(nodes[k].x, nodes[k].y, nodes[k].z, nodes[k + 1].x, nodes[k + 1].y, nodes[k + 1].z);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      const links = new THREE.LineSegments(lg, this.linkMat);
      links.frustumCulled = false;
      group.add(links);
      extra.push(lg);

      const evs = 3 + Math.floor(R() * 3);
      for (let k = 0; k < evs; k++) {
        const [title, sub] = EVENT_TYPES[Math.floor(R() * EVENT_TYPES.length)];
        let x = 0, y = 0;
        for (let tries = 0; tries < 12; tries++) { const r = Rk * (0.1 + R() * 0.6), a = R() * Math.PI * 2; x = Math.cos(a) * r; y = Math.sin(a) * r; if (land(x, y)) break; }
        const lat = city.lat + y / 111.2, lon = city.lon + x / (111.2 * cosφ);
        const ground = ll2v(lat, lon, 1 + 0.01 / EARTH_KM);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.26 / EARTH_KM, 0.31 / EARTH_KM, 48), this.ringMat);
        ring.position.copy(ground);
        ring.lookAt(ground.clone().multiplyScalar(2));
        ring.userData.scripted = true;
        group.add(ring);
        extra.push(ring.geometry);
        labels.push({ kind: 'event', pos: ll2v(lat, lon, 1 + 1.6 / EARTH_KM), title, sub });
      }
    }

    this.group.add(group);
    return {
      group, labels, procedural: [points, inst], materialize,
      pedestrianGrid: { angle: theta, spacingM: sp * 1000, radiusM: Rk * 1600 },
      dispose: () => { geo.dispose(); boxGeo.dispose(); inst.dispose(); extra.forEach((g) => g.dispose()); },
    };
  }
}
