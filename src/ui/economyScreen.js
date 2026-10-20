import { day, esc, flagHTML, int, money } from './format.js';
import { BUDGET_LINES, budgetChangeState, changeBudget, budgetLoanState, takeBudgetLoan } from '../game/budget.js';
import {
  SECTORS, COMMODITIES, COMMODITY_IDS, LAWS, PROJECTS, MAX_PROJECTS, TAXES, LAW_COST, lawOption,
  lawChangeState, changeLaw, taxChangeState, changeTax, tariffChangeState, changeTariff, rateChangeState, changeRate,
  subsidyChangeState, changeSubsidy, cancelProject, moveProject, projectCost, sectorShares, OUT_PER_FACTORY,
} from '../game/economy.js';

export const ECON_TABS = [
  ['overview', 'Overview', 'E'],
  ['budget', 'Budget', 'L'],
  ['construction', 'Construction'],
  ['industry', 'Industry'],
  ['trade', 'Trade & resources'],
  ['finance', 'Finance'],
  ['laws', 'Economic laws'],
];

const DAY = 86400000;
const sgn = (v, d = 1) => `${v > 0.0005 ? '+' : v < -0.0005 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
const cls = (v, goodUp = true) => (Math.abs(v) < 0.05 ? 'dim' : (v > 0) === goodUp ? 'good' : 'bad');
const bar = (v, warn = 0.9, bad = 0.97) => `<span class="sbar ${v >= bad ? 'bad' : v >= warn ? 'warn' : ''}"><i style="width:${Math.round(Math.min(1, Math.max(0, v)) * 100)}%"></i></span>`;
const pct = (v, d = 1) => `${v.toFixed(d)}%`;

// Readable effects of a law option, from its modifiers.
const MOD_TEXT = {
  invPriv: (v) => `${sgn(v * 100, 0)}% private investment`,
  invPub: (v) => `${sgn(v * 100, 0)}% public-investment efficiency`,
  tfp: (v) => `${sgn(v, 2)} pts productivity growth a year`,
  cons: (v) => `${sgn(v * 100, 0)}% consumption`,
  natU: (v) => `${sgn(v, 1)} pts structural unemployment`,
  wage: (v) => `${sgn(v, 1)} pts wage inflation`,
  inflP: (v) => `${sgn(v, 1)} pts inflation pressure`,
  cred: (v) => `${sgn(v * 100, 0)} central-bank credibility`,
  risk: (v) => `${sgn(v, 1)} pts bond risk premium`,
  conv: (v) => `converts ${(v * 100).toFixed(1)}% of civilian industry to arms a month while orders exceed plant`,
  steer: (v) => `${sgn(v * 100, 0)}% investment in strategic industry`,
  exportCtl: (v) => `${(v * 100).toFixed(0)}% of commodity surpluses kept at home`,
  capCtl: (v) => `damps capital flight by ${(v * 100).toFixed(0)}%`,
  manual: () => 'you set the policy rate',
  monetize: (v) => `${(v * 100).toFixed(0)}% of new borrowing bought by the central bank`,
  peg: () => 'reserves hold the exchange rate',
  limit: (v) => `deficit ceiling ${v}% of GDP`,
  stab: (v) => `${sgn(v, 0)} stability`,
  ws: (v) => `${sgn(v, 0)} war support`,
  pp: (v) => `${sgn(v, 2)} political power a day`,
};
const modsText = (mods) => Object.entries(mods).map(([k, v]) => MOD_TEXT[k]?.(v)).filter(Boolean).join(' · ') || 'The baseline.';

// HOI4-style economy screen: overview, budget, construction, industry, trade and resources,
// finance and economic laws for the player's country.
export class EconomyScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.tab = 'overview';
    this.el = document.createElement('div');
    this.el.className = 'screen econ-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Economy');
    root.appendChild(this.el);
    this._html = '';
    this.el.addEventListener('click', (e) => this._click(e));
  }

  close() { this.el.hidden = true; }

  open(tab = this.tab, toggle = false) {
    if (this.ctx.game.player == null) return;
    if (toggle && !this.el.hidden && tab === this.tab) { this.close(); return; }
    const changed = tab !== this.tab;
    this.tab = tab;
    this.el.hidden = false;
    this._html = '';
    this.render();
    if (changed) this.el.scrollTop = 0;
  }

  _click(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const { game, toast } = this.ctx;
    const n = game.nations[game.player], d = b.dataset;
    let why = null, ok = null;
    if (d.x !== undefined) { this.close(); return; }
    if (d.etab) { this.open(d.etab); return; }
    if (d.map !== undefined) { this.close(); this.ctx.setMode(7); return; }
    if (d.site) { this.close(); this.ctx.openConstruction(d.site); return; }
    if (d.production !== undefined) { this.close(); this.ctx.openMilitary('production'); return; }
    if (d.budget) { why = changeBudget(game, n, d.budget, +d.dir); ok = 'Funding updated.'; }
    else if (d.loan) { why = takeBudgetLoan(game, n, d.loan); ok = 'Borrowing updated.'; }
    else if (d.tax) why = changeTax(game, n, d.tax, +d.dir);
    else if (d.tariff) why = changeTariff(game, n, +d.tariff);
    else if (d.rate) why = changeRate(game, n, +d.rate, +(d.step ?? 0.25));
    else if (d.sub) why = changeSubsidy(game, n, d.sub, +d.dir);
    else if (d.cancel) cancelProject(n, +d.cancel);
    else if (d.up) moveProject(n, +d.up, -1);
    else if (d.down) moveProject(n, +d.down, 1);
    else if (d.law) { why = changeLaw(game, n, d.law, d.opt); ok = `${lawOption(d.law, d.opt).name} adopted.`; }
    if (why) toast(why);
    else if (ok) toast(ok);
    this._html = '';
    this.render();
    this.ctx.refreshTop();
  }

  render() {
    if (this.el.hidden) return;
    const { game } = this.ctx;
    const n = game.nations[game.player];
    if (!n?.econ) return;
    const E = n.econ;
    const atWar = game.warsOf(n.index).length > 0;
    const body = {
      overview: () => this._overview(n, E),
      budget: () => this._budget(n, E),
      construction: () => this._construction(n, E),
      industry: () => this._industry(n, E),
      trade: () => this._trade(n, E),
      finance: () => this._finance(n, E),
      laws: () => this._laws(n, E),
    }[this.tab]();
    const html = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap econ-wrap">
        <nav class="mil-tabs" aria-label="Economy screens">${ECON_TABS.map(([id, label, key]) => `<button data-etab="${id}" class="${id === this.tab ? 'on' : ''}" ${id === this.tab ? 'aria-current="page"' : ''}>${label}${key ? ` <kbd class="num">${key}</kbd>` : ''}</button>`).join('')}</nav>
        <header class="econ-head">${flagHTML(n)}<div><h1>${esc(ECON_TABS.find((t) => t[0] === this.tab)[1])}</h1><p>${esc(n.name)} · ${day(game.time)} · ${atWar ? 'At war' : 'Peacetime'} · ${esc(lawOption('model', E.laws.model).name)}</p></div></header>
        ${body}
      </div>`;
    if (html === this._html) return;
    const scroll = this.el.scrollTop;
    const focus = this.el.contains(document.activeElement) ? document.activeElement : null;
    const key = focus ? Object.entries(focus.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${v}"]`).join('') : '';
    this._html = html;
    this.el.innerHTML = html;
    this.el.scrollTop = scroll;
    if (key) this.el.querySelector(`button${key}:not(:disabled)`)?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------------- overview
  _overview(n, E) {
    const usd = (v) => money((v * E.P) / E.xr);
    const debtUsd = ((E.debtLoc + E.debtFx * E.xr) / E.xr);
    const xrChange = (1 / E.xr - 1) * 100;
    const kpi = (label, value, note, tone = '') => `<div><span>${label}</span><b class="num ${tone}">${value}</b><small>${note}</small></div>`;
    const shares = sectorShares(n);
    const strip = shares.map((s) => `<i style="flex:${Math.max(0.0001, s.share)}" class="sec-${s.id}" title="${esc(s.name)} ${s.share.toFixed(1)}%"></i>`).join('');
    const sectors = shares.map((s) => `<div class="ec-row sec">
        <span class="nm"><i class="sw sec-${s.id}"></i>${esc(s.name)}</span>
        <span class="num">${pct(s.share)}</span>
        <span class="num ${cls(s.x.growth - E.gTrend * 100)}">${s.id === 'defence' ? '—' : `${sgn(s.x.growth)}%`}</span>
        <span class="ub">${bar(s.x.U, 0.9, 0.96)}<b class="num">${Math.round(s.x.U * 100)}%</b></span>
        <span class="num">${s.x.L >= 1 ? `${s.x.L.toFixed(1)}m` : `${int(s.x.L * 1000)}k`}</span>
      </div>`).join('');
    const a = E.acc ?? { C: 0, I: 0, G: 0, X: 0, M: 0, inventories: 0, tP: 0 };
    const prodRows = shares.map((s) => `<div class="acc-row"><span>${esc(s.name)}</span><b class="num">${usd(s.x.VA)}</b></div>`).join('')
      + `<div class="acc-row"><span>Net product taxes</span><b class="num">${usd(a.tP)}</b></div>`;
    const expRows = [['Household consumption', a.C], ['Private investment', a.Ip ?? a.I], ['Public investment', a.Ig ?? 0], ['Government consumption', a.G], ['Exports', a.X], ['Imports', -a.M], ['Inventories & discrepancy', a.inventories]]
      .map(([k, v]) => `<div class="acc-row"><span>${k}</span><b class="num ${v < 0 ? 'neg' : ''}">${v < 0 ? '−' : ''}${usd(Math.abs(v))}</b></div>`).join('');
    const drivers = (parts, unit, goodUp) => parts.map(([k, v]) => `<div class="drv"><span>${esc(k)}</span><span class="dbar"><i class="${v >= 0 ? 'p' : 'm'} ${cls(v, goodUp)}" style="width:${Math.min(50, Math.abs(v) * (unit === 'g' ? 6 : 2))}%"></i></span><b class="num ${cls(v, goodUp)}">${sgn(v)}</b></div>`).join('');
    const alerts = E.alerts.length
      ? E.alerts.map((x) => `<li class="${x.level}">${esc(x.text)}</li>`).join('')
      : '<li class="ok">No warnings. The economy is running within its means.</li>';
    return `
      <div class="sup-kpis ec-kpis">
        ${kpi('Nominal GDP', money(n.gdp), `$${int((n.gdp * 1000) / n.pop)} per person`)}
        ${kpi('Real growth', `${sgn(n.growth)}%`, 'on a year ago', n.growth < 0 ? 'bad' : '')}
        ${kpi('Inflation', pct(E.pi), `target ${E.target}%`, E.pi > E.target + 4 ? 'bad' : '')}
        ${kpi('Unemployment', pct(E.u), `${E.LF.toFixed(E.LF < 10 ? 1 : 0)}m in the labour force`, E.u > E.u0 + 2 ? 'bad' : '')}
        ${kpi('Public debt', money(debtUsd), `${pct(n.debt, 0)} of GDP`, n.debt > E.safe ? 'warn' : '')}
        ${kpi('Budget balance', `${sgn(-E.deficit)}%`, `of GDP · ${money(Math.abs(E.deficit) * n.gdp / 100)} a year`, E.deficit > 6 ? 'bad' : '')}
        ${kpi('Policy rate', pct(E.i, 2), `10-year yield ${pct(E.yld, 2)}`)}
        ${n.iso3 === 'USA' ? kpi('Currency', 'Dollar', `the world's reserve currency · ${sgn(xrChange)}% against other currencies`) : kpi('Currency', E.euro ? 'Euro' : `${sgn(xrChange)}%`, E.euro ? `${sgn(xrChange)}% against the dollar since 2025` : 'against the dollar since 2025', xrChange < -15 ? 'bad' : '')}
      </div>
      <ul class="ec-alerts">${alerts}</ul>
      <section class="sup-sec">
        <h2>Economic sectors</h2>
        <p class="sup-note">Value added by sector. Capacity grows with investment and productivity; utilisation follows demand and is cut by shortages of energy, metals, food or workers.</p>
        <div class="sec-strip" aria-hidden="true">${strip}</div>
        <div class="ec-row sec head"><span>Sector</span><span>Share of GDP</span><span>Capacity growth</span><span>Utilisation</span><span>Jobs</span></div>
        ${sectors}
      </section>
      <section class="sup-sec ec-two">
        <div>
          <h2>Why it is growing</h2>
          <p class="sup-note">Contributions to real growth, percentage points a year.</p>
          ${drivers(E.growthParts, 'g', true)}
        </div>
        <div>
          <h2>Why prices are rising</h2>
          <p class="sup-note">Inflation is expectations plus pressures, in points. It moves a third of the way toward their sum each month.</p>
          ${drivers(E.inflParts.filter(([k, v]) => k === 'Expectations' || Math.abs(v) >= 0.05), 'i', false)}
        </div>
      </section>
      <section class="sup-sec ec-two">
        <div>
          <h2>Production</h2>
          <p class="sup-note">GDP is measured as value added. Intermediate inputs are not counted twice.</p>
          ${prodRows}
          <div class="acc-row total"><span>GDP</span><b class="num">${usd(E.Y)}</b></div>
        </div>
        <div>
          <h2>Expenditure</h2>
          <p class="sup-note">C + I + G + X − M. The gap to production is stock-building, so the two sides always agree.</p>
          ${expRows}
          <div class="acc-row total"><span>GDP</span><b class="num">${usd(E.Y)}</b></div>
        </div>
      </section>
      ${historyChart(E)}
      <p class="ledger-source">Starting values for 2025 combine the WatchTower import with game estimates informed by the IMF World Economic Outlook and World Bank sector accounts. Every response in the simulation is a game estimate, not a forecast.</p>`;
  }

  // ------------------------------------------------------------------------- budget
  _budget(n, E) {
    const { game } = this.ctx;
    const amount = (p) => money((n.gdp * p) / 100);
    const revRows = E.revParts.filter(([, v]) => v > 0.005).map(([k, v]) => `<div class="acc-row"><span>${k}</span><b class="num">${pct(v, 2)}</b><small class="num">${amount(v)}</small></div>`).join('');
    const fundingRow = (def) => {
      const line = n.budget.lines[def.id];
      const control = (dir, label) => {
        const why = budgetChangeState(game, n, def.id, dir);
        return `<button class="ledger-adjust" data-budget="${def.id}" data-dir="${dir}" aria-label="${label} ${esc(def.name)} by ${def.step} points of GDP" title="${esc(why ?? `${label} by ${def.step} points · 10 political power`)}" ${why ? 'disabled' : ''}>${dir > 0 ? '+' : '−'}</button>`;
      };
      return `<div class="ledger-funding-row">
        <div class="ledger-funding-name"><strong>${esc(def.name)}</strong><small>${esc(line.source)} · ${esc(EFFECT[def.id] ?? def.effect)}</small></div>
        <div class="ledger-funding-value"><b class="num">${line.value.toFixed(def.id === 'un' ? 3 : 2)}%</b><small class="num">${amount(line.value)}/yr</small></div>
        <div class="ledger-adjustments">${control(-1, 'Cut')}${control(1, 'Raise')}</div>
      </div>`;
    };
    const extra = [
      ['Other services (fixed)', n.budget.other],
      ['Industrial subsidies', E.subsidyPct],
      ['War operations', E.warOps],
      ['Immigration programs', E.migrationSpend],
      ['Interest on the debt', E.interestPct],
    ].filter(([, v]) => Math.abs(v) > 0.005).map(([k, v]) => `<div class="acc-row"><span>${k}</span><b class="num">${pct(v, 2)}</b><small class="num">${amount(v)}</small></div>`).join('');
    const taxRow = (t) => {
      const ctl = (dir) => { const why = taxChangeState(game, n, t.id, dir); return `<button class="ledger-adjust" data-tax="${t.id}" data-dir="${dir}" aria-label="${dir > 0 ? 'Raise' : 'Cut'} ${esc(t.name)}" title="${esc(why ?? `${dir > 0 ? 'Raise' : 'Cut'} by ${t.step} point · 10 political power`)}" ${why ? 'disabled' : ''}>${dir > 0 ? '+' : '−'}</button>`; };
      const change = E.tax[t.id] - E.tax0[t.id];
      return `<div class="ledger-funding-row">
        <div class="ledger-funding-name"><strong>${t.name}</strong><small>${t.note} · ${TAX_EFFECT[t.id]}</small></div>
        <div class="ledger-funding-value"><b class="num">${E.tax[t.id]}%</b><small class="num">${change ? `${sgn(change, 0)} since 2025` : 'unchanged'}</small></div>
        <div class="ledger-adjustments">${ctl(-1)}${ctl(1)}</div>
      </div>`;
    };
    const loanButton = (kind, label) => {
      const why = budgetLoanState(game, n, kind);
      return `<button class="btn" data-loan="${kind}" title="${esc(why ?? 'Costs 20 political power; available every 90 days')}" ${why ? 'disabled' : ''}>${label}</button>`;
    };
    const bal = -E.deficit;
    return `
      <div class="sup-kpis">
        <div><span>Revenue</span><b class="num">${pct(E.revPct)}</b><small>${amount(E.revPct)} a year</small></div>
        <div><span>Spending</span><b class="num">${pct(E.spendPct + E.interestPct)}</b><small>${amount(E.spendPct + E.interestPct)} incl. interest</small></div>
        <div><span>Balance</span><b class="num ${bal < -3 ? 'bad' : ''}">${sgn(bal)}%</b><small>${amount(Math.abs(bal))} ${bal < 0 ? 'borrowed' : 'repaid'} a year</small></div>
        <div><span>Public debt</span><b class="num">${pct(n.debt, 0)}</b><small>interest ${pct(E.interestPct, 2)} of GDP</small></div>
      </div>
      <section class="sup-sec ec-two">
        <div>
          <h2>Revenue</h2>
          <p class="sup-note">Share of GDP. Tax receipts rise in booms and fall in slumps; resource rents follow world prices.</p>
          ${revRows}
          <div class="acc-row total"><span>Total</span><b class="num">${pct(E.revPct, 2)}</b><small class="num">${amount(E.revPct)}</small></div>
        </div>
        <div>
          <h2>Taxes</h2>
          <p class="sup-note">Each change costs 10 political power and has a 30-day cooldown.</p>
          <div class="ledger-funding one">${TAXES.map(taxRow).join('')}</div>
        </div>
      </section>
      <section class="ledger-budget">
        <div class="ledger-budget-head"><div><h2>Spending</h2><p>Annual allocations as a share of GDP. Each change costs 10 political power and has a 30-day cooldown. Infrastructure pays for construction; military spending funds the arms industry.</p></div><div class="ledger-budget-total"><strong class="num">${pct(E.spendPct, 2)}</strong><span>Before interest</span></div></div>
        <div class="ledger-funding">${BUDGET_LINES.map(fundingRow).join('')}</div>
        <div class="ec-extra">${extra}</div>
      </section>
      <section class="ledger-loans"><div><h2>Treasury reserve</h2><p>Borrow 2% of GDP into a cash reserve that covers deficits before new debt is issued, or use it to repay bonds. Either costs 20 political power and has a 90-day cooldown.</p><div class="ledger-loan-actions">${loanButton('issue', 'Issue bonds')}${loanButton('repay', 'Repay bonds')}</div></div><div class="ledger-budget-total"><strong class="num">${money(n.budget.reserve)}</strong><span>Available reserve</span></div></section>`;
  }

  // ------------------------------------------------------------------------- construction
  _construction(n, E) {
    const usd = (v) => money((v * E.P) / E.xr);
    const infra = n.budget.lines.infrastructure.value;
    const monthly = (infra / 100) * E.Y * 0.7 * E.constrRatio / 12;
    const queue = E.projects.map((p, i) => {
      const def = PROJECTS[p.kind];
      const perMonth = p.cost / (def.days / 30);
      const left = p.cost - p.paid;
      const eta = p.rate > 0.01 ? Math.ceil(left / (perMonth * p.rate)) : null;
      return `<div class="ec-row proj">
        <span class="nm">${esc(def.name)}<small>${esc(def.desc)}${p.city ? ` · ${esc(p.city)}` : ''}</small></span>
        <span class="num">${usd(p.cost)}</span>
        <span class="ub">${bar(p.paid / p.cost, 2, 2)}<b class="num">${Math.floor((p.paid / p.cost) * 100)}%</b></span>
        <span class="num ${p.rate < 0.99 ? 'warn' : 'dim'}">${p.rate > 0.01 ? `${Math.round(p.rate * 100)}% speed` : 'waiting'}</span>
        <span class="num dim">${eta ? `${eta} mo` : '—'}</span>
        <span class="acts"><button data-up="${p.id}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button data-down="${p.id}" ${i < E.projects.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button class="rm" data-cancel="${p.id}" aria-label="Cancel project">✕</button></span>
      </div>`;
    }).join('');
    const full = E.projects.length >= MAX_PROJECTS;
    const options = Object.entries(PROJECTS).map(([k, def]) => `<div class="ec-row opt">
        <span class="nm">${esc(def.name)}<small>${esc(def.desc)}</small></span>
        <span class="num">${usd(projectCost(n, k))}</span>
        <span class="num dim">${Math.round(def.days / 30)} months at full speed</span>
        <button class="up" data-site="${k}" ${full ? 'disabled' : ''}>Place</button>
      </div>`).join('');
    const con = E.sectors.construction;
    return `
      <div class="sup-kpis">
        <div><span>Infrastructure budget</span><b class="num">${pct(infra, 2)}</b><small>${money((n.gdp * infra) / 100)} a year · set in the Budget tab</small></div>
        <div><span>Available to projects</span><b class="num">${usd(monthly)}</b><small>a month (70% of the budget)</small></div>
        <div><span>Spent on projects</span><b class="num">${pct(E.projSpendPct ?? 0, 2)}</b><small>of GDP; the rest maintains the network</small></div>
        <div><span>Construction sector</span><b class="num ${E.constrRatio < 1 ? 'bad' : ''}">${Math.round(con.U * 100)}%</b><small>${E.constrRatio < 1 ? `overstretched: projects run at ${Math.round(E.constrRatio * 100)}%` : 'utilisation, with room to build'}</small></div>
      </div>
      <section class="sup-sec">
        <h2>Construction queue</h2>
        <p class="sup-note">Projects are paid in order from the infrastructure budget, each at most its own pace. Money spent on projects no longer maintains the general network, which slowly costs productivity everywhere. Raise infrastructure spending to build more without that trade-off.</p>
        <div class="ec-row proj head"><span>Project</span><span>Cost</span><span>Progress</span><span>Funding</span><span>Done in</span><span></span></div>
        ${queue || '<p class="note">Nothing under construction. Queue a project below.</p>'}
      </section>
      <section class="sup-sec">
        <h2>Projects <button class="btn" data-map>Place on map</button></h2>
        <p class="sup-note">Costs reflect the capacity each building adds. Offices and office complexes require a city. ${full ? `The queue is full (${MAX_PROJECTS}).` : ''}</p>
        ${options}
      </section>`;
  }

  // ------------------------------------------------------------------------- industry
  _industry(n, E) {
    const { game } = this.ctx;
    const usd = (v) => money((v * E.P) / E.xr);
    const rows = SECTORS.filter((s) => s.id !== 'defence').map((s) => {
      const x = E.sectors[s.id];
      const ctl = (dir) => { const why = subsidyChangeState(game, n, s.id, dir); return `<button data-sub="${s.id}" data-dir="${dir}" ${why ? 'disabled' : ''} title="${esc(why ?? `${dir > 0 ? 'Raise' : 'Cut'} subsidy · 10 political power`)}" aria-label="${dir > 0 ? 'Raise' : 'Cut'} ${esc(s.name)} subsidy">${dir > 0 ? '+' : '−'}</button>`; };
      const inputs = Object.keys(s.dep).filter((c) => E.comm[c].r < 0.995).map((c) => COMMODITIES[c].name.toLowerCase());
      return `<div class="ec-row ind">
        <span class="nm">${esc(s.name)}<small>${inputs.length ? `short of ${inputs.join(', ')}` : s.makes ? `produces ${COMMODITIES[s.makes].name.toLowerCase()}` : 'inputs secure'}</small></span>
        <span class="num">${usd(x.cap * s.va)}</span>
        <span class="ub">${bar(x.U, 0.9, 0.96)}<b class="num">${Math.round(x.U * 100)}%</b></span>
        <span class="num">${usd(x.VA)}</span>
        <span class="num ${cls(x.growth - E.gTrend * 100)}">${sgn(x.growth)}%</span>
        <span class="num">${usd(x.I)}</span>
        <span class="step">${ctl(-1)}<span class="pips">${[0, 1, 2].map((i) => `<i class="${i < x.sub ? 'on' : ''}"></i>`).join('')}</span>${ctl(1)}</span>
      </div>`;
    }).join('');
    const limit = { budget: 'the procurement budget', capacity: 'plant capacity', inputs: 'metal and energy shortages', labour: 'a shortage of workers' }[E.milLimit];
    const capUsed = E.milCap > 0 ? E.milUsed / E.milCap : 0;
    return `
      <section class="sup-sec">
        <h2>Civilian industry</h2>
        <p class="sup-note">Capacity is value added at full use. Investment follows profits: busy sectors attract it. A subsidy level costs 4% of the sector's value added a year and raises investment in it by 35%.</p>
        <div class="ec-row ind head"><span>Sector</span><span>Capacity</span><span>Utilisation</span><span>Value added</span><span>Capacity growth</span><span>Investment / yr</span><span>Subsidy</span></div>
        ${rows}
      </section>
      <section class="sup-sec">
        <h2>Arms industry</h2>
        <p class="sup-note">Military factories are real plant. Defence spending funds one factory per $3bn a year; each turns $${OUT_PER_FACTORY.toFixed(2)}bn of metals, energy and labour into equipment. Arms makers expand slowly when orders outrun plant. Build military factories or complexes in Construction, or adopt the war economy to convert civilian factories.</p>
        <div class="sup-kpis">
          <div><span>Funded by the budget</span><b class="num">${E.milFunded.toFixed(0)}</b><small>factories · ${pct(n.budget.lines.military.value, 2)} of GDP</small></div>
          <div><span>Plant capacity</span><b class="num">${E.milCap.toFixed(0)}</b><small>${Math.round(capUsed * 100)}% in use</small></div>
          <div><span>Running</span><b class="num ${E.milLimit !== 'budget' ? 'warn' : ''}">${E.milUsed.toFixed(0)}</b><small>limited by ${limit}</small></div>
          <div><span>On production lines</span><b class="num">${E.milFactories}</b><small><button class="lnk" data-production>Open production</button></small></div>
        </div>
        <p class="sup-note">Built facilities: ${[
          [E.facilities.airports, 'airport'], [E.facilities.dockyards, 'dockyard'], [E.facilities.refineries, 'oil refinery'],
          [E.facilities.synth, 'synthetic fuel plant'], [E.facilities.silos, 'fuel depot'], [E.facilities.railYards, 'rail yard'],
          [E.facilities.campuses, 'research campus'], [E.facilities.dataCentres, 'data centre'], [E.facilities.airDefence, 'air defence site'],
        ].filter(([k]) => k > 0).map(([k, label]) => `${k} ${label}${k === 1 ? '' : 's'}`).join(' · ') || 'none yet'}. Most also expand the capacity of the sector that runs them.</p>
      </section>`;
  }

  // ------------------------------------------------------------------------- trade
  _trade(n, E) {
    const { game } = this.ctx;
    const W = game.econ;
    const usd = (v) => money((v * E.P) / E.xr);
    const a = E.acc ?? { X: 0, M: 0 };
    const tariffBtn = (dir) => { const why = tariffChangeState(game, n, dir); return `<button class="ledger-adjust" data-tariff="${dir}" ${why ? 'disabled' : ''} title="${esc(why ?? `${dir > 0 ? 'Raise' : 'Cut'} by 2.5 points · 10 political power`)}" aria-label="${dir > 0 ? 'Raise' : 'Cut'} the tariff">${dir > 0 ? '+' : '−'}</button>`; };
    const comm = COMMODITY_IDS.map((c) => {
      const k = E.comm[c];
      const net = k.exp - k.imp;
      const value = net * k.val * E.Y0;
      return `<div class="ec-row com">
        <span class="nm">${esc(COMMODITIES[c].name)}</span>
        <span class="num">${Math.round((k.prod / Math.max(1e-6, k.dem)) * 100)}%</span>
        <span class="num ${net >= 0 ? '' : 'dim'}">${net >= 0 ? 'exports' : 'imports'} ${usd(Math.abs(value))}</span>
        <span class="num ${W.prices[c] > 1.15 ? 'bad' : W.prices[c] < 0.9 ? 'good' : ''}">${W.prices[c].toFixed(2)}×</span>
        <span class="ub">${bar(k.r, 2, 2)}<b class="num ${k.r < 0.985 ? 'bad' : ''}">${Math.round(k.r * 100)}%</b></span>
        <span class="num">${k.stock.toFixed(1)} mo</span>
      </div>`;
    }).join('');
    const names = (set) => [...set].map((i) => game.nations[i]?.name).filter(Boolean);
    const by = names(n.sanctionedBy);
    const on = game.live().filter((t) => t.sanctionedBy?.has(n.index)).map((t) => t.name);
    return `
      <div class="sup-kpis">
        <div><span>Exports</span><b class="num">${usd(a.X)}</b><small>${pct((a.X / E.Y) * 100)} of GDP</small></div>
        <div><span>Imports</span><b class="num">${usd(a.M)}</b><small>${pct((a.M / E.Y) * 100)} of GDP</small></div>
        <div><span>Current account</span><b class="num ${E.ca < -4 ? 'bad' : ''}">${sgn(E.ca)}%</b><small>of GDP, incl. interest abroad</small></div>
        <div><span>Average tariff</span><span class="ec-ctl"><b class="num">${pct(E.tariff)}</b>${tariffBtn(-1)}${tariffBtn(1)}</span><small>${E.tariff > E.tariff0 ? 'partners retaliate against your exports' : 'raises revenue and prices; partners retaliate'}</small></div>
      </div>
      <section class="sup-sec">
        <h2>Strategic resources</h2>
        <p class="sup-note">Production against domestic demand. Importers depend on access: sanctions cut it, and a shortage cuts output in every sector that uses the resource and raises prices. Stockpiles cover a shortfall for a while. World prices follow what importers want against what exporters can sell.</p>
        <div class="ec-row com head"><span>Resource</span><span>Self-sufficiency</span><span>Net trade / yr</span><span>World price</span><span>Supply met</span><span>Stockpile</span></div>
        ${comm}
        <p class="sup-note">Export policy: <b>${esc(lawOption('exports', E.laws.exports).name)}</b>. <button class="lnk" data-etab="laws">Change it in Economic laws</button>.</p>
      </section>
      <section class="sup-sec ec-two">
        <div><h2>Sanctions on you</h2>${by.length ? `<p class="sup-note">${esc(by.join(', '))}. Together they cut ${Math.round(E.restr * 100)}% of your access to world trade and finance.</p>` : '<p class="sup-note">None.</p>'}</div>
        <div><h2>Your sanctions</h2>${on.length ? `<p class="sup-note">${esc(on.join(', '))}. Lost exports cost you ${Math.round(E.sanctionLoss * 100)}% of export demand.</p>` : '<p class="sup-note">None. Impose them from a country\'s diplomacy menu.</p>'}</div>
      </section>`;
  }

  // ------------------------------------------------------------------------- finance
  _finance(n, E) {
    const { game } = this.ctx;
    const rateWhy = rateChangeState(game, n, 1);
    const manual = !rateWhy || /Limit|political/.test(rateWhy);
    const rateBtn = (dir, step) => { const why = rateChangeState(game, n, dir); return `<button class="ledger-adjust" data-rate="${dir}" data-step="${step}" ${why ? 'disabled' : ''} title="${esc(why ?? `${dir > 0 ? 'Raise' : 'Cut'} by ${step} points · 2 political power`)}" aria-label="${dir > 0 ? 'Raise' : 'Cut'} the rate by ${step}">${dir > 0 ? '+' : '−'}${step === 1 ? '1' : ''}</button>`; };
    const debt = E.debtLoc + E.debtFx * E.xr;
    const fxShare = debt > 0 ? (E.debtFx * E.xr) / debt : 0;
    const months = E.reserves / Math.max(1e-6, (E.imports ?? 1) / 12);
    const interestRev = (E.interestPct / Math.max(1, E.revPct)) * 100;
    return `
      <div class="sup-kpis">
        <div><span>Policy rate</span><span class="ec-ctl"><b class="num">${pct(manual ? E.iSet : E.i, 2)}</b>${manual ? `${rateBtn(-1, 1)}${rateBtn(-1, 0.25)}${rateBtn(1, 0.25)}${rateBtn(1, 1)}` : ''}</span><small>${manual ? `you set it · the rule suggests ${pct(E.taylor, 2)}` : esc(E.euro ? 'set by the European Central Bank' : `set by rule: ${pct(E.taylor, 2)}`)}</small></div>
        <div><span>Inflation</span><b class="num">${pct(E.pi)}</b><small>expected ${pct(E.anchor)} · target ${E.target}%</small></div>
        <div><span>Credibility</span><b class="num">${Math.round(E.cred * 100)}%</b><small>how hard expectations cling to the target</small></div>
        <div><span>Real rate</span><b class="num">${pct(E.i - E.anchor, 2)}</b><small>policy rate less expected inflation</small></div>
      </div>
      <section class="sup-sec ec-two">
        <div>
          <h2>Government bonds</h2>
          <div class="acc-row"><span>Market yield</span><b class="num">${pct(E.yld, 2)}</b><small>policy rate + term premium ${E.risk >= 0 ? '+' : '−'} ${pct(Math.abs(E.risk), 2)} risk premium</small></div>
          <div class="acc-row"><span>Average rate on the debt</span><b class="num">${pct(E.rD, 2)}</b><small>old debt rolls over at market yields</small></div>
          <div class="acc-row"><span>Average maturity</span><b class="num">${(E.mat / 12).toFixed(1)} years</b><small>${(100 / E.mat).toFixed(1)}% of the debt refinances each month</small></div>
          <div class="acc-row"><span>Interest bill</span><b class="num">${pct(E.interestPct, 2)}</b><small>of GDP · ${interestRev.toFixed(0)}% of revenue</small></div>
          <div class="acc-row"><span>In foreign currency</span><b class="num">${pct(fxShare * 100, 0)}</b><small>grows when the currency falls</small></div>
          ${E.monetized > 0.01 ? `<div class="acc-row"><span>Bought by the central bank</span><b class="num">${pct(E.monetized, 2)}</b><small>of GDP a year, printed money</small></div>` : ''}
        </div>
        <div>
          <h2>Currency</h2>
          <div class="acc-row"><span>Regime</span><b>${esc(lawOption('currency', E.laws.currency).name)}</b><small>${E.euro ? 'shared with the euro area' : `<button class="lnk" data-etab="laws">change it</button>`}</small></div>
          <div class="acc-row"><span>Against the dollar</span><b class="num">${sgn((1 / E.xr - 1) * 100)}%</b><small>since January 2025</small></div>
          <div class="acc-row"><span>Reserves</span><b class="num">${money(E.reserves)}</b><small>${months.toFixed(1)} months of imports</small></div>
          <div class="acc-row"><span>Current account</span><b class="num">${sgn(E.ca)}%</b><small>of GDP</small></div>
          <div class="acc-row"><span>Payments pressure</span><b class="num ${E.pressure < -2 ? 'bad' : ''}">${sgn(E.pressure ?? 0)}%</b><small>${E.laws.currency === 'managed' ? 'paid from reserves to hold the peg' : 'moves the exchange rate'}</small></div>
        </div>
      </section>`;
  }

  // ------------------------------------------------------------------------- laws
  _laws(n, E) {
    const { game } = this.ctx;
    const laws = LAWS.map((law) => {
      const cur = E.laws[law.id];
      const curOpt = lawOption(law.id, cur);
      const opts = law.options.filter((o) => !o.locked || o.id === cur).map((o) => {
        const on = o.id === cur;
        const why = on ? null : lawChangeState(game, n, law.id, o.id);
        return `<button class="law-opt ${on ? 'on' : ''}" data-law="${law.id}" data-opt="${o.id}" ${on || why ? 'disabled' : ''} ${on ? 'aria-current="true"' : ''} title="${esc(why ?? `Adopt · ${LAW_COST.pp} political power`)}">
          <b>${esc(o.name)}</b>
          <span>${esc(o.desc)}</span>
          <small>${esc(modsText(o.mods))}</small>
          ${!on && why ? `<em>${esc(why)}</em>` : ''}
        </button>`;
      }).join('');
      return `<section class="sup-sec law"><h2>${esc(law.name)}</h2><p class="sup-note">In force: <b>${esc(curOpt.name)}</b>${E.lawCooldown[law.id] > game.time ? ` · can change in ${Math.ceil((E.lawCooldown[law.id] - game.time) / DAY)} days` : ''}</p><div class="law-opts">${opts}</div></section>`;
    }).join('');
    return `<p class="sup-note ec-lede">Each economic model has trade-offs rather than fixed bonuses. Changing a law costs ${LAW_COST.pp} political power, and it can't change again for ${LAW_COST.days} days. Effects are measured from your starting laws.</p>${laws}`;
  }
}

