import { BATTALIONS, BATTALION_IDS, SUPPORT, SUPPORT_IDS, EQUIPMENT, COLS, ROWS, SUPPORT_SLOTS, MAX_WIDTH, DEFAULT_TEMPLATES, gridOf, makeTemplate, templateStats, templateProblem, sideProfile, strike } from '../game/templates.js';
import { MODEL } from '../data/equipment.js';
import { trainingLines } from '../game/armies.js';
import { preferred } from '../game/production.js';
import { counter } from './symbols.js';
import { milTabs } from './milTabs.js';
import { esc, int } from './format.js';

const ABBR = { inf: 'INF', motor: 'MOT', mech: 'MECH', tank: 'TANK', recon: 'RECON', spa: 'SPA', mlrs: 'MLRS', at: 'AT', shorad: 'SHORAD', drones: 'DRONE', ewbn: 'EW', para: 'PARA', marine: 'MAR' };
const SABBR = { engineers: 'ENG', logistics: 'LOG', maintenance: 'MAINT', medical: 'MED', police: 'MP', signals: 'SIG', recondrones: 'UAV', counterdrone: 'C-UAS', ewco: 'EW' };
const TYPE_NAME = { inf: 'Infantry', mech: 'Mechanised', armor: 'Armoured', airborne: 'Airborne', marine: 'Marine' };
const pct = (v) => `${Math.round(v * 100)}%`;
// Reference opponents for the matchup panel: the three standard division types at par equipment.
const RIVALS = DEFAULT_TEMPLATES.slice(0, 3).map((t) => ({ name: t.name.replace(' Division', ''), stats: templateStats(gridOf(t.cols), t.support) }));
const side = (stats) => sideProfile([{ tpl: { stats } }], () => 1);

