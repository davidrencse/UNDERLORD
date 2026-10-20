import * as THREE from 'three';
import { EARTH_KM, DEG, ll2v, rng, hashString } from '../util/geo.js';
import { buildingAt, inWater } from './ground.js';
import { CIVILIAN_MODEL } from '../data/civilianModel.js';

// People are drawn at true scale (1.75 m), so they only resolve once the camera is near the street.
const SHOW_BELOW = 0.0003; // about 1.9 km from the ground
const MAX_PEOPLE = 6000;
const DETAILED = 900; // nearest walkers get the animated model, the rest a static low-poly figure
const PER_TILE = 1500;
const R_M = EARTH_KM * 1000;
const STRIDE_M = 1.5; // ground covered by one baked walk cycle (two steps)
const GREYS = [0.36, 0.42, 0.48, 0.54, 0.6];

const decode = (b64, Type) => {
  const bytes = typeof atob === 'function' ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : Uint8Array.from(Buffer.from(b64, 'base64'));
  return new Type(bytes.buffer);
};

// One indexed body plus every walk frame in a float texture (column = vertex, row = frame).
// The vertex shader fetches its own vertex from the two frames around the instance's phase,
// so the whole crowd is a single instanced draw.
function civilianMesh() {
  const M = CIVILIAN_MODEL;
  const q = decode(M.positions, Int16Array), n = M.vertices;
  const data = new Float32Array(M.frames * n * 4);
  for (let i = 0; i < M.frames * n; i++) {
    data[i * 4] = q[i * 3] * M.quantum;
    data[i * 4 + 1] = q[i * 3 + 1] * M.quantum;
    data[i * 4 + 2] = q[i * 3 + 2] * M.quantum;
  }
  const frames = new THREE.DataTexture(data, n, M.frames, THREE.RGBAFormat, THREE.FloatType);
  frames.needsUpdate = true;
  const geometry = new THREE.BufferGeometry();
  const rest = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) rest.set(data.subarray(i * 4, i * 4 + 3), i * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(rest, 3));
  const index = decode(M.index, n < 65536 ? Uint16Array : Uint32Array);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const phase = new THREE.InstancedBufferAttribute(new Float32Array(DETAILED), 1);
  phase.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPhase', phase);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFrames = { value: frames };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2D uFrames;
attribute float aPhase;`)
      .replace('#include <begin_vertex>', `float fr = fract(aPhase) * ${M.frames}.0;
