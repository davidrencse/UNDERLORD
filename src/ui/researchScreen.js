import { MODEL } from '../data/equipment.js';
import { TECHS, TECH, CATEGORIES, CATEGORY_IDS, RESEARCH, slotsFor, speedFor, rdBn, costOf, aheadOf, daysLeft, canResearch, isActive, startResearch, cancelResearch, freeSlot, effectsOf } from '../game/research.js';
import { milTabs } from './milTabs.js';
import { esc, int } from './format.js';

const yearOf = (t) => new Date(t).getUTCFullYear();

// Research: Hearts of Iron IV's slots and technology tree, over the 2025 equipment catalog. Each
// slot works on one technology; finished ones unlock models for the production lines or improve
// a whole class of equipment.
export class ResearchScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'screen research-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Research');
    root.appendChild(this.el);
    this._html = '';
    this.slot = null; // the slot the next pick goes into
    this.el.addEventListener('click', (e) => this._click(e));
  }

  close() { this.el.hidden = true; }
  open() { if (this.ctx.game.player == null) return; this.el.hidden = false; this._html = ''; this.render(); }

  _click(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const { game } = this.ctx;
    const n = game.nations[game.player], d = b.dataset;
    if (d.x !== undefined) { this.close(); return; }
    if (d.miltab) { this.ctx.openMilitary(d.miltab); return; }
    if (d.ledger !== undefined) { this.close(); this.ctx.openLedger(); return; }
    let why = null;
    if (d.cancel !== undefined) { cancelResearch(n, +d.cancel); this.slot = +d.cancel; }
    else if (d.slot !== undefined) this.slot = this.slot === +d.slot ? null : +d.slot;
    else if (d.tech) {
      const i = this.slot != null && this.slot < n.research.slots.length ? this.slot : freeSlot(n);
      if (i < 0) why = 'Every research slot is busy. Cancel a project, or pick a slot to replace it.';
      else { why = startResearch(n, i, d.tech); if (!why) this.slot = null; }
    }
    if (why) this.ctx.toast(why);
    this._html = '';
    this.render();
  }

  // Who can build a model this technology unlocks.
  _maker(n, m) {
    const own = m.makers.includes(n.iso3) || m.makers.includes('*');
    const tag = own ? 'your design' : m.lic?.includes(n.iso3) ? 'built under licence' : m.makers.some((iso) => { const x = this.ctx.world.byIso.get(iso); return x && x !== n && this.ctx.game.allied(n.index, x.index); }) ? 'allied design, under licence' : `${m.makers.join(', ')} design`;
    const later = m.from > this.ctx.game.time ? ` · in production from ${yearOf(m.from)}` : '';
    return `<li class="${own ? 'own' : ''}"><b>${esc(m.name)}</b> <span>${tag}${later}</span></li>`;
  }

  render() {
    if (this.el.hidden) return;
    const { game } = this.ctx;
    const n = game.nations[game.player];
    const R = n?.research;
    if (!R) return;
    const time = game.time;
    const k = slotsFor(n), speed = speedFor(n);
    const slots = R.slots.map((id, i) => {
      const t = id && TECH[id];
      const sel = this.slot === i ? ' sel' : '';
      if (!t) return `<button class="rs-slot empty${sel}" data-slot="${i}" aria-pressed="${this.slot === i}"><b class="num">${i + 1}</b><span>${this.slot === i ? 'Pick a technology below' : 'Empty slot'}</span></button>`;
      const done = (R.progress[id] ?? 0) / t.days;
      return `<div class="rs-slot${sel}">
        <button class="rs-pick" data-slot="${i}" aria-pressed="${this.slot === i}" aria-label="Replace this slot's project"><b class="num">${i + 1}</b></button>
        <div class="who"><b>${esc(t.name)}</b><span>${esc(CATEGORIES[t.cat])}</span></div>
        <div class="eff"><span class="sbar"><i style="width:${Math.round(done * 100)}%"></i></span><b class="num">${Math.floor(done * 100)}%</b></div>
        <div class="left"><b class="num">${daysLeft(n, id, time)} d</b><span>to go</span></div>
        <button class="rm" data-cancel="${i}" aria-label="Stop this project (progress is kept)">✕</button>
      </div>`;
    }).join('');
    const free = R.slots.includes(null);
    const cats = CATEGORY_IDS.map((c) => {
      const techs = TECHS.filter((t) => t.cat === c).sort((a, b) => depth(a) - depth(b));
      const cards = techs.map((t) => {
        const done = R.done.has(t.id), active = isActive(R, t.id), open = canResearch(R, t.id) && !active;
        const missing = t.req.filter((r) => !R.done.has(r));
        const cost = costOf(t, time), ahead = aheadOf(t, time) > 1.001, prog = R.progress[t.id] ?? 0;
        const status = done ? 'Researched' : active ? `In slot ${R.slots.indexOf(t.id) + 1}` : missing.length ? 'Locked' : prog ? `${Math.floor((prog / t.days) * 100)}% done` : 'Available';
        const fx = effectsOf(t);
        return `<article class="rs-tech${done ? ' done' : active ? ' active' : missing.length ? ' locked' : ''}" style="--d:${depth(t)}">
          <header><b>${esc(t.name)}</b><span class="st">${status}</span></header>
          <p>${esc(t.note)}</p>
          ${fx.length ? `<ul class="fx">${fx.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          ${t.unlocks.length ? `<ul class="un"><li class="h">Unlocks</li>${t.unlocks.map((id) => this._maker(n, MODEL[id])).join('')}</ul>` : ''}
          <footer>
            <span class="num">${int(cost)} d${ahead ? ` <em title="Ahead of time: ${t.year}">ahead of ${t.year}</em>` : ` · ${t.year}`}</span>
            ${t.req.length ? `<span class="req">Needs ${t.req.map((r) => `<i class="${R.done.has(r) ? 'ok' : ''}">${esc(TECH[r].name)}</i>`).join(', ')}</span>` : ''}
            ${done || active ? '' : `<button class="btn${open && (free || this.slot != null) ? ' primary' : ''}" data-tech="${t.id}" ${open ? '' : 'disabled'}>${this.slot != null && R.slots[this.slot] ? `Replace slot ${this.slot + 1}` : 'Research'}</button>`}
          </footer>
        </article>`;
      }).join('');
      const have = techs.filter((t) => R.done.has(t.id)).length;
      return `<section class="rs-cat"><h3>${esc(CATEGORIES[c])} <span class="num">${have}/${techs.length}</span></h3>${cards}</section>`;
    }).join('');
    const html = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap mil-wrap">
        ${milTabs('research')}
        <header class="mil-head"><h1>Research</h1><p>Each slot works on one technology. Finished technologies unlock models for the production lines or improve a whole class of equipment, and every division using it. Researching ahead of a technology's year costs more; stopping a project keeps its progress.</p></header>
        <div class="sup-kpis">
          <div><span>Research slots</span><b class="num">${k} / ${RESEARCH.maxSlots}</b><small>$${int(rdBn(n))}bn a year: education and a quarter of defence · <button class="lnk" data-ledger>ledger</button></small></div>
          <div><span>Research speed</span><b class="num">${speed.toFixed(2)}×</b><small>education share of GDP and income per head</small></div>
          <div><span>Research points</span><b class="num">${(speed * k).toFixed(1)}</b><small>days of research a day, all slots</small></div>
          <div><span>Technologies</span><b class="num">${R.done.size} / ${TECHS.length}</b><small>${free ? '<b class="warn">a slot is idle</b>' : 'every slot busy'}</small></div>
        </div>
        <section class="sup-sec">
          <h2>Research slots</h2>
          <div class="rs-slots">${slots}</div>
          <p class="sup-note">Pick a slot to choose what it works on next. Spending more on education or defence in the ledger adds slots; spending less closes the last ones.</p>
        </section>
        <section class="sup-sec">
          <h2>Technologies</h2>
          <div class="rs-tree">${cats}</div>
          <p class="sup-note">Costs are days at standard speed. Class improvements raise the rating of everything in the class, on top of the stockpile's own rating. A model unlocked here can be built by its makers, and by their allies under licence once the maker has the technology. Costs, dates and effects are game estimates informed by IISS <i>Military Balance 2025</i>, RUSI and manufacturer data.</p>
        </section>
      </div>`;
    if (html === this._html) return;
    const scroll = this.el.scrollTop;
    this._html = html;
    this.el.innerHTML = html;
    this.el.scrollTop = scroll;
  }
}

// How many prerequisites deep a technology sits, for ordering and indenting the tree.
function depth(t) { return t.req.length ? 1 + Math.max(...t.req.map((r) => depth(TECH[r]))) : 0; }
