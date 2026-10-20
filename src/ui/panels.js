import { SPIRITS, POWER_CENTRE_TYPES } from '../data/politics.js';
import { IDEOLOGIES, BLOCS, FACTIONS } from '../data/nations.js';
import { domesticDecisions, decisionState, takeDecision, diplomacy, takeDiplomaticAction } from '../game/actions.js';
import { politicalPressure } from '../game/politicalSystems.js';
import { TYPES, cityAt, echelon } from '../game/units.js';
import { MOVE, DIV_FRONT } from '../game/orbat.js';
import { money, pct, signed, int, esc, flagHTML, fxText, day, compact } from './format.js';
import { svg } from './symbols.js';
import { equipmentNames } from '../world/unitModels.js';

export const IDEO_TONE = { dem: '#e8e8e8', nat: '#a9adb1', aut: '#6f7377', com: '#ff4433', the: '#ffb547' };

export function spiritRows(g, n) {
  const rows = n.spirits.map((id) => ({ id, s: SPIRITS[id] })).filter((x) => x.s);
  for (const t of n.timed) {
    const s = SPIRITS[t.id] ?? (t.id.startsWith('contagion_') ? { name: `Trade shock from ${g.world.byIso.get(t.id.slice(10))?.name ?? 'abroad'}`, desc: 'A partner economy\'s recession is hitting exports.', fx: t.mod } : null);
    if (s) rows.push({ id: t.id, s, until: t.until });
  }
  for (const m of g.globalMods) rows.push({ id: m.id, s: { name: m.name, desc: 'A worldwide shock affecting every nation.', fx: m.mod }, until: m.until });
  return rows;
}

export function partyBar(n) {
  const list = [...n.politics.list].sort((a, b) => b.share - a.share);
  const tot = list.reduce((a, p) => a + p.share, 0);
  return `<div class="party-bar">${list.map((p) => `<i style="width:${(p.share / tot) * 100}%;background:${IDEO_TONE[p.ideo]}" title="${esc(p.name)}"></i>`).join('')}</div>`;
}

function sparkline(values) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${38 - ((v - min) / Math.max(1e-6, max - min)) * 34}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#e8e8e8" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
}