const EFFECT = {
  education: 'Productivity growth over years, stability',
  infrastructure: 'Construction projects, productivity',
  military: 'Arms factories, war support',
  health: 'Labour-force participation, stability',
  pensions: 'Household income, stability',
  housing: 'Construction demand, stability',
};
const TAX_EFFECT = {
  income: 'cuts take-home pay and labour supply',
  corporate: 'deters private investment',
  consumption: 'raises prices once, then revenue',
};

// Growth, inflation and unemployment by month, as a small line chart with labelled axes.
function historyChart(E) {
  const h = E.hist;
  if (h.length < 3) return '<section class="sup-sec"><h2>History</h2><p class="sup-note">The chart builds as months pass.</p></section>';
  const W = 640, H = 170, L = 34, R = 10, T = 10, B = 22;
  const growth = h.map((p, i) => (i >= 12 ? (p.Y / h[i - 12].Y - 1) * 100 : null));
  const series = [['Inflation', h.map((p) => p.pi), 'var(--signal)'], ['Unemployment', h.map((p) => p.u), 'var(--quiet)'], ['Growth', growth, 'var(--ink)']];
  const vals = series.flatMap(([, v]) => v.filter((x) => x != null));
  let lo = Math.min(0, ...vals), hi = Math.max(5, ...vals);
  lo = Math.floor(lo / 5) * 5; hi = Math.ceil(hi / 5) * 5;
  const x = (i) => L + (i / (h.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [];
  const step = (hi - lo) > 40 ? 20 : (hi - lo) > 20 ? 10 : 5;
  for (let v = lo; v <= hi; v += step) ticks.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'zero' : ''}"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}%</text>`);
  const paths = series.map(([, v, c]) => {
    let d = '';
    v.forEach((p, i) => { if (p == null) return; d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`; });
    return d ? `<path d="${d}" stroke="${c}"/>` : '';
  }).join('');
  const d0 = new Date(h[0].t), d1 = new Date(h[h.length - 1].t);
  const lab = (d) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `<section class="sup-sec"><h2>History</h2>
    <div class="ec-legend">${series.map(([k, , c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}<small>Growth appears after twelve months.</small></div>
    <svg class="ec-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Inflation, unemployment and growth by month">
      <g class="grid">${ticks.join('')}</g>
      <g class="lines">${paths}</g>
      <text x="${L}" y="${H - 6}" class="ax">${lab(d0)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="ax">${lab(d1)}</text>
    </svg></section>`;
}
