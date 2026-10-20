import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.fetch = async (url) => ({ json: async () => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url))) });
const { loadWorld } = await import('../src/world/geo.js');
const { Game } = await import('../src/game/game.js');
const { fuelDay, fuelFactor, refining, signFuelDeal, bestSupplier, fuelDays, BURN } = await import('../src/game/fuel.js');
const {
  commandMonth, commandFactor, takeDoctrine, doctrineBlocker, doctrineFx, assignCommander,
  armySummaries, TRAITS, rankName,
} = await import('../src/game/commanders.js');

const DAY = 86400000;
async function fresh() {
  const world = await loadWorld();
  const game = new Game(world);
  return { game, n: (iso) => world.byIso.get(iso) };
}
// A formation the fuel and command layers can read, without the unit simulation.
const stack = (owner, type, over = {}) => ({ owner, type, divs: 1, str: 1, state: 'idle', army: 1, ...over });

test('an oil producer refines more than an importer of the same size', async () => {
  const { n } = await fresh();
  const sau = n('SAU'), jpn = n('JPN');
  assert.ok(refining(sau) / sau.gdp > refining(jpn) / jpn.gdp, 'Saudi Arabia refines more per unit of output than Japan');
});

test('fuel is burned by armour and hardly noticed by infantry', async () => {
  const { game, n } = await fresh();
  const c = n('USA');
  const armour = Array.from({ length: 40 }, () => stack(c.index, 'armor', { state: 'moving' }));
  fuelDay(game, c, armour);
  const movingUse = c.fuel.use;
  fuelDay(game, c, Array.from({ length: 40 }, () => stack(c.index, 'inf')));
  assert.ok(movingUse > c.fuel.use * 10, `armour on the move burns ${movingUse.toFixed(0)}kt against infantry at rest ${c.fuel.use.toFixed(0)}kt`);
  assert.ok(BURN.armor > BURN.inf);
});

test('a country that cannot refine or import runs its tanks dry and they crawl', async () => {
  const { game, n } = await fresh();
  const c = n('JPN');
  c.econ.comm.energy.self = 0;
  c.econ.restr = 0.9; // blockaded and sanctioned
  const host = Array.from({ length: 300 }, () => stack(c.index, 'armor', { state: 'moving' }));
  for (let i = 0; i < 120; i++) { game.time += DAY; fuelDay(game, c, host); }
  assert.ok(c.fuel.ratio < 0.9, `fuel ratio ${c.fuel.ratio.toFixed(2)}`);
  assert.ok(fuelFactor(c, 'armor') < fuelFactor(c, 'inf'), 'armour suffers more than infantry');
  assert.ok(fuelFactor(c, 'armor') >= 0.25);
});

test('a fuel deal brings in fuel from a willing exporter', async () => {
  const { game, n } = await fresh();
  const c = n('DEU');
  const supplier = bestSupplier(game, c);
  assert.ok(supplier, 'somebody is selling');
  assert.equal(signFuelDeal(game, c), true);
  assert.equal(c.fuel.deals.length, 1);
  const host = Array.from({ length: 50 }, () => stack(c.index, 'mech'));
  fuelDay(game, c, host);
  assert.ok(c.fuel.imports > 0);
  assert.ok(fuelDays(c) > 0);
});

test('army experience accrues in war, slowly in peace, and buys doctrine', async () => {
  const { game, n } = await fresh();
  const c = n('USA');
  const host = [stack(c.index, 'armor', { battle: true }), stack(c.index, 'inf')];
  commandMonth(game, c, host);
  const peace = c.command.xp;
  game.startWar(c.index, n('RUS').index, { silent: true });
  commandMonth(game, c, host);
  assert.ok(c.command.xp - peace > peace, 'war earns more than peace');
  c.command.xp = 500;
  assert.equal(doctrineBlocker(c, 'mobile'), null);
  assert.equal(takeDoctrine(game, c, 'mobile'), true);
  assert.equal(c.command.doctrine.mobile, 1);
  assert.ok(doctrineFx(c).speed > 0);
});

test('doctrine and a good commander make a formation fight harder', async () => {
  const { game, n } = await fresh();
  const c = n('USA');
  const s = stack(c.index, 'armor', { attack: true });
  const before = commandFactor(game, s);
  c.command.xp = 1000;
  takeDoctrine(game, c, 'mobile');
  takeDoctrine(game, c, 'mobile');
  assignCommander(c, c.command.officers[0].id, s.army);
  c.command.officers[0].skill.attack = 6;
  assert.ok(commandFactor(game, s) > before, `${commandFactor(game, s).toFixed(3)} vs ${before.toFixed(3)}`);
});

test('a commander who only ever leads tanks becomes a panzer leader', async () => {
  const { game, n } = await fresh();
  const c = n('USA');
  const host = Array.from({ length: 6 }, () => stack(c.index, 'armor', { battle: true }));
  game.startWar(c.index, n('RUS').index, { silent: true });
  for (let i = 0; i < 30; i++) { game.time += 30 * DAY; commandMonth(game, c, host); }
  const officer = c.command.officers.find((o) => o.army === 1);
  assert.ok(officer, 'an army with no commander is given one');
  assert.ok(officer.traits.includes('panzer_leader'), `traits: ${officer.traits.join(', ') || 'none'}`);
  assert.ok(officer.level > 1, 'and goes up levels');
  assert.match(rankName(officer), /General|Field Marshal/);
  assert.ok(TRAITS.panzer_leader.fx.atk > 0);
});

test('army summaries read the armour share of each army', async () => {
  const { n } = await fresh();
  const c = n('USA');
  const summaries = armySummaries(c, [stack(c.index, 'armor'), stack(c.index, 'inf'), stack(c.index, 'inf', { army: 2 })]);
  assert.equal(summaries.length, 2);
  assert.equal(summaries.find((a) => a.id === 1).armourShare, 0.5);
  assert.equal(summaries.find((a) => a.id === 2).armourShare, 0);
});
