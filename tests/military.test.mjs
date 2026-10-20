import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traceFront, spread, paramAlong, setBack, lineKm, contactPixels, windowAround } from '../src/game/fronts.js';
import { computeSupply, reach, hubCap, routeCut, SUPPLY, LEVEL_CAP, fullKm, cityLevel, seedHubs } from '../src/game/supply.js';
import { templateStats, sideProfile, strike, makeTemplate, templateProblem, gridOf, DEFAULT_TEMPLATES, MAX_WIDTH, COLS, ROWS } from '../src/game/templates.js';
import { seedProduction, preferred, buildsOf, draw, drawClass, produceDay, addLine, setFactories, moveLine, switchLine, newLine, optionsFor, assigned, needOf } from '../src/game/production.js';
import { MODELS, MODEL, CLASSES } from '../src/data/equipment.js';
import { INVENTORIES } from '../src/data/inventories.js';
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

test('cities are natural hubs, levelled by population, the capital one higher', () => {
  assert.deepEqual([0.06, 0.5, 1.4, 3, 12.7].map(cityLevel), [1, 2, 2, 3, 5]);
  const nations = [{ index: 1, iso3: 'AAA', name: 'A', capital: { lat: 50, lon: 30 } }];
  const cities = [{ name: 'Big', lat: 50, lon: 30.1, pop: 3, iso3: 'AAA' }, { name: 'Small', lat: 48, lon: 35, pop: 0.2, iso3: 'AAA' }, { name: 'Twin', lat: 50.1, lon: 30.2, pop: 1, iso3: 'AAA' }];
  const hubs = seedHubs(nations, cities, [{ name: 'Port', lat: 46, lon: 31, iso3: 'AAA' }]);
  assert.deepEqual(hubs.map((h) => [h.name, h.level]), [['Big', 4], ['Small', 1], ['Port', 2]], 'capital is Big +1; Twin is inside 40 km and merges');
});

test('supply reach grows with hub level and fades past it', () => {
  for (let l = 1; l <= 5; l++) {
    assert.equal(reach(fullKm(l), l), 1);
    assert.ok(Math.abs(reach(fullKm(l) + SUPPLY.spanKm / 2, l) - 0.5) < 1e-9);
    assert.equal(reach(fullKm(l) + SUPPLY.spanKm + 1, l), 0);
  }
  assert.ok(fullKm(5) > fullKm(1));
});

test('a hub shares its throughput, and a cut route starves the pocket', () => {
  const control = splitRaster();
  const hub = { id: 1, lat: 50.5, lon: 0.5, level: 1, ctrl: 1, damagedUntil: 0, readyAt: 0, load: 0 };
  const near = Array.from({ length: 8 }, (_, i) => ({ owner: 1, divs: 1, lat: 50.5 + (i % 3) * 0.2, lon: 1 + i * 0.1, supply: 1, hub: 0 }));
  const opts = { time: 0, control, pixelOf: px, usable: () => [hub], isEnemyOf: () => (c) => c === 2 };
  computeSupply(near, [hub], opts);
  for (const s of near) assert.ok(Math.abs(s.supply - LEVEL_CAP[1] / 8) < 1e-9, '8 divisions on a level-1 hub (4) get half supply each');
  assert.equal(hub.load, 8);

  const pocket = [{ owner: 1, divs: 1, lat: 50.5, lon: 15.5, supply: 1, hub: 0 }];
  assert.ok(routeCut(pocket[0], hub, control, px, (c) => c === 2));
  computeSupply(pocket, [hub], opts);
  assert.ok(pocket[0].supply <= SUPPLY.cutFactor + 1e-9, `cut off division gets ${pocket[0].supply}`);
  // At peace nothing can be cut.
  hub.level = 5;
  pocket[0].lon = 10.5;
  computeSupply(pocket, [hub], { ...opts, isEnemyOf: () => null });
  assert.ok(pocket[0].supply > SUPPLY.cutFactor);
});

test('captured and unfinished hubs work at reduced capacity', () => {
  const h = { level: 3, readyAt: 0, damagedUntil: 100 };
  assert.equal(hubCap(h, 50), LEVEL_CAP[3] / 2);
  assert.equal(hubCap(h, 150), LEVEL_CAP[3]);
  assert.equal(hubCap({ level: 2, readyAt: 200, damagedUntil: 0 }, 150), 0);
});

