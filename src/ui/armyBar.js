import { trainingLines } from '../game/armies.js';
import { SUPPLY, LEVEL_CAP } from '../game/supply.js';
import { esc, int } from './format.js';

const TOOL_HINT = {
  front: 'Front line: click the enemy country. The army spreads along your border with it and follows it as it moves.',
  fallback: 'Fallback line: click points on your own ground, then Enter or right-click to finish. Divisions dig in faster there.',
  offensive: 'Offensive line: click points across enemy ground, then Enter or right-click to finish. Execute to push to it.',
  hub: `Supply hub: click your own ground. ${SUPPLY.buildPP} political power; opens at level ${SUPPLY.buildLevel} (${LEVEL_CAP[SUPPLY.buildLevel]} divisions) in ${SUPPLY.buildDays} days.`,
};

const stanceText = (g, a) => {
  if (a.executing) return a.offensive ? 'Attacking to objective' : 'Attacking along front';
  if (a.stance === 'fallback' && a.fallback) return 'Holding fallback line';
  if (a.front) return `Holding front: ${g.nations[a.front.target].name}`;
  if (a.offensive) return 'Offensive drawn';
  return 'No orders';
};

// The army strip along the bottom of the map: one card per army, the battle-plan tools for the
// active army, supply hub construction and the training queue that feeds new divisions forward.
export class ArmyBar {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'armybar';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.hint = document.createElement('div');
    this.hint.className = 'toolhint';
    this.hint.hidden = true;
    root.appendChild(this.hint);
    this.trainOpen = false;
    this._html = '';
    this._hint = '';
    this.el.addEventListener('click', (e) => this._click(e));
  }

  show() { this.el.hidden = false; this.render(); }

  _click(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const { game, units, toast } = this.ctx;
    const A = units.armies, p = game.player;
    const a = A.byId.get(this.ctx.activeArmy());
    const d = b.dataset;
    let why = null;
    if (d.army) {
      const army = A.byId.get(+d.army);
      if (!army) return;
      const members = A.members(army);
      if (this.ctx.activeArmy() === army.id && members.length) {
        const c = members.reduce((acc, s) => ({ lat: acc.lat + s.lat / members.length, lon: acc.lon + s.lon / members.length }), { lat: 0, lon: 0 });
        this.ctx.cam.flyTo(c.lat, c.lon, Math.min(this.ctx.cam.goal.dist, 0.14));
      }
      this.ctx.setActiveArmy(army.id);
      this.ctx.selectUnits(members);
    } else if (d.new !== undefined) {
      const sel = this.ctx.selectedUnits().filter((s) => s.owner === p && s.kit);
      if (!sel.length) { toast('Select your divisions first, then form them into an army.'); return; }
      const army = A.create(p, sel);
      this.ctx.setActiveArmy(army.id);
      this.ctx.selectUnits(A.members(army));
    } else if (d.tool) {
      if (d.tool !== 'hub' && !a) return;
      const cur = this.ctx.tool();
      if (cur?.kind === d.tool) this.ctx.setTool(null);
      else this.ctx.setTool({ kind: d.tool, army: a?.id, pts: d.tool === 'fallback' || d.tool === 'offensive' ? [] : null });
    } else if (d.exec !== undefined && a) why = A.execute(a, !a.executing);
    else if (d.stance !== undefined && a) why = A.setStance(a, a.stance === 'fallback' ? 'front' : 'fallback');
    else if (d.clear && a) A.clear(a, d.clear);
    else if (d.disband !== undefined && a) { A.disband(a); this.ctx.setActiveArmy(null); }
    else if (d.trainpanel !== undefined) this.trainOpen = !this.trainOpen;
    else if (d.design !== undefined) { this.ctx.openMilitary('designer'); return; }
    else if (d.train) why = A.train(p, d.train, a?.id ?? 0);
    else if (d.cancel) A.cancel(+d.cancel);
    if (why) toast(why);
    this.render();
    this.ctx.refreshTop?.();
  }

  render() {
    if (this.el.hidden) return;
    const { game, units } = this.ctx;
    const A = units.armies, p = game.player;
    if (p == null) return;
    const n = game.nations[p];
    const active = this.ctx.activeArmy();
    const tool = this.ctx.tool();
    const armies = A.of(p);
    const canNew = this.ctx.selectedUnits().some((s) => s.owner === p && s.kit);
    const cards = armies.map((a) => {
      const m = A.members(a);
      const divs = m.reduce((t, s) => t + s.divs, 0);
      const sup = m.length ? m.reduce((t, s) => t + s.supply, 0) / m.length : 1;
      const str = m.length ? m.reduce((t, s) => t + s.str, 0) / m.length : 0;
      return `<button class="ab-card${a.id === active ? ' on' : ''}${a.executing ? ' exec' : ''}" data-army="${a.id}" title="${a.id === active ? 'Click again to fly to this army' : 'Select this army'}">
        <span class="nm">${esc(a.name)}</span>
        <span class="meta num">${+divs.toFixed(1)} div · ${Math.round(str * 100)}% str · <em class="${sup < 0.25 ? 'bad' : sup < 0.5 ? 'warn' : ''}">${Math.round(sup * 100)}% sup</em></span>
        <span class="st">${esc(stanceText(game, a))}</span>
        <span class="plan" title="Planning bonus ${Math.round(a.plan * 30)}%"><i style="width:${Math.round(a.plan * 100)}%"></i></span>
      </button>`;
    }).join('');
    const a = A.byId.get(active);
    const on = (k) => (tool?.kind === k ? ' on' : '');
    const actions = a && a.owner === p ? `<div class="ab-act" role="toolbar" aria-label="${esc(a.name)} orders">
        <button data-tool="front" class="${on('front')}" title="Trace a front line along the border with an enemy">Front line</button>
        <button data-tool="fallback" class="${on('fallback')}" title="Draw a defensive line to fall back to and dig in on">Fallback line</button>
        <button data-tool="offensive" class="${on('offensive')}" title="Draw the objective line for an offensive">Offensive line</button>
        <span class="sep"></span>
        <button data-exec class="go${a.executing ? ' hot' : ''}" ${a.front || a.offensive ? '' : 'disabled'}>${a.executing ? 'Halt offensive' : `Execute <small>+${Math.round(a.plan * 30)}%</small>`}</button>
        ${a.front && a.fallback ? `<button data-stance>${a.stance === 'fallback' ? 'Return to front' : 'Fall back'}</button>` : ''}
        <span class="sep"></span>
        ${a.offensive ? '<button data-clear="offensive" class="x" title="Remove the offensive line">✕ Offensive</button>' : ''}
        ${a.fallback ? '<button data-clear="fallback" class="x" title="Remove the fallback line">✕ Fallback</button>' : ''}
        ${a.front ? '<button data-clear="front" class="x" title="Remove the front line">✕ Front</button>' : ''}
        <button data-disband class="x" title="Disband the army; its divisions stay where they are">Disband</button>
      </div>` : '';
    const q = A.queued(p);
    const lines = trainingLines(n);
    const day = 86400000;
    const train = this.trainOpen ? `<div class="ab-train">
        <div class="h"><b>Training</b><span class="num">${q.length} / ${lines} lines · ${int(n.manpower)}k manpower</span></div>
        ${n.templates.map((t) => `<div class="row"><span>${esc(t.name)}</span><span class="num">${Math.ceil(t.stats.men / 1000)}k · ${t.stats.days} d</span><button data-train="${t.id}" ${q.length >= lines || n.manpower < Math.ceil(t.stats.men / 1000) ? 'disabled' : ''}>Train</button></div>`).join('')}
        <button class="lnk ab-design" data-design>Design a division…</button>
        ${q.length ? `<div class="queue">${q.map((x) => {
          const f = Math.min(1, (game.time - x.start) / (x.ready - x.start));
          const to = A.byId.get(x.army);
          return `<div class="qi"><span>${esc(x.tpl.name)}${to ? ` → ${esc(to.name)}` : ''}</span><span class="num">${Math.ceil((x.ready - game.time) / day)} d</span><button data-cancel="${x.id}" aria-label="Cancel">✕</button><i style="width:${Math.round(f * 100)}%"></i></div>`;
        }).join('')}</div>` : ''}
        <p>New divisions deploy at the hub nearest ${a ? esc(a.name) : 'the capital'}${a ? ' and join it as reinforcements' : ''}. Lines come from defence spending.</p>
      </div>` : '';
    const html = `${train}<div class="ab-row">
        <div class="ab-cards">${cards}<button class="ab-new" data-new ${canNew ? '' : 'disabled'} title="Form an army from the selected divisions">＋ Army</button></div>
        <div class="ab-logi">
          <button data-tool="hub" class="${on('hub')}" title="Build a supply hub (${SUPPLY.buildPP} political power)">Supply hub</button>
          <button data-trainpanel class="${this.trainOpen ? 'on' : ''}">Training <span class="num">${q.length}/${lines}</span></button>
        </div>
      </div>${actions}`;
    if (html !== this._html) { this._html = html; this.el.innerHTML = html; }
    const hint = tool ? `${TOOL_HINT[tool.kind]}${tool.pts?.length ? ` (${tool.pts.length} point${tool.pts.length > 1 ? 's' : ''})` : ''} · Esc cancels` : '';
    if (hint !== this._hint) { this._hint = hint; this.hint.textContent = hint; this.hint.hidden = !hint; }
  }
}
