import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Civilians } from '../src/world/civilians.js';
import { SupplyTraffic } from '../src/world/supplyTraffic.js';
import { StreetTraffic, streetLanes } from '../src/world/streetTraffic.js';

test('pedestrians populate loaded streets only at ground zoom', () => {
  const tile = {
    key: 1, cLat: 0, cLon: 0, buildings: 100,
    obj: { visible: true, matrix: new THREE.Matrix4() },
    rPos: Float32Array.from([-30, 0, 0.8, 30, 0, 0.8]), rRank: Uint8Array.from([5]),
    wPos: new Float32Array(), fRing: new Float32Array(), fInfo: new Float32Array(),
    ix: { gx0: 49, gy0: 49, nx: 3, ny: 3, bOff: new Uint32Array(10), bItems: new Uint32Array(),
      wOff: new Uint32Array(10), wItems: new Uint32Array(), bbox: new Float32Array(), destroyed: new Uint8Array() },
  };
  const osm = { active: true, version: 1, tiles: new Map([[1, tile]]) };
  const people = new Civilians(new THREE.Scene(), osm);
  const cam = { lat: 0, lon: 0, dist: 0.01 };
  people.update(cam, 1);
  assert.equal(people.group.visible, false);
  cam.dist = 0.0001;
  people.update(cam, 2);
  assert.equal(people.group.visible, true);
  assert.ok(people.mesh.count > 1, 'a street carries a crowd, not a single walker');
  assert.ok(people.count <= 6000);
});

test('pedestrians remain visible in a city when street tiles are unavailable', () => {
  const city = { name: 'Test City', lat: 0, lon: 0 };
  const cityLayer = { group: { visible: true }, nearest: () => city,
    built: new Map([[city.name, { pedestrianGrid: { angle: 0, spacingM: 400, radiusM: 8000 } }]]) };
  const osm = { active: false, version: 0, tiles: new Map(), probe: () => ({ loaded: false }) };
  const people = new Civilians(new THREE.Scene(), osm, cityLayer);
  people.update({ lat: 0, lon: 0, dist: 0.0001 }, 1);
  assert.ok(people.mesh.count > 0);
  assert.ok(people.count <= 6000);
});

const roadTile = () => ({
  key: 7, cLat: 0, cLon: 0, buildings: 50, obj: { visible: true, matrix: new THREE.Matrix4() },
  // One two-segment residential street (rank 4) and one rail line (rank 0).
  rPos: Float32Array.from([-200, 0, 0.8, 0, 0, 0.8, 0, 0, 0.8, 200, 0, 0.8, -200, 50, 0.8, 200, 50, 0.8]),
  rRank: Uint8Array.from([4, 4, 0]), rLine: Uint32Array.from([1, 1, 2]), ix: {},
});

test('street lanes join a line into one street and skip rail', () => {
  const streets = streetLanes(roadTile());
  assert.equal(streets.length, 1);
  assert.equal(streets[0].len, 400);
  assert.ok(streets[0].cars.some((c) => c.dir > 0) && streets[0].cars.some((c) => c.dir < 0));
});

test('street traffic drives on the right of loaded streets at ground zoom', () => {
  const osm = { active: true, version: 1, tiles: new Map([[7, roadTile()]]) };
  const traffic = new StreetTraffic(new THREE.Scene(), osm);
  traffic.update({ lat: 0, lon: 0, dist: 0.01 }, 1);
  assert.equal(traffic.group.visible, false);
  traffic.update({ lat: 0, lon: 0, dist: 0.0001 }, 2);
  assert.ok(traffic.count > 0);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (const mesh of traffic.meshes) for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    const east = new THREE.Vector3(1, 0, 0).applyQuaternion(q).x > 0;
    assert.ok(Math.abs(Math.abs(p.y) - 1.8) < 1e-6, 'cars sit in a lane beside the centreline');
    assert.equal(p.y < 0, east, 'eastbound traffic keeps to the south (right) side');
  }
});

test('street traffic falls back to a procedural city grid', () => {
  const city = { name: 'Grid City', lat: 0, lon: 0 };
  const cityLayer = { group: { visible: true }, nearest: () => city,
    built: new Map([[city.name, { pedestrianGrid: { angle: 0.3, spacingM: 300, radiusM: 6000 } }]]) };
  const traffic = new StreetTraffic(new THREE.Scene(), { active: false, version: 0, tiles: new Map() }, cityLayer);
  traffic.update({ lat: 0, lon: 0, dist: 0.0001 }, 1);
  assert.ok(traffic.count > 20);
});

test('supply traffic follows assigned hubs near divisions', () => {
  const game = { player: 1 };
  const units = { stacks: [{ id: 4, owner: 1, lat: 0, lon: 0, kit: {}, hub: 1, supply: 1 }],
    armies: { hubs: [{ id: 1, lat: 0, lon: 1 }] } };
  const traffic = new SupplyTraffic(new THREE.Scene(), game, units);
  traffic.update({ lat: 0, lon: 0, dist: 0.002 }, 1);
  assert.equal(traffic.truck.count, 1);
  traffic.update({ lat: 0, lon: 1, dist: 0.002 }, 2);
  assert.equal(traffic.train.count, 1);
});