test('the combat triangle: piercing beats armour, armour beats soft attack, soft attack beats piercing', () => {
  const side = (cols, sup = []) => sideProfile([{ tpl: { stats: templateStats(gridOf(cols), sup) } }], () => 1);
  const soft = side(DEFAULT_TEMPLATES[0].cols, DEFAULT_TEMPLATES[0].support); // infantry and guns
  const armour = side(DEFAULT_TEMPLATES[2].cols, DEFAULT_TEMPLATES[2].support); // tanks
  const piercing = side([['inf', 'inf'], ['inf', 'inf'], ['at', 'at'], ['at', 'at']]); // anti-tank heavy
  const edge = (x, y) => strike(x, y).value / strike(y, x).value;
  assert.ok(edge(armour, soft) > 1.5, `armour over soft ${edge(armour, soft)}`);
  assert.ok(strike(soft, armour).holds, 'infantry cannot pierce the tanks');
  assert.ok(edge(piercing, armour) > 1.15, `piercing over armour ${edge(piercing, armour)}`);
  assert.ok(!strike(piercing, armour).holds);
  assert.ok(edge(soft, piercing) > 1.5, `soft over piercing ${edge(soft, piercing)}`);
});

test('combined arms: guns need spotting and shells, EW blinds drones', () => {
  const inf = DEFAULT_TEMPLATES[0];
  const enemy = sideProfile([{ tpl: { stats: templateStats(gridOf(inf.cols), []) } }], () => 1);
  const withDrones = sideProfile([{ tpl: { stats: templateStats(gridOf(inf.cols), inf.support) } }], () => 1);
  const blind = sideProfile([{ tpl: { stats: templateStats(gridOf([['inf', 'inf', 'inf'], ['inf', 'inf', 'inf'], ['spa', 'spa'], ['at']]), []) } }], () => 1);
  assert.ok(strike(withDrones, enemy).value > strike(blind, enemy).value * 1.2, 'spotted guns hit harder');
  const dry = { ...withDrones, ammoFill: 0 };
  assert.ok(strike(dry, enemy).value < strike(withDrones, enemy).value * 0.8, 'no shells, quiet guns');
  const jammer = sideProfile([{ tpl: { stats: templateStats(gridOf([['inf', 'inf'], ['ewbn']]), ['ewco', 'counterdrone']) } }], () => 1);
  const r = strike(withDrones, jammer);
  assert.ok(r.spot < withDrones.recon && r.droneEff < 0.6, `EW cuts spotting ${r.spot} and drones ${r.droneEff}`);
});

test('templates sit on a 5×5 grid with a support column and refuse impossible designs', () => {
  const t = makeTemplate('x', 'Test', gridOf([['tank', 'tank', 'bogus'], ['inf', 'inf']]), ['engineers', 'engineers', 'nonsense', 'logistics']);
  assert.equal(t.grid.length, COLS * ROWS);
  assert.deepEqual(t.bats, { tank: 2, inf: 2 });
  assert.deepEqual(t.support, ['engineers', 'logistics'], 'one of each company');
  assert.equal(t.stats.width, 8);
  assert.equal(t.stats.eq.mbt, 88);
  assert.equal(t.stats.type, 'armor');
  assert.ok(t.stats.fx.def > 0 && t.stats.fx.supply < 0, 'engineers and logistics apply');
  assert.equal(templateProblem(Array(25).fill(null)), 'Add at least one battalion.');
  assert.match(templateProblem(gridOf([['spa', 'spa', 'spa', 'spa', 'spa'], ['spa', 'spa', 'spa', 'spa', 'spa'], ['spa', 'spa', 'spa', 'spa']])), new RegExp(`over the ${MAX_WIDTH} limit`));
  // Better equipment raises the battalions that use it.
  const better = templateStats(t.grid, t.support, { mbt: 1.3 });
  assert.ok(better.pierce > t.stats.pierce && better.armor > t.stats.armor);
});

test('every catalog model is well formed', () => {
  for (const m of MODELS) {
    assert.ok(CLASSES[m.cls], `${m.id} has a known class`);
    assert.ok(m.q > 0 && m.cost > 0 && Array.isArray(m.makers) && Array.isArray(m.lic), m.id);
  }
  // Out-of-production models (no makers) are only held, never offered to a line.
  assert.equal(optionsFor({ iso3: 'UKR' }, () => true, Date.parse('2025-01-20')).has('t72'), false);
  for (const c of Object.keys(CLASSES)) assert.ok(MODELS.some((m) => m.cls === c && m.makers.includes('*')), `${c} has a generic pattern`);
});

