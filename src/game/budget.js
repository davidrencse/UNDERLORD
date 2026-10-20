// All allocations use percentage points of annual GDP. World Bank and OECD observations seed
// the measured lines; the remaining lines are explicit game estimates, not reported accounts.
export const BUDGET_LINES = [
  { id: 'policy', name: 'Policy funding', step: 0.25, cap: 4, effect: 'Political power', weight: { pp: 0.012 } },
  { id: 'education', name: 'Education', step: 0.25, cap: 14, effect: 'Growth, stability', weight: { growth: 0.08, stab: 0.35 } },
  { id: 'military', name: 'Military', step: 0.25, cap: 45, effect: 'War support', weight: { ws: 1.5, growth: -0.02 } },
  { id: 'administration', name: 'Administration', step: 0.25, cap: 7, effect: 'Stability', weight: { stab: 0.5 } },
  { id: 'infrastructure', name: 'Infrastructure', step: 0.25, cap: 12, effect: 'Growth', weight: { growth: 0.12 } },
  { id: 'health', name: 'Health', step: 0.25, cap: 16, effect: 'Stability, growth', weight: { stab: 0.7, growth: 0.03 } },
  { id: 'pensions', name: 'Pensions', step: 0.25, cap: 23, effect: 'Stability', weight: { stab: 0.7 } },
  { id: 'border', name: 'Border security', step: 0.1, cap: 4, effect: 'War support', weight: { ws: 0.7 } },
  { id: 'foreignAid', name: 'Foreign aid', step: 0.05, cap: 2, effect: 'Political power', weight: { pp: 0.02 } },
  { id: 'un', name: 'UN contributions', step: 0.002, cap: 0.05, effect: 'Political power', weight: { pp: 0.4 } },
  { id: 'immigrantAssistance', name: 'Immigrant assistance', step: 0.05, cap: 3, effect: 'Stability', weight: { stab: 0.5 } },
  { id: 'publicSafety', name: 'Public safety', step: 0.25, cap: 6, effect: 'Stability', weight: { stab: 0.55 } },
  { id: 'housing', name: 'Housing', step: 0.25, cap: 6, effect: 'Stability', weight: { stab: 0.45 } },
];

import { adjustDebt } from './economy.js';

const round = (n, digits = 3) => Number(n.toFixed(digits));
const measured = (observation, fallback) => observation && Number.isFinite(observation.pctGdp)
  ? { value: round(observation.pctGdp), source: `Observed ${observation.year}` }
  : { value: fallback, source: 'Game estimate' };