int f0 = int(fr);
int f1 = (f0 + 1) % ${M.frames};
vec3 transformed = mix(texelFetch(uFrames, ivec2(gl_VertexID, f0), 0).xyz,
  texelFetch(uFrames, ivec2(gl_VertexID, f1), 0).xyz, fract(fr));`);
  };
  return instanced(geometry, material, DETAILED);
}

// A few pixels tall at the distances it is used, so a tapered body and a head are enough.
function farFigureMesh() {
  const body = new THREE.CylinderGeometry(0.16, 0.2, 1.42, 5, 1).rotateX(Math.PI / 2).translate(0, 0, 0.71);
  const head = new THREE.IcosahedronGeometry(0.13, 0).translate(0, 0, 1.58).toNonIndexed();
  const geometry = new THREE.BufferGeometry();
  const a = body.toNonIndexed().attributes.position.array, b = head.attributes.position.array;
  const pos = new Float32Array(a.length + b.length);
  pos.set(a); pos.set(b, a.length);
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return instanced(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), MAX_PEOPLE - DETAILED);
}

// A procedural city has no OSM tile, so walkers and cars on its street grid use a local frame
// shaped like a tile's: metres east (x), north (y) and up (z) around the city centre.
const cityFrames = new Map();
export function cityFrame(city) {
  let frame = cityFrames.get(city.name);
  if (frame) return frame;
  const c = ll2v(city.lat, city.lon);
  const up = c.clone().normalize();
  const east = new THREE.Vector3(Math.cos(city.lon * DEG), 0, -Math.sin(city.lon * DEG));
  const north = new THREE.Vector3().crossVectors(up, east);
  const matrix = new THREE.Matrix4().makeBasis(east, north, up)
    .scale(new THREE.Vector3(1 / R_M, 1 / R_M, 1 / R_M)).setPosition(c);
  frame = { obj: { matrix }, cLat: city.lat, cLon: city.lon };
  cityFrames.set(city.name, frame);
  return frame;
}

function instanced(geometry, material, capacity) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

// Candidate paths are generated once per loaded tile. People occupy sidewalks beside usable
// streets, rather than random points that could land inside buildings or water. Each usable
// stretch of sidewalk carries a small crowd whose size follows how built-up the tile is.
export function pedestrianPaths(tile) {
  const road = tile.rPos, rank = tile.rRank;
  const paths = [];
  const limit = Math.min(PER_TILE, Math.floor((tile.buildings ?? 0) * 1.5));
  if (!limit) return paths;
  const random = rng(tile.key);
  const crowd = Math.min(6, 1 + (tile.buildings ?? 0) / 150);
  for (let i = 0; i < rank.length && paths.length < limit; i++) {
    if (rank[i] < 2 || rank[i] > 8) continue; // rail, transit and major highways
    const o = i * 6;
    const ax = road[o], ay = road[o + 1], bx = road[o + 3], by = road[o + 4];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 8 || len > 400) continue;
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    const walkers = Math.round(crowd * Math.min(3, len / 40) * (0.5 + random()));
    // Sidewalks sit outside the traffic lanes (see streetTraffic.js), so wider roads push them out.
    const kerb = rank[i] >= 7 ? 7.5 : rank[i] >= 4 ? 4.5 : 2;
    for (let w = 0; w < walkers && paths.length < limit; w++) {
      const side = (random() < 0.5 ? -1 : 1) * (kerb + random() * 2);
      const x0 = ax + nx * side, y0 = ay + ny * side;
      const x1 = bx + nx * side, y1 = by + ny * side;
      const midX = (x0 + x1) * 0.5, midY = (y0 + y1) * 0.5;
      if (buildingAt(tile, midX, midY, 1.5) >= 0 || inWater(tile, midX, midY)) continue;
      paths.push({ tile, x0, y0, x1, y1, mx: midX, my: midY, len, phase: random() * 2, speed: 1.1 + random() * 0.4,
        yaw: Math.atan2(y1 - y0, x1 - x0), grey: GREYS[Math.floor(random() * GREYS.length)] });
    }
  }
  return paths;
}

export class Civilians {
  constructor(scene, osm, cityLayer = null) {
    this.osm = osm;
    this.cityLayer = cityLayer;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.selected = [];
    this.lastPick = -Infinity;
    this.lastDraw = -Infinity;
    this.lastVersion = -1;
    this.pickLat = NaN;
    this.pickLon = NaN;
    this.mesh = civilianMesh();
    this.far = farFigureMesh();
    this.group.add(this.mesh, this.far);
    this.dummy = new THREE.Object3D();
    this.matrix = new THREE.Matrix4();
    this.color = new THREE.Color();
  }

  _fallback(cam, candidates, radius) {
    const layer = this.cityLayer;
    if (!layer?.group.visible) return;
    const city = layer.nearest(cam.lat, cam.lon, 35);
    const grid = city && layer.built.get(city.name)?.pedestrianGrid;
    if (!grid) return;
    const cosLat = Math.cos(city.lat * DEG);
    const cx = (cam.lon - city.lon) * 111195 * cosLat;
    const cy = (cam.lat - city.lat) * 111195;
    if (Math.hypot(cx, cy) > grid.radiusM) return;
    const a = grid.angle, ca = Math.cos(a), sa = Math.sin(a);
    const cu = cx * ca + cy * sa, cv = -cx * sa + cy * ca;
    const tile = cityFrame(city);
    const seed = hashString(city.name);
    const radius2 = radius * radius;
    const add = (u0, v0, u1, v1, key) => {
      const mx = (u0 + u1) / 2, my = (v0 + v1) / 2;
      const x = mx * ca - my * sa, y = mx * sa + my * ca;
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > radius2 || x * x + y * y > grid.radiusM ** 2) return;
      const lat = city.lat + y / 111195, lon = city.lon + x / (111195 * cosLat);
      const ground = this.osm.probe?.(lat, lon);
      if (ground?.loaded && (ground.building || ground.water)) return;
      const random = rng(seed ^ key);
      const x0 = u0 * ca - v0 * sa, y0 = u0 * sa + v0 * ca;
      const x1 = u1 * ca - v1 * sa, y1 = u1 * sa + v1 * ca;
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      const nx = -dy / len, ny = dx / len;
      for (let w = 2 + Math.floor(random() * 4); w > 0; w--) {
        const side = (random() < 0.5 ? -1 : 1) * (4.5 + random() * 2); // cars keep to 2.5 m
        const path = { tile, x0: x0 + nx * side, y0: y0 + ny * side,
          x1: x1 + nx * side, y1: y1 + ny * side, len, phase: random() * 2,
          speed: 1.1 + random() * 0.4, yaw: Math.atan2(dy, dx),
          grey: GREYS[Math.floor(random() * GREYS.length)] };
        candidates.push({ path, d2 });
      }
    };
    const spacing = grid.spacingM;
    const step = 90;
    const uMin = Math.floor((cu - radius) / step), uMax = Math.ceil((cu + radius) / step);
    const vMin = Math.floor((cv - radius) / spacing), vMax = Math.ceil((cv + radius) / spacing);
    for (let v = vMin; v <= vMax; v++) for (let u = uMin; u <= uMax; u++) {
      const key = Math.imul(u, 73856093) ^ Math.imul(v, 19349663);
      add(u * step, v * spacing, u * step + 45, v * spacing, key);
    }
    const uLineMin = Math.floor((cu - radius) / spacing), uLineMax = Math.ceil((cu + radius) / spacing);
    const vStepMin = Math.floor((cv - radius) / step), vStepMax = Math.ceil((cv + radius) / step);
    for (let u = uLineMin; u <= uLineMax; u++) for (let v = vStepMin; v <= vStepMax; v++) {
      const key = Math.imul(u, 83492791) ^ Math.imul(v, 2654435761);
      add(u * spacing, v * step, u * spacing, v * step + 45, key);
    }
  }

  _pick(cam, now) {
    if (now - this.lastPick < 0.2 && this.lastVersion === this.osm.version &&
        Math.abs(cam.lat - this.pickLat) < 0.00003 && Math.abs(cam.lon - this.pickLon) < 0.00003) return;
    this.lastPick = now;
    this.lastVersion = this.osm.version;
    this.pickLat = cam.lat;
    this.pickLon = cam.lon;
    const radius = Math.min(2.2, 0.55 + cam.dist * EARTH_KM * 0.8) * 1000;
    const cos = Math.max(0.1, Math.cos(cam.lat * DEG));
    const candidates = [];
    for (const tile of this.osm.tiles.values()) {
      if (!tile.obj?.visible || !tile.ix) continue;
      const tileN = (tile.cLat - cam.lat) * 111195;
      const tileE = (tile.cLon - cam.lon) * 111195 * cos;
      if (Math.hypot(tileN, tileE) > radius + 1600) continue;
      tile.pedestrianPaths ??= pedestrianPaths(tile);
      for (const path of tile.pedestrianPaths) {
        const north = tileN + path.my, east = tileE + path.mx;
        const d2 = north * north + east * east;
        if (d2 < radius * radius) candidates.push({ path, d2 });
      }
    }
    if (candidates.length < 120) this._fallback(cam, candidates, radius);
    candidates.sort((a, b) => a.d2 - b.d2);
    this.selected = candidates.slice(0, MAX_PEOPLE).map((entry) => entry.path);
  }

  update(cam, now) {
    const show = cam.dist < SHOW_BELOW && (this.osm.active || this.cityLayer?.group.visible);
    this.group.visible = show;
    if (!show || now - this.lastDraw < 1 / 24) return;
    this.lastDraw = now;
    this._pick(cam, now);
    const dummy = this.dummy, near = this.mesh, far = this.far;
    const phases = near.geometry.attributes.aPhase.array;
    let n = 0;
    for (const p of this.selected) {
      const travel = (now * p.speed / p.len + p.phase) % 2;
      const t = travel <= 1 ? travel : 2 - travel;
      const heading = p.yaw + (travel <= 1 ? 0 : Math.PI);
      dummy.position.set(p.x0 + (p.x1 - p.x0) * t, p.y0 + (p.y1 - p.y0) * t, 0.1);
      dummy.rotation.set(0, 0, heading);
      dummy.updateMatrix();
      this.matrix.multiplyMatrices(p.tile.obj.matrix, dummy.matrix);
      this.color.setRGB(p.grey, p.grey, p.grey);
      const mesh = n < DETAILED ? near : far, i = n < DETAILED ? n : n - DETAILED;
      mesh.setMatrixAt(i, this.matrix);
      mesh.setColorAt(i, this.color);
      if (mesh === near) phases[i] = now * p.speed / STRIDE_M + p.phase * 7.3;
      n++;
    }
    near.count = Math.min(n, DETAILED);
    far.count = Math.max(0, n - DETAILED);
    for (const mesh of [near, far]) {
      mesh.instanceMatrix.needsUpdate = mesh.count > 0;
      mesh.instanceColor.needsUpdate = mesh.count > 0;
    }
    near.geometry.attributes.aPhase.needsUpdate = near.count > 0;
  }

  get count() { return this.mesh.count + this.far.count; }
}
