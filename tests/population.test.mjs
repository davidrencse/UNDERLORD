import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.fetch = async (url) => ({ json: async () => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url))) });
const { loadWorld } = await import('../src/world/geo.js');
const { Game } = await import('../src/game/game.js');
const {
  populationMonth, ageBands, medianAge, recruitablePool, manpowerCap, manpowerTick,
  setConscription, conscriptionBlocker, dependencyRatio,
} = await import('../src/game/population.js');

const DAY = 86400000;
async function fresh() {
  const world = await loadWorld();
  const game = new Game(world);
  return { game, n: (iso) => world.byIso.get(iso) };
}
const years = (game, n, k) => { for (let i = 0; i < k * 12; i++) { game.time += 30 * DAY; populationMonth(game, n); } };

test('every nation starts with a pyramid that matches its reported age bands and size', async () => {
  const { n } = await fresh();
  for (const iso of ['USA', 'JPN', 'NGA', 'DEU', 'IND']) {
    const c = n(iso);
    if (!c?.population) continue;
    const b = ageBands(c);
    const total = b.young + b.working + b.old;
    assert.ok(Math.abs(total / 1000 - c.pop) / c.pop < 0.02, `${iso} pyramid ${(total / 1000).toFixed(1)}m vs pop ${c.pop.toFixed(1)}m`);
    const d = c.demographics;
    if (d?.ages65plus?.value) {
      const oldShare = (b.old / total) * 100;
      assert.ok(Math.abs(oldShare - d.ages65plus.value) < 2.5, `${iso} 65+ ${oldShare.toFixed(1)}% vs ${d.ages65plus.value.toFixed(1)}%`);
    }
  }
});

test('Japan reads older than Nigeria on median age and dependency', async () => {
  const { n } = await fresh();
  const jpn = n('JPN'), nga = n('NGA');
  assert.ok(medianAge(jpn) > medianAge(nga) + 10, `median ${medianAge(jpn).toFixed(1)} vs ${medianAge(nga).toFixed(1)}`);
  assert.ok(dependencyRatio(jpn) > 0.4);
});

test('a low-fertility country shrinks and a high-fertility one grows over twenty years', async () => {
  const { game, n } = await fresh();
  const jpn = n('JPN'), nga = n('NGA');
  const jpn0 = jpn.pop, nga0 = nga.pop;
  jpn.population.netMigration = 0;
  nga.population.netMigration = 0;
  years(game, jpn, 20);
  years(game, nga, 20);
  assert.ok(jpn.pop < jpn0, `Japan ${jpn0.toFixed(1)}m -> ${jpn.pop.toFixed(1)}m`);
  assert.ok(nga.pop > nga0 * 1.2, `Nigeria ${nga0.toFixed(1)}m -> ${nga.pop.toFixed(1)}m`);
});

test('replacement fertility holds a population roughly level', async () => {
  const { game, n } = await fresh();
  const c = n('FRA');
  c.population.tfr = c.population.tfrBase = 2.07;
  c.population.netMigration = 0;
  const start = c.pop;
  years(game, c, 30);
  assert.ok(Math.abs(c.pop - start) / start < 0.12, `${start.toFixed(1)}m -> ${c.pop.toFixed(1)}m`);
});

test('manpower comes off the service-age pool and the conscription law sets the share', async () => {
  const { game, n } = await fresh();
  const c = n('USA');
  const pool = recruitablePool(c);
  assert.ok(pool > 0 && pool < c.pop * 1000, 'pool is a slice of the population');
  const volunteer = manpowerCap(c);
  c.warSupport = 95;
  setConscription(game, c, 'limited');
  const limited = manpowerCap(c);
  assert.ok(limited > volunteer, `${limited.toFixed(0)}k vs ${volunteer.toFixed(0)}k`);
  assert.equal(conscriptionBlocker(game, c, 'all_adults'), 'The country can only move one step at a time.');
});

test('a democracy at peace will not go past limited conscription', async () => {
  const { game, n } = await fresh();
  const c = n('DEU');
  c.warSupport = 95;
  setConscription(game, c, 'limited');
  assert.equal(conscriptionBlocker(game, c, 'extensive'), 'A democracy will not go this far short of war.');
});

test('manpower refills toward the ceiling without passing it', async () => {
  const { n } = await fresh();
  const c = n('USA');
  c.manpower = 0;
  for (let i = 0; i < 2000; i++) c.manpower = manpowerTick(c, c.manpower);
  const cap = manpowerCap(c);
  assert.ok(c.manpower <= cap + 1e-6 && c.manpower > cap * 0.9, `${c.manpower.toFixed(0)}k against a ceiling of ${cap.toFixed(0)}k`);
});

test('war deaths are taken out of the serving ages', async () => {
  const { game, n } = await fresh();
  const c = n('UKR') ?? n('POL');
  const before = recruitablePool(c);
  c.casualties = (c.casualties ?? 0) + 400; // thousands
  populationMonth(game, c);
  assert.ok(recruitablePool(c) < before, 'the pool of service-age people falls');
});
