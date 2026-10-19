import * as THREE from 'three';
import { buildModels, doctrine } from './unitModels.js';
import { ll2v, haversine, DEG, EARTH_KM } from '../util/geo.js';
import { GROUND_EXAG } from './armyLayer.js';

const R_M = EARTH_KM * 1000;
const HOUR = 3600000;
const MAX_CRATERS = 6000;
const MAX_WRECKS = 4000;
const MAX_EMITTERS = 900;

// Smoke, fire and blast particles. Each emitter spawns a fixed set of particles whose motion is
// computed entirely in the vertex shader from time, so the CPU only rebuilds buffers when the
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
    for (const k of ['mbt_west', 'mbt_east', 'ifv', 'apc', 'spg']) {
      const m = new THREE.InstancedMesh(geos[k], this.wreckMat, MAX_WRECKS);
      m.count = 0;
      m.frustumCulled = false;
      this.wreckMeshes[k] = m;
      this.group.add(m);
    }

    this.uniforms = { uTime: { value: 0 }, uProj: { value: 800 } };
    const mk = (blending) => new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: particleVert, fragmentShader: particleFrag, transparent: true, depthWrite: false, blending });
    this.fire = new THREE.Points(new THREE.BufferGeometry(), mk(THREE.AdditiveBlending));
    this.smoke = new THREE.Points(new THREE.BufferGeometry(), mk(THREE.NormalBlending));
    this.fire.frustumCulled = this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 2;
    this.group.add(this.smoke, this.fire);

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
    const m = new THREE.Matrix4(), up = new THREE.Vector3(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    const near = { lat: cam.lat, lon: cam.lon };
    const watchKm = Math.max(40, cam.dist * EARTH_KM * 4);

    // New impacts: crater, building damage if the city is streamed in, a blast and sometimes fire.
    for (const im of this.units.impacts) {
      if (im.time <= this.lastImpact) continue;
      const i = this.craters.count < MAX_CRATERS ? this.craters.count++ : Math.floor(g.r() * MAX_CRATERS);
      const p = ll2v(im.lat, im.lon, 1 + 0.3 / R_M);
      up.copy(p).normalize();
      q.setFromUnitVectors(z, up);
      const rad = 8 + g.r() * 10;
      m.compose(p, q, new THREE.Vector3(rad / R_M, rad / R_M, 1 / R_M));
      this.craters.setMatrixAt(i, m);
      this.craters.instanceMatrix.needsUpdate = true;
      this.osm.damage(im.lat, im.lon, 30 + g.r() * 25);
      if (haversine(near, im) < watchKm) {
        this.emitters.push({ lat: im.lat, lon: im.lon, h: 0, kind: 2, until: g.time + HOUR, born: nowSec + g.r() * 1.2 });
        if (g.r() < (im.urban ? 0.35 : 0.12)) this.addEmitter(im.lat, im.lon, 2, 0, 10);
        this.dirty = true;
      }
    }
    const last = this.units.impacts[this.units.impacts.length - 1];
    if (last) this.lastImpact = Math.max(this.lastImpact, last.time);

    // Wrecks. Each one burns for a day, then smoulders.
    const wrecks = this.units.wrecks;
    if (wrecks.length !== this.lastWrecks || (this.wrecksDirtyVersion !== this.osm.version && nowSec - (this.wrecksAt ?? 0) > 2)) {
      this.wrecksAt = nowSec;
      const fresh = wrecks.slice(Math.max(0, Math.min(this.lastWrecks, wrecks.length)));
      for (const w of fresh) if (g.time - w.time < 2 * HOUR) this.addEmitter(w.lat, w.lon, 3, 0, 24);
      this.lastWrecks = wrecks.length;
      this._layWrecks();
      this.wrecksDirtyVersion = this.osm.version;
    }

    // Expire emitters by game time; one-shot blasts by real time.
    const before = this.emitters.length;
    this.emitters = this.emitters.filter((e) => (e.kind === 2 ? nowSec - e.born < 1.6 : e.until > g.time));
    if (this.emitters.length !== before) this.dirty = true;
    if (this.dirty && nowSec - (this.rebuiltAt ?? 0) > 0.25) { this.dirty = false; this.rebuiltAt = nowSec; this._rebuild(); }

    this.uniforms.uTime.value = nowSec;
    this.uniforms.uProj.value = window.innerHeight / (2 * Math.tan((camera.fov * DEG) / 2));
    this.group.visible = cam.dist < 0.03;
  }

  _layWrecks() {
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), up = new THREE.Vector3(), east = new THREE.Vector3(), north = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
    const counts = {};
    for (const k in this.wreckMeshes) counts[k] = 0;
    const s = GROUND_EXAG / R_M;
    for (const w of this.units.wrecks) {
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
    for (const k in this.wreckMeshes) {
      const mesh = this.wreckMeshes[k];
      mesh.count = Math.min(MAX_WRECKS, counts[k]);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _rebuild() {
    const build = (pred, per) => {
      const pos = [], upA = [], seed = [], kind = [], born = [];
      const v = new THREE.Vector3();
      for (const e of this.emitters) {
        if (!pred(e)) continue;
        ll2v(e.lat, e.lon, 1 + e.h / R_M, v);
        const n = v.clone().normalize();
        const count = per(e);
        for (let i = 0; i < count; i++) {
          // Spread each emitter's particles a few metres so a fire has some body.
          pos.push(v.x + ((i * 0.37) % 1 - 0.5) * 8 / R_M, v.y + ((i * 0.61) % 1 - 0.5) * 8 / R_M, v.z + ((i * 0.83) % 1 - 0.5) * 8 / R_M);
          upA.push(n.x, n.y, n.z);
          seed.push(i / count + ((e.lat * 977 + e.lon * 131) % 1));
          kind.push(e.kind);
          born.push(e.born);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aUp', new THREE.Float32BufferAttribute(upA, 3));
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
      g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
      g.setAttribute('aBorn', new THREE.Float32BufferAttribute(born, 1));
      return g;
    };
    this.fire.geometry.dispose();
    this.smoke.geometry.dispose();
    this.fire.geometry = build((e) => e.kind !== 1, (e) => (e.kind === 2 ? 1 : 7));
    this.smoke.geometry = build((e) => e.kind === 1, () => 12);
  }
}