export class CountryPanel {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('aside');
    this.el.className = 'panel left';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Nation');
    root.appendChild(this.el);
    this.tab = 'overview';
    this.nation = null;
    this._html = '';
    this._queued = false;
    this.el.addEventListener('click', (e) => this._click(e));
  }

  open(i) { this.nation = i; this.el.hidden = false; this._html = ''; this.render(); }

  // Coalesces simulation-driven refreshes (a day tick plus any politics events in the same frame)
  // into one render at the end of the current task, before the browser paints.
  schedule() {
    if (this._queued || this.el.hidden) return;
    this._queued = true;
    queueMicrotask(() => { this._queued = false; this.render(); });
  }
  close() { this.el.hidden = true; this.nation = null; this.ctx.onPanelClose?.(); }

  _click(e) {
    const b = e.target.closest('[data-tab],[data-close],[data-dec],[data-dip],[data-loc],[data-open],[data-pick],[data-nation]');
    if (!b) return;
    const { game, units } = this.ctx;
    const n = game.nations[this.nation];
    if (b.dataset.tab) { this.tab = b.dataset.tab; this.render(); }
    else if (b.dataset.close !== undefined) this.close();
    else if (b.dataset.dec) {
      const d = domesticDecisions(n).find((x) => x.id === b.dataset.dec);
      const why = takeDecision(game, n, d);
      if (why) this.ctx.toast(why);
      this.render(); this.ctx.refreshTop();
    } else if (b.dataset.dip) {
      const why = takeDiplomaticAction(game, game.player, this.nation, b.dataset.dip);
      if (why) { this.ctx.toast(why); return; }
      this.render(); this.ctx.refreshTop();
    } else if (b.dataset.loc) {
      const s = units.byId.get(+b.dataset.loc);
      if (s) { this.ctx.selectUnits([s]); this.ctx.cam.flyTo(s.lat, s.lon, Math.min(this.ctx.cam.goal.dist, 0.25)); }
    } else if (b.dataset.open) this.ctx.openDossier(this.nation);
    else if (b.dataset.pick !== undefined) this.ctx.openFocus();
    else if (b.dataset.nation) this.ctx.selectNation(+b.dataset.nation, true);
  }

  render() {
    if (this.el.hidden || this.nation == null) return;
    const { game } = this.ctx;
    const n = game.nations[this.nation];
    const own = n.index === game.player;
    const tabs = [['overview', 'Overview'], ['politics', 'Politics'], ['economy', 'Economy'], ['military', 'Military'], ['diplomacy', own ? 'Decisions' : 'Diplomacy']];
    const html = `
      <div class="ph">
        <button class="close" data-close aria-label="Close">✕</button>
        <div class="row">${flagHTML(n)}<div><h2>${esc(n.name)}</h2><div class="sub">${esc(n.leader)}${n.title ? `, ${esc(n.title)}` : ''}</div></div></div>
        <div class="tabs" role="tablist">${tabs.map(([id, l]) => `<button data-tab="${id}" class="${this.tab === id ? 'on' : ''}" role="tab">${l}</button>`).join('')}</div>
      </div>
      <div class="pb">${this[`_${this.tab}`](n, own)}</div>`;
    // Most daily ticks change nothing on the open tab; skip the rebuild (and its forced layout).
    if (html === this._html) return;
    this._html = html;
    const scroll = this.el.scrollTop;
    this.el.innerHTML = html;
    // Writing scrollTop forces a synchronous layout, so only restore a non-zero offset.
    if (scroll) this.el.scrollTop = scroll;
  }

  _overview(n, own) {
    const g = this.ctx.game;
    const gain = g.ppGain(n);
    const wars = g.warsOf(n.index);
    const ideo = IDEOLOGIES[n.ideology]?.name ?? n.ideology;
    return `
      <div class="sec core">
        <div><div class="k">Political power</div><div class="v">${Math.floor(n.pp)}<small>${signed(gain, 2)}/day</small></div></div>
        <div><div class="k">Stability</div><div class="v">${n.stability.toFixed(0)}<small>%</small></div><div class="m"><i style="width:${n.stability}%"></i></div></div>
        <div><div class="k">War support</div><div class="v">${n.warSupport.toFixed(0)}<small>%</small></div><div class="m"><i style="width:${n.warSupport}%"></i></div></div>
        <div><div class="k">GDP</div><div class="v">${money(n.gdp)}<small>${signed(n.growth)}%</small></div></div>
      </div>
      <div class="sec">
        <div class="stat"><span class="k">Government</span><span class="v" style="font-family:var(--body);font-weight:400">${esc(n.gov)}</span></div>
        <div class="stat"><span class="k">Ruling ideology</span><span class="v" style="font-family:var(--body);font-weight:400">${ideo}</span></div>
        <div class="stat"><span class="k">Population</span><span class="v">${n.pop >= 1 ? n.pop.toFixed(1) + ' m' : Math.round(n.pop * 1000) + 'k'}</span></div>
        <div class="stat"><span class="k">${n.politics.congress ? 'Next Party Congress' : 'Next election'}</span><span class="v">${n.politics.next ? day(Date.parse(n.politics.next)) : n.politics.congress ? day(Date.parse(n.politics.congress)) : 'None scheduled'}</span></div>
      </div>
      <div class="sec"><h3>Alignment</h3><div class="chips">
        ${n.faction ? `<span class="chip faction" title="${esc(FACTIONS[n.faction]?.long)}">${n.faction}</span>` : '<span class="chip">Non-aligned</span>'}
        ${n.blocs.filter((b) => b !== n.faction).map((b) => `<span class="chip" title="${esc(BLOCS[b] ?? b)}">${b}</span>`).join('')}
        ${wars.map((w) => `<span class="chip war">${esc(w.name)}</span>`).join('')}
      </div></div>
      <div class="sec"><h3>National spirits</h3>${spiritRows(g, n).map(({ s, until }) => `<div class="spirit"><b>${esc(s.name)}</b>${until ? ` <span class="num" style="color:var(--quiet);font-size:10.5px">until ${day(until)}</span>` : ''}<p>${esc(s.desc)}</p><div class="fx">${fxText(s.fx)}</div></div>`).join('') || '<p class="note">None.</p>'}</div>
      <div class="sec" style="display:flex;gap:6px">
        <button class="btn primary" data-open>Open overview</button>
        ${own ? '<button class="btn" data-pick>National trajectory</button>' : ''}
      </div>`;
  }

  _politics(n) {
    const g = this.ctx.game;
    const pressure = politicalPressure(n);
    const list = [...n.politics.list].sort((a, b) => b.share - a.share);
    const tot = list.reduce((a, p) => a + p.share, 0);
    const focus = n.focus.current ? g.tree(n).focuses.find((f) => f.id === n.focus.current.id) : null;
    return `
      <div class="sec"><h3>${esc(pressure.name)} <em>${pressure.value.toFixed(0)} / 100</em></h3>
        <div class="stat"><span class="k">Political power effect</span><span class="v">${signed(pressure.pp, 2)} / day</span></div>
        <div class="stat"><span class="k">Stability target</span><span class="v">${signed(pressure.stab, 1)} pts</span></div>
        <p class="note">${esc(pressure.desc)}</p>
        ${n.politics.congress ? `<p class="note">Next Party Congress: ${day(Date.parse(n.politics.congress))}</p>` : ''}
      </div>
      <div class="sec"><h3>Parties <em>${n.politics.next ? 'support' : 'estimated support'}</em></h3>
        ${partyBar(n)}
        ${list.map((p) => `<div class="party ${n.politics.ruling.includes(p.id) ? 'ruling' : ''}"><span class="sw" style="background:${IDEO_TONE[p.ideo]}"></span><span class="pn">${esc(p.name)}<small>${esc(p.note)}</small></span><span class="ps">${((p.share / tot) * 100).toFixed(1)}%</span></div>`).join('')}
      </div>
      <div class="sec"><h3>Power centres <em>influence / loyalty</em></h3>
        ${n.powerCentres.map((p) => `<div class="pc" title="${esc(POWER_CENTRE_TYPES[p.type])}"><span>${esc(p.name)}</span><span class="infl">${p.influence}%</span><span class="loy ${p.loyalty < 30 ? 'low' : ''}"><i style="width:${p.loyalty.toFixed(0)}%"></i></span></div>`).join('')}
        <p class="note">Disloyal centres with high influence drag stability down. A disloyal army can attempt a coup.</p>
      </div>
      <div class="sec"><h3>National trajectory</h3>
        <div class="stat"><span class="k">Current focus</span><span class="v" style="font-family:var(--body);font-weight:400">${focus ? esc(focus.name) : 'None'}</span>${focus ? `<span class="m"><i style="width:${(n.focus.current.progress / focus.days) * 100}%"></i></span>` : ''}</div>
        <div class="stat"><span class="k">Completed</span><span class="v">${n.focus.done.size} / ${g.tree(n).focuses.length}</span></div>
      </div>`;
  }

  _economy(n) {
    const perCap = (n.gdp * 1e9) / (n.pop * 1e6);
    const w = n.wt;
    return `
      <div class="sec"><h3>Output <em>monthly GDP</em></h3>${sparkline(n.gdpHistory.length > 1 ? n.gdpHistory : null) || '<p class="note">History builds as months pass.</p>'}</div>
      <div class="sec">
        <div class="stat"><span class="k">GDP</span><span class="v">${money(n.gdp)}</span></div>
        <div class="stat"><span class="k">GDP per capita</span><span class="v">$${int(perCap)}</span></div>
        <div class="stat"><span class="k">Growth</span><span class="v">${signed(n.growth)}%</span></div>
        <div class="stat"><span class="k">Inflation</span><span class="v">${pct(n.inflation, 1)}</span></div>
        <div class="stat"><span class="k">Unemployment</span><span class="v">${pct(n.unemployment, 1)}</span></div>
        <div class="stat"><span class="k">Policy rate</span><span class="v">${pct(n.interest, 2)}</span></div>
        <div class="stat"><span class="k">Public debt</span><span class="v">${pct(n.debt)} <small>of GDP</small></span></div>
        <div class="stat"><span class="k">Defence spending</span><span class="v">${pct(n.defPct, 1)} <small>${money((n.gdp * n.defPct) / 100)}</small></span></div>
        ${n.sanctionedBy.size ? `<div class="stat"><span class="k">Sanctioned by</span><span class="v">${n.sanctionedBy.size} nations</span></div>` : ''}
      </div>
      ${w?.tax ? `<div class="sec"><h3>Tax <em>WatchTower estimate</em></h3>
        <div class="stat"><span class="k">Top income rate</span><span class="v" style="font-family:var(--body);font-weight:400">${esc(w.tax.topIncome)}</span></div>
        <div class="stat"><span class="k">Corporate</span><span class="v" style="font-family:var(--body);font-weight:400">${esc(w.tax.corporate)}</span></div>
        <div class="stat"><span class="k">Tax to GDP</span><span class="v" style="font-family:var(--body);font-weight:400">${esc(w.tax.taxToGdp)}</span></div></div>` : ''}`;
  }

  _military(n) {
    const { units, game } = this.ctx;
    const a = n.army ?? {};
    const mine = units.of(n.index);
    const w = n.wt?.military;
    return `
      <div class="sec">
        <div class="stat"><span class="k">Active personnel</span><span class="v">${int(a.active * 1000)}</span></div>
        ${w ? `<div class="stat"><span class="k">Reserves</span><span class="v">${int(w.reserve)}</span></div>` : ''}
        <div class="stat"><span class="k">Main battle tanks</span><span class="v">${int(a.mbt)}</span></div>
        <div class="stat"><span class="k">Combat aircraft</span><span class="v">${int(a.air)}</span></div>
        <div class="stat"><span class="k">Major surface ships</span><span class="v">${int(a.ships)}</span></div>
        <div class="stat"><span class="k">Submarines</span><span class="v">${int(a.subs)}</span></div>
        <div class="stat"><span class="k">Aircraft carriers</span><span class="v">${int(a.carriers)}</span></div>
        <div class="stat"><span class="k">Nuclear warheads</span><span class="v">${a.nukes ? int(a.nukes) : 'None'}</span></div>
        <div class="stat"><span class="k">Manpower pool</span><span class="v">${compact(n.manpower * 1000)}</span></div>
        <div class="stat"><span class="k">Casualties</span><span class="v">${int(n.casualties)}</span></div>
        ${w ? `<div class="stat"><span class="k">Global Firepower rank</span><span class="v">${w.rank} <small>of ${w.rankTotal}</small></span></div>` : ''}
      </div>
      <div class="sec rowlist"><h3>Formations <em>${mine.length}</em></h3>
        ${mine.map((s) => `<div class="ri" data-loc="${s.id}"><span>${esc(s.name)}</span><span>${TYPES[s.type].domain === 'land' ? `${s.divs} div ` : ''}${Math.round(s.str * 100)}%</span></div>`).join('') || '<p class="note">No formations.</p>'}
      </div>
      ${game.player === n.index ? '<p class="hint">Click a counter to select it, shift-click to add more, then right-click on the map to move.</p>' : ''}`;
  }

  _diplomacy(n, own) {
    const g = this.ctx.game;
    if (own) {
      return `<div class="sec"><h3>Decisions <em>${Math.floor(n.pp)} PP available</em></h3><div class="actions">${domesticDecisions(n).map((d) => {
        const st = decisionState(g, n, d);
        return `<button class="act" data-dec="${d.id}" ${st.ok ? '' : 'disabled'} title="${esc(st.why ?? '')}"><b>${esc(d.name)}</b><span class="cost">${d.cost} PP</span><small>${esc(st.ok ? d.desc : st.why)}</small></button>`;
      }).join('')}</div></div>
      <div class="sec rowlist"><h3>Wars</h3>${g.warsOf(n.index).map((w) => `<div class="ri"><span>${esc(w.name)}</span><span>since ${day(w.since)}</span></div>`).join('') || '<p class="note">At peace.</p>'}</div>`;
    }
    if (g.player == null) return '<p class="note">Choose a nation to conduct diplomacy.</p>';
    const op = g.opinion(g.player, n.index);
    const acts = diplomacy(g, g.player, n.index);
    const enemies = [...g.enemiesOf(n.index)].map((i) => g.nations[i]);
    return `
      <div class="sec">
        <div class="stat"><span class="k">Opinion of ${esc(g.nations[g.player].name)}</span><span class="v">${signed(op, 0)}</span><span class="m"><b style="left:50%"></b><i style="left:${op < 0 ? 50 + op / 2 : 50}%;width:${Math.abs(op) / 2}%;background:${op < 0 ? 'var(--hostile)' : 'var(--ink)'}"></i></span></div>
        <div class="stat"><span class="k">Relationship</span><span class="v" style="font-family:var(--body);font-weight:400">${g.atWar(g.player, n.index) ? 'At war' : g.allied(g.player, n.index) ? 'Allied' : g.nations[g.player].guarantees.has(n.index) ? 'Guaranteed' : 'Neutral'}</span></div>
        <div class="stat"><span class="k">Your influence</span><span class="v">${g.nations[g.player].influence.get(n.index) ?? 0} / 100</span></div>
      </div>
      <div class="sec"><h3>Actions <em>${Math.floor(g.nations[g.player].pp)} PP available</em></h3><div class="actions">${acts.map((a) => `<button class="act${a.danger ? ' danger' : ''}" data-dip="${a.id}" ${a.ok ? '' : 'disabled'}><b>${esc(a.name)}</b><span class="cost">${a.cost ? `${a.cost} PP` : ''}</span><small>${esc(a.ok ? a.desc : a.why || a.desc)}</small></button>`).join('')}</div></div>
      ${enemies.length ? `<div class="sec rowlist"><h3>At war with</h3>${enemies.map((e) => `<div class="ri" data-nation="${e.index}"><span>${esc(e.name)}</span><span>${e.iso3}</span></div>`).join('')}</div>` : ''}`;
  }
}

