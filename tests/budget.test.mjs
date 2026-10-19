import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBudget, budgetDelta, budgetEffects, changeBudget, dailyBudgetBorrowing, takeBudgetLoan } from '../src/game/budget.js';

const observations = JSON.parse(readFileSync(new URL('../public/data/budget-baselines.json', import.meta.url)));
const watchtower = JSON.parse(readFileSync(new URL('../public/data/watchtower.json', import.meta.url)));

function nation(iso3, index = 1) {
  const wt = watchtower.countries[iso3];
  const n = {
    iso3, index, name: wt?.name ?? iso3, wt, gdp: (wt?.gdpUsd ?? 100e9) / 1e9,
    pop: (wt?.gdpUsd && wt?.gdpPerCapita) ? wt.gdpUsd / wt.gdpPerCapita / 1e6 : 10,
    defPct: 2, pp: 100, debt: 50, cooldowns: {},
  };
  n.budget = createBudget(n, observations.countries[iso3]);
  return n;
}

const game = (n) => ({ player: n.index, time: Date.UTC(2025, 0, 20), log() {}, emit() {} });

test('countries start with distinct observed allocations and marked estimates', () => {
  const us = nation('USA');
  const italy = nation('ITA');
  assert.equal(us.budget.lines.education.value, 5.42);
  assert.equal(italy.budget.lines.pensions.value, 16.1);
  assert.notEqual(us.budget.lines.military.value, italy.budget.lines.military.value);
  assert.equal(us.budget.lines.border.source, 'Game estimate');
  assert.equal(budgetDelta(us.budget), 0);
});

test('funding decision changes costs, effects, and defence share once per cooldown', () => {
  const n = nation('USA');
  const g = game(n);
  const original = n.defPct;
  assert.equal(changeBudget(g, n, 'military', 1), null);
  assert.equal(n.defPct, original + 0.25);
  assert.equal(budgetDelta(n.budget), 0.25);
  assert.ok(budgetEffects(n.budget).ws > 0);
  assert.equal(n.pp, 90);
  assert.match(changeBudget(g, n, 'military', -1), /again in/);
  assert.equal(n.defPct, original + 0.25);
  g.player = 2;
  assert.match(changeBudget(g, n, 'health', 1), /Only your country/);
});

test('loans create a usable reserve and repayment reverses the debt', () => {
  const n = nation('GBR');
  const g = game(n);
  assert.equal(takeBudgetLoan(g, n, 'issue'), null);
  assert.equal(n.debt, 52);
  assert.equal(n.budget.reserve, n.gdp * 0.02);
  assert.equal(dailyBudgetBorrowing(n, 1), 0);
  assert.ok(n.budget.reserve < n.gdp * 0.02);
  assert.match(takeBudgetLoan(g, n, 'repay'), /90 days/);
  g.time += 90 * 86400000;
  assert.match(takeBudgetLoan(g, n, 'repay'), /reserve/);
  n.budget.reserve = n.gdp * 0.02;
  assert.equal(takeBudgetLoan(g, n, 'repay'), null);
  assert.equal(n.debt, 50);
  assert.equal(n.budget.reserve, 0);
});
