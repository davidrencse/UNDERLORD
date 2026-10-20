import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMMIGRATION_TREES, SHARED_IMMIGRATION, NATIONAL_IMMIGRATION } from '../src/data/immigration.js';
import { createImmigration, applyImmigration, immigrationMonth, matchesTargets, policyFor, setMigrationFunding } from '../src/game/immigration.js';
import { Game } from '../src/game/game.js';

const nation = (iso3 = 'CAN') => {
  const n = { iso3, index: 1, pop: 40, gdp: 2000, debt: 60, unemployment: 6, politics: { ruling: ['A'], list: [{ id: 'A', ideo: 'dem', share: 50 }, { id: 'B', ideo: 'nat', share: 50 }] } };
  n.immigration = createImmigration(n);
  return n;
};
const game = () => ({ player: 1, time: Date.UTC(2025, 0, 1), emit() {}, pendingEvents: [] });
function months(n, count, g = game()) {
  for (let i = 0; i < count; i++) { g.time = Date.UTC(2025, i + 1, 1); immigrationMonth(g, n); }
  return g;
}
const total = (n) => n.immigration.cohorts.reduce((s, c) => s + c.population, 0);

test('58 country trees have unique IDs, symmetric exclusions, valid modifiers and reachable graphs', () => {
  assert.equal(Object.keys(IMMIGRATION_TREES).length, 58);
  assert.ok(SHARED_IMMIGRATION.length >= 50 && SHARED_IMMIGRATION.length <= 70);
  for (const [iso, tree] of Object.entries(IMMIGRATION_TREES)) {
    const ids = new Map(tree.focuses.map((f) => [f.id, f]));
    assert.equal(ids.size, tree.focuses.length, iso);
    const seen = new Set();
    for (let pass = 0; pass < tree.focuses.length; pass++) for (const f of tree.focuses) {
      assert.ok(f.days > 0 && f.fx.immigration.effects);
      for (const req of [...f.req, ...(f.requiresAny ?? [])]) assert.ok(ids.has(req), `${f.id} references ${req}`);
      for (const blocked of f.mutex) assert.ok(ids.get(blocked)?.mutex.includes(f.id), `${f.id} symmetric with ${blocked}`);
      if ((!f.req.length || (f.reqAll ? f.req.every((id) => seen.has(id)) : f.req.some((id) => seen.has(id))))
        && (!f.requiresAny || f.requiresAny.some((id) => seen.has(id)))) seen.add(f.id);
    }
    assert.equal(seen.size, ids.size, `${iso} has no dependency cycles`);
    const n = nation(iso);
    for (const f of tree.focuses.filter((f) => !f.doctrine && !f.regionalDoctrine && !f.settlement)) assert.ok(applyImmigration(n, f.fx.immigration), f.id);
  }
});

test('focus completion installs one persistent program and doctrines exclude each other', () => {
  const n = nation();
  n.focus = { tree: 'generic', done: new Set(), current: null };
  n.pp = 100; n.mods = {}; n.spirits = [];
  const g = Object.assign(Object.create(Game.prototype), game(), { nations: [null, n], listeners: new Map() });
  const tree = IMMIGRATION_TREES.CAN;
  const by = (key) => tree.focuses.find((f) => f.id === `CAN_IMM_${key}`);
  assert.equal(g.startFocus(n, by('integration').id), false);
  n.focus.done.add(by('question').id);
  n.focus.done.add(by('national_0').id);
  assert.equal(g.startFocus(n, by('integration').id), true);
  assert.equal(g.focusState(n, by('restriction')), 'blocked');
  g.log = () => {};
  for (let i = 0; i < 70; i++) g._focusTick(n);
  assert.equal(n.immigration.doctrine, 'integration');
  assert.equal(n.immigration.programs.length, 1);
  assert.equal(applyImmigration(n, by('integration').fx.immigration), false);
  assert.equal(g.startFocus(n, by('restriction').id), false);
  assert.equal(g.focusState(n, by('borders')), 'blocked', 'the excluded doctrine blocks descendants');
  assert.equal(g.focusState(n, by('safety')), 'available', 'public safety crosses doctrine branches');
  assert.equal(g.focusState(n, by('settlement_integration')), 'locked', 'national chain still required');
});

