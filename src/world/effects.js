import * as THREE from 'three';
import { buildModels, doctrine } from './unitModels.js';
import { ll2v, haversine, DEG, EARTH_KM } from '../util/geo.js';
import { GROUND_EXAG } from './armyLayer.js';

const R_M = EARTH_KM * 1000;
const HOUR = 3600000;
const MAX_CRATERS = 6000;
const MAX_WRECKS = 4000;
const MAX_EMITTERS = 900;
const WRECK_KINDS = ['mbt_west', 'mbt_east', 'ifv', 'apc', 'spg'];

// Smoke, fire and blast particles. Each emitter spawns a fixed set of particles whose motion is
// computed entirely in the vertex shader from time, so the CPU only refills its buffers when the
// set of emitters changes.
const particleVert = /* glsl */ `
attribute vec3 aUp; attribute float aSeed; attribute float aKind; attribute float aBorn;
uniform float uTime; uniform float uProj;
varying float vT; varying float vKind;
void main() {
  float rate = aKind < 0.5 ? 0.55 : (aKind < 1.5 ? 0.06 : 1.0);
  float t = aKind > 1.5 ? clamp((uTime - aBorn) / 1.4, 0.0, 1.0) : fract(uTime * rate + aSeed);
  vec3 wind = normalize(cross(aUp, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  float rise = aKind < 0.5 ? 45.0 : (aKind < 1.5 ? 420.0 : 60.0);
  float drift = aKind < 1.5 ? 260.0 * t * t * step(0.5, aKind) : 0.0;
  vec3 p = position + (aUp * rise * t + wind * drift + aUp * aSeed * 6.0) / ${R_M.toFixed(1)};
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sizeM = aKind < 0.5 ? mix(26.0, 10.0, t) : (aKind < 1.5 ? mix(40.0, 220.0, t) : mix(30.0, 260.0, t));
  gl_PointSize = clamp(sizeM / ${R_M.toFixed(1)} * uProj / -mv.z, 1.0, 180.0);
  vT = t; vKind = aKind;
}`;
const particleFrag = /* glsl */ `
varying float vT; varying float vKind;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, r);
  if (vKind < 0.5) {
    gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.3, 0.08), vT) * soft, soft * (1.0 - vT));
  } else if (vKind < 1.5) {
    float a = soft * (1.0 - vT) * smoothstep(0.0, 0.08, vT) * 0.55;
    gl_FragColor = vec4(vec3(0.16 + vT * 0.18), a);
  } else {
    if (vT >= 1.0) discard;
    gl_FragColor = vec4(vec3(1.0, 0.75, 0.4) * soft * (1.0 - vT) * 1.6, soft * (1.0 - vT));
  }
}`;

