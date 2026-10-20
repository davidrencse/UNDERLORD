import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.fetch = async (url) => ({ json: async () => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url))) });
const { loadWorld } = await import('../src/world/geo.js');
const { Game } = await import('../src/game/game.js');
const { economyMonth, queueProject, changeLaw, changeTax, PROJECTS, COMMODITY_IDS } = await import('../src/game/economy.js');

const DAY = 86400000;
// A fresh world and game; the economy runs month by month without the military layer.
async function fresh() {
  const world = await loadWorld();
  const game = new Game(world);
  return { world, game, n: (iso) => world.byIso.get(iso) };
}
function months(game, k, each) {
  for (let i = 0; i < k; i++) { game.time += 30 * DAY; each?.(i); economyMonth(game); }
}

test('with nothing changed, the majors keep their starting growth, inflation and jobs for a year', async () => {
  const { game, n } = await fresh();
  const start = {};
  for (const iso of ['USA', 'DEU', 'JPN', 'GBR', 'IND', 'CHN']) start[iso] = { g: n(iso).growth, pi: n(iso).inflation, u: n(iso).unemployment };
  months(game, 12);
  for (const [iso, s] of Object.entries(start)) {
    const c = n(iso);
    assert.ok(Math.abs(c.growth - s.g) < 2, `${iso} growth ${c.growth.toFixed(2)} vs ${s.g}`);
    assert.ok(Math.abs(c.inflation - s.pi) < 2, `${iso} inflation ${c.inflation.toFixed(2)} vs ${s.pi}`);
    assert.ok(Math.abs(c.unemployment - s.u) < 1.5, `${iso} unemployment ${c.unemployment.toFixed(2)} vs ${s.u}`);
  }
});

test('production and expenditure GDP reconcile through inventories every month', async () => {
  const { game, world } = await fresh();
  months(game, 6);
  for (const c of game.live()) {
    const E = c.econ, a = E.acc;
    const production = Object.values(E.sectors).reduce((t, x) => t + x.VA, 0) + a.tP;
    const expenditure = a.C + a.I + a.G + a.X - a.M + a.inventories;
    assert.ok(Math.abs(production - E.Y) < 1e-6 * E.Y, `${c.iso3} production side`);
    assert.ok(Math.abs(expenditure - E.Y) < 1e-6 * E.Y, `${c.iso3} expenditure side`);
    assert.ok(Number.isFinite(c.gdp) && c.gdp > 0, `${c.iso3} GDP ${c.gdp}`);
  }
  void world;
});

test('sanctioning an energy exporter cuts its output and raises world energy prices and importers\' inflation', async () => {
  const base = await fresh();
  const hit = await fresh();
  const rus = hit.n('RUS');
  for (const iso of ['USA', 'DEU', 'FRA', 'GBR', 'JPN', 'ITA', 'CAN', 'KOR', 'AUS', 'NLD', 'ESP', 'POL']) rus.sanctionedBy.add(hit.n(iso).index);
  months(base.game, 9);
  months(hit.game, 9);
  assert.ok(hit.game.econ.prices.energy > base.game.econ.prices.energy + 0.02, `energy ${hit.game.econ.prices.energy} vs ${base.game.econ.prices.energy}`);
  assert.ok(rus.econ.Y < base.n('RUS').econ.Y * 0.98, 'Russian output falls');
  assert.ok(rus.econ.sectors.energy.U < base.n('RUS').econ.sectors.energy.U, 'Russian energy producers cut output');
  assert.ok(hit.n('DEU').inflation > base.n('DEU').inflation, 'German inflation rises');
  assert.ok(hit.n('USA').econ.sanctionLoss > 0, 'sanctioners lose some exports');
});

test('an embargo on an energy importer creates shortages that cut industry', async () => {
  const { game, n } = await fresh();
  const jpn = n('JPN');
  months(game, 2);
  const manuf0 = jpn.econ.sectors.manufacturing.inMult;
  jpn.econ.boosts.push({ kind: 'access', v: -0.6, until: game.time + 400 * DAY });
  months(game, 4);
  assert.ok(jpn.econ.comm.energy.r < 0.95, `energy supply met ${jpn.econ.comm.energy.r}`);
  assert.ok(jpn.econ.sectors.manufacturing.inMult < manuf0, 'manufacturing loses inputs');
  assert.ok(jpn.econ.alerts.some((a) => /Energy shortage/.test(a.text)));
});