test('either side of a national fork allows national supporting programs', () => {
  const n = nation('USA');
  n.focus = { tree: 'USA', done: new Set(['USA_IMM_question', 'USA_IMM_national_0', 'USA_IMM_national_1_alternative']), current: null };
  const g = Object.assign(Object.create(Game.prototype), game());
  const f = IMMIGRATION_TREES.USA.focuses.find((f) => f.id === 'USA_IMM_local_0');
  assert.equal(g.focusState(n, f), 'available');
  const continuation = IMMIGRATION_TREES.USA.focuses.find((f) => f.id === 'USA_IMM_national_2');
  assert.equal(g.focusState(n, continuation), 'available');
});

test('population reconciles with flows and natural growth, including status changes', () => {
  const n = nation();
  const before = total(n);
  applyImmigration(n, { effects: { regularization: .5, removals: .5, justice: .3, naturalization: .4 } });
  const g = game();
  immigrationMonth(g, n, .001);
  const flow = n.immigration.flows;
  assert.ok(Math.abs(total(n) - (before * 1.001 + flow.inflows - flow.outflows)) < .001);
  assert.ok(Math.abs(n.pop * 1e6 - total(n)) < .001);
  const snapshot = JSON.stringify(n.immigration.flows);
  immigrationMonth(g, n, .001);
  assert.equal(JSON.stringify(n.immigration.flows), snapshot, 'same month cannot settle twice');
  for (const c of n.immigration.cohorts) assert.ok(c.citizens >= 0 && c.citizens <= c.population && c.eligible <= c.population - c.citizens + 1e-7);
});

test('restriction lowers inflows, expansion raises housing use, and funding improves targeted integration', () => {
  const restrictive = nation(), expanded = nation(), base = nation(), funded = nation(), unfunded = nation();
  applyImmigration(restrictive, { doctrine: 'restriction', effects: { admissions: -.7, family: -.3, enforcement: .4 } });
  applyImmigration(expanded, { doctrine: 'multicultural', effects: { admissions: .7, family: .4 } });
  const program = { effects: { language: .4, credentials: .4, spending: .2 }, targets: { origin_regions: ['south_asia'], migration_status: ['permanent_resident'] } };
  applyImmigration(funded, program); applyImmigration(unfunded, program); unfunded.immigration.funding = 0;
  for (const n of [restrictive, expanded, base, funded, unfunded]) months(n, 12);
  assert.ok(restrictive.immigration.flows.inflows < base.immigration.flows.inflows);
  assert.ok(expanded.immigration.housingUse > base.immigration.housingUse);
  const target = (n) => n.immigration.cohorts.find((c) => c.origin === 'IND' && c.route === 'skilled_work');
  assert.ok(target(funded).language > target(unfunded).language);
  assert.ok(target(funded).credentials > target(unfunded).credentials);
  const other = funded.immigration.cohorts.find((c) => c.origin === 'NGA' && c.route === 'skilled_work');
  assert.equal(policyFor(funded.immigration, other).language, .4);
  assert.equal(unfunded.immigration.spending, 0);
  assert.ok(funded.immigration.spending > 0);
});

test('origin labels do not change safety, and regional programs follow configurable taxonomy', () => {
  const a = nation(), b = nation();
  for (const c of b.immigration.cohorts) c.region = c.region === 'south_asia' ? 'sub_saharan_africa' : 'south_asia';
  const effects = { prevention: .4, justice: .2, services: .3, spending: .2 };
  applyImmigration(a, { effects }); applyImmigration(b, { effects });
  months(a, 12); months(b, 12);
  assert.equal(a.immigration.safety, b.immigration.safety);
  assert.equal(a.immigration.reporting, b.immigration.reporting);
  const afg = a.immigration.cohorts.find((c) => c.origin === 'AFG');
  const targets = { origin_regions: ['south_asia'] };
  assert.equal(matchesTargets(afg, targets, a.immigration), false);
  a.immigration.taxonomy.afghanistan = 'south_asia';
  assert.equal(matchesTargets(afg, targets, a.immigration), true);
  assert.equal(setMigrationFunding({ player: 2 }, a, 0), false, 'observers cannot edit funding');
  assert.equal(setMigrationFunding(game(), a, NaN), false);
});

