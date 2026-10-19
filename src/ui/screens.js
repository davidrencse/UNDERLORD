import { IDEOLOGIES, BLOCS, FACTIONS } from '../data/nations.js';
import { SPIRITS, POWER_CENTRE_TYPES } from '../data/politics.js';
import { CRISES } from '../game/crises.js';
import { money, pct, signed, int, esc, flagHTML, fxText, day, compact, usd } from './format.js';
import { spiritRows, partyBar, IDEO_TONE } from './panels.js';

const fig = (k, v, s = '') => `<div><div class="k">${k}</div><div class="v${v == null ? ' missing' : ''}">${v ?? 'Not available'}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;

// ------------------------------------------------------------------------------- Overview
export class DossierScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Country overview');
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) this.close();
      const nb = e.target.closest('[data-nation]');
      if (nb) this.open(+nb.dataset.nation);
    });
  }
  close() { this.el.hidden = true; }
  open(i) {
    const { game } = this.ctx;
    const n = game.nations[i];
    if (!n) return;
    this.nation = i;
    const w = n.wt ?? {};
    const m = w.military;
    const a = n.army ?? {};
    const perCap = (n.gdp * 1e9) / (n.pop * 1e6);
    const list = [...n.politics.list].sort((x, y) => y.share - x.share);
    const tot = list.reduce((s, p) => s + p.share, 0);
    const others = game.live().filter((o) => o !== n);
    const ranked = others.map((o) => [o, game.opinion(n.index, o.index)]).sort((x, y) => y[1] - x[1]);
    const partners = ranked.slice(0, 6), rivals = ranked.slice(-6).reverse();
    const inv = m?.inventory ?? {};
    const INV = [['fighters', 'Fighters'], ['attack', 'Attack aircraft'], ['helicopters', 'Helicopters'], ['attackHelicopters', 'Attack helicopters'], ['tankers', 'Tankers'], ['tanks', 'Tanks'], ['vehicles', 'Armoured vehicles'], ['selfPropelledArtillery', 'SP artillery'], ['towedArtillery', 'Towed artillery'], ['mlrs', 'Rocket artillery'], ['aircraftCarriers', 'Carriers'], ['helicopterCarriers', 'Helicopter carriers'], ['destroyers', 'Destroyers'], ['frigates', 'Frigates'], ['corvettes', 'Corvettes'], ['submarines', 'Submarines'], ['patrolVessels', 'Patrol vessels'], ['mineWarfare', 'Mine warfare']];

    this.el.innerHTML = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap">
        <div class="dossier-hero">
          ${flagHTML(n)}
          <div>
            <h1>${esc(n.name)}</h1>
            <div class="meta"><b>${esc(n.leader)}</b>${n.title ? `, ${esc(n.title)}` : ''}. ${esc(n.gov)}, ${(IDEOLOGIES[n.ideology]?.name ?? '').toLowerCase()} government.${w.governingBloc ? ` ${esc(w.governingBloc)}.` : ''}</div>
          </div>
          <div class="core" style="min-width:300px">
            <div><div class="k">Political power</div><div class="v">${Math.floor(n.pp)}</div></div>
            <div><div class="k">Stability</div><div class="v">${n.stability.toFixed(0)}<small>%</small></div><div class="m"><i style="width:${n.stability}%"></i></div></div>
            <div><div class="k">War support</div><div class="v">${n.warSupport.toFixed(0)}<small>%</small></div><div class="m"><i style="width:${n.warSupport}%"></i></div></div>
            <div><div class="k">GDP</div><div class="v">${money(n.gdp)}</div></div>
          </div>
        </div>

        <div class="dgrid">
          <section class="c7"><h2>Government <em>${n.politics.next ? `next election ${day(Date.parse(n.politics.next))}` : 'no scheduled election'}</em></h2>
            <dl class="kv">
              <dt>Head of government</dt><dd>${esc(w.headOfGovernment ?? `${n.leader}${n.title ? `, ${n.title}` : ''}`)}</dd>
              <dt>System</dt><dd>${esc(n.gov)}</dd>
              ${w.legislature ? `<dt>Legislature</dt><dd>${esc(w.legislature)}</dd>` : ''}
              ${w.lastElection ? `<dt>Last election</dt><dd>${esc(w.lastElection)}</dd>` : ''}
            </dl>
            <div style="margin-top:14px">${partyBar(n)}</div>
            ${list.map((p) => `<div class="party ${n.politics.ruling.includes(p.id) ? 'ruling' : ''}"><span class="sw" style="background:${IDEO_TONE[p.ideo]}"></span><span class="pn">${esc(p.name)}<small>${esc(p.note)}</small></span><span class="ps">${((p.share / tot) * 100).toFixed(1)}%</span></div>`).join('')}
          </section>
          <section class="c5"><h2>Power centres <em>influence, loyalty</em></h2>
            ${n.powerCentres.map((p) => `<div class="pc"><span>${esc(p.name)}${POWER_CENTRE_TYPES[p.type] !== p.name ? `<br><small style="color:var(--quiet)">${esc(POWER_CENTRE_TYPES[p.type])}</small>` : ''}</span><span class="infl">${p.influence}%</span><span class="loy ${p.loyalty < 30 ? 'low' : ''}"><i style="width:${p.loyalty.toFixed(0)}%"></i></span></div>`).join('')}
          </section>

          <section class="c8"><h2>Economy <em>${w.gdpUsd ? 'World Bank 2024 baseline, simulated since' : 'estimated baseline, simulated since'}</em></h2>
            <div class="figs">
              ${fig('GDP', money(n.gdp), `${signed(n.growth)}% growth`)}
              ${fig('GDP per capita', `$${int(perCap)}`)}
              ${fig('Inflation', pct(n.inflation, 1))}
              ${fig('Unemployment', pct(n.unemployment, 1))}
              ${fig('Policy rate', pct(n.interest, 2))}
              ${fig('Public debt', pct(n.debt), 'of GDP')}
              ${fig('Net monthly wage', w.netWageUsd ? `$${int(w.netWageUsd)}` : null, w.netWageUsd ? 'average, after tax' : '')}
              ${fig('Corruption losses', w.corruptionLossUsd ? usd(w.corruptionLossUsd) : null, w.corruptionLossUsd ? 'modelled, per year' : '')}
              ${fig('Top income tax', w.tax?.topIncome ?? null)}
              ${fig('Corporate tax', w.tax?.corporate ?? null)}
              ${fig('VAT', w.tax?.vat ?? null)}
              ${fig('Tax to GDP', w.tax?.taxToGdp ?? null)}
            </div>
            ${w.spending ? `<div class="source">Government spending: ${esc(w.spending.total)}; social ${esc(w.spending.social)}, health ${esc(w.spending.health)}, education ${esc(w.spending.education)}, defence ${esc(w.spending.defence)} of total.</div>` : ''}
          </section>
          <section class="c4"><h2>Trade</h2>
            ${w.trade ? `<dl class="kv" style="grid-template-columns:110px 1fr">
              <dt>Exports</dt><dd>${esc(w.trade.exportsPctGdp)} of GDP</dd>
              <dt>Buyers</dt><dd>${esc(w.trade.exportPartners)}</dd>
              <dt>Suppliers</dt><dd>${esc(w.trade.importPartners)}</dd>
              <dt>Leading exports</dt><dd>${esc(w.trade.leadingExports)}</dd></dl>` : '<p class="note">No trade profile for this nation yet.</p>'}
          </section>

          <section class="c6"><h2>Society and migration</h2>
            <div class="figs">
              ${fig('Population', n.pop >= 1 ? `${n.pop.toFixed(1)} m` : `${Math.round(n.pop * 1000)}k`)}
              ${fig('Fertility rate', w.fertility != null ? w.fertility.toFixed(2) : null, w.fertility != null ? 'children per woman' : '')}
              ${fig('Migrant stock', w.migrantStock ? compact(w.migrantStock) : null, w.migrantStock ? 'foreign-born, 2021' : '')}
              ${fig('Foreign-born share', w.migration?.foreignBornShare ?? null)}
              ${fig('Net migration', w.migration?.netMigration ?? null)}
              ${fig('Muslim share', w.migration?.muslimShare ?? null)}
            </div>
            ${w.topOrigins || w.migration?.topOrigins ? `<p class="note">Largest origins: ${esc(w.migration?.topOrigins ?? w.topOrigins)}</p>` : ''}
          </section>
          <section class="c6"><h2>Armed forces <em>${m ? `Global Firepower rank ${m.rank} of ${m.rankTotal}` : 'estimate'}</em></h2>
            <div class="figs">
              ${fig('Active personnel', int((m?.active ?? a.active * 1000)))}
              ${fig('Reserves', m ? int(m.reserve) : null)}
              ${fig('Defence budget', m ? usd(m.budgetUsd) : money((n.gdp * n.defPct) / 100), m ? '' : `${n.defPct.toFixed(1)}% of GDP`)}
              ${fig('Nuclear warheads', a.nukes ? int(a.nukes) : 'None')}
            </div>
            ${m ? `<div class="inv" style="margin-top:12px">${INV.filter(([k]) => inv[k]).map(([k, l]) => `<div><span>${l}</span><span>${int(inv[k])}</span></div>`).join('')}</div>` : `<div class="inv" style="margin-top:12px"><div><span>Tanks</span><span>${int(a.mbt)}</span></div><div><span>Combat aircraft</span><span>${int(a.air)}</span></div><div><span>Surface ships</span><span>${int(a.ships)}</span></div><div><span>Submarines</span><span>${int(a.subs)}</span></div><div><span>Carriers</span><span>${int(a.carriers)}</span></div></div>`}
          </section>

          <section class="c4"><h2>Alignment</h2>
            <div class="chips">${n.faction ? `<span class="chip faction">${esc(FACTIONS[n.faction]?.long ?? n.faction)}</span>` : '<span class="chip">Non-aligned</span>'}${n.blocs.map((b) => `<span class="chip">${esc(BLOCS[b] ?? b)}</span>`).join('')}</div>
            <div style="margin-top:12px">${game.warsOf(n.index).map((war) => `<div class="stat"><span class="k" style="color:#ff8a7e">${esc(war.name)}</span><span class="v">${day(war.since)}</span></div>`).join('') || '<p class="note">Not at war.</p>'}</div>
          </section>
          <section class="c4"><h2>Closest partners</h2><div class="rowlist">${partners.map(([o, v]) => `<div class="ri" data-nation="${o.index}"><span>${esc(o.name)}</span><span>${signed(v, 0)}</span></div>`).join('')}</div></section>
          <section class="c4"><h2>Rivals</h2><div class="rowlist">${rivals.map(([o, v]) => `<div class="ri" data-nation="${o.index}"><span>${esc(o.name)}</span><span>${signed(v, 0)}</span></div>`).join('')}</div></section>

          <section class="c12"><h2>National spirits</h2>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:0 24px">${spiritRows(game, n).map(({ s, until }) => `<div class="spirit"><b>${esc(s.name)}</b>${until ? ` <span class="num" style="color:var(--quiet);font-size:10.5px">until ${day(until)}</span>` : ''}<p>${esc(s.desc)}</p><div class="fx">${fxText(s.fx)}</div></div>`).join('') || '<p class="note">None.</p>'}</div>
          </section>
        </div>
        <p class="source">${n.wt ? `Baseline figures imported from WatchTower (World Bank, Trading Economics, Global Firepower, party estimates) on ${esc(game.world.wt.importedAt)}. ` : 'No WatchTower dossier for this nation; figures are game estimates. '}Values marked “Not available” have no source yet.</p>
      </div>`;
    this.el.hidden = false;
    this.el.scrollTop = 0;
    void SPIRITS;
  }
}

