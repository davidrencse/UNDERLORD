import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Low-poly military models, built in code at real-world dimensions (metres; +z forward, +y up).
// Proportions follow published specs: M1A2 Abrams 9.8 m with gun, 3.7 m wide; T-90M 9.6 m,
// 3.8 m, dome turret with Relikt ERA; Type 99A 11 m, arrow-wedge turret; Bradley/BMP-3 ~6.6 m;
// Stryker/Boxer/BTR-82 ~7.8 m 8×8; M109/2S19 ~9 m with a 7.5 m barrel; HIMARS/BM-30 trucks;
// AH-64/Ka-52 17.7 m with 14.6 m rotor; F-35/Su-35/J-20 15.7–21 m; Arleigh Burke/Type 055 155–180 m;
// Nimitz/Kuznetsov/Shandong 305–333 m; Virginia/Yasen 115–130 m. Vertex colours carry the shading.

const parts = [];
function add(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, shade = 0.75 } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(shade), 3));
  parts.push(g);
}
const box = (w, h, l, o) => add(new THREE.BoxGeometry(w, h, l), o);
const cyl = (r1, r2, len, axis, o, seg = 10) => {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  add(g, o);
};
// Parts are merged and then re-indexed: faces keep their own normals and shades, but each
// shared corner is transformed once instead of once per triangle (2.4-4.7x fewer vertices).
function done() {
  const g = mergeVertices(mergeGeometries(parts.splice(0)));
  g.computeBoundingSphere();
  return g;
}

// Extruded top-view outline (x across, f forward) rising from y0 by `height`.
function plan(points, height, o) {
  const s = new THREE.Shape(points.map(([x, f]) => new THREE.Vector2(x, -f)));
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  add(g, o);
}
// Flat wing or fin outline in the x/z plane.
function wing(points, thick, o) { plan(points, thick, o); }

// A road wheel's inner face lies inside the track block, where it can never be seen, so only
// the tyre and the outer face are kept.
function roadWheel(side, o) {
  const g = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 8);
  g.rotateZ(Math.PI / 2); // the top cap (group 1) now faces -x, the bottom cap (group 2) +x
  const drop = g.groups[side > 0 ? 1 : 2];
  const idx = Array.from(g.index.array);
  idx.splice(drop.start, drop.count);
  g.setIndex(idx);
  g.clearGroups();
  add(g, o);
}
function tracks(len, gap, h = 0.95) {
  for (const s of [-1, 1]) {
    box(0.66, h, len, { x: s * gap, y: h / 2, shade: 0.28 });
    for (let k = 0; k < 6; k++) roadWheel(s, { x: s * (gap + 0.34), y: 0.42, z: -len / 2 + 0.7 + (k * (len - 1.4)) / 5, shade: 0.4 });
  }
}
function wheels(zs, gap, r = 0.55) {
  for (const s of [-1, 1]) for (const z of zs) cyl(r, r, 0.42, 'x', { x: s * gap, y: r, z, shade: 0.25 }, 10);
}

