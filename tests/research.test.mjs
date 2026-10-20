import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TECHS, TECH, CATEGORIES, STARTING, RESEARCH, seedResearch, slotsFor, speedFor, researchDay, startResearch, cancelResearch, autoResearch, canResearch, aheadOf, ratings, hasTech } from '../src/game/research.js';
import { optionsFor, seedProduction } from '../src/game/production.js';
import { templateStats, sideProfile, strike, gridOf, DEFAULT_TEMPLATES } from '../src/game/templates.js';
import { MODELS, MODEL, CLASSES } from '../src/data/equipment.js';

const START = Date.UTC(2025, 0, 20);
const DAY = 86400000;
// A nation as the game builds it: GDP in $bn, education in % of GDP from the budget.
const nation = (iso3, gdp, edu = 4.5, pop = 50) => ({ iso3, gdp, pop, defPct: 2, budget: { lines: { education: { value: edu } } } });

test('the technology tree is well formed and covers every gated model', () => {
  for (const t of TECHS) {
    assert.ok(CATEGORIES[t.cat], `${t.id} has a known category`);
    assert.ok(t.days > 0 && t.year >= 2015, t.id);
    for (const r of t.req) assert.ok(TECH[r], `${t.id} needs ${r}, which exists`);
    for (const c of Object.keys(t.quality ?? {})) assert.ok(CLASSES[c], `${t.id} improves a real class`);
    assert.ok(t.unlocks.length || Object.keys(t.quality ?? {}).length || Object.keys(t.mods ?? {}).length, `${t.id} does something`);
  }
  // No cycles: every technology is reachable from techs with no prerequisites.
  const seen = new Set();
  let grew = true;
  while (grew) { grew = false; for (const t of TECHS) if (!seen.has(t.id) && t.req.every((r) => seen.has(r))) { seen.add(t.id); grew = true; } }
  assert.equal(seen.size, TECHS.length);
  for (const m of MODELS) if (m.tech) assert.ok(TECH[m.tech]?.unlocks.includes(m.id), `${m.id} is unlocked by ${m.tech}`);
  for (const id of ['leo2a8', 'excalibur', 'switchblade', 'iristslm']) assert.ok(MODEL[id].tech, `${id} needs research`);
  for (const [iso, list] of Object.entries(STARTING)) for (const id of list) assert.ok(TECH[id], `${iso} starts with ${id}`);
});

test('slots and speed follow education spending', () => {
  const small = nation('EST', 40, 5, 1.3);
  const big = nation('USA', 29000, 5, 335);
  assert.equal(slotsFor(small), 1);
  assert.equal(slotsFor(big), RESEARCH.maxSlots);
  const mid = nation('POL', 850, 4.5, 37);
  const before = slotsFor(mid);
  mid.budget.lines.education.value = 12;
  assert.ok(slotsFor(mid) > before, 'more education spending, more slots');
  assert.ok(speedFor(mid) > speedFor(nation('POL', 850, 2, 37)));
  // Losing slots drops the last project but keeps its progress.
  const R = seedResearch(mid);
  const last = R.slots.length - 1;
  assert.equal(startResearch(mid, last, 'inf_kit'), null);
  researchDay(mid, START);
  const done = R.progress.inf_kit;
  assert.ok(done > 0);
  mid.budget.lines.education.value = 1;
  researchDay(mid, START);
  assert.ok(R.slots.length <= last && !R.slots.includes('inf_kit'));
  assert.equal(R.progress.inf_kit, done);
});

test('research progresses daily, needs prerequisites, and finishes', () => {
  const n = nation('POL', 850, 4.5, 37);
  const R = seedResearch(n);
  assert.equal(R.done.size, 0, 'minor nations start with no technologies');
  assert.match(startResearch(n, 0, 'atgm_ff'), /Top-attack ATGMs first/);
  assert.equal(startResearch(n, 0, 'atgm_topattack'), null);
  assert.match(startResearch(n, 1, 'atgm_topattack'), /already being researched/);
  const t = TECH.atgm_topattack, speed = speedFor(n);
  let days = 0, finished = [];
  while (!finished.length && days < 1000) { finished = researchDay(n, START + days * DAY); days++; }
  assert.deepEqual(finished, ['atgm_topattack']);
  assert.equal(days, Math.ceil(t.days / speed));
  assert.equal(R.slots[0], null, 'the slot is free again');
  assert.ok(R.bonus.atgm > 0.1 && canResearch(R, 'atgm_ff'));
  // Stopping keeps progress.
  startResearch(n, 0, 'atgm_ff');
  researchDay(n, START);
  const p = R.progress.atgm_ff;
  cancelResearch(n, 0);
  researchDay(n, START);
  assert.equal(R.progress.atgm_ff, p);
  // Ahead of time is slower: next-generation tanks are a 2028 technology.
  assert.ok(aheadOf(TECH.mbt_next, START) > 3.5 && aheadOf(TECH.mbt_next, Date.UTC(2029, 0, 1)) === 1);
});

test('major nations start with what they field in 2025', () => {
  const field = (iso) => seedResearch(nation(iso, 2000));
  assert.ok(field('USA').done.has('art_guided') && field('USA').done.has('uav_loiter') && field('USA').done.has('ew_brigade'));
  assert.ok(field('DEU').done.has('mbt_aps') && field('DEU').done.has('ad_medium'));
  assert.ok(field('RUS').done.has('fpv_fibre') && field('RUS').done.has('fpv_mass'), 'prerequisites come with');
  assert.ok(field('RUS').done.has('ew_strategic') && !field('RUS').done.has('mbt_aps'));
  for (const iso of ['USA', 'CHN', 'RUS', 'DEU', 'FRA', 'GBR', 'IND', 'TUR']) assert.ok(field(iso).done.size >= 6, iso);
});