const totalFromWatchTower = (text) => {
  const match = /^~?(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?% of GDP/.exec(text ?? '');
  return match ? (Number(match[1]) + Number(match[2] ?? match[1])) / 2 : null;
};

export function createBudget(n, observed = {}) {
  const wt = n.wt ?? {};
  const perCapita = wt.gdpPerCapita ?? (n.pop > 0 ? n.gdp * 1000 / n.pop : 0);
  const prosperous = perCapita > 30000;
  const total = totalFromWatchTower(wt.spending?.total) ?? (prosperous ? 38 : 30);
  const migrantShare = wt.migrantStock && n.pop > 0 ? wt.migrantStock / (n.pop * 1e6) : 0;
  const incomeScale = Math.min(1, Math.max(0, perCapita / 65000));
  const migrationScale = Math.min(0.25, migrantShare);
  const sizeScale = Math.min(1, Math.max(0, Math.log10(Math.max(1, n.gdp)) / 4));
  const estimate = (value) => ({ value: round(value), source: 'Game estimate' });
  const lines = {
    policy: estimate(0.4 + total * 0.006 + incomeScale * 0.18),
    education: measured(observed.education, 4),
    military: measured(observed.military, n.defPct),
    administration: estimate(1.25 + total * 0.034),
    infrastructure: estimate(4.3 - incomeScale * 1.7 + total * 0.006),
    health: measured(observed.health, prosperous ? 5.5 : 2.5),
    pensions: measured(observed.pensions, prosperous ? 7 : 3),
    border: estimate(0.2 + migrationScale * 2 + (n.iso3 === 'UKR' ? 0.8 : 0)),
    foreignAid: estimate(0.04 + incomeScale * 0.35 + sizeScale * 0.06),
    un: estimate(0.001 + incomeScale * 0.004 + sizeScale * 0.002),
    immigrantAssistance: estimate(0.04 + migrationScale * 1.6 + incomeScale * 0.03),
    publicSafety: estimate(1.05 + total * 0.017 + migrationScale * 0.3),
    housing: estimate(0.35 + total * 0.012 + incomeScale * 0.35),
  };
  n.defPct = lines.military.value;
  const baseline = Object.fromEntries(Object.entries(lines).map(([id, line]) => [id, line.value]));
  return { lines, baseline, other: round(Math.max(0, total - budgetTotal({ lines }))), reserve: 0 };
}

export function budgetTotal(budget) {
  return Object.values(budget.lines).reduce((sum, line) => sum + line.value, budget.other ?? 0);
}

export function budgetDelta(budget) {
  return round(Object.entries(budget.lines).reduce((sum, [id, line]) => sum + line.value - budget.baseline[id], 0));
}

// The weights never change, so the per-line pairs are read once rather than on every nation-day.
const LINE_WEIGHTS = BUDGET_LINES.map((line) => [line.id, Object.entries(line.weight)]);

export function budgetEffects(budget) {
  const effects = { growth: 0, stab: 0, ws: 0, pp: 0 };
  for (const [id, weights] of LINE_WEIGHTS) {
    const delta = budget.lines[id].value - budget.baseline[id];
    for (const [key, factor] of weights) effects[key] += delta * factor;
  }
  return effects;
}

// Borrowed reserves cover only positive annual deficits. Returns the uncovered debt increment
// in percentage points for one simulated day; debt service and GDP growth remain in Game.
export function dailyBudgetBorrowing(n, deficit) {
  const daily = Math.max(0, deficit) / 365;
  const reserveUsed = Math.min(n.budget.reserve, daily * n.gdp / 100);
  n.budget.reserve -= reserveUsed;
  const uncovered = deficit / 365 - reserveUsed / Math.max(0.001, n.gdp) * 100;
  return deficit >= 0 ? Math.max(0, uncovered) : uncovered;
}

export function budgetChangeState(g, n, id, direction) {
  if (n.index !== g.player) return 'Only your country can set the budget.';
  const definition = BUDGET_LINES.find((line) => line.id === id);
  if (!definition || ![1, -1].includes(direction)) return 'Unknown funding decision.';
  if (n.pp < 10) return 'Needs 10 political power.';
  const cooldown = n.cooldowns[`budget:${id}`] ?? 0;
  if (cooldown > g.time) return `Can change this line again in ${Math.ceil((cooldown - g.time) / 86400000)} days.`;
  const line = n.budget.lines[id];
  const next = round(line.value + definition.step * direction);
  if (next < 0 || next > definition.cap) return 'Funding limit reached.';
  return null;
}

export function changeBudget(g, n, id, direction) {
  const why = budgetChangeState(g, n, id, direction);
  if (why) return why;
  const definition = BUDGET_LINES.find((line) => line.id === id);
  const line = n.budget.lines[id];
  const next = round(line.value + definition.step * direction);
  line.value = next;
  if (id === 'military') n.defPct = next;
  n.pp -= 10;
  n.cooldowns[`budget:${id}`] = g.time + 30 * 86400000;
  g.log(`${n.name} ${direction > 0 ? 'raises' : 'cuts'} ${definition.name.toLowerCase()} funding to ${next}% of GDP.`, { nation: n.index, kind: 'politics' });
  g.emit('nation', n);
  return null;
}

export function budgetLoanState(g, n, kind) {
  if (n.index !== g.player) return 'Only your country can manage its borrowing.';
  if (n.pp < 20) return 'Needs 20 political power.';
  if ((n.cooldowns['budget:loan'] ?? 0) > g.time) return 'Borrowing decision is available every 90 days.';
  const amount = n.gdp * 0.02;
  if (kind === 'issue' && n.debt > 248) return 'Debt ceiling reached.';
  if (kind === 'repay' && (n.debt < 2 || n.budget.reserve + 1e-6 < amount)) return 'Needs a 2% of GDP reserve and outstanding debt.';
  if (!['issue', 'repay'].includes(kind)) return 'Unknown borrowing decision.';
  return null;
}

export function takeBudgetLoan(g, n, kind) {
  const why = budgetLoanState(g, n, kind);
  if (why) return why;
  const amount = n.gdp * 0.02;
  if (kind === 'issue') {
    adjustDebt(n, 2);
    n.budget.reserve += amount;
  } else {
    adjustDebt(n, -2);
    n.budget.reserve -= amount;
  }
  n.pp -= 20;
  n.cooldowns['budget:loan'] = g.time + 90 * 86400000;
  g.log(`${n.name} ${kind === 'issue' ? 'issues' : 'repays'} bonds worth 2% of GDP.`, { nation: n.index, kind: 'politics' });
  g.emit('nation', n);
  return null;
}
