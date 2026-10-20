import { CLASSES, CLASS_IDS, MODEL, MODELS } from '../data/equipment.js';
import { PRODUCTION, assigned, lineOutput, addLine, setFactories, removeLine, moveLine, switchLine, autoAssign, costOf } from '../game/production.js';
import { COST } from '../game/templates.js';
import { milTabs } from './milTabs.js';
import { esc, int } from './format.js';

const fmt = (v) => (v >= 1000 ? int(v) : v >= 100 ? int(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const MONTH = 30;

// Production: military factories on lines that each build one real 2025 model, in priority order,
// feeding the stockpile that training, replacements, guns and drone units draw on.
export class ProductionScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'screen production-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Production');
    root.appendChild(this.el);
    this._html = '';
    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('change', (e) => this._change(e));
  }

  close() { this.el.hidden = true; }
  open() { if (this.ctx.game.player == null) return; this.el.hidden = false; this._html = ''; this.render(); }

  _done(why) { if (why) this.ctx.toast(why); this._html = ''; this.render(); }

  _change(e) {
    const n = this.ctx.game.nations[this.ctx.game.player];
    const t = e.target;
    if (t.matches('[data-switch]') && t.value) this._done(switchLine(n, +t.dataset.switch, t.value));
    else if (t.matches('[data-addline]') && t.value) this._done(addLine(n, t.value));
  }

  _click(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const { game, units } = this.ctx;
    const n = game.nations[game.player], d = b.dataset;
    let why = null;
    if (d.x !== undefined) { this.close(); return; }
    if (d.miltab) { this.ctx.openMilitary(d.miltab); return; }
    if (d.ledger !== undefined) { this.close(); this.ctx.openLedger(); return; }
    if (d.more) why = setFactories(n, +d.more, +(d.step ?? 1));
    else if (d.less) why = setFactories(n, +d.less, -(+(d.step ?? 1)));
    else if (d.up) moveLine(n, +d.up, -1);
    else if (d.down) moveLine(n, +d.down, 1);
    else if (d.rm) removeLine(n, +d.rm);
    else if (d.auto !== undefined) {
      const P = n.production;
      P.auto = !P.auto;
      if (P.auto) {
        // Reset: the general staff lays out lines for current shortages plus what the army fields.
        const want = units.armies.demand(n.index);
        for (const s of units.stacks) if (s.owner === n.index && s.tpl) for (const [k, v] of Object.entries(s.tpl.stats.eq)) want[k] = (want[k] ?? 0) + v * (COST[k] ?? 1) * s.divs * 0.02;
        autoAssign(n, want);
        P.auto = true;
      }
    }
    this._done(why);
  }

  render() {
    if (this.el.hidden) return;
    const { game, units } = this.ctx;
    const n = game.nations[game.player];
    if (!n?.production) return;
    const P = n.production;
    const used = assigned(n), free = P.factories - used;
    const short = units.armies.demand(n.index);
    const buildable = (cls) => MODELS.filter((m) => m.cls === cls && P.options.has(m.id));
    const lines = P.lines.map((l, i) => {
      const m = MODEL[l.model];
      const others = buildable(l.cls).filter((x) => x.id !== l.model);
      return `<div class="pl-card">
        <div class="pr"><button data-up="${i}" ${i ? '' : 'disabled'} aria-label="Raise priority">▲</button><b class="num">${i + 1}</b><button data-down="${i}" ${i < P.lines.length - 1 ? '' : 'disabled'} aria-label="Lower priority">▼</button></div>
        <div class="who"><b>${esc(m.name)}</b><span>${esc(m.role)}${l.licensed ? ' · <em>licensed</em>' : ''}</span>
          ${others.length ? `<select data-switch="${i}" aria-label="Switch this line to another model"><option value="">Switch model…</option>${others.map((x) => `<option value="${x.id}">${esc(x.name)} · ${(x.q * 100).toFixed(0)} · ${costOf(x, P.options.get(x.id)).toFixed(x.cost < 1 ? 3 : 1)} fd${P.options.get(x.id) ? ' (licence)' : ''}</option>`).join('')}</select>` : ''}</div>
        <div class="out"><b class="num">${fmt(lineOutput(l) * MONTH)}</b><span>${esc(CLASSES[l.cls].unit)}/mo</span></div>
        <div class="fac"><span>Base output</span><span class="step"><button data-less="${i}" aria-label="One fewer factory">−</button><b class="num">${l.factories}/${PRODUCTION.maxPerLine}</b><button data-more="${i}" ${free && l.factories < PRODUCTION.maxPerLine ? '' : 'disabled'} aria-label="One more factory">+</button><button data-more="${i}" data-step="5" ${free && l.factories < PRODUCTION.maxPerLine ? '' : 'disabled'} aria-label="Five more factories">+5</button></span></div>
        <div class="eff"><span>Efficiency</span><span class="sbar ${l.eff < 0.6 ? 'warn' : ''}"><i style="width:${Math.round(l.eff * 100)}%"></i></span><b class="num">${Math.round(l.eff * 100)}%</b></div>
        <button class="rm" data-rm="${i}" aria-label="Close this line">✕</button>
      </div>`;
    }).join('');
    const addOpts = CLASS_IDS.map((c) => `<optgroup label="${esc(CLASSES[c].name)}">${buildable(c).map((m) => `<option value="${m.id}">${esc(m.name)} · rating ${(m.q * 100).toFixed(0)} · ${costOf(m, P.options.get(m.id)).toFixed(m.cost < 1 ? 3 : 1)} fd${P.options.get(m.id) ? ' (licence)' : ''}</option>`).join('')}</optgroup>`).join('');
    const stock = CLASS_IDS.map((c) => {
      const have = Math.max(0, P.stock[c] ?? 0), made = P.rate[c] ?? 0, burn = P.burn[c] ?? 0;
      const net = made - burn;
      const cover = burn > made + 1e-9 ? have / (burn - made) : Infinity;
      const gap = (short[c] ?? 0) / (COST[c] ?? 1);
      return `<div class="st-row${gap > 0 ? ' short' : ''}">
        <span class="nm">${esc(CLASSES[c].name)}</span>
        <span class="num">${int(have)}</span>
        <span class="num ${P.quality[c] >= 1.15 ? 'good' : P.quality[c] < 0.9 ? 'warn' : ''}">${Math.round((P.quality[c] ?? 1) * 100)}</span>
        <span class="num">${fmt(made * MONTH)}</span>
        <span class="num">${fmt(burn * MONTH)}</span>
        <span class="num ${net < -1e-9 ? 'bad' : net > 1e-9 ? 'good' : 'dim'}">${net >= 0 ? '+' : '−'}${fmt(Math.abs(net) * MONTH)}</span>
        <span class="num ${cover < 30 ? 'bad' : cover < 90 ? 'warn' : 'dim'}">${cover === Infinity ? '—' : `${Math.floor(cover)} d`}</span>
        <span class="num ${gap > 0 ? 'bad' : 'dim'}">${gap > 0 ? int(gap) : '—'}</span>
      </div>`;
    }).join('');
    const html = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap mil-wrap">
        ${milTabs('production')}
        <header class="mil-head"><h1>Production</h1><p>Each line builds one model. New lines start at ${Math.round(PRODUCTION.startEff * 100)}% efficiency and reach full output over ${PRODUCTION.rampDays} days; switching a line to another model of the same kind keeps ${Math.round(PRODUCTION.switchKeep * 100)}% of its efficiency. Lines at the top keep their factories when the budget shrinks.</p></header>
        <div class="sup-kpis">
          <div><span>Military factories</span><b class="num">${used} / ${P.factories}</b><small>${free ? `${free} unassigned` : 'all assigned'}</small></div>
          <div><span>Defence spending</span><b class="num">${(n.defPct ?? 0).toFixed(1)}%</b><small>one factory per $${PRODUCTION.bnPerFactory}bn a year · <button class="lnk" data-ledger>ledger</button></small></div>
          <div><span>Output</span><b class="num">${fmt(P.lines.reduce((t, l) => t + Math.min(l.factories, PRODUCTION.maxPerLine) * l.eff, 0) * MONTH)}</b><small>factory-days a month</small></div>
          <div><span>Planning</span><b class="num">${P.auto ? 'Automatic' : 'Manual'}</b><small><button class="lnk" data-auto>${P.auto ? 'Take manual control' : 'Reset to the staff plan'}</button></small></div>
        </div>
        <section class="sup-sec">
          <h2>Production lines</h2>
          <div class="pl-list">${lines || '<p class="note">No lines.</p>'}</div>
          <div class="pl-add"><select data-addline ${free && P.lines.length < PRODUCTION.maxLines ? '' : 'disabled'} aria-label="Add a production line"><option value="">${free ? '＋ Add a production line…' : 'Free a factory to add a line'}</option>${addOpts}</select></div>
          <p class="sup-note">Rating is a game estimate of each system against its class. Your own designs and generic patterns are built at list cost; allies' designs under licence cost 30% more. ${P.auto ? 'The general staff rebalances lines toward shortages every month; changing a line takes manual control.' : ''}</p>
        </section>
        <section class="sup-sec">
          <h2>Stockpile</h2>
          <div class="st-row head"><span>Equipment</span><span>In stock</span><span>Rating</span><span>Made / mo</span><span>Used / mo</span><span>Net / mo</span><span>Lasts</span><span>Short</span></div>
          ${stock}
          <p class="sup-note">Rating is the average standard of the stock, moving toward what the lines build; division stats scale with it. “Short” is what under-strength divisions, those in training, and a month of artillery and drone use still need beyond the stock.</p>
        </section>
      </div>`;
    if (html === this._html) return;
    const scroll = this.el.scrollTop;
    this._html = html;
    this.el.innerHTML = html;
    this.el.scrollTop = scroll;
  }
}