test('production lines build real models, switch, keep priority, and draw by value', () => {
  const n = { iso3: 'DEU', gdp: 300, defPct: 3 }; // $9bn a year: 3 factories
  const options = optionsFor(n, (iso) => iso === 'USA', 0);
  assert.equal(options.get('leo2a7'), false, 'own design');
  assert.equal(options.get('abrams'), true, 'ally design under licence');
  assert.equal(options.has('t90m'), false);
  assert.equal(options.has('chally3'), false, 'not in production before 2027');
  seedProduction(n, { rifles: 1000, mbt: 10 }, options);
  const P = n.production;
  assert.equal(P.factories, 3);
  assert.equal(assigned(n), 3);
  assert.equal(P.stock.mbt, 5);
  assert.ok(P.quality.mbt >= 1.25, 'rated as Leopards');
  P.lines = [newLine(P, 'leo2a8', 2, 1)];
  assert.equal(setFactories(n, 0, 2), null, 'adds only what is free');
  assert.equal(P.lines[0].factories, 3);
  P.lines[0].factories = 2;
  assert.equal(addLine(n, 'rifle_gen'), null);
  moveLine(n, 1, -1);
  assert.equal(P.lines[0].model, 'rifle_gen');
  const before = P.stock.mbt;
  produceDay(n);
  assert.ok(Math.abs(P.stock.mbt - (before + 2 / 11)) < 1e-9);
  // Switching within the class keeps part of the efficiency; licensed designs cost more.
  assert.equal(switchLine(n, 1, 'abrams'), null);
  assert.ok(P.lines[1].licensed && P.lines[1].cost === 10 * 1.3 && Math.abs(P.lines[1].eff - 0.6) < 1e-9);
  // Losing a factory takes it from the lowest-priority line.
  n.gdp = 200;
  produceDay(n);
  assert.equal(P.factories, 2);
  assert.equal(P.lines[0].model, 'rifle_gen');
  assert.equal(P.lines[1].factories, 1);
  // No rifles left: a draw needing both still gets the tanks' (far larger) share of value.
  P.stock.rifles = 0;
  const have = P.stock.mbt;
  const f = draw(n, { mbt: 1, rifles: 100 });
  assert.ok(f > 0.5 && f < 1, `fill ${f}`);
  assert.equal(P.stock.mbt, have - 1);
  assert.equal(drawClass(n, 'ammo', 10), 0);
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
    assert.ok(members.every((s) => s.dig > 0 && s.tpl), 'entrenched, and on a template');
  }
  const ukr = world.byIso.get('UKR').index;
  assert.ok(units.stacks.filter((s) => s.owner === ukr && s.kit).every((s) => s.num > 0 && /(Division|Corps)$/.test(s.name)));
  // Kyiv is the capital hub at level 4; every Ukrainian city is a hub.
  assert.equal(A.hubs.find((h) => h.name === 'Kyiv')?.level, 4);
  assert.ok(A.hubs.filter((h) => h.owner === ukr).length >= 10);

  // Training a template: manpower now, equipment on deployment, then it joins the army.
  const n = game.nations[ukr];
  const [army] = A.of(ukr);
  const tpl = n.templates[0];
  const mp = n.manpower;
  assert.equal(A.train(ukr, tpl.id, army.id), null);
  assert.equal(n.manpower, mp - Math.ceil(tpl.stats.men / 1000));
  const before = army.ids.size;
  for (const [e, v] of Object.entries(needOf(tpl))) n.production.stock[e] = v;
  game.time = A.queue.find((q) => q.owner === ukr).ready;
  A._trainingDaily();
  assert.equal(A.queue.filter((q) => q.owner === ukr).length, 0);
  assert.equal(army.ids.size, before + 1, 'the new division joined the army');
  const fresh = units.stacks[units.stacks.length - 1];
  assert.equal(fresh.tpl, tpl);
  assert.ok(fresh.str > 0.99, 'fully equipped from the stockpile');
  // Russia builds its own tanks; Ukraine's production picks from what it and its partners make.
  const rus = game.nations[world.byIso.get('RUS').index];
  assert.ok(rus.production.lines.some((l) => l.model === 't90m' || l.model === 't72b3'));
  assert.ok(n.production.options.size > 0 && n.production.lines.length > 0);

  // Building and upgrading hubs cost political power and take time.
  n.pp = 200;
  const spot = units.stacks.find((s) => s.owner === ukr && s.army);
  const site = { lat: spot.lat - 0.4, lon: spot.lon - 0.6 };
  const why = A.buildHub(ukr, site);
  if (!why) {
    const h = A.hubs[A.hubs.length - 1];
    assert.equal(h.level, SUPPLY.buildLevel);
    assert.equal(hubCap(h, game.time), 0, 'not open yet');
  }
  const kyiv = A.hubs.find((h) => h.name === 'Kyiv');
  assert.equal(A.upgradeHub(ukr, kyiv.id), null);
  game.time = kyiv.upgradeAt;
  A._hubsDaily();
  assert.equal(kyiv.level, 5);
  assert.match(A.canUpgradeHub(ukr, kyiv), /highest level/);
});