test('deficits accumulate as debt and old debt reprices only as it matures', async () => {
  const base = await fresh();
  const spend = await fresh();
  const gbr = spend.n('GBR');
  gbr.budget.lines.infrastructure.value += 4;
  months(base.game, 1);
  months(spend.game, 1, () => {});
  const rD = gbr.econ.rD;
  gbr.econ.i += 5; // a sudden rate shock: market yields jump, the average rate on the debt does not
  months(base.game, 23);
  months(spend.game, 23);
  // Some of the spending pays for itself through growth and inflation, but most is borrowed.
  const b = base.n('GBR').econ;
  assert.ok(gbr.econ.deficit > b.deficit + 1.5, `deficit ${gbr.econ.deficit.toFixed(1)} vs ${b.deficit.toFixed(1)}`);
  assert.ok(gbr.econ.debtLoc > b.debtLoc * 1.04, 'more bonds outstanding');
  assert.ok(gbr.econ.rD > rD && gbr.econ.rD < gbr.econ.yld, 'average rate drifts toward the yield');
});

test('the war economy converts civilian industry into arms plant when orders exceed it', async () => {
  const a = await fresh();
  const b = await fresh();
  for (const w of [a, b]) {
    const c = w.n('POL');
    c.budget.lines.military.value = 8;
    w.game.player = c.index;
    c.pp = 500;
    c.warSupport = 70;
  }
  assert.equal(changeLaw(b.game, b.n('POL'), 'model', 'war'), null);
  months(a.game, 12);
  months(b.game, 12);
  const pa = a.n('POL').econ, pb = b.n('POL').econ;
  assert.ok(pb.milCap > pa.milCap * 1.2, `plant ${pb.milCap.toFixed(1)} vs ${pa.milCap.toFixed(1)}`);
  assert.ok(pb.sectors.manufacturing.cap < pa.sectors.manufacturing.cap, 'civilian manufacturing shrinks');
  assert.ok(pa.milLimit === 'capacity', 'without conversion, plant limits arms output');
});

test('mobilisation takes workers out of the labour force', async () => {
  const { game, n } = await fresh();
  const ger = n('DEU');
  let soldiers = 180000;
  game.uniformedAll = () => { const out = new Float64Array(256); out[ger.index] = soldiers; return out; };
  months(game, 3);
  const u0 = ger.econ.u, lf0 = ger.econ.LF;
  soldiers += 2.5e6;
  months(game, 4);
  assert.ok(ger.econ.LF < lf0 - 2, `labour force ${ger.econ.LF.toFixed(1)} vs ${lf0.toFixed(1)}`);
  assert.ok(ger.econ.u < u0, 'unemployment falls as men are called up');
});

test('construction projects are paid from the infrastructure budget and add capacity', async () => {
  const { game, n } = await fresh();
  const fra = n('FRA');
  const cap0 = fra.econ.sectors.energy.cap;
  const self0 = fra.econ.comm.energy.self;
  assert.equal(queueProject(fra, 'power'), null);
  const id = fra.econ.projects.at(-1).id;
  months(game, Math.ceil(PROJECTS.power.days / 30) + 1);
  assert.ok(!fra.econ.projects.some((p) => p.id === id), 'the project finished');
  assert.ok(fra.econ.sectors.energy.cap > cap0 * 1.03, 'energy capacity rose');
  assert.ok(fra.econ.comm.energy.self > self0 * 1.03, 'self-sufficiency rose');
  assert.ok(COMMODITY_IDS.includes('energy'));
});

test('tax rises raise revenue and cost political power once per cooldown', async () => {
  const { game, n } = await fresh();
  const usa = n('USA');
  game.player = usa.index;
  usa.pp = 100;
  months(game, 1);
  const rev = usa.econ.revPct;
  assert.equal(changeTax(game, usa, 'consumption', 1), null);
  assert.equal(usa.pp, 90);
  assert.match(changeTax(game, usa, 'consumption', 1), /again in/);
  months(game, 1);
  assert.ok(usa.econ.revPct > rev, `revenue ${usa.econ.revPct.toFixed(2)} vs ${rev.toFixed(2)}`);
});