// ------------------------------------------------------------------------------- Focus tree
function focusFx(fx = {}) {
  const out = [];
  if (fx.pp) out.push(`${signed(fx.pp, 0)} political power`);
  if (fx.stab) out.push(`${signed(fx.stab, 0)}% stability`);
  if (fx.ws) out.push(`${signed(fx.ws, 0)}% war support`);
  if (fx.growth) out.push(`${signed(fx.growth)} pts GDP growth`);
  if (fx.debt) out.push(`${signed(fx.debt, 0)} pts debt`);
  if (fx.defPct) out.push(`${signed(fx.defPct)}% of GDP to defence`);
  if (fx.divisions) out.push(`${fx.divisions} new division${fx.divisions > 1 ? 's' : ''}`);
  if (fx.airWings) out.push('New air wing');
  if (fx.fleets) out.push('New squadron');
  if (fx.spirit) out.push(`Gain “${SPIRITS[fx.spirit]?.name}”`);
  if (fx.remove) out.push(`Remove “${SPIRITS[fx.remove]?.name}”`);
  if (fx.leader) out.push(`${fx.leader[0]} becomes ${fx.leader[1]}`);
  if (fx.ideo) out.push(`Government becomes ${IDEOLOGIES[fx.ideo].name.toLowerCase()}`);
  if (fx.gov) out.push(`System: ${fx.gov}`);
  if (fx.blocLeave) out.push(`Leave the ${BLOCS[fx.blocLeave]}`);
  for (const [k, v] of Object.entries(fx.loyalty ?? {})) out.push(`${signed(v, 0)} loyalty: ${POWER_CENTRE_TYPES[k].toLowerCase()}`);
  for (const [k, v] of Object.entries(fx.party ?? {})) out.push(`${signed(v, 0)} pts ${k}`);
  return out;
}