test('long runs retain finite populations, citizenship and bounded capacities', () => {
  const n = nation();
  applyImmigration(n, { effects: { naturalization: 1, credentials: .5, admissions: .8, housing: .4, spending: .3 } });
  months(n, 120);
  assert.ok(n.immigration.flows.naturalizations > 0);
  for (const c of n.immigration.cohorts) for (const key of ['population', 'citizens', 'eligible', 'language', 'employment', 'income', 'taxes']) assert.ok(Number.isFinite(c[key]) && c[key] >= 0, `${c.id} ${key}`);
  assert.ok(n.immigration.safety >= 0 && n.immigration.safety <= 1);
  assert.equal(n.immigration.history.length, 24);
});

test('regional agreements affect relevant partners and capacity without affecting unrelated countries', () => {
  const n = nation();
  const g = game();
  const changes = [];
  g.world = { byIso: new Map([['IND', { index: 2 }], ['NGA', { index: 3 }]]) };
  g.addOpinion = (a, b, delta) => changes.push({ a, b, delta });
  applyImmigration(n, { effects: { diplomacy: .2, language: .3, credentials: .2 }, targets: { origin_regions: ['south_asia'] } });
  immigrationMonth(g, n);
  assert.ok(changes.some((c) => c.b === 2 && c.delta > 0));
  assert.ok(!changes.some((c) => c.b === 3));
  assert.ok(n.immigration.integrationCapacity > .325);
});

test('capacity disputes offer policy choices and respect their recurrence cooldown', () => {
  const n = nation();
  const g = game();
  g.log = () => {};
  n.immigration.housingUnits *= .7;
  applyImmigration(n, { effects: { admissions: .5 } });
  immigrationMonth(g, n);
  assert.equal(g.pendingEvents[0].def.id, 'housing_protest');
  const chosen = g.pendingEvents[0].def.options[0].fx.immigration;
  applyImmigration(n, chosen);
  assert.ok(policyFor(n.immigration).housing > 0);
  g.time = Date.UTC(2025, 1, 1);
  immigrationMonth(g, n);
  assert.equal(g.pendingEvents.filter((e) => e.def.id === 'housing_protest').length, 1);
});

test('real world exposes all requested trees and immigration spending reaches national accounts', async () => {
  globalThis.fetch = async (url) => ({ json: async () => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url))) });
  const { loadWorld } = await import('../src/world/geo.js');
  const { economyMonth } = await import('../src/game/economy.js');
  const world = await loadWorld();
  const g = new Game(world);
  for (const iso of Object.keys(NATIONAL_IMMIGRATION)) {
    assert.ok(world.byIso.get(iso), `${iso} is reachable from the actual map`);
    assert.ok(world.byIso.get(iso).immigration, `${iso} has live immigration state`);
  }
  const n = world.byIso.get('CAN');
  applyImmigration(n, { effects: { spending: .25, housing: .2 } });
  g.time = Date.UTC(2025, 1, 1);
  economyMonth(g);
  assert.equal(n.econ.migrationSpend, .25);
  assert.ok(Number.isFinite(n.econ.spendPct) && n.econ.spendPct >= .25);
  assert.ok(Math.abs(n.pop * 1e6 - total(n)) < .001);
  const a = n.econ.acc;
  assert.ok(Math.abs(a.C + a.I + a.G + a.X - a.M + a.inventories - n.econ.Y) < 1e-6);
  for (const c of g.live()) assert.ok(c.pop > 0 && Number.isFinite(c.gdp), c.iso3);
});