export class Effects {
  constructor(scene, game, units, osm) {
    this.game = game;
    this.units = units;
    this.osm = osm;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lastImpact = 0;
    this.lastWrecks = 0;
    this.emitters = []; // { lat, lon, h, kind 0 fire / 1 smoke / 2 blast, until (game ms), born (real s) }
    this.dirty = false;

    // Craters: scorched discs on the ground.
    const disc = new THREE.CircleGeometry(1, 14);
    this.craters = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: 0x2c2723, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), MAX_CRATERS);
    this.craters.count = 0;
    this.craters.frustumCulled = false;
    this.group.add(this.craters);

    // Wrecks: charred hulls of the same models the armies use, turrets askew.
    const geos = buildModels();
    this.wreckMat = new THREE.MeshLambertMaterial({ color: 0x6a625a, vertexColors: true });
    this.wreckMeshes = {};
    for (const k of WRECK_KINDS) {
      const m = new THREE.InstancedMesh(geos[k], this.wreckMat, MAX_WRECKS);
      m.count = 0;
      m.frustumCulled = false;
      this.wreckMeshes[k] = m;
      this.group.add(m);
    }
    this._wreckN = {}; // instances laid per kind (before the capacity clamp)
    this._lastWreck = null; // the newest wreck already laid, to recognise pure appends

    this.uniforms = { uTime: { value: 0 }, uProj: { value: 800 } };
    const mk = (blending) => new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: particleVert, fragmentShader: particleFrag, transparent: true, depthWrite: false, blending });
    this.fire = new THREE.Points(particleGeometry(1024), mk(THREE.AdditiveBlending));
    this.smoke = new THREE.Points(particleGeometry(1024), mk(THREE.NormalBlending));
    this.fire.frustumCulled = this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 2;
    this.group.add(this.smoke, this.fire);

    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._z = new THREE.Vector3(0, 0, 1);
    this._sc = new THREE.Vector3();
    this._near = { lat: 0, lon: 0 };
    this._w = { v: new THREE.Vector3(), up: new THREE.Vector3(), east: new THREE.Vector3(), north: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3() };

    osm.onRubble = (list) => {
      for (const b of list.slice(0, 6)) this.addEmitter(b.lat, b.lon, Math.min(40, b.h * 0.15), this.game.r() < 0.6 ? 0 : 1, 30);
    };
  }

  addEmitter(lat, lon, h, kind, hours) {
    this.emitters.push({ lat, lon, h, kind, until: this.game.time + hours * HOUR, born: this.now ?? 0 });
    if (kind === 0) this.emitters.push({ lat, lon, h: h + 10, kind: 1, until: this.game.time + hours * 1.6 * HOUR, born: this.now ?? 0 });
    if (this.emitters.length > MAX_EMITTERS) this.emitters.splice(0, this.emitters.length - MAX_EMITTERS);
    this.dirty = true;
  }

  update(cam, camera, nowSec) {
    this.now = nowSec;
    const g = this.game;
    const m = this._m, p = this._p, up = this._up, q = this._q, z = this._z, sc = this._sc;
    const near = this._near;
    near.lat = cam.lat; near.lon = cam.lon;
    const watchKm = Math.max(40, cam.dist * EARTH_KM * 4);

    // New impacts: crater, building damage if the city is streamed in, a blast and sometimes fire.
    // Impacts are logged in time order, so only the tail newer than the last one seen is read.
    const impacts = this.units.impacts;
    let first = impacts.length;
    while (first > 0 && impacts[first - 1].time > this.lastImpact) first--;
    let lo = Infinity, hi = -1;
    for (let k = first; k < impacts.length; k++) {
      const im = impacts[k];
      if (im.time <= this.lastImpact) continue;
      const i = this.craters.count < MAX_CRATERS ? this.craters.count++ : Math.floor(g.r() * MAX_CRATERS);
      ll2v(im.lat, im.lon, 1 + 0.3 / R_M, p);
      up.copy(p).normalize();
      q.setFromUnitVectors(z, up);
      const rad = 8 + g.r() * 10;
      m.compose(p, q, sc.set(rad / R_M, rad / R_M, 1 / R_M));
      this.craters.setMatrixAt(i, m);
      if (i < lo) lo = i;
      if (i > hi) hi = i;
      this.osm.damage(im.lat, im.lon, 30 + g.r() * 25);
      if (haversine(near, im) < watchKm) {
        this.emitters.push({ lat: im.lat, lon: im.lon, h: 0, kind: 2, until: g.time + HOUR, born: nowSec + g.r() * 1.2 });
        if (g.r() < (im.urban ? 0.35 : 0.12)) this.addEmitter(im.lat, im.lon, 2, 0, 10);
        this.dirty = true;
      }
    }
    if (hi >= 0) {
      this.craters.instanceMatrix.addUpdateRange(lo * 16, (hi - lo + 1) * 16);
      this.craters.instanceMatrix.needsUpdate = true;
    }
    const last = impacts[impacts.length - 1];
    if (last) this.lastImpact = Math.max(this.lastImpact, last.time);

    // Wrecks. Each one burns for a day, then smoulders.
    const wrecks = this.units.wrecks;
    // At the 4,000-wreck cap the count stops changing while the oldest are dropped, so also
    // watch the newest wreck.
    const newest = wrecks[wrecks.length - 1] ?? null;
    if (wrecks.length !== this.lastWrecks || newest !== this._lastWreck || (this.wrecksDirtyVersion !== this.osm.version && nowSec - (this.wrecksAt ?? 0) > 2)) {
      this.wrecksAt = nowSec;
      let prev = Math.max(0, Math.min(this.lastWrecks, wrecks.length));
      if (wrecks.length === this.lastWrecks && newest !== this._lastWreck) prev = this._lastWreck ? wrecks.lastIndexOf(this._lastWreck) + 1 : 0;
      for (let k = prev; k < wrecks.length; k++) { const w = wrecks[k]; if (g.time - w.time < 2 * HOUR) this.addEmitter(w.lat, w.lon, 3, 0, 24); }
      // New wrecks on unchanged ground are appended; anything else re-lays them all.
      const append = this.wrecksDirtyVersion === this.osm.version && prev > 0 && prev === this.lastWrecks && wrecks.length > prev && wrecks[prev - 1] === this._lastWreck;
      this.lastWrecks = wrecks.length;
      this._layWrecks(append ? prev : 0);
      this.wrecksDirtyVersion = this.osm.version;
    }

    // Expire emitters by game time; one-shot blasts by real time (compacted in place).
    const em = this.emitters;
    let kept = 0;
    for (let k = 0; k < em.length; k++) {
      const e = em[k];
      if (e.kind === 2 ? nowSec - e.born < 1.6 : e.until > g.time) em[kept++] = e;
    }
    if (kept !== em.length) { em.length = kept; this.dirty = true; }
    if (this.dirty && nowSec - (this.rebuiltAt ?? 0) > 0.25) { this.dirty = false; this.rebuiltAt = nowSec; this._rebuild(); }

    this.uniforms.uTime.value = nowSec;
    this.uniforms.uProj.value = window.innerHeight / (2 * Math.tan((camera.fov * DEG) / 2));
    this.group.visible = cam.dist < 0.03;
  }

  // Lays wrecks[from..] into the wreck meshes (from = 0 re-lays everything).
  _layWrecks(from) {
    const { v, up, east, north, fwd, right } = this._w;
    const m = this._m;
    const counts = this._wreckN, start = {};
    for (const k in this.wreckMeshes) { if (!from) counts[k] = 0; start[k] = counts[k]; }
    const s = GROUND_EXAG / R_M;
    const wrecks = this.units.wrecks;
    for (let n = from; n < wrecks.length; n++) {
      const w = wrecks[n];
      let kind = w.kind === 'mbt' ? (doctrine(this.game.nations[w.owner].iso3) === 'west' ? 'mbt_west' : 'mbt_east') : w.kind;
      const mesh = this.wreckMeshes[kind] ?? this.wreckMeshes.apc;
      kind = this.wreckMeshes[kind] ? kind : 'apc';
      // Wrecks lie where they fell, but never inside a standing building or in a river.
      let { lat, lon } = w;
      const pr = this.osm.probe(lat, lon);
      if (pr.loaded && (pr.building || pr.water)) {
        const r = this.osm.road(lat, lon, 200);
        if (!r) continue;
        lat = r.lat; lon = r.lon;
      }
      ll2v(lat, lon, 1, v);
      up.copy(v).normalize();
      east.set(Math.cos(lon * DEG), 0, -Math.sin(lon * DEG));
      north.crossVectors(up, east);
      const h = w.yaw * DEG;
      fwd.copy(north).multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h));
      right.crossVectors(fwd, up);
      // A slight list, as if the hull had settled into a crater.
      const tilt = ((w.yaw * 13) % 7 - 3) * 0.02;
      up.addScaledVector(right, tilt).normalize();
      m.makeBasis(right.multiplyScalar(s), up.multiplyScalar(s), fwd.multiplyScalar(s)).setPosition(v);
      mesh.setMatrixAt(counts[kind]++, m);
    }
    this._lastWreck = wrecks[wrecks.length - 1] ?? null;
    for (const k in this.wreckMeshes) {
      const mesh = this.wreckMeshes[k];
      const a = Math.min(MAX_WRECKS, start[k]), b = Math.min(MAX_WRECKS, counts[k]);
      mesh.count = b;
      if (b > a) {
        mesh.instanceMatrix.addUpdateRange(a * 16, (b - a) * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // Refills the particle buffers in place; they only grow (by doubling) when they run out.
  _rebuild() {
    const fill = (pts, pred, per) => {
      let n = 0;
      for (const e of this.emitters) if (pred(e)) n += per(e);
      let geo = pts.geometry;
      if (n > geo.attributes.position.count) {
        geo.dispose();
        geo = pts.geometry = particleGeometry(2 ** Math.ceil(Math.log2(n)));
      }
      const A = geo.attributes;
      const pos = A.position.array, upA = A.aUp.array, seed = A.aSeed.array, kind = A.aKind.array, born = A.aBorn.array;
      const v = this._p, nrm = this._up;
      let j = 0;
      for (const e of this.emitters) {
        if (!pred(e)) continue;
        ll2v(e.lat, e.lon, 1 + e.h / R_M, v);
        nrm.copy(v).normalize();
        const count = per(e);
        for (let i = 0; i < count; i++, j++) {
          // Spread each emitter's particles a few metres so a fire has some body.
          pos[j * 3] = v.x + ((i * 0.37) % 1 - 0.5) * 8 / R_M;
          pos[j * 3 + 1] = v.y + ((i * 0.61) % 1 - 0.5) * 8 / R_M;
          pos[j * 3 + 2] = v.z + ((i * 0.83) % 1 - 0.5) * 8 / R_M;
          upA[j * 3] = nrm.x; upA[j * 3 + 1] = nrm.y; upA[j * 3 + 2] = nrm.z;
          seed[j] = i / count + ((e.lat * 977 + e.lon * 131) % 1);
          kind[j] = e.kind;
          born[j] = e.born;
        }
      }
      geo.setDrawRange(0, n);
      if (n) for (const name in A) {
        const at = A[name];
        at.addUpdateRange(0, n * at.itemSize);
        at.needsUpdate = true;
      }
    };
    fill(this.fire, (e) => e.kind !== 1, (e) => (e.kind === 2 ? 1 : 7));
    fill(this.smoke, (e) => e.kind === 1, () => 12);
  }
}

// Particle buffers with room for `cap` points, refilled in place by Effects._rebuild.
function particleGeometry(cap) {
  const g = new THREE.BufferGeometry();
  const attr = (size) => new THREE.BufferAttribute(new Float32Array(cap * size), size).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', attr(3));
  g.setAttribute('aUp', attr(3));
  g.setAttribute('aSeed', attr(1));
  g.setAttribute('aKind', attr(1));
  g.setAttribute('aBorn', attr(1));
  g.setDrawRange(0, 0);
  return g;
}