export class FocusScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'screen';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) { this.close(); return; }
      const f = e.target.closest('[data-focus]');
      if (!f) return;
      const { game } = this.ctx;
      const n = game.nations[game.player];
      this.detail = f.dataset.focus;
      if (game.startFocus(n, f.dataset.focus)) game.log(`${n.name} begins “${game.tree(n).focuses.find((x) => x.id === f.dataset.focus).name}”.`, { nation: n.index, kind: 'focus' });
      this.render();
    });
    this.el.addEventListener('mouseover', (e) => {
      const f = e.target.closest('[data-focus]');
      if (f && f.dataset.focus !== this.detail) { this.detail = f.dataset.focus; this._detail(); }
    });
  }
  close() { this.el.hidden = true; }
  open() { this.el.hidden = false; this._html = null; this.render(); }

  render() {
    if (this.el.hidden) return;
    const { game } = this.ctx;
    const n = game.nations[game.player];
    const tree = game.tree(n);
    const X = 178, Y = 112;
    const maxX = Math.max(...tree.focuses.map((f) => f.x)), maxY = Math.max(...tree.focuses.map((f) => f.y));
    const byId = new Map(tree.focuses.map((f) => [f.id, f]));
    const links = [];
    for (const f of tree.focuses) for (const r of f.req ?? []) {
      const p = byId.get(r);
      if (!p) continue;
      const x1 = p.x * X + 75, y1 = p.y * Y + 64, x2 = f.x * X + 75, y2 = f.y * Y;
      links.push(`<path d="M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}" stroke="${n.focus.done.has(r) ? '#e8e8e8' : 'rgba(255,255,255,0.25)'}" fill="none" ${f.reqAll ? '' : 'stroke-dasharray="3 3"'}/>`);
    }
    for (const f of tree.focuses) for (const m of f.mutex ?? []) {
      const o = byId.get(m);
      if (o && o.y === f.y && o.x > f.x) links.push(`<path d="M${f.x * X + 150} ${f.y * Y + 32} H${o.x * X}" stroke="rgba(255,68,51,0.5)" stroke-dasharray="2 4"/>`);
    }
    const cur = n.focus.current;
    const html = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap wide">
        <div class="tree-head">
          <div><div style="color:var(--quiet)">${esc(n.name)}</div><h1>${esc(tree.title)}</h1></div>
          <div style="text-align:right;color:var(--quiet)">${cur ? `Pursuing <b style="color:var(--ink)">${esc(byId.get(cur.id).name)}</b>, ${byId.get(cur.id).days - cur.progress} days left` : 'No focus selected. Choose an available one.'}<br><span class="num">${n.focus.done.size}/${tree.focuses.length} complete</span></div>
        </div>
        <div class="tree" style="width:${maxX * X + 150}px;height:${maxY * Y + 70}px">
          <svg class="links" width="${maxX * X + 150}" height="${maxY * Y + 70}">${links.join('')}</svg>
          ${tree.focuses.map((f) => {
            const st = game.focusState(n, f);
            const prog = cur?.id === f.id ? `<span class="prog" style="width:${(cur.progress / f.days) * 100}%"></span>` : '';
            return `<button class="focus ${st}" data-focus="${f.id}" style="left:${f.x * X}px;top:${f.y * Y}px" ${st === 'available' || st === 'active' || st === 'done' ? '' : 'aria-disabled="true"'}><b>${esc(f.name)}</b><small>${f.days} days${st === 'blocked' ? ', excluded' : ''}</small>${prog}</button>`;
          }).join('')}
        </div>
        <div class="focus-detail"></div>
      </div>`;
    // Re-rendered on every game day while open; most days change nothing in the tree.
    if (html !== this._html) {
      this._html = html;
      this._detailHtml = null;
      this.el.innerHTML = html;
    }
    this._detail();
  }

  _detail() {
    const { game } = this.ctx;
    const n = game.nations[game.player];
    const f = game.tree(n).focuses.find((x) => x.id === this.detail) ?? game.tree(n).focuses[0];
    const box = this.el.querySelector('.focus-detail');
    if (!box) return;
    const st = game.focusState(n, f);
    const hint = { available: n.focus.current ? 'Finish the current focus first.' : 'Click to begin.', active: 'In progress.', done: 'Completed.', locked: 'Requires an earlier focus.', blocked: 'Excluded by a rival path.' }[st];
    const html = `<b style="font:600 20px var(--display);letter-spacing:.06em;text-transform:uppercase">${esc(f.name)}</b> <span class="num" style="color:var(--quiet)">${f.days} days</span><p style="margin:6px 0;max-width:80ch;color:#cfd1d3">${esc(f.desc)}</p><div class="fx" style="font:400 11px var(--mono);color:var(--quiet)">${focusFx(f.fx).join(', ') || 'No direct effects.'}</div><p class="note">${hint}</p>`;
    if (html === this._detailHtml && box === this._detailBox) return;
    this._detailHtml = html;
    this._detailBox = box;
    box.innerHTML = html;
  }
}

// ------------------------------------------------------------------------------- Events
export class EventModal {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'event-modal';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-opt]');
      if (!b || !this.cur) return;
      const { game } = this.ctx;
      const n = game.nations[this.cur.nation];
      const opt = this.options[+b.dataset.opt];
      CRISES.apply(game, n, opt);
      game.log(`${this.cur.def.title}: ${opt.label.toLowerCase()}.`, { nation: n.index, kind: 'crisis' });
      this.cur = null;
      this.el.hidden = true;
      game.paused = this.wasPaused;
      this.ctx.refreshTop();
      this.next();
    });
  }
  next() {
    const { game } = this.ctx;
    if (this.cur || !game.pendingEvents.length) return;
    this.cur = game.pendingEvents.shift();
    const n = game.nations[this.cur.nation];
    const def = this.cur.def;
    this.options = def.options.filter((o) => !o.democratic || n.politics.next);
    this.wasPaused = game.paused;
    game.paused = true;
    this.ctx.refreshClock();
    this.el.innerHTML = `<div class="event-card" role="alertdialog" aria-label="${esc(def.title)}">
      <div class="eh"><span>${esc(n.name)}</span><span>${day(game.time)}</span></div>
      <h2>${esc(def.title)}</h2><p>${esc(def.text(n))}</p>
      <div class="actions">${this.options.map((o, i) => `<button class="act" data-opt="${i}"><b>${esc(o.label)}</b><span class="cost">${o.fx.pp ? `${-o.fx.pp} PP` : ''}</span><small>${esc(o.desc)}</small></button>`).join('')}</div></div>`;
    this.el.hidden = false;
    this.el.querySelector('.act')?.focus();
  }
}

// ------------------------------------------------------------------------------- Start
export const MAJORS = ['USA', 'CHN', 'RUS', 'DEU', 'FRA', 'GBR', 'IND', 'TUR'];
const SITUATION = {
  USA: 'A new administration, tariffs and a polarised country.',
  CHN: 'Slowing growth, a property bust and Taiwan.',
  RUS: 'Three years into the war in Ukraine. A war economy running hot.',
  DEU: 'The coalition has collapsed. A snap election in five weeks.',
  FRA: 'A hung parliament and a minority government on borrowed time.',
  GBR: 'A huge majority on a third of the vote. Reform is surging.',
  IND: 'The fastest-growing major economy, courted by every bloc.',
  TUR: 'Inflation, the Straits and a seat at every table.',
};

export class StartScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'start';
    root.appendChild(this.el);
    this.choice = null;
    this.el.addEventListener('click', (e) => {
      const m = e.target.closest('[data-iso]');
      if (m) { this.choose(this.ctx.world.byIso.get(m.dataset.iso).index); return; }
      if (e.target.closest('[data-go]') && this.choice != null) { this.el.hidden = true; this.ctx.begin(this.choice); }
    });
    this.render();
  }
  get active() { return !this.el.hidden; }
  choose(i) {
    const n = this.ctx.game.nations[i];
    if (!n || n.inert) return;
    this.choice = i;
    this.ctx.preview(i);
    this.render();
  }
  render() {
    const { game, world } = this.ctx;
    const majors = MAJORS.map((iso) => world.byIso.get(iso)).filter(Boolean);
    const c = this.choice != null ? game.nations[this.choice] : null;
    const spirits = c ? c.spirits.map((s) => SPIRITS[s]?.name).filter(Boolean) : [];
    this.el.innerHTML = `
      <div class="brand">
        <h1>UNDERLORD</h1>
        <p>The world doesn't collapse all at once.</p>
        <div class="when"><span>20 January 2025</span><span>${game.live().length} nations</span><span>${game.wars.length} wars underway</span></div>
      </div>
      <div class="pick">
        <h2>Choose a nation</h2>
        <p>The eight major campaigns have their own politics and power centres. Every other nation is playable too: click it on the globe.</p>
        <div class="majors">${majors.map((n) => `<button class="major ${this.choice === n.index ? 'on' : ''}" data-iso="${n.iso3}">${flagHTML(n)}<span><b>${esc(n.name)}</b><small>${esc(SITUATION[n.iso3] ?? '')}</small></span><span class="gdp">${money(n.gdp)}</span></button>`).join('')}</div>
        ${c ? `<div class="chosen">
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.leader)}${c.title ? `, ${esc(c.title)}` : ''}. ${esc(c.gov)}.${spirits.length ? ` ${esc(spirits.join(', '))}.` : ''}</p>
          <div class="core" style="margin-bottom:14px">
            <div><div class="k">Stability</div><div class="v">${c.stability.toFixed(0)}<small>%</small></div></div>
            <div><div class="k">War support</div><div class="v">${c.warSupport.toFixed(0)}<small>%</small></div></div>
            <div><div class="k">GDP</div><div class="v">${money(c.gdp)}</div></div>
            <div><div class="k">Active forces</div><div class="v">${compact((c.army?.active ?? 0) * 1000)}</div></div>
          </div>
          <button class="btn signal" data-go>Lead ${esc(c.name)}</button>
        </div>` : '<p class="note" style="margin-top:16px">Select a nation to see its starting position.</p>'}
      </div>`;
  }
}
