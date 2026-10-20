import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.fetch = async (url) => ({ json: async () => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url))) });
const { loadWorld } = await import('../src/world/geo.js');
const { Game } = await import('../src/game/game.js');
const { PROJECTS, queueProject, economyMonth } = await import('../src/game/economy.js');
const { refining, storageDays, fuelDay } = await import('../src/game/fuel.js');
const { speedFor, builtResearch } = await import('../src/game/research.js');
const { hubCap, setHubBonus, hubBonus, LEVEL_CAP } = await import('../src/game/supply.js');
const { CITIES } = await import('../src/data/places.js');

async function fresh() {
  const world = await loadWorld();
  const game = new Game(world);
  return { game, n: (iso) => world.byIso.get(iso) };
}
// Where a project of this kind can legally go: a city of the country for city-only buildings,
// otherwise the capital.
const siteFor = (n, kind) => (PROJECTS[kind].city ? CITIES.find((c) => c.iso3 === n.iso3) : null) ?? n.capital;

// Build `count` of `kind` without waiting out the construction time.
function build(game, n, kind, count = 1) {
  let left = count;
  while (left > 0) {
    const batch = Math.min(left, 6);
    for (let i = 0; i < batch; i++) {
      const error = queueProject(n, kind, siteFor(n, kind));
      assert.equal(error, null, `${kind} refused: ${error}`);
      const p = n.econ.projects[n.econ.projects.length - 1];
      p.paid = p.cost;
    }
    economyMonth(game);
    left -= batch;
  }
}

test('every project in the list has a name, a build time and an effect', async () => {
  for (const [id, def] of Object.entries(PROJECTS)) {
    assert.ok(def.name && def.desc, `${id} needs a name and a description`);
    assert.ok(def.days > 0, `${id} needs a build time`);
    assert.ok(def.factories || def.sector || def.all || def.facilities, `${id} does nothing`);
  }
});

test('an oil refinery and a synthetic plant both add fuel, and the synthetic one needs no crude', async () => {
  const { game, n } = await fresh();
  const jpn = n('JPN');
  jpn.econ.comm.energy.self = 0; // no crude of its own
  const before = refining(jpn);
  build(game, jpn, 'refinery');
  const withRefinery = refining(jpn);
  build(game, jpn, 'synthFuel');
  const withSynth = refining(jpn);
  assert.ok(withRefinery > before, `refinery adds ${(withRefinery - before).toFixed(0)} kt/day`);
  assert.ok(withSynth - withRefinery > withRefinery - before, 'the synthetic plant gives more to a country with no crude');
});

test('fuel depots deepen the reserve', async () => {
  const { game, n } = await fresh();
  const c = n('DEU');
  const before = storageDays(c);
  build(game, c, 'fuelDepot', 2);
  assert.equal(storageDays(c), before + 16);
  const stacks = [{ owner: c.index, type: 'armor', divs: 1, str: 1, state: 'idle' }];
  fuelDay(game, c, stacks);
  assert.ok(c.fuel.cap > 0 && c.fuel.stock > 0);
});

test('a research campus speeds research up, with diminishing returns', async () => {
  const { game, n } = await fresh();
  const c = n('KOR') ?? n('USA');
  const before = speedFor(c);
  build(game, c, 'researchCampus');
  const one = speedFor(c);
  assert.ok(one > before, `${one.toFixed(3)} vs ${before.toFixed(3)}`);
  build(game, c, 'researchCampus', 9);
  const ten = builtResearch(c);
  assert.ok(ten < 10 * (one / before - 1), 'the tenth campus is worth less than the first');
});

test('rail yards raise what every hub can push', async () => {
  const { game, n } = await fresh();
  const c = n('POL');
  const hub = { level: 3, ctrl: c.index, readyAt: 0, damagedUntil: 0 };
  setHubBonus(c.index, 1);
  const before = hubCap(hub, game.time);
  assert.equal(before, LEVEL_CAP[3]);
  build(game, c, 'railYard', 3);
  assert.equal(c.econ.facilities.railYards, 3);
  setHubBonus(c.index, 1 + 0.04 * c.econ.facilities.railYards); // what the daily tick does
  assert.ok(hubBonus(c.index) > 1.1);
  assert.ok(hubCap(hub, game.time) > before);
});

test('an air defence network blunts enemy air support over home ground', async () => {
  const { game, n } = await fresh();
  const units = { game, world: game.world };
  const { Units } = await import('../src/game/units.js');
  const U = new Units(game, game.world);
  const c = n('FRA');
  const home = c.capital;
  assert.equal(U._nationalAA(c.index, home), 0);
  build(game, c, 'airDefence', 2);
  assert.ok(U._nationalAA(c.index, home) > 0, 'the network covers its own country');
  const abroad = { lat: -33.9, lon: 151.2 }; // Sydney: not French ground
  assert.equal(U._nationalAA(c.index, abroad), 0);
  void units;
});

test('a mining complex and a desalination plant raise self-sufficiency in their commodity', async () => {
  const { game, n } = await fresh();
  const c = n('SAU') ?? n('EGY');
  const metals = c.econ.comm.metals.self, food = c.econ.comm.food.self;
  build(game, c, 'miningComplex');
  build(game, c, 'desalination');
  assert.ok(c.econ.comm.metals.self > metals, 'metals');
  assert.ok(c.econ.comm.food.self > food, 'food');
});