// The army designer: Hearts of Iron IV's division grid (five combat columns, a support column)
// with the 2025 battalion catalog, and the resulting profile shown live against the combat
// triangle and the combined-arms factors (spotting, drones, electronic warfare, air defence).
export class DesignerScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'screen designer-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Army designer');
    root.appendChild(this.el);
    this.draft = null;
    this.pick = null; // { kind: 'combat' | 'support', i }
    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('input', (e) => { if (e.target.matches('[data-name]') && this.draft) { this.draft.name = e.target.value.slice(0, 40); this._dirty(); } });
  }

  close() { this.el.hidden = true; }

  open() {
    const n = this.ctx.game.nations[this.ctx.game.player];
    if (!n) return;
    if (!this.draft || (this.draft.id && !n.templates.some((t) => t.id === this.draft.id))) this._edit(n.templates[0]);
    this.el.hidden = false;
    this.render();
  }

  _edit(t) {
    this.pick = null;
    this.draft = t ? { id: t.id, name: t.name, grid: [...t.grid], support: [...t.support] } : { id: null, name: 'New Division', grid: gridOf([['inf', 'inf'], ['inf', 'inf'], ['spa']]), support: ['logistics'] };
  }

  // Updates just the save state while typing a name, without redrawing the input.
  _dirty() {
    const el = this.el.querySelector('[data-save]');
    const n = this.ctx.game.nations[this.ctx.game.player];
    const saved = n?.templates.find((t) => t.id === this.draft.id);
    if (el && saved) el.disabled = !!templateProblem(this.draft.grid, this.draft.support) || !this._changed(saved);
  }

  _changed(saved) { return saved.name !== this.draft.name || saved.grid.join() !== this.draft.grid.join() || saved.support.join() !== this.draft.support.join(); }

  _click(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const { game, units, toast } = this.ctx;
    const n = game.nations[game.player], d = b.dataset, dr = this.draft;
    if (d.x !== undefined) { this.close(); return; }
    if (d.miltab) { this.ctx.openMilitary(d.miltab); return; }
    if (d.pick) this._edit(n.templates.find((t) => t.id === d.pick));
    else if (d.blank !== undefined) this._edit(null);
    else if (d.slot) { const i = +d.slot; this.pick = this.pick?.kind === 'combat' && this.pick.i === i ? null : { kind: 'combat', i }; }
    else if (d.sslot) { const i = +d.sslot; this.pick = this.pick?.kind === 'support' && this.pick.i === i ? null : { kind: 'support', i }; }
    else if (d.put !== undefined && this.pick) {
      const id = d.put || null;
      if (this.pick.kind === 'combat') dr.grid[this.pick.i] = id;
      else {
        const s = [...dr.support];
        while (s.length <= this.pick.i) s.push(null);
        s[this.pick.i] = id;
        dr.support = s.filter(Boolean);
      }
      this.pick = null;
    } else if (d.save !== undefined || d.saveas !== undefined) {
      const why = templateProblem(dr.grid, dr.support);
      if (why) { toast(why); return; }
      const name = dr.name.trim() || 'Division';
      const existing = d.save !== undefined && n.templates.find((t) => t.id === dr.id);
      if (existing) {
        const t = makeTemplate(existing.id, name, dr.grid, dr.support, n.production.quality);
        Object.assign(existing, { name: t.name, grid: t.grid, support: t.support, bats: t.bats, stats: t.stats });
        units.retemplate(n.index, existing);
        toast(`${name} updated. Divisions on it refit to the new organisation.`);
      } else {
        const t = makeTemplate(`t${n.nextTemplate++}`, name, dr.grid, dr.support, n.production.quality);
        n.templates.push(t);
        dr.id = t.id;
        toast(`${name} saved.`);
      }
    } else if (d.del !== undefined) {
      const t = n.templates.find((x) => x.id === dr.id);
      if (!t) return;
      const using = units.stacks.filter((s) => s.tpl === t).length + units.armies.queue.filter((q) => q.tpl === t).length;
      if (using) { toast(`${using} division${using > 1 ? 's use' : ' uses'} this template.`); return; }
      if (n.templates.length <= 1) { toast('Keep at least one template.'); return; }
      n.templates = n.templates.filter((x) => x !== t);
      this._edit(n.templates[0]);
    } else if (d.train !== undefined) {
      const why = units.armies.train(game.player, dr.id, this.ctx.activeArmy() ?? 0);
      toast(why ?? 'Division queued for training.');
      this.ctx.refreshTop();
    }
    this.render();
  }

  _picker(n, st) {
    if (!this.pick) return '';
    const combat = this.pick.kind === 'combat';
    const cur = combat ? this.draft.grid[this.pick.i] : this.draft.support[this.pick.i];
    const taken = new Set(this.draft.support);
    const opts = combat
      ? BATTALION_IDS.map((id) => {
        const b = BATTALIONS[id];
        const over = st.width - (cur ? BATTALIONS[cur].width : 0) + b.width > MAX_WIDTH;
        const bits = [b.soft && `soft ${b.soft}`, b.arty && `artillery ${b.arty}`, b.drone && `drones ${b.drone}`, b.pierce && `pierce ${b.pierce}`, b.armor && `armour ${b.armor}`, b.recon && `recon ${pct(b.recon)}`, b.ew && `EW ${pct(b.ew)}`, b.aa && `air def ${pct(b.aa)}`].filter(Boolean).join(' · ');
        return `<button class="opt${id === cur ? ' on' : ''}" data-put="${id}" ${over ? 'disabled title="Over the width limit"' : ''}><b>${ABBR[id]}</b><span>${esc(b.name)}<small>${bits} · width ${b.width}</small></span></button>`;
      }).join('')
      : SUPPORT_IDS.map((id) => {
        const c = SUPPORT[id];
        return `<button class="opt${id === cur ? ' on' : ''}" data-put="${id}" ${taken.has(id) && id !== cur ? 'disabled title="Already in the support column"' : ''}><b>${SABBR[id]}</b><span>${esc(c.name)}<small>${esc(c.note)}</small></span></button>`;
      }).join('');
    return `<div class="picker" role="listbox" aria-label="${combat ? 'Combat battalions' : 'Support companies'}">
      <div class="ph2"><span>${combat ? `Column ${Math.floor(this.pick.i / ROWS) + 1}, row ${(this.pick.i % ROWS) + 1}` : 'Support company'}</span>${cur ? '<button class="lnk" data-put="">Remove</button>' : ''}</div>
      <div class="opts">${opts}</div></div>`;
  }

  render() {
    if (this.el.hidden) return;
    const { game, units } = this.ctx;
    const n = game.nations[game.player];
    if (!n || !this.draft) return;
    const dr = this.draft;
    const st = templateStats(dr.grid, dr.support, n.production.quality);
    const why = templateProblem(dr.grid, dr.support);
    const saved = n.templates.find((t) => t.id === dr.id);
    const dirty = !saved || this._changed(saved);
    const count = new Map();
    for (const s of units.stacks) if (s.owner === n.index && s.tpl) count.set(s.tpl, (count.get(s.tpl) ?? 0) + s.divs);
    const list = n.templates.map((t) => `<button class="dt-card${t.id === dr.id ? ' on' : ''}" data-pick="${t.id}">
        <span class="ic unit land own">${counter({ type: t.stats.type, ech: 'XX', num: t.stats.n, str: 1 })}</span>
        <span><b>${esc(t.name)}</b><small class="num">${t.stats.n} bn · width ${t.stats.width} · ${int(count.get(t) ?? 0)} fielded</small></span>
      </button>`).join('');
    const sel = (kind, i) => this.pick?.kind === kind && this.pick.i === i;
    const grid = Array.from({ length: COLS }, (_, c) => `<div class="gcol">${Array.from({ length: ROWS }, (_, r) => {
      const i = c * ROWS + r, id = dr.grid[i];
      return `<button class="slot${id ? ` f k-${id}` : ''}${sel('combat', i) ? ' sel' : ''}" data-slot="${i}" aria-label="${id ? esc(BATTALIONS[id].name) : 'Empty slot'}">${id ? `<b>${ABBR[id]}</b><small>${BATTALIONS[id].width}w</small>` : '+'}</button>`;
    }).join('')}</div>`).join('');
    const support = Array.from({ length: SUPPORT_SLOTS }, (_, i) => {
      const id = dr.support[i];
      return `<button class="slot sup${id ? ' f' : ''}${sel('support', i) ? ' sel' : ''}" data-sslot="${i}" aria-label="${id ? esc(SUPPORT[id].name) : 'Empty support slot'}">${id ? `<b>${SABBR[id]}</b>` : '+'}</button>`;
    }).join('');
    const stat = (k, v, hint = '') => `<div class="ds"><span>${k}</span><b class="num">${v}</b>${hint ? `<small>${hint}</small>` : ''}</div>`;
    const me = side(st);
    const matchups = RIVALS.map((r) => {
      const them = side(r.stats);
      const out = strike(me, them), back = strike(them, me);
      const edge = out.value / Math.max(1e-6, back.value);
      const note = out.holds ? 'cannot pierce their armour' : back.holds ? 'your armour holds' : them.hard > 0.3 && me.pierce + me.dpierce > me.soft ? 'your piercing gets through' : me.hard < 0.1 && them.soft + them.arty > me.soft + me.arty ? 'soft-skinned against their guns' : '';
      return `<div class="mu ${edge >= 1.15 ? 'good' : edge <= 0.87 ? 'bad' : ''}"><span>vs ${esc(r.name)}</span><b class="num">${edge.toFixed(2)}×</b><small>${note}</small></div>`;
    }).join('');
    const model = (cls) => { const l = n.production.lines.find((x) => x.cls === cls); return MODEL[l?.model]?.name ?? preferred(n.production, cls)?.name ?? ''; };
    const eqList = Object.entries(st.eq).map(([e, v]) => `<div class="eq"><span>${esc(EQUIPMENT[e].name)}<small>${esc(model(e))}</small></span><b class="num">${int(v)}</b><em class="num ${(n.production.stock[e] ?? 0) < v ? 'bad' : ''}">${int(Math.max(0, n.production.stock[e] ?? 0))} in stock</em></div>`).join('');
    const fx = st.fx;
    const supportFx = [fx.def && `+${pct(fx.def)} defence`, fx.dig && `dig in ${pct(fx.dig)} faster`, fx.supply && `${pct(-fx.supply)} less supply`, fx.eqUse && `${pct(-fx.eqUse)} less replacement equipment`, fx.menUse && `${pct(-fx.menUse)} fewer replacements`, fx.plan && `+${pct(fx.plan)} planning`, fx.org && `+${fx.org} organisation`].filter(Boolean);
    const lines = trainingLines(n), q = units.armies.queued(n.index).length;
    this.el.innerHTML = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap mil-wrap">
        ${milTabs('designer')}
        <header class="mil-head"><h1>Army designer</h1><p>Five combat columns and a support column. Piercing beats armour, armour beats soft attack, soft attack beats piercing. Guns need drones to spot for them; EW and counter-drone teams blind and down the enemy's.</p></header>
        <div class="designer">
          <aside class="dt-list">${list}<button class="dt-new" data-blank>＋ New template</button></aside>
          <section class="dt-edit">
            <div class="dt-top">
              <span class="ic unit land own">${counter({ type: st.type, ech: st.n >= 6 ? 'XX' : st.n >= 3 ? 'X' : 'II', num: st.n || 0, str: 1 })}</span>
              <input data-name value="${esc(dr.name)}" maxlength="40" aria-label="Template name">
              <span class="dt-type">${TYPE_NAME[st.type]} · ${st.n} battalions · ${dr.support.length} support · width <b class="${st.width > MAX_WIDTH ? 'bad' : ''}">${st.width}/${MAX_WIDTH}</b> · ${int(st.men)} troops</span>
            </div>
            <div class="dgrid">
              <div class="gsup"><span class="gl">Support</span>${support}</div>
              <div class="gcombat"><span class="gl">Combat battalions</span><div class="gcols">${grid}</div></div>
            </div>
            ${this._picker(n, st)}
            <div class="dt-actions">
              ${saved ? `<button class="btn primary" data-save ${why || !dirty ? 'disabled' : ''}>Save changes</button>` : ''}
              <button class="btn ${saved ? '' : 'primary'}" data-saveas ${why ? 'disabled' : ''}>Save as new template</button>
              ${saved ? `<button class="btn" data-train ${dirty || q >= lines ? 'disabled' : ''} title="${q >= lines ? 'All training lines are busy' : `Train one (${q}/${lines} lines busy)`}">Train one</button>` : ''}
              ${saved ? '<button class="btn" data-del>Delete</button>' : ''}
              ${why ? `<span class="warn">${esc(why)}</span>` : dirty && saved ? '<span class="dim">Unsaved changes</span>' : ''}
            </div>
          </section>
          <aside class="dt-stats">
            <h2>Combat</h2>
            ${stat('Soft attack', (st.soft + st.arty + st.drone).toFixed(0), `direct ${st.soft.toFixed(0)} · artillery ${st.arty.toFixed(0)} · drones ${st.drone.toFixed(0)}`)}
            ${stat('Piercing attack', (st.pierce + st.dpierce).toFixed(0), `penetration ${st.pen.toFixed(0)}${st.dpen ? ` · drones ${st.dpen.toFixed(0)} from above` : ''}`)}
            ${stat('Armour', st.armor.toFixed(1), `${pct(st.hard)} hard · blunts attackers that cannot pierce it`)}
            ${stat('Defence · Breakthrough', `${st.def.toFixed(0)} · ${st.brk.toFixed(0)}`)}
            ${stat('Organisation', st.org.toFixed(0))}
            <h2>Combined arms</h2>
            ${stat('Spotting', pct(st.recon), st.arty ? (st.recon < 0.3 ? 'guns fire half-blind without drones' : 'drones and recon direct the guns') : 'only matters with artillery')}
            ${stat('Electronic warfare', pct(st.ew), 'jams enemy drones and spotting')}
            ${stat('Counter-drone', pct(st.cdrone), 'downs enemy strike drones')}
            ${stat('Air defence', pct(st.aa), 'cancels enemy air support')}
            ${st.ammo || st.fpv ? stat('In battle uses', [st.ammo && `${st.ammo} rounds/h`, st.fpv && `${st.fpv} drones/h`].filter(Boolean).join(' · '), 'from the stockpile; short of it, guns and drones go quiet') : ''}
            ${supportFx.length ? stat('Support', '', supportFx.join(' · ')) : ''}
            <h2>Against</h2>
            <div class="mus">${matchups}</div>
            <h2>Cost</h2>
            ${stat('Training', `${st.days} d`)}
            ${stat('Equipment', `${int(st.cost)} fd`, 'factory-days to equip one division')}
            <div class="eqs">${eqList}</div>
          </aside>
        </div>
      </div>`;
  }
}
