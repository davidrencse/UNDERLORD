import { SUPPLY, LEVEL_CAP, fullKm, upgradePP, hubCap } from '../game/supply.js';
import { day, esc, flagHTML, int } from './format.js';
import { milTabs } from './milTabs.js';

const DAY = 86400000;
const pips = (h) => `<span class="pips" aria-label="Level ${h.level}">${Array.from({ length: SUPPLY.maxLevel }, (_, i) => `<i class="${i < h.level ? 'on' : h.upgradeAt && i === h.level ? 'up' : ''}"></i>`).join('')}</span>`;
const pctCls = (v) => (v < 0.25 ? 'bad' : v < 0.5 ? 'warn' : '');
const bar = (v) => `<span class="sbar ${pctCls(v)}"><i style="width:${Math.round(v * 100)}%"></i></span>`;

// The player's logistics: how well each army is supplied, every hub's level and load, and the
// orders that fix shortages (build a hub, upgrade one, find the divisions that are cut off).
export class SupplyScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'screen supply-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Supply');
    root.appendChild(this.el);
    this._html = '';
    this.el.addEventListener('click', (e) => this._click(e));
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
    const { game, units, cam } = this.ctx;
    const A = units.armies, d = b.dataset;
    if (d.x !== undefined) { this.close(); return; }
    if (d.miltab) { this.ctx.openMilitary(d.miltab); return; }
    if (d.build !== undefined || d.map !== undefined) {
      this.close();
      this.ctx.setMode(6);
      if (d.build !== undefined) this.ctx.setTool({ kind: 'hub' });
      return;
    }
    if (d.upgrade) {
      const why = A.upgradeHub(game.player, +d.upgrade);
      this.ctx.toast(why ?? 'Upgrade under way.');
      this.ctx.refreshTop();
      this.render();
      return;
    }
    if (d.hub) {
      const h = A.hubs.find((x) => x.id === +d.hub);
      if (!h) return;
      this.close();
      this.ctx.setMode(6);
      cam.flyTo(h.lat, h.lon, Math.min(cam.goal.dist, 0.12));
      return;
    }
    if (d.army) {
      const a = A.byId.get(+d.army);
      const m = a ? A.members(a) : [];
      if (!m.length) return;
      this.close();
      this.ctx.setMode(6);
      this.ctx.setActiveArmy(a.id);
      this.ctx.selectUnits(m);
      const c = m.reduce((acc, s) => ({ lat: acc.lat + s.lat / m.length, lon: acc.lon + s.lon / m.length }), { lat: 0, lon: 0 });
      cam.flyTo(c.lat, c.lon, Math.min(cam.goal.dist, 0.14));
      return;
    }
    if (d.unit) {
      const s = units.byId.get(+d.unit);
      if (!s) return;
      this.close();
      this.ctx.setMode(6);
      this.ctx.selectUnits([s]);
      cam.flyTo(s.lat, s.lon, Math.min(cam.goal.dist, 0.08));
    }
  }

  render() {
    if (this.el.hidden) return;
    const { game, units } = this.ctx;
    const p = game.player, n = game.nations[p];
    if (!n) return;
    const A = units.armies, t = game.time;
    const mine = units.stacks.filter((s) => s.owner === p && s.kit);
    const supplied = mine.filter((s) => s.supply >= 0.5).length;
    const cut = mine.filter((s) => s.supply <= SUPPLY.cutFactor + 0.02);
    const held = A.hubs.filter((h) => h.ctrl === p);
    const lost = A.hubs.filter((h) => h.owner === p && h.ctrl !== p);
    const capacity = held.reduce((a, h) => a + hubCap(h, t), 0);
    const demand = mine.reduce((a, s) => a + s.divs, 0);
    const building = held.filter((h) => h.readyAt > t);
    const hubName = new Map(A.hubs.map((h) => [h.id, h.name]));

    const armyRow = (name, m, id) => {
      if (!m.length) return '';
      const avg = m.reduce((a, s) => a + s.supply, 0) / m.length;
      const low = Math.min(...m.map((s) => s.supply));
      const nCut = m.filter((s) => s.supply <= SUPPLY.cutFactor + 0.02).length;
      return `<div class="srow army">
        <span class="nm">${esc(name)}</span>
        <span class="num">${m.length} div</span>
        <span class="sv">${bar(avg)}<b class="num ${pctCls(avg)}">${Math.round(avg * 100)}%</b></span>
        <span class="num ${pctCls(low)}">lowest ${Math.round(low * 100)}%</span>
        <span class="num ${nCut ? 'bad' : 'dim'}">${nCut ? `${nCut} cut off` : 'none cut off'}</span>
        ${id ? `<button class="lnk" data-army="${id}">Show</button>` : '<span></span>'}
      </div>`;
    };
    const armies = A.of(p);
    const loose = mine.filter((s) => !s.army);

    const hubRow = (h) => {
      const cap = hubCap(h, t);
      const over = cap > 0 && h.load > cap;
      const status = h.ctrl !== p ? `Held by ${esc(game.nations[h.ctrl]?.name ?? 'the enemy')}`
        : h.readyAt > t ? `Building, opens in ${Math.ceil((h.readyAt - t) / DAY)} d`
        : h.upgradeAt ? `Upgrading, ${Math.ceil((h.upgradeAt - t) / DAY)} d`
        : h.damagedUntil > t ? `Damaged, half capacity for ${Math.ceil((h.damagedUntil - t) / DAY)} d`
        : over ? 'Overloaded' : h.load ? 'Working' : 'Idle';
      const why = h.ctrl === p ? A.canUpgradeHub(p, h) : 'You do not hold this hub.';
      const can = h.ctrl === p && h.level < SUPPLY.maxLevel && !h.upgradeAt && h.readyAt <= t;
      return `<div class="srow hubrow${over ? ' over' : ''}${h.ctrl !== p ? ' lost' : ''}">
        <span class="nm"><button class="lnk" data-hub="${h.id}">${esc(h.name)}</button><small>${h.kind === 'built' ? 'Built' : h.kind === 'port' ? 'Port' : h.kind === 'capital' ? 'Capital' : 'City'}</small></span>
        ${pips(h)}
        <span class="num">${Math.round(h.load * 10) / 10} / ${Math.round(cap)}</span>
        <span class="sv">${bar(cap ? Math.min(1, h.load / cap) : 0)}</span>
        <span class="num dim">${fullKm(h.level)} km</span>
        <span class="st ${over || h.ctrl !== p ? 'bad' : h.readyAt > t || h.upgradeAt ? 'warn' : ''}">${status}</span>
        ${can ? `<button class="up" data-upgrade="${h.id}" ${why ? 'disabled' : ''} title="${esc(why ?? `Level ${h.level + 1}: ${LEVEL_CAP[h.level + 1]} divisions, ${fullKm(h.level + 1)} km. Takes ${SUPPLY.upgradeDays} days.`)}">Upgrade <small>${upgradePP(h.level)} PP</small></button>` : '<span></span>'}
      </div>`;
    };
    const order = (h) => (h.ctrl !== p ? -1 : hubCap(h, t) ? h.load / hubCap(h, t) : 0.5);
    const hubs = [...held].sort((a, b) => order(b) - order(a) || b.level - a.level);
    const worst = mine.filter((s) => s.supply < 0.5).sort((a, b) => a.supply - b.supply).slice(0, 14);

    const html = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap supply-wrap">
        ${milTabs('supply')}
        <header class="ledger-head">
          ${flagHTML(n)}
          <div><h1>Supply</h1><p>${esc(n.name)} logistics · ${day(t)}</p></div>
          <div class="sup-actions">
            <button class="btn signal" data-build ${n.pp < SUPPLY.buildPP ? 'disabled' : ''}>Build supply hub <small class="num">${SUPPLY.buildPP} PP</small></button>
            <button class="btn" data-map>Supply map</button>
          </div>
        </header>
        <div class="sup-kpis">
          <div><span>Divisions in supply</span><b class="num ${pctCls(mine.length ? supplied / mine.length : 1)}">${supplied} / ${mine.length}</b><small>at 50% or better</small></div>
          <div><span>Cut off</span><b class="num ${cut.length ? 'bad' : ''}">${cut.length}</b><small>route home runs through enemy ground</small></div>
          <div><span>Throughput</span><b class="num ${demand > capacity ? 'bad' : ''}">${int(demand)} / ${int(capacity)}</b><small>divisions drawing / hub capacity</small></div>
          <div><span>Hubs</span><b class="num">${held.length}</b><small>${building.length ? `${building.length} building · ` : ''}${lost.length ? `${lost.length} lost · ` : ''}${int(n.pp)} PP to spend</small></div>
        </div>

        <section class="sup-sec">
          <h2>Armies</h2>
          ${armies.map((a) => armyRow(a.name, A.members(a), a.id)).join('')}
          ${armyRow('Not in an army', loose, 0)}
          ${mine.length ? '' : '<p class="note">No land divisions.</p>'}
        </section>

        ${worst.length ? `<section class="sup-sec">
          <h2>Short of supply</h2>
          <div class="sup-list">${worst.map((s) => `<button class="srow unitrow" data-unit="${s.id}"><span class="nm">${esc(s.name)}</span><span class="sv">${bar(s.supply)}<b class="num ${pctCls(s.supply)}">${Math.round(s.supply * 100)}%</b></span><span class="dim">${s.hub ? `from ${esc(hubName.get(s.hub))}` : 'no hub in reach'}</span></button>`).join('')}</div>
        </section>` : ''}

        <section class="sup-sec">
          <h2>Hubs</h2>
          <p class="sup-note">Every city is a natural hub, levelled 1–5 by population (the capital one level higher); naval bases are level-2 ports. Anywhere else, build one: it opens at level ${SUPPLY.buildLevel} after ${SUPPLY.buildDays} days. Each level adds throughput and reach: ${LEVEL_CAP.slice(1).map((c, i) => `L${i + 1} ${c} div / ${fullKm(i + 1)} km`).join(' · ')}. Past that radius supply fades to nothing over ${SUPPLY.spanKm} km, and a route through enemy ground is cut.</p>
          <div class="srow head"><span>Hub</span><span>Level</span><span>Load</span><span></span><span>Full reach</span><span>Status</span><span></span></div>
          ${hubs.map(hubRow).join('') || '<p class="note">You hold no supply hubs.</p>'}
          ${lost.length ? `<h3>Lost to the enemy</h3>${lost.map(hubRow).join('')}` : ''}
        </section>
      </div>`;
    if (html === this._html) return;
    const scroll = this.el.scrollTop;
    this._html = html;
    this.el.innerHTML = html;
    if (scroll) this.el.scrollTop = scroll;
  }
}