// Land formations list every equipment line from their table of organisation, with counts.
const LAND_KIT = [['Main battle tanks', 'mbt', 'mbt'], ['Infantry fighting vehicles', 'ifv', 'ifv'], ['Armoured personnel carriers', 'apc', null], ['Self-propelled guns', 'spg', 'spg'], ['Rocket launchers', 'mlrs', 'mlrs'], ['Helicopters', 'heli', 'heli'], ['Trucks', 'truck', null]];
const EQUIP = {
  air: [['Fighter', 'jet'], ['Attack helicopter', 'heli']],
  fleet: [['Surface combatant', 'ship']],
  carrier: [['Carrier', 'carrier'], ['Escorts', 'ship'], ['Air wing', 'jet']],
  sub: [['Submarine', 'sub']],
};
function equipmentRows(type, iso3, list) {
  const names = equipmentNames(iso3);
  if (TYPES[type].domain === 'land' && list[0].kit) {
    return LAND_KIT.map(([label, key, nameKey]) => {
      const n = Math.round(list.reduce((a, x) => a + (x.kit?.[key] ?? 0) * x.str, 0));
      if (!n) return '';
      return `<div class="stat"><span class="k">${label}${nameKey ? `<br><small style="color:var(--dim)">${esc(names[nameKey])}</small>` : ''}</span><span class="v">${int(n)}</span></div>`;
    }).join('');
  }
  return (EQUIP[type] ?? []).map(([label, key]) => `<div class="stat"><span class="k">${label}</span><span class="v" style="font-family:var(--body);font-weight:400">${esc(names[key])}</span></div>`).join('');
}