test('researched technologies open models to the production lines', () => {
  const none = () => false;
  const deu = nation('DEU', 4500);
  assert.ok(!optionsFor(deu, none, START).has('leo2a8'), 'no research, no Leopard 2A8');
  seedResearch(deu);
  const opts = optionsFor(deu, none, START);
  assert.equal(opts.get('leo2a8'), false, 'its own design once researched');
  assert.equal(opts.get('iristslm'), false);
  assert.ok(!opts.has('kf51'), 'the KF51 needs next-generation tanks');
  deu.research.done.add('mbt_next');
  assert.ok(optionsFor(deu, none, START).has('kf51'));
  // A partner builds it under licence once the maker has the technology.
  const pol = nation('POL', 850);
  seedResearch(pol);
  const partnerHas = (iso, tech) => iso === 'DEU' && hasTech(deu, tech);
  assert.equal(optionsFor(pol, (iso) => iso === 'DEU', START, partnerHas).get('leo2a8'), true);
  assert.ok(!optionsFor(pol, (iso) => iso === 'DEU', START).has('leo2a8'), 'not while the maker lacks it');
  // Research does not override the date: Challenger 3 waits for 2027.
  const gbr = nation('GBR', 3500);
  seedResearch(gbr);
  assert.ok(gbr.research.done.has('mbt_aps') && !optionsFor(gbr, none, START).has('chally3'));
  assert.ok(optionsFor(gbr, none, Date.UTC(2027, 1, 1)).has('chally3'));
  // The US starts able to build its guided shells and loitering munitions.
  const usa = nation('USA', 29000);
  seedResearch(usa);
  const u = optionsFor(usa, none, START);
  assert.ok(u.has('excalibur') && u.has('switchblade') && u.has('tlsbct'));
});

test('class improvements and modifiers reach division stats and combat', () => {
  const n = nation('POL', 850);
  seedResearch(n);
  seedProduction(n, { atgm: 100 }, optionsFor(n, () => false, START));
  const inf = DEFAULT_TEMPLATES[0];
  const grid = gridOf(inf.cols);
  const before = templateStats(grid, inf.support, ratings(n));
  // Top-attack missiles granted, then mass FPV production finished in a slot (which applies both).
  n.research.done.add('atgm_topattack');
  startResearch(n, 0, 'fpv_mass');
  n.research.progress.fpv_mass = TECH.fpv_mass.days;
  researchDay(n, START);
  const after = templateStats(grid, inf.support, ratings(n));
  assert.ok(ratings(n).atgm > n.production.quality.atgm, 'the quality map carries the improvement');
  assert.ok(after.pierce > before.pierce, 'top-attack missiles pierce harder');
  assert.ok(after.drone > before.drone, 'better FPV drones');
  // Fibre-optic drones shrug off the enemy's jamming.
  const jammer = sideProfile([{ tpl: { stats: templateStats(gridOf([['inf', 'inf'], ['ewbn']]), ['ewco']) } }], () => 1);
  const radio = sideProfile([{ tpl: { stats: templateStats(grid, inf.support) } }], () => 1);
  const fibre = sideProfile([{ tpl: { stats: templateStats(grid, inf.support, { mods: { ...ratings(n).mods, ewResist: 0.4 } }) } }], () => 1);
  assert.ok(fibre.ewResist > 0.39);
  assert.ok(strike(fibre, jammer).droneEff > strike(radio, jammer).droneEff);
  // Precision rockets use fewer rounds.
  const arm = gridOf(DEFAULT_TEMPLATES[2].cols);
  assert.ok(templateStats(arm, [], { mods: { ammoUse: -0.1, ewResist: 0, jamResist: 0, recon: 0, cdrone: 0, aa: 0 } }).ammo < templateStats(arm, []).ammo);
});

test('the AI keeps every slot busy, toward what it can build', () => {
  const n = nation('DEU', 4500);
  seedResearch(n);
  n.research.done = new Set(['mbt_cage', 'ifv_turret']);
  const started = autoResearch(n, START, { mbt: true, ifv: true, rifles: true });
  assert.equal(started.length, slotsFor(n));
  assert.ok(n.research.slots.every((id) => id && canResearch(n.research, id)));
  assert.equal(new Set(n.research.slots).size, n.research.slots.length, 'no technology twice');
  assert.ok(started.includes('mbt_aps'), 'works toward the Leopard 2A8 it can build');
  assert.deepEqual(autoResearch(n, START), [], 'nothing to add while every slot is busy');
});

test('in the running game, research advances and unlocks models for production', async () => {
  globalThis.fetch = async (url) => ({ json: async () => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url))) });
  const { loadWorld } = await import('../src/world/geo.js');
  const { Game } = await import('../src/game/game.js');
  const { Units } = await import('../src/game/units.js');
  const world = await loadWorld();
  const game = new Game(world);
  const units = new Units(game, world);
  const A = units.armies;
  const deu = world.byIso.get('DEU');
  assert.ok(deu.research.done.has('mbt_aps') && deu.production.options.has('leo2a8'));
  assert.ok(!deu.production.options.has('kf51'));
  const pol = world.byIso.get('POL');
  A._researchDaily();
  assert.ok(pol.research.slots.length >= 1 && pol.research.slots.every(Boolean), 'the AI picked research');
  // Germany finishes next-generation tanks: the KF51 can go on a line at once.
  deu.research.slots[0] = 'mbt_next';
  for (const r of TECH.mbt_next.req) deu.research.done.add(r);
  deu.research.progress.mbt_next = TECH.mbt_next.days - 1e-6;
  A._researchDaily();
  assert.ok(deu.research.done.has('mbt_next'));
  assert.equal(deu.production.options.get('kf51'), false);
});
