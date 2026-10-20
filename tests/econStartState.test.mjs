import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.fetch = async (url) => ({ json: async () => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url))) });
const { loadWorld } = await import('../src/world/geo.js');
const { Game } = await import('../src/game/game.js');
const { budgetTotal } = await import('../src/game/budget.js');

const MAJORS = ['USA', 'CHN', 'RUS', 'DEU', 'FRA', 'GBR', 'JPN', 'IND', 'TUR', 'UKR'];
// Fields the economy screen reads. They were once written only by economyMonth, so every
// tab that used one threw until a game month had passed.
const SHOWN = ['revParts', 'taylor', 'spendPct', 'subsidyPct', 'warOps', 'migrationSpend', 'constrRatio', 'projSpendPct', 'imports', 'ca', 'pressure'];

const world = await loadWorld();

test('the economy a nation starts with already has every field the economy screen shows', () => {
  const game = new Game(world);
  for (const iso of MAJORS) {
    const E = game.nations[world.byIso.get(iso).index].econ;
    for (const key of SHOWN) assert.notEqual(E[key], undefined, `${iso}: econ.${key} is missing before the first month`);
  }
});

test('the starting revenue split adds up to reported revenue, and spending to the budget', () => {
  const game = new Game(world);
  for (const iso of MAJORS) {
    const n = game.nations[world.byIso.get(iso).index];
    const E = n.econ;
    const split = E.revParts.reduce((sum, [, v]) => sum + v, 0);
    assert.ok(Math.abs(split - E.revPct) < 0.01, `${iso}: revenue split ${split.toFixed(2)} vs ${E.revPct.toFixed(2)}`);
    assert.ok(Math.abs(E.spendPct - budgetTotal(n.budget)) < 0.01, `${iso}: spending ${E.spendPct.toFixed(2)} vs budget ${budgetTotal(n.budget).toFixed(2)}`);
  }
});