const builders = {
  mbt_west() { // M1A2 Abrams / Leopard 2 / Challenger
    tracks(7.9, 1.5);
    box(3.0, 0.75, 7.3, { y: 1.25, z: -0.15, shade: 0.7 });
    box(3.66, 0.08, 7.7, { y: 1.0, shade: 0.55 });
    box(3.0, 0.55, 1.5, { y: 1.18, z: 3.55, rx: 0.62, shade: 0.66 });
    box(3.4, 0.82, 3.7, { y: 2.03, z: -0.4, shade: 0.9 });
    box(3.0, 0.78, 1.3, { y: 2.0, z: 1.75, rx: -0.12, shade: 0.94 });
    box(2.8, 0.68, 1.4, { y: 2.0, z: -2.85, shade: 0.8 });
    box(0.62, 0.38, 0.62, { x: 0.85, y: 2.62, z: -0.7, shade: 0.75 });
    box(0.9, 0.62, 0.55, { y: 2.05, z: 2.45, shade: 0.62 });
    cyl(0.08, 0.1, 5.1, 'z', { y: 2.06, z: 5.1, shade: 0.5 });
    return done();
  },
  mbt_east() { // T-90M / T-72B3
    tracks(6.9, 1.55, 0.9);
    box(3.1, 0.68, 6.6, { y: 1.1, shade: 0.68 });
    box(3.78, 0.07, 6.8, { y: 0.92, shade: 0.52 });
    box(3.1, 0.5, 1.4, { y: 1.05, z: 3.25, rx: 0.72, shade: 0.64 });
    const dome = new THREE.SphereGeometry(1.55, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    add(dome, { y: 1.42, z: -0.25, sy: 0.55, sz: 1.15, shade: 0.9 });
    for (const s of [-1, 1]) box(0.95, 0.34, 0.55, { x: s * 0.82, y: 1.78, z: 1.0, ry: -s * 0.42, shade: 0.78 });
    box(0.5, 0.3, 0.5, { x: -0.6, y: 2.25, z: -0.5, shade: 0.7 });
    cyl(0.07, 0.09, 5.0, 'z', { y: 1.78, z: 3.6, shade: 0.5 });
    for (const s of [-1, 1]) cyl(0.3, 0.3, 1.1, 'x', { x: s * 0.6, y: 1.45, z: -3.45, shade: 0.45 });
    return done();
  },
  mbt_china() { // Type 99A / VT-4
    tracks(7.6, 1.5);
    box(3.3, 0.76, 7.2, { y: 1.22, shade: 0.7 });
    box(3.5, 0.07, 7.5, { y: 0.98, shade: 0.52 });
    box(3.3, 0.55, 1.5, { y: 1.15, z: 3.45, rx: 0.65, shade: 0.66 });
    box(3.3, 0.76, 3.3, { y: 1.97, z: -0.5, shade: 0.9 });
    for (const s of [-1, 1]) box(1.85, 0.72, 0.62, { x: s * 0.72, y: 1.96, z: 1.45, ry: -s * 0.55, shade: 0.94 });
    box(2.7, 0.62, 1.2, { y: 1.95, z: -2.7, shade: 0.8 });
    cyl(0.08, 0.1, 5.6, 'z', { y: 2.0, z: 4.6, shade: 0.5 });
    return done();
  },
  ifv() { // M2 Bradley / BMP-3 / ZBD-04
    tracks(6.4, 1.4, 0.9);
    box(3.1, 1.4, 6.0, { y: 1.45, z: -0.15, shade: 0.72 });
    box(3.1, 0.8, 1.1, { y: 1.65, z: 3.0, rx: 0.95, shade: 0.68 });
    box(1.7, 0.62, 1.7, { x: 0.25, y: 2.46, z: 0.3, shade: 0.88 });
    cyl(0.05, 0.06, 2.6, 'z', { x: 0.25, y: 2.5, z: 2.4, shade: 0.45 });
    box(0.7, 0.45, 0.4, { x: -0.6, y: 2.4, z: 0.3, shade: 0.6 });
    return done();
  },
  apc() { // Stryker / Boxer / BTR-82A
    box(2.9, 1.7, 7.2, { y: 1.75, shade: 0.74 });
    box(2.9, 0.9, 1.1, { y: 1.85, z: 3.75, rx: 0.85, shade: 0.7 });
    box(0.7, 0.42, 0.9, { y: 2.82, z: 0.6, shade: 0.86 });
    cyl(0.04, 0.04, 1.6, 'z', { y: 2.88, z: 1.6, shade: 0.45 });
    wheels([-2.7, -1.3, 1.3, 2.7], 1.32, 0.6);
    return done();
  },
  spg() { // M109A7 / 2S19 Msta-S / PLZ-05
    tracks(7.0, 1.5);
    box(3.2, 0.9, 6.8, { y: 1.3, shade: 0.7 });
    box(3.2, 1.6, 4.6, { y: 2.55, z: -0.9, shade: 0.88 });
    box(1.0, 0.7, 0.6, { y: 2.6, z: 1.6, shade: 0.65 });
    cyl(0.11, 0.13, 7.4, 'z', { y: 2.7, z: 5.0, rx: -0.08, shade: 0.5 });
    return done();
  },
  mlrs() { // M142 HIMARS / BM-30 Smerch / PHL-16
    box(2.5, 2.2, 2.1, { y: 1.95, z: 2.75, shade: 0.76 });
    box(2.4, 0.5, 7.0, { y: 1.1, shade: 0.4 });
    box(2.3, 1.15, 4.2, { y: 2.35, z: -1.2, rx: -0.32, shade: 0.88 });
    wheels([-2.6, -1.2, 2.6], 1.12, 0.6);
    return done();
  },
  truck() { // M1083 FMTV / KamAZ / Ural
    box(2.5, 2.2, 2.0, { y: 1.9, z: 2.8, shade: 0.72 });
    box(2.5, 2.4, 5.0, { y: 2.15, z: -0.9, shade: 0.62 });
    box(2.3, 0.45, 7.4, { y: 0.95, z: 0.1, shade: 0.35 });
    wheels([-2.5, -1.2, 2.7], 1.1, 0.55);
    return done();
  },
  soldier() { // Rifleman with plate carrier and pack
    for (const s of [-1, 1]) box(0.18, 0.86, 0.22, { x: s * 0.12, y: 0.43, shade: 0.42 });
    box(0.5, 0.66, 0.32, { y: 1.2, shade: 0.7 });
    box(0.38, 0.46, 0.22, { y: 1.25, z: -0.25, shade: 0.52 });
    add(new THREE.SphereGeometry(0.15, 8, 6), { y: 1.7, shade: 0.6 });
    box(0.07, 0.08, 0.95, { x: 0.24, y: 1.28, z: 0.32, rx: 0.15, shade: 0.3 });
    for (const s of [-1, 1]) box(0.13, 0.55, 0.14, { x: s * 0.3, y: 1.18, z: 0.12, rx: -0.6, shade: 0.6 });
    return done();
  },
  heli() { // AH-64 Apache / Ka-52 / Z-10
    box(1.1, 1.5, 6.5, { y: 2.0, z: 0.9, shade: 0.74 });
    cyl(0.1, 0.6, 1.8, 'z', { y: 1.9, z: 5.0, shade: 0.72 });
    cyl(0.25, 0.48, 7.2, 'z', { y: 2.35, z: -5.0, shade: 0.68 });
    box(0.14, 2.1, 1.3, { y: 3.3, z: -8.5, rx: -0.2, shade: 0.68 });
    box(2.6, 0.1, 0.9, { y: 2.4, z: -8.4, shade: 0.6 });
    box(4.6, 0.14, 1.0, { y: 1.85, z: 0.6, shade: 0.62 });
    for (const s of [-1, 1]) box(0.7, 0.7, 2.2, { x: s * 0.82, y: 2.85, z: 0.1, shade: 0.66 });
    for (const s of [-1, 1]) cyl(0.18, 0.18, 1.4, 'z', { x: s * 2.1, y: 1.6, z: 0.6, shade: 0.4 });
    cyl(0.15, 0.15, 0.9, 'y', { y: 3.3, z: 0.4, shade: 0.45 });
    box(0.25, 0.7, 0.25, { y: 0.55, z: 2.8, shade: 0.4 });
    return done();
  },
  rotor() {
    box(14.6, 0.08, 0.55, { y: 3.75, shade: 0.42 });
    box(0.55, 0.08, 14.6, { y: 3.75, shade: 0.42 });
    return done();
  },
  jet() { // F-35A / Su-35 / J-20 — delta-wing fighter at cruise attitude
    cyl(0.95, 0.85, 11.5, 'z', { shade: 0.8 }, 10);
    add(new THREE.ConeGeometry(0.85, 3.4, 10).rotateX(Math.PI / 2), { z: 7.4, shade: 0.82 });
    cyl(0.75, 0.8, 0.7, 'z', { z: -6.1, shade: 0.4 }, 10);
    wing([[0, 3.4], [5.4, -2.2], [5.4, -3.3], [0, -3.6]], 0.2, { y: -0.1, shade: 0.72 });
    wing([[0, 3.4], [-5.4, -2.2], [-5.4, -3.3], [0, -3.6]], 0.2, { y: -0.1, shade: 0.72 });
    wing([[0.4, -3.8], [2.8, -6.0], [2.8, -6.7], [0.4, -6.4]], 0.15, { shade: 0.68 });
    wing([[-0.4, -3.8], [-2.8, -6.0], [-2.8, -6.7], [-0.4, -6.4]], 0.15, { shade: 0.68 });
    for (const s of [-1, 1]) box(0.14, 2.3, 2.0, { x: s * 1.0, y: 1.2, z: -4.9, rz: s * 0.4, rx: -0.3, shade: 0.7 });
    box(0.7, 0.45, 2.2, { y: 0.85, z: 3.2, shade: 0.35 });
    return done();
  },
  destroyer() { // Arleigh Burke / Type 055 / Admiral Gorshkov
    plan([[-10, -76], [10, -76], [10.5, 30], [0, 78], [-10.5, 30]], 9, { y: -3, shade: 0.62 });
    plan([[-9.5, -74], [9.5, -74], [9.8, 28], [0, 74], [-9.8, 28]], 0.3, { y: 6, shade: 0.5 });
    box(14, 9, 26, { y: 10.5, z: 12, shade: 0.86 });
    box(10, 6, 22, { y: 9, z: -22, shade: 0.8 });
    box(7, 8, 10, { y: 18, z: 14, shade: 0.9 });
    cyl(0.6, 0.9, 20, 'y', { y: 28, z: 6, shade: 0.7 });
    box(6, 4, 7, { y: 15, z: -18, shade: 0.75 });
    box(3, 1.6, 4, { y: 8, z: 50, shade: 0.8 });
    cyl(0.25, 0.3, 7, 'z', { y: 8.4, z: 55, shade: 0.5 });
    box(13, 0.6, 15, { y: 7.1, z: 34, shade: 0.55 });
    return done();
  },
  carrier() { // Nimitz / Ford / Shandong
    plan([[-20, -150], [20, -150], [21, 110], [0, 160], [-21, 110]], 18, { y: -10, shade: 0.55 });
    plan([[-34, -166], [26, -166], [40, -20], [40, 120], [10, 166], [-20, 166], [-38, 60], [-38, -120]], 2.5, { y: 18, shade: 0.7 });
    box(8, 20, 34, { x: 30, y: 30, z: -18, shade: 0.88 });
    box(6, 8, 12, { x: 30, y: 44, z: -16, shade: 0.8 });
    cyl(0.6, 0.8, 16, 'y', { x: 30, y: 56, z: -14, shade: 0.6 });
    box(1, 0.2, 230, { x: -6, y: 20.65, z: -10, ry: -0.16, shade: 0.95 });
    box(1, 0.2, 140, { x: 4, y: 20.65, z: 70, shade: 0.95 });
    return done();
  },
  submarine() { // Virginia / Yasen / Type 093
    add(new THREE.CapsuleGeometry(5.2, 100, 6, 12).rotateX(Math.PI / 2), { y: -1.5, shade: 0.42 });
    box(3, 7.5, 13, { y: 6, z: 28, shade: 0.5 });
    for (const s of [-1, 1]) box(5, 0.4, 2.5, { x: s * 3.5, y: 6.5, z: 28, shade: 0.45 });
    box(0.4, 6, 4, { y: 2.5, z: -54, shade: 0.4 });
    return done();
  },
};

export const MODEL_KINDS = Object.keys(builders);
// Built once and shared: the army and the wreck layer draw the same geometry, so it is only
// uploaded to the GPU once. Callers must treat the geometries as read-only.
let models = null;
export function buildModels() {
  if (models) return models;
  models = {};
  for (const k of MODEL_KINDS) models[k] = builders[k]();
  return models;
}

// Distant stand-ins: a hull block and a superstructure block sized to each model's bounds,
// 24 triangles instead of several hundred.
export function buildProxies(geos) {
  const out = {};
  for (const [k, g] of Object.entries(geos)) {
    g.computeBoundingBox();
    const b = g.boundingBox, w = b.max.x - b.min.x, h = b.max.y - b.min.y, l = b.max.z - b.min.z;
    const cz = (b.max.z + b.min.z) / 2;
    box(w * 0.92, h * 0.55, l * 0.9, { y: b.min.y + h * 0.275, z: cz, shade: 0.62 });
    box(w * 0.6, h * 0.45, l * 0.45, { y: b.min.y + h * 0.775, z: cz - l * 0.08, shade: 0.88 });
    out[k] = done();
  }
  return out;
}

// Real lengths, used for formation spacing.
export const LENGTH = { mbt_west: 9.8, mbt_east: 9.6, mbt_china: 11, ifv: 6.6, apc: 7.8, spg: 9.5, mlrs: 7.5, truck: 7.5, soldier: 1.2, heli: 17.7, jet: 18, destroyer: 155, carrier: 333, submarine: 115 };

const EAST = new Set(['RUS', 'BLR', 'UKR', 'KAZ', 'KGZ', 'TJK', 'UZB', 'TKM', 'ARM', 'AZE', 'GEO', 'IND', 'IRN', 'IRQ', 'SYR', 'PRK', 'VNM', 'LAO', 'DZA', 'LBY', 'CUB', 'VEN', 'NIC', 'ETH', 'ERI', 'SRB', 'MNG', 'AFG', 'YEM', 'SDN', 'AGO', 'MOZ', 'UGA']);
const CHINA = new Set(['CHN', 'PAK', 'BGD', 'MMR', 'THA', 'KHM', 'NGA', 'TZA', 'ZWE', 'NAM', 'SLK', 'LKA', 'NPL']);
export const doctrine = (iso3) => (CHINA.has(iso3) ? 'china' : EAST.has(iso3) ? 'east' : 'west');

// Representative in-service equipment by nation, for the unit card.
const KIT = {
  USA: ['M1A2 SEPv3 Abrams', 'M2A4 Bradley', 'M109A7 Paladin', 'M142 HIMARS', 'AH-64E Apache', 'F-35A / F-16C', 'Arleigh Burke-class', 'Nimitz / Ford-class', 'Virginia-class'],
  RUS: ['T-90M / T-72B3M', 'BMP-3 / BMP-2M', '2S19M2 Msta-S', 'BM-30 Smerch / Tornado-S', 'Ka-52 Alligator', 'Su-35S / Su-34', 'Admiral Gorshkov-class', 'Admiral Kuznetsov', 'Yasen-M-class'],
  CHN: ['Type 99A / Type 96B', 'ZBD-04A', 'PLZ-05', 'PHL-16', 'Z-10', 'J-20 / J-16', 'Type 055 / Type 052D', 'Shandong / Fujian', 'Type 093B'],
  DEU: ['Leopard 2A7V', 'Puma', 'PzH 2000', 'MARS II', 'Tiger UHT', 'Eurofighter Typhoon', 'F125 Baden-Württemberg-class', null, 'Type 212A'],
  GBR: ['Challenger 2 / 3', 'Warrior / Ajax', 'AS-90 / Archer', 'M270A2 MLRS', 'AH-64E Apache', 'F-35B / Typhoon', 'Type 45 Daring-class', 'Queen Elizabeth-class', 'Astute-class'],
  FRA: ['Leclerc XLR', 'VBCI', 'CAESAR', 'LRU', 'Tigre HAD', 'Rafale', 'FREMM / Horizon', 'Charles de Gaulle', 'Suffren-class'],
  UKR: ['T-64BV / Leopard 2A4', 'BMP-2 / M2A2 Bradley', 'PzH 2000 / 2S1', 'M142 HIMARS', 'Mi-24', 'F-16AM / MiG-29', null, null, null],
  IND: ['T-90S Bhishma / Arjun', 'BMP-2 Sarath', 'K9 Vajra', 'Pinaka', 'AH-64E / LCH Prachand', 'Su-30MKI / Rafale', 'Visakhapatnam-class', 'INS Vikrant', 'Kalvari-class'],
  TUR: ['Leopard 2A4 / M60T', 'ACV-15 / Kaplan', 'T-155 Fırtına', 'T-122 Sakarya', 'T129 ATAK', 'F-16C', 'TCG Istanbul-class', 'TCG Anadolu (LHD)', 'Reis-class'],
  ISR: ['Merkava Mk 4', 'Namer / Eitan', 'M109 Doher', 'PULS', 'AH-64D', 'F-35I / F-15I', "Sa'ar 6-class", null, 'Dolphin-class'],
  POL: ['K2 / M1A2 / Leopard 2PL', 'Rosomak / Borsuk', 'Krab / K9', 'HIMARS / Chunmoo', 'AH-64E', 'F-35A / F-16', 'Miecznik-class', null, 'Kobben-class'],
  JPN: ['Type 10', 'Type 89', 'Type 99 SPH', 'M270', 'AH-64D', 'F-35A / F-15J', 'Maya-class', 'Izumo-class', 'Taigei-class'],
  KOR: ['K2 Black Panther', 'K21', 'K9 Thunder', 'K239 Chunmoo', 'AH-64E', 'KF-21 / F-15K', 'Sejong the Great-class', null, 'Dosan Ahn Changho-class'],
  PRK: ['Chonma-ho / Pokpung-ho', 'VTT-323', 'Koksan', 'KN-25', 'Mi-24', 'MiG-29', 'Najin-class', null, 'Romeo-class'],
  IRN: ['Zulfiqar / T-72S', 'BMP-2', 'Raad-2', 'Fajr-5', 'AH-1J', 'F-14A / MiG-29', 'Moudge-class', null, 'Kilo-class'],
};
const GENERIC = {
  west: ['Leopard 2 / M1 Abrams', 'M113 / CV90', 'M109', 'M270', 'AH-64', 'F-16', 'Frigate', 'Carrier', 'Type 209'],
  east: ['T-72 / T-90', 'BMP-2', '2S1 / 2S3', 'BM-21 Grad', 'Mi-24', 'MiG-29 / Su-30', 'Frigate', 'Carrier', 'Kilo-class'],
  china: ['Type 96 / VT-4', 'Type 86', 'PLZ-45', 'Type 81', 'Z-10', 'J-10 / JF-17', 'Type 054 frigate', 'Carrier', 'Type 039'],
};
export function equipmentNames(iso3) {
  const g = GENERIC[doctrine(iso3)];
  const k = KIT[iso3] ?? g;
  const [mbt, ifv, spg, mlrs, heli, jet, ship, carrier, sub] = k.map((v, i) => v ?? g[i]);
  return { mbt, ifv, spg, mlrs, heli, jet, ship, carrier, sub };
}