export class UnitPanel {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('aside');
    this.el.className = 'panel right ucard';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-close],[data-halt],[data-loc],[data-form],[data-join],[data-leave]');
      if (!b) return;
      const A = this.ctx.units.armies, p = this.ctx.game.player;
      const mine = () => this.list.filter((s) => s.owner === p && s.kit);
      if (b.dataset.close !== undefined) this.ctx.selectUnits([]);
      else if (b.dataset.form !== undefined) { const a = A.create(p, mine()); this.ctx.setActiveArmy(a.id); this.ctx.selectUnits(A.members(a)); }
      else if (b.dataset.join) { const a = A.byId.get(+b.dataset.join); if (a) A.assign(a, mine()); this.ctx.setActiveArmy(+b.dataset.join); this.render(); }
      else if (b.dataset.leave !== undefined) { for (const s of mine()) if (s.army) A.detach(s); this.render(); }
      else if (b.dataset.halt !== undefined) { for (const s of this.list) if (s.owner === this.ctx.game.player) { s.path = []; s.state = s.battle ? 'battle' : 'idle'; } this.render(); }
      else if (b.dataset.loc) { const s = this.ctx.units.byId.get(+b.dataset.loc); if (s) this.ctx.cam.flyTo(s.lat, s.lon); }
    });
    this.list = [];
    this._html = '';
  }

  show(list) { this.list = list; this.el.hidden = !list.length; this.render(); }

  // Supply, entrenchment and army membership of a land formation (or the first of a selection).
  _logistics(s, own) {
    const A = this.ctx.units.armies, a = A.byId.get(s.army);
    const hub = s.hub ? A.hubs.find((h) => h.id === s.hub) : null;
    const sup = Math.round(s.supply * 100);
    const avg = (k) => Math.round((this.list.reduce((t, x) => t + (x[k] ?? 0), 0) / this.list.length) * 100);
    return `${own ? `<div class="stat"><span class="k">Army</span><span class="v" style="font-family:var(--body);font-weight:400">${a ? esc(a.name) : 'Unassigned'}</span></div>` : ''}
      <div class="stat"><span class="k">Supply${hub ? ` <small>from ${esc(hub.name)}</small>` : ''}</span><span class="v${sup < 25 ? ' bad' : sup < 50 ? ' warn' : ''}">${this.list.length > 1 ? avg('supply') : sup}%</span><span class="m"><i style="width:${sup}%"></i></span></div>
      <div class="stat"><span class="k">Entrenchment <small>+${Math.round(avg('dig') * 0.5)}% defence</small></span><span class="v">${avg('dig')}%</span><span class="m"><i style="width:${avg('dig')}%"></i></span></div>
      ${s.plan ? `<div class="stat"><span class="k">Planning bonus</span><span class="v">+${Math.round(s.plan * 100)}%</span></div>` : ''}`;
  }

  // The division's combat profile, and how its current battle stands on the triangle.
  _combat(s) {
    const c = s.tpl.stats, b = s.battle;
    const mine = b && b.def.has(s) ? b.holdD : b?.holdA;
    const theirs = b && b.def.has(s) ? b.holdA : b?.holdD;
    const info = b?.info, ours = b && (b.def.has(s) ? 'D' : 'A');
    const hit = info && (ours === 'A' ? info.onD : info.onA);
    const ammo = info && (ours === 'A' ? info.ammoA : info.ammoD);
    const notes = b ? [mine ? 'our armour holds' : theirs ? 'cannot pierce their armour' : '', hit && c.arty ? `guns ${hit.spot >= 0.5 ? 'spotted' : 'firing blind'}` : '', ammo != null && ammo < 0.9 && c.ammo ? `ammunition ${Math.round(ammo * 100)}%` : '', hit && (c.drone || c.dpierce) && hit.droneEff < 0.6 ? 'drones jammed or shot down' : ''].filter(Boolean) : [];
    return `<div class="stat"><span class="k">Soft attack · Piercing</span><span class="v">${(c.soft + c.arty + c.drone).toFixed(0)} · ${(c.pierce + c.dpierce).toFixed(0)}</span></div>
      <div class="stat"><span class="k">Armour · Penetration <small>${Math.round(c.hard * 100)}% hard</small></span><span class="v">${c.armor.toFixed(0)} · ${c.pen.toFixed(0)}</span></div>
      <div class="stat"><span class="k">Spotting · EW · Counter-drone</span><span class="v">${Math.round(c.recon * 100)} · ${Math.round(c.ew * 100)} · ${Math.round(c.cdrone * 100)}</span></div>
      ${b ? `<div class="stat"><span class="k">Battle</span><span class="v" style="font-family:var(--body);font-weight:400">${b.ratio ? `${(b.def.has(s) ? 1 / b.ratio : b.ratio).toFixed(2)}× ` : ''}${esc(notes.join(', ') || 'even terms')}</span></div>` : ''}`;
  }

  _armyButtons() {
    const { units, game } = this.ctx;
    const A = units.armies, p = game.player;
    const mine = this.list.filter((s) => s.owner === p && s.kit);
    if (!mine.length) return '';
    const active = A.byId.get(this.ctx.activeArmy());
    const inActive = active && mine.every((s) => s.army === active.id);
    return `${active && !inActive ? `<button class="btn" data-join="${active.id}">Join ${esc(active.name)}</button>` : ''}
      <button class="btn" data-form>New army</button>
      ${mine.some((s) => s.army) ? '<button class="btn" data-leave>Leave army</button>' : ''}`;
  }

  render() {
    if (this.el.hidden) return;
    const { game } = this.ctx;
    this.list = this.list.filter((s) => this.ctx.units.byId.has(s.id));
    if (!this.list.length) { this.el.hidden = true; return; }
    const s = this.list[0];
    const n = game.nations[s.owner];
    const t = TYPES[s.type];
    const own = s.owner === game.player;
    const status = s.battle ? ['battle', 'In combat'] : s.state === 'moving' ? ['moving', 'Moving'] : s.state === 'retreat' ? ['moving', 'Retreating'] : ['', 'Holding'];
    const multi = this.list.length > 1;
    const men = this.list.reduce((a, x) => a + (x.kit?.men ?? x.divs * TYPES[x.type].men) * x.str, 0);
    const html = `
      <div class="ph">
        <button class="close" data-close aria-label="Close">✕</button>
        <div class="uname">${multi ? `${this.list.length} formations` : esc(s.name)}</div>
        <div class="utype">${svg(s.type)}<span>${t.domain === 'land' ? `${echelon(s.divs)} · ` : ''}${s.tpl ? esc(s.tpl.name) : esc(t.label)}, ${esc(n.name)}</span></div>
        <span class="ustatus ${status[0]}">${status[1]}</span>
      </div>
      <div class="pb">
        ${multi ? `<div class="sec rowlist">${this.list.map((x) => `<div class="ri" data-loc="${x.id}"><span>${esc(x.name)}</span><span>${Math.round(x.str * 100)}%</span></div>`).join('')}</div>` : ''}
        <div class="sec">
          ${t.domain === 'land' ? `<div class="stat"><span class="k">Division equivalents</span><span class="v">${+this.list.reduce((a, x) => a + x.divs, 0).toFixed(2)}</span></div>` : ''}
          ${this.list.some((x) => x.estimated) ? `<div class="stat"><span class="k">Deployment</span><span class="v">Estimated region</span></div>` : ''}
          ${s.ships ? `<div class="stat"><span class="k">Vessels</span><span class="v">${s.ships}</span></div>` : ''}
          ${s.planes ? `<div class="stat"><span class="k">Aircraft</span><span class="v">${s.planes}</span></div>` : ''}
          <div class="stat"><span class="k">Personnel</span><span class="v">${int(men)}</span></div>
          <div class="stat"><span class="k">Strength</span><span class="v">${Math.round(s.str * 100)}%</span><span class="m"><i style="width:${s.str * 100}%"></i></span></div>
          <div class="stat"><span class="k">Organisation</span><span class="v">${Math.round(s.org * 100)}%</span><span class="m"><i style="width:${s.org * 100}%"></i></span></div>
          <div class="stat"><span class="k">Experience</span><span class="v">${Math.round(s.exp * 100)}%</span></div>
          ${t.domain === 'land' ? this._logistics(s, own) : ''}
          ${s.tpl ? this._combat(s) : ''}
          ${equipmentRows(s.type, n.iso3, this.list)}
          ${t.domain === 'land' && MOVE[s.type] ? `<div class="stat"><span class="k">Road march</span><span class="v">${MOVE[s.type].march} <small>km/day</small></span></div>
          <div class="stat"><span class="k">Advance under fire</span><span class="v">${MOVE[s.type].contested} <small>km/day</small></span></div>
          <div class="stat"><span class="k">Footprint</span><span class="v">${((s.divs < 1 ? Math.sqrt(s.divs) : Math.min(8, s.divs)) * DIV_FRONT / 1000).toFixed(1)} × ${(s.divs < 1 ? Math.sqrt(s.divs) * 5 : 5).toFixed(1)} <small>km</small></span></div>
          ${cityAt(s) ? `<div class="stat"><span class="k">Terrain</span><span class="v" style="font-family:var(--body);font-weight:400">Urban: ${esc(cityAt(s).name)}</span></div>` : ''}` : t.domain === 'sea' ? `<div class="stat"><span class="k">Speed</span><span class="v">${t.speed} km/h</span></div>` : '<div class="stat"><span class="k">Air support radius</span><span class="v">800 km</span></div>'}
        </div>
        ${own ? `<p class="hint">${t.domain === 'air' ? 'Right-click friendly territory to rebase. Wings support battles within 800 km.' : t.domain === 'sea' ? 'Right-click open water to sail. Hostile fleets within 70 km will engage.' : 'Right-click to move. Moving into enemy formations attacks them; enemy land you cross is occupied.'}</p>
        <div class="ubtns">
          ${s.state === 'moving' ? '<button class="btn" data-halt>Halt</button>' : ''}
          ${t.domain === 'land' ? this._armyButtons() : ''}
        </div>` : ''}
      </div>`;
    if (html === this._html) return;
    this._html = html;
    this.el.innerHTML = html;
  }
}
