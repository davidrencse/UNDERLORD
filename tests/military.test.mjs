import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traceFront, spread, paramAlong, setBack, lineKm, contactPixels, windowAround } from '../src/game/fronts.js';
import { computeSupply, reach, hubCap, routeCut, SUPPLY } from '../src/game/supply.js';
import { haversine } from '../src/util/geo.js';

// A small equirectangular raster: 360 × 180, one pixel per degree.
const W = 360, H = 180;
const px = (lat, lon) => Math.min(H - 1, Math.floor(90 - lat)) * W + Math.min(W - 1, Math.floor(lon + 180));
const lut = (...ids) => { const t = new Uint8Array(256); for (const i of ids) t[i] = 1; return t; };

// Nation 1 holds lon < 10 and nation 2 lon >= 10, for latitudes 40-60; the rest is sea.
function splitRaster(border = 10) {
  const c = new Uint8Array(W * H);
  for (let lat = 40; lat < 60; lat++) for (let lon = -10; lon < 30; lon++) c[px(lat + 0.5, lon + 0.5)] = lon < border ? 1 : 2;
  return c;
}

test('a straight border becomes one front line on our side, facing the enemy', () => {
  const control = splitRaster();
  const segs = traceFront(control, W, H, { lat: 50, lon: 9 }, lut(1), lut(2), { dLat: 15, minKm: 50 });
  assert.equal(segs.length, 1);
  const pts = segs[0];
  for (const p of pts) assert.ok(p.lon > 8.5 && p.lon < 10, `vertex at lon ${p.lon} should sit on the last column before the border`);
  // Facing east (bearing ~90°) away from the ends, where the coast skews the estimate.
  for (const p of pts.slice(1, -1)) assert.ok(Math.abs(p.out - 90) < 30, `front faces ${p.out}°`);
  assert.ok(lineKm(pts) > 1500, 'the line runs the length of the border');
});

test('no contact, no front', () => {
  const control = splitRaster();
  assert.deepEqual(traceFront(control, W, H, { lat: 50, lon: 9 }, lut(1), lut(3)), []);
  const win = windowAround({ lat: 50, lon: 9 }, 15, W, H);
  assert.equal(contactPixels(control, W, H, win, lut(1), lut(3)).length, 0);
});

test('slots spread evenly along a line and formations keep their order along it', () => {
  const line = [{ lat: 50, lon: 0 }, { lat: 50, lon: 10 }];
  const slots = spread([line], 5);
  assert.equal(slots.length, 5);
  const gaps = slots.slice(1).map((s, i) => haversine(slots[i], s));
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1, 'equal spacing');
  assert.ok(paramAlong([line], { lat: 50.2, lon: 1 }) < paramAlong([line], { lat: 49.8, lon: 8 }));
  // Set back moves away from the side the slot faces.
  const back = setBack({ lat: 50, lon: 5, out: 0 }, 10);
  assert.ok(back.lat < 50 && Math.abs(haversine(back, { lat: 50, lon: 5 }) - 10) < 0.5);
});

test('supply falls off with distance from the hub', () => {
  assert.equal(reach(0), 1);
  assert.equal(reach(SUPPLY.fullKm), 1);
  assert.ok(reach((SUPPLY.fullKm + SUPPLY.zeroKm) / 2) > 0.4 && reach((SUPPLY.fullKm + SUPPLY.zeroKm) / 2) < 0.6);
  assert.equal(reach(SUPPLY.zeroKm + 1), 0);
});

test('a hub shares its throughput, and a cut route starves the pocket', () => {
  const control = splitRaster();
  const hub = { id: 1, lat: 50.5, lon: 0.5, cap: 4, ctrl: 1, damagedUntil: 0, readyAt: 0, load: 0 };
  const near = Array.from({ length: 8 }, (_, i) => ({ owner: 1, divs: 1, lat: 50.5 + (i % 3) * 0.2, lon: 1 + i * 0.1, supply: 1, hub: 0 }));
  const opts = { time: 0, control, pixelOf: px, usable: () => [hub], isEnemyOf: () => (c) => c === 2 };
  computeSupply(near, [hub], opts);
  for (const s of near) assert.ok(Math.abs(s.supply - 0.5) < 1e-9, '8 divisions on a hub of 4 get half supply each');
  assert.equal(hub.load, 8);

  // A division on the far side of enemy ground: the route home runs through it.
  const pocket = [{ owner: 1, divs: 1, lat: 50.5, lon: 15.5, supply: 1, hub: 0 }];
  assert.ok(routeCut(pocket[0], hub, control, px, (c) => c === 2));
  computeSupply(pocket, [hub], opts);
  assert.ok(pocket[0].supply <= SUPPLY.cutFactor + 1e-9, `cut off division gets ${pocket[0].supply}`);
});

test('captured and unfinished hubs work at reduced capacity', () => {
  const h = { cap: 10, readyAt: 0, damagedUntil: 100 };
  assert.equal(hubCap(h, 50), 5);
  assert.equal(hubCap(h, 150), 10);
  assert.equal(hubCap({ cap: 10, readyAt: 200, damagedUntil: 0 }, 150), 0);
});

test('on the real 2025 map both sides start dug in along the Ukrainian front', async () => {
  globalThis.fetch = async (url) => ({ json: async () => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url))) });
  const { loadWorld } = await import('../src/world/geo.js');
  const { Game } = await import('../src/game/game.js');
  const { Units } = await import('../src/game/units.js');
  const world = await loadWorld();
  const game = new Game(world);
  const units = new Units(game, world);
  const A = units.armies;
  for (const iso of ['UKR', 'RUS']) {
    const n = world.byIso.get(iso);
    const [army] = A.of(n.index);
    assert.ok(army?.front?.segs.length, `${iso} has a front`);
    const members = A.members(army);
    assert.ok(members.length > 40, `${iso} fields ${members.length} divisions on it`);
    const pts = army.front.segs.flat();
    const onLine = members.filter((s) => pts.some((p) => haversine(p, s) < 40)).length;
    assert.ok(onLine / members.length > 0.9, `${iso}: ${onLine}/${members.length} within 40 km of the line`);
    assert.ok(members.every((s) => s.dig > 0), 'already entrenched');
  }
  // Every land formation carries a division number and NATO-style name.
  const ukr = world.byIso.get('UKR').index;
  assert.ok(units.stacks.filter((s) => s.owner === ukr && s.kit).every((s) => s.num > 0 && /(Division|Corps)$/.test(s.name)));

  // Training: costs manpower, respects the lines, and deploys into the army.
  const n = game.nations[ukr];
  const [army] = A.of(ukr);
  const mp = n.manpower;
  assert.equal(A.train(ukr, 'inf', army.id), null);
  assert.equal(n.manpower, mp - 12);
  const before = army.ids.size;
  game.time = A.queue[0].ready;
  A.daily();
  assert.equal(A.queue.filter((q) => q.owner === ukr).length, 0);
  assert.equal(army.ids.size, before + 1, 'the new division joined the army');
});