test('national inventories name real catalog systems and seed real stock and lines', () => {
  const START = Date.parse('2025-01-20');
  for (const iso of ['USA', 'CHN', 'RUS', 'DEU', 'FRA', 'GBR', 'IND', 'TUR', 'UKR', 'POL', 'ISR', 'KOR', 'JPN', 'IRN']) assert.ok(INVENTORIES[iso], `${iso} has an inventory`);
  for (const [iso, inv] of Object.entries(INVENTORIES)) {
    for (const [c, e] of Object.entries(inv)) {
      assert.ok(CLASSES[c], `${iso}.${c} is a class`);
      for (const [id, k] of Object.entries(e.have ?? {})) assert.ok(MODEL[id]?.cls === c && k > 0, `${iso}.${c} holds ${id}`);
      for (const b of e.build ?? []) {
        const id = Array.isArray(b) ? b[0] : b;
        assert.ok(MODEL[id]?.cls === c, `${iso}.${c} builds ${id}`);
        assert.ok(MODEL[id].makers.includes(iso) || MODEL[id].makers.includes('*') || MODEL[id].lic.includes(iso), `${iso} has a way to build ${id}`);
      }
    }
  }
  const seed = (iso, fielded) => {
    const n = { iso3: iso, gdp: 2000, defPct: 2.5 };
    seedProduction(n, fielded, optionsFor(n, () => false, START), INVENTORIES[iso]);
    return n.production;
  };
  const fielded = { mbt: 1000, ifv: 1000, spg: 1000, atgm: 1000, fpv: 1000, ammo: 1000, rifles: 1000, uav: 100 };
  // Ukraine: rated by the mixed Soviet and Western fleet it holds, thin reserves, its own lines.
  const U = seed('UKR', fielded);
  const tanks = INVENTORIES.UKR.mbt.have, n = Object.values(tanks).reduce((t, k) => t + k, 0);
  assert.ok(Math.abs(U.quality.mbt - Object.entries(tanks).reduce((t, [id, k]) => t + MODEL[id].q * k, 0) / n) < 1e-9, 'holdings-weighted rating');
  assert.equal(U.holdings.mbt[0][0], 't64bv', 'the T-64 is the most numerous Ukrainian tank');
  assert.equal(U.stock.mbt, Math.round(1000 * INVENTORIES.UKR.mbt.store / n), 'reserve follows real stores');
  assert.equal(U.stock.fpv, 2000, 'drone reserve multiplier');
  const built = new Set(U.lines.map((l) => l.model));
  for (const id of ['bohdana', 'stugna', 'fpv', 't64bv']) assert.ok(built.has(id), `Ukraine builds ${id}`);
  assert.ok(!built.has('mbt_lic') && !built.has('towed'), 'no generic patterns where it has its own');
  // Poland: K2 under licence and its own Krab, with no alliance needed.
  const P = seed('POL', fielded);
  const k2 = P.lines.find((l) => l.model === 'k2');
  assert.ok(k2?.licensed && Math.abs(k2.cost - MODEL.k2.cost * 1.3) < 1e-9, 'K2 licence-built');
  assert.ok(P.lines.some((l) => l.model === 'krab' && !l.licensed));
  assert.equal(preferred(P, 'ifv').id, 'rosomak', 'Borsuk is not in production until mid-2025');
  // A class's factories are split between its real models by weight.
  const R = seed('RUS', fielded);
  assert.deepEqual(buildsOf(R, 'mbt').map(([id]) => id), ['t90m', 't72b3', 't80bvm']);
  assert.ok(R.lines.filter((l) => l.cls === 'mbt').length >= 2, 'Russia runs several tank lines');
  assert.ok(R.quality.mbt < 1 && R.quality.mbt > 0.8, `Russian tank fleet ${R.quality.mbt}`);
  // A nation with no inventory keeps the generic defaults.
  const bra = { iso3: 'BRA', gdp: 2000, defPct: 1.1 };
  seedProduction(bra, fielded, optionsFor(bra, () => false, START));
  assert.equal(bra.production.stock.mbt, 500);
  assert.equal(preferred(bra.production, 'mbt').id, 'mbt_lic');
});
