import { day, esc, flagHTML, int, money, pct, usd } from './format.js';
import { BUDGET_LINES, budgetTotal, budgetDelta, budgetChangeState, changeBudget, budgetLoanState, takeBudgetLoan } from '../game/budget.js';

const row = (label, value, source) => `<div class="ledger-row"><span>${label}</span><strong class="num">${value ?? 'Not available'}</strong><small>${source}</small></div>`;

// The ledger is deliberately limited to the player's country. Current values come from the
// simulation; the military snapshot is read from the local WatchTower import when available.
export class LedgerScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'screen ledger-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Country ledger');
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) { this.close(); return; }
      const { game } = this.ctx;
      const n = game.nations[game.player];
      const funding = e.target.closest('[data-budget]');
      const loan = e.target.closest('[data-loan]');
      if (!n || (!funding && !loan)) return;
      const why = funding
        ? changeBudget(game, n, funding.dataset.budget, Number(funding.dataset.dir))
        : takeBudgetLoan(game, n, loan.dataset.loan);
      if (why) this.ctx.toast(why);
      else this.ctx.toast(funding ? 'Funding updated.' : 'Borrowing updated.');
      this.render();
      this.ctx.refreshTop();
    });
  }

  close() { this.el.hidden = true; }

  open() {
    if (this.ctx.game.player == null) return;
    this.el.hidden = false;
    this.render();
    this.el.scrollTop = 0;
  }

  render() {
    if (this.el.hidden) return;
    const { game } = this.ctx;
    const n = game.nations[game.player];
    if (!n) return;
    const military = n.wt?.military;
    const snapshot = game.world.wt?.importedAt;
    const perCapita = n.pop > 0 ? `$${int(n.gdp * 1000 / n.pop)}` : null;
    const scroll = this.el.scrollTop;
    const active = this.el.contains(document.activeElement) ? {
      budget: document.activeElement.dataset.budget,
      direction: document.activeElement.dataset.dir,
      loan: document.activeElement.dataset.loan,
    } : null;
    const fundingRow = (definition) => {
      const line = n.budget.lines[definition.id];
      const amount = money(n.gdp * line.value / 100);
      const rate = `${line.value.toFixed(definition.id === 'un' ? 3 : 2)}%`;
      const control = (direction, label) => {
        const why = budgetChangeState(game, n, definition.id, direction);
        return `<button class="ledger-adjust" data-budget="${definition.id}" data-dir="${direction}" aria-label="${label} ${esc(definition.name)} funding by ${definition.step} percentage points of GDP" title="${esc(why ?? `${label} by ${definition.step} points · 10 political power`)}" ${why ? 'disabled' : ''}>${direction > 0 ? '+' : '−'}</button>`;
      };
      const raiseStatus = budgetChangeState(game, n, definition.id, 1);
      const cutStatus = budgetChangeState(game, n, definition.id, -1);
      const status = raiseStatus && cutStatus ? raiseStatus : definition.effect;
      return `<div class="ledger-funding-row">
        <div class="ledger-funding-name"><strong>${esc(definition.name)}</strong><small>${esc(line.source)} · ${esc(status)}</small></div>
        <div class="ledger-funding-value"><b class="num">${rate}</b><small class="num">${amount}/yr</small></div>
        <div class="ledger-adjustments">${control(-1, 'Cut')}${control(1, 'Raise')}</div>
      </div>`;
    };
    const loanButton = (kind, label) => {
      const why = budgetLoanState(game, n, kind);
      return `<button class="btn" data-loan="${kind}" title="${esc(why ?? 'Costs 20 political power; available every 90 days')}" ${why ? 'disabled' : ''}>${label}</button>`;
    };
    this.el.innerHTML = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap ledger-wrap">
        <header class="ledger-head">
          ${flagHTML(n)}
          <div><h1>${esc(n.name)} ledger</h1><p>National accounts · ${day(game.time)}</p></div>
        </header>
        <div class="ledger-body">
          <section>
            <h2>Economy</h2>
            ${row('GDP', money(n.gdp), 'Simulated')}
            ${row('GDP per capita', perCapita, 'Simulated')}
            ${row('Inflation', pct(n.inflation, 1), 'Simulated')}
            ${row('Unemployment', pct(n.unemployment, 1), 'Simulated')}
            ${row('Public debt', pct(n.debt, 0), 'Share of GDP · simulated')}
          </section>
          <section>
            <h2>People & defence</h2>
            ${row('Population', n.pop >= 1 ? `${n.pop.toFixed(1)}m` : `${int(n.pop * 1000)}k`, 'Simulated baseline')}
            ${row('Active personnel', military?.active == null ? null : int(military.active), 'WatchTower snapshot')}
            ${row('Defence budget', military?.budgetUsd == null ? null : usd(military.budgetUsd), 'WatchTower snapshot')}
          </section>
        </div>
        <section class="ledger-budget">
          <div class="ledger-budget-head"><div><h2>Funding decisions</h2><p>Annual allocations as a share of GDP. Each change costs 10 political power and has a 30-day cooldown.</p></div><div class="ledger-budget-total"><strong class="num">${budgetTotal(n.budget).toFixed(2)}%</strong><span>Game budget total</span></div></div>
          <div class="ledger-funding">${BUDGET_LINES.map(fundingRow).join('')}</div>
          <div class="ledger-budget-foot"><span>Other services (fixed)</span><b class="num">${n.budget.other.toFixed(2)}%</b></div>
          <p class="ledger-budget-effect">Change from starting budget: <b class="num">${budgetDelta(n.budget) >= 0 ? '+' : ''}${budgetDelta(n.budget).toFixed(3)}% of GDP yearly</b>. Higher spending adds to debt unless covered by reserves; cuts reduce borrowing.</p>
        </section>
        <section class="ledger-loans"><div><h2>Loans & reserves</h2><p>Borrow 2% of GDP into reserves to cover extra spending, or repay it. Either action costs 20 political power and has a 90-day cooldown.</p><div class="ledger-loan-actions">${loanButton('issue', 'Issue bonds')}${loanButton('repay', 'Repay bonds')}</div><small class="ledger-loan-status">${esc(budgetLoanState(game, n, 'issue') && budgetLoanState(game, n, 'repay') ? budgetLoanState(game, n, 'issue') : 'Ready')}</small></div><div class="ledger-budget-total"><strong class="num">${money(n.budget.reserve)}</strong><span>Available reserve</span></div></section>
        <p class="ledger-source">WatchTower data is stored in this game. Economy and population start from its baseline where available, then follow the simulation. Military personnel and budget above are a static import${snapshot ? ` from ${esc(snapshot)}` : ''}. Funding allocations marked “Observed” use <a href="https://data.worldbank.org/" target="_blank" rel="noopener noreferrer">World Bank</a> education, health, and military data or <a href="https://www.oecd.org/en/publications/pensions-at-a-glance-2025_e40274c1-en/full-report/public-expenditure-on-pensions_ddc9a2dd.html" target="_blank" rel="noopener noreferrer">OECD</a> pension data. Other allocations and all decision effects are game estimates.</p>
      </div>`;
    if (scroll) this.el.scrollTop = scroll;
    if (active?.budget) this.el.querySelector(`[data-budget="${active.budget}"][data-dir="${active.direction}"]:not(:disabled)`)?.focus({ preventScroll: true });
    else if (active?.loan) this.el.querySelector(`[data-loan="${active.loan}"]:not(:disabled)`)?.focus({ preventScroll: true });
  }
}
