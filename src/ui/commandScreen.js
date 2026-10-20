import { day, esc, flagHTML, int } from './format.js';
import { milTabs } from './milTabs.js';
import { DOCTRINE, TRAITS, XP, doctrineBlocker, doctrineCost, takeDoctrine, assignCommander, toggleExercises, rankName, armySummaries, autoAssign } from '../game/commanders.js';
import { fuelDays, FUEL } from '../game/fuel.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const bar = (v, cls = '') => `<span class="sbar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>`;
const fx = (f) => Object.entries(f).map(([k, v]) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}% ${LABEL[k] ?? k}`).join(' · ');
const LABEL = {
  atk: 'attack', def: 'defence', org: 'organisation', speed: 'speed', planning: 'planning',
  supply: 'supply use', fuel: 'fuel use', manpower: 'manpower', casualties: 'casualties', xp: 'experience',
};

// The general staff: who commands which army, what they have learned, the doctrine the country
// fights by, and whether there is fuel in the tanks to fight with.
export class CommandScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'screen command-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Command');
    root.appendChild(this.el);
    this._html = '';
    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-assign]');
      if (!sel) return;
      const n = this.ctx.game.nations[this.ctx.game.player];
      assignCommander(n, sel.dataset.assign, sel.value === '' ? null : +sel.value);
      this.render();
    });
  }

  close() { this.el.hidden = true; }

  open() {
    if (this.ctx.game.player == null) return;
    this.el.hidden = false;
    this._html = '';
    this.render();
    this.el.scrollTop = 0;
  }

  _click(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const { game } = this.ctx;
    const n = game.nations[game.player];
    const d = b.dataset;
    if (d.x !== undefined) { this.close(); return; }
    if (d.miltab) { this.ctx.openMilitary(d.miltab); return; }
    if (d.doctrine) {
      const why = doctrineBlocker(n, d.doctrine);
      if (why) { this.ctx.toast(why); return; }
      takeDoctrine(game, n, d.doctrine);
      this.render();
      return;
    }
    if (d.exercises !== undefined) {
      toggleExercises(n);
      this.ctx.toast(n.command.exercises ? 'The army goes on exercises. Experience accrues; equipment wears.' : 'Exercises stood down.');
      this.render();
    }
  }

  render() {
    if (this.el.hidden) return;
    const { game, units } = this.ctx;
    const n = game.nations[game.player];
    if (!n?.command) return;
    const C = n.command;
    const F = n.fuel ?? {};
    const stacks = units?.stacks ?? [];
    const armies = armySummaries(n, stacks);
    autoAssign(n, armies); // an army in the field always has someone in front of it
    const armyName = new Map((units?.armies?.of(n.index) ?? []).map((a) => [a.id, a.name]));
    const days = fuelDays(n);

    const officer = (o) => {
      const army = armies.find((a) => a.id === o.army);
      return `<div class="cmd-officer">
        <div class="cmd-who">
          <b>${esc(rankName(o))} ${esc(o.name)}</b>
          <span class="cmd-level">Level ${o.level}</span>
          <span class="cmd-xp">${bar(o.xp / XP.levelCost(o.level))}<small class="num">${Math.round(o.xp)} / ${XP.levelCost(o.level)} xp</small></span>
        </div>
        <dl class="cmd-skills">
          ${[['attack', 'Attack'], ['defence', 'Defence'], ['planning', 'Planning'], ['logistics', 'Logistics']]
            .map(([k, label]) => `<div><dt>${label}</dt><dd class="num">${o.skill[k]}</dd></div>`).join('')}
        </dl>
        <div class="cmd-traits">
          ${o.traits.length
            ? o.traits.map((t) => `<span class="chip" title="${esc(TRAITS[t].desc)}">${esc(TRAITS[t].name)}</span>`).join('')
            : '<span class="cmd-none">No traits yet — they come from the fighting this officer actually does.</span>'}
        </div>
        <label class="cmd-assign">Command
          <select data-assign="${o.id}" aria-label="Army commanded by ${esc(o.name)}">
            <option value="" ${o.army == null ? 'selected' : ''}>Unassigned</option>
            ${[...armyName].map(([id, name]) => `<option value="${id}" ${o.army === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}
          </select>
        </label>
        ${army ? `<p class="cmd-field">${army.divs} divisions · ${pct(army.armourShare)} armoured · ${army.engaged ? 'in contact' : army.attacking ? 'on the move' : 'holding'}</p>` : '<p class="cmd-field dim">Not in the field.</p>'}
      </div>`;
    };

    const branch = ([key, b]) => {
      const taken = C.doctrine[key];
      const cost = doctrineCost(n, key);
      const why = doctrineBlocker(n, key);
      return `<section class="cmd-branch">
        <h3>${esc(b.name)} <em>${taken}/${b.steps.length}</em></h3>
        <p>${esc(b.desc)}</p>
        <ol class="cmd-steps">
          ${b.steps.map((s, i) => `<li class="${i < taken ? 'done' : i === taken ? 'next' : ''}">
            <b>${esc(s.name)}</b>
            <span class="cmd-fx">${fx(s.fx)}</span>
            <span class="num">${i < taken ? 'adopted' : `${s.cost} xp`}</span>
          </li>`).join('')}
        </ol>
        <button class="btn ${why ? '' : 'signal'}" data-doctrine="${key}" ${why ? 'disabled' : ''} title="${esc(why ?? '')}">
          ${cost == null ? 'Branch complete' : `Adopt next step <small class="num">${cost} xp</small>`}
        </button>
      </section>`;
    };

    const html = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap command-wrap">
        ${milTabs('command')}
        <header class="ledger-head">
          ${flagHTML(n)}
          <div><h1>Command</h1><p>${esc(n.name)} general staff · ${day(game.time)}</p></div>
          <div class="sup-actions">
            <button class="btn ${C.exercises ? 'signal' : ''}" data-exercises>${C.exercises ? 'Stand down exercises' : 'Begin exercises'}</button>
          </div>
        </header>
        <div class="sup-kpis">
          <div><span>Army experience</span><b class="num">${Math.round(C.xp)}</b><small>${C.spent ? `${Math.round(C.spent)} spent so far` : 'nothing spent yet'}</small></div>
          <div><span>Doctrine</span><b class="num">${Object.values(C.doctrine).reduce((a, v) => a + v, 0)} / 16</b><small>steps adopted</small></div>
          <div><span>Fuel</span><b class="num ${F.ratio < 0.95 ? 'bad' : ''}">${int(Math.round(F.stock ?? 0))}<small> kt</small></b><small>${days === Infinity ? 'nothing is burning it' : `${days.toFixed(0)} days at today's burn`}</small></div>
          <div><span>Officers</span><b class="num">${C.officers.length}</b><small>${C.officers.filter((o) => o.army != null).length} in the field</small></div>
        </div>

        <section class="sup-sec cmd-fuel">
          <h2>Fuel</h2>
          <p class="sup-note">Refined at home, bought abroad, burned by anything with an engine. An army that
            runs dry still moves and fights, at a fraction of its pace — armour worst, infantry least.</p>
          <div class="cmd-fuel-grid">
            <div><span>Refined at home</span><b class="num">${(F.prod ?? 0).toFixed(0)} kt/day</b></div>
            <div><span>Imported</span><b class="num">${(F.imports ?? 0).toFixed(0)} kt/day</b></div>
            <div><span>Burned</span><b class="num">${(F.use ?? 0).toFixed(0)} kt/day</b></div>
            <div><span>Reserve</span>${bar((F.stock ?? 0) / Math.max(1, F.cap ?? 1), (F.stock ?? 0) < (F.cap ?? 1) * 0.2 ? 'warn' : '')}<b class="num">${pct((F.stock ?? 0) / Math.max(1, F.cap ?? 1))}</b></div>
          </div>
          ${F.deals?.length
            ? `<ul class="cmd-deals">${F.deals.map((d) => `<li><b>${esc(game.nations[d.with]?.name ?? 'Unknown')}</b><span class="num">${d.kt.toFixed(0)} kt/day</span><small>until ${day(d.until)}</small></li>`).join('')}</ul>`
            : `<p class="cmd-none">No standing import deals. One can be signed from the country panel's decisions for ${FUEL.dealPP} political power.</p>`}
        </section>

        <section class="sup-sec">
          <h2>Officers</h2>
          <p class="sup-note">Experience comes from command in the field. Traits come from the kind of war an
            officer keeps fighting, and stay with them.</p>
          <div class="cmd-officers">${C.officers.map(officer).join('')}</div>
        </section>

        <section class="sup-sec">
          <h2>Land doctrine</h2>
          <p class="sup-note">Army experience buys doctrine, and doctrine moves every formation in the country,
            not just the one in front of it.</p>
          <div class="cmd-branches">${Object.entries(DOCTRINE).map(branch).join('')}</div>
        </section>
      </div>`;
    if (html === this._html) return;
    this._html = html;
    this.el.innerHTML = html;
  }
}
