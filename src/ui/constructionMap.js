import { ll2v } from '../util/geo.js';
import { pixelOf } from '../world/geo.js';
import { CITIES } from '../data/places.js';
import { PROJECTS, MAX_PROJECTS, projectCost, queueProject, cancelProject, cityForProject } from '../game/economy.js';
import { SUPPLY } from '../game/supply.js';
import { esc, money } from './format.js';

const DAY = 86400000;
const TYPES = Object.entries(PROJECTS);
// A supply hub is sited like a building but paid for and built by the military, not the economy,
// so it sits alongside the economic projects here rather than inside their queue.
const HUB = 'supplyHub';
const HUB_DEF = {
  name: 'Supply hub',
  desc: 'A railhead feeding every division in reach. Paid in political power, ready in ' + SUPPLY.buildDays + ' days.',
};
const defOf = (kind) => (kind === HUB ? HUB_DEF : PROJECTS[kind]);

// The list is long enough now that it needs shelves. Anything unlisted falls under Industry.
const GROUPS = [
  ['Industry', ['militaryFactory', 'militaryComplex', 'civilianFactory', 'civilianComplex', 'dockyards', 'dockyardComplex', 'miningComplex']],
  ['Energy, fuel and water', ['powerGenerator', 'powerGrid', 'nuclearGenerator', 'refinery', 'synthFuel', 'fuelDepot', 'desalination']],
  ['Logistics', ['infrastructure', 'railYard', 'airports', HUB]],
  ['Services and science', ['offices', 'officeComplex', 'researchCampus', 'dataCentre']],
  ['Defence', ['airDefence']],
];

export class ConstructionMap {
  constructor(root, overlay, ctx) {
    this.ctx = ctx;
    this.active = false;
    this.kind = 'militaryFactory';
    this.hover = null;
    this.el = document.createElement('aside');
    this.el.className = 'construction-map';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.markers = document.createElement('div');
    this.markers.className = 'construction-markers';
    overlay.appendChild(this.markers);
    this.ghost = document.createElement('div');
    this.ghost.className = 'construction-ghost';
    this.ghost.hidden = true;
    overlay.appendChild(this.ghost);
    this.records = new Map();
    this.cityPins = new Map();
    this.cities = document.createElement('div');
    this.cities.className = 'construction-cities';
    overlay.appendChild(this.cities);
    this.cities.addEventListener('click', (e) => {
      const city = CITIES[+e.target.closest('[data-city]')?.dataset.city];
      if (city && this.active) this.place(city);
    });
    this.el.addEventListener('click', (e) => this.click(e));
  }

  open(kind) {
    if (kind) this.kind = kind;
    this.active = true;
    this.el.hidden = false;
    this.render();
  }

  select(kind) { this.kind = kind; this.render(); }
  close() {
    this.active = false;
    this.hover = null;
    this.el.hidden = true;
    this.ghost.hidden = true;
    for (const rec of this.records.values()) rec.el.remove();
    this.records.clear();
    for (const rec of this.cityPins.values()) rec.el.remove();
    this.cityPins.clear();
  }

  siteError(ll) {
    const { game, world, units } = this.ctx;
    if (!ll) return 'Choose land in your country.';
    const n = game.nations[game.player];
    if (this.kind === HUB) return units.armies.canBuildHub(game.player, ll);
    const city = PROJECTS[this.kind].city ? cityForProject(n, this.kind, ll) : null;
    if (PROJECTS[this.kind].city && !city) return 'Choose one of your cities.';
    const at = pixelOf(city?.lat ?? ll.lat, city?.lon ?? ll.lon);
    if (world.owner[at] !== game.player || world.control[at] !== game.player) return 'Build on land you own and control.';
    if (n.econ.projects.length >= MAX_PROJECTS) return `Construction queue full (${MAX_PROJECTS}).`;
    return null;
  }

  place(ll) {
    const why = this.siteError(ll);
    if (why) { this.ctx.toast(why); return; }
    const { game, units } = this.ctx;
    const n = game.nations[game.player];
    if (this.kind === HUB) {
      const error = units.armies.buildHub(game.player, ll);
      if (error) { this.ctx.toast(error); return; }
      this.ctx.toast('Supply hub under construction.');
      this.ctx.refreshTop();
      this.render();
      return;
    }
    const site = { lat: ll.lat, lon: ll.lon };
    const error = queueProject(n, this.kind, site);
    if (error) { this.ctx.toast(error); return; }
    this.ctx.toast(`${PROJECTS[this.kind].name} queued.`);
    this.ctx.refreshTop();
    this.render();
  }

  click(e) {
    const button = e.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.kind) { this.kind = button.dataset.kind; this.render(); }
    else if (button.dataset.cancel) {
      cancelProject(this.ctx.game.nations[this.ctx.game.player], +button.dataset.cancel);
      this.render();
    } else if (button.dataset.focus) {
      const p = this.ctx.game.nations[this.ctx.game.player].econ.projects.find((x) => x.id === +button.dataset.focus);
      if (p?.site) this.ctx.cam.flyTo(p.site.lat, p.site.lon, Math.min(this.ctx.cam.goal.dist, 0.25));
    } else if (button.dataset.hub) {
      const h = this.ctx.units.armies.hubs.find((x) => x.id === +button.dataset.hub);
      if (h) this.ctx.cam.flyTo(h.lat, h.lon, Math.min(this.ctx.cam.goal.dist, 0.25));
    } else if (button.dataset.ledger !== undefined) this.ctx.openEconomy('construction');
    else if (button.dataset.close !== undefined) this.ctx.setMode(0);
  }

  render() {
    if (!this.active) return;
    const scroll = this.el.querySelector('.construction-scroll')?.scrollTop ?? 0;
    const { game } = this.ctx;
    const n = game.nations[game.player], E = n.econ;
    const choice = (id) => {
      const def = defOf(id);
      if (!def) return '';
      const military = id === HUB;
      const cost = military ? `${SUPPLY.buildPP} PP` : money(projectCost(n, id) * E.P / E.xr);
      return `<button class="construction-choice${military ? ' military' : ''}${id === this.kind ? ' selected' : ''}" data-kind="${id}" aria-pressed="${id === this.kind}"><span><b>${esc(def.name)}</b><small>${esc(def.desc)}</small></span><em class="num">${cost}</em></button>`;
    };
    const grouped = new Set(GROUPS.flatMap(([, ids]) => ids));
    const loose = TYPES.map(([id]) => id).filter((id) => !grouped.has(id));
    const options = GROUPS.map(([label, ids], i) => {
      const body = (i === 0 ? [...ids, ...loose] : ids).map(choice).join('');
      return body ? `<h3 class="construction-group">${esc(label)}</h3>${body}` : '';
    }).join('');
    const hubs = this.ctx.units.armies.hubs
      .filter((h) => h.ctrl === game.player && (h.readyAt > game.time || h.upgradeAt))
      .map((h) => `<div class="construction-queue-row hub"><button data-hub="${h.id}" title="Show on map">${esc(h.name)}</button><span class="num">${Math.ceil(((h.readyAt > game.time ? h.readyAt : h.upgradeAt) - game.time) / DAY)} d</span><span class="construction-hub-state">${h.readyAt > game.time ? 'building' : 'upgrading'}</span></div>`).join('');
    const queue = E.projects.map((p) => `<div class="construction-queue-row"><button data-focus="${p.id}" ${p.site ? '' : 'disabled'} title="Show on map">${esc(PROJECTS[p.kind].name)}${p.city ? ` · ${esc(p.city)}` : p.site ? '' : ' · national'}</button><span class="num">${Math.floor(p.paid / p.cost * 100)}%</span><button data-cancel="${p.id}" aria-label="Cancel ${esc(PROJECTS[p.kind].name)}">×</button></div>`).join('');
    this.el.innerHTML = `<header><div><h2>Construction</h2><p>Select a building, then click your territory. Offices require a city; supply hubs need ${SUPPLY.minGapKm} km of clear ground between them.</p></div><button data-close aria-label="Close construction map">×</button></header>
      <div class="construction-scroll"><div class="construction-choices">${options}</div>
      ${hubs ? `<section><h3>Supply hubs <span class="num">${n.pp.toFixed(0)} PP</span></h3>${hubs}</section>` : ''}
      <section><h3>Queue <span class="num">${E.projects.length}/${MAX_PROJECTS}</span></h3>${queue || '<p class="construction-empty">No projects queued.</p>'}
      <button class="construction-ledger" data-ledger>Open construction ledger →</button></section></div>`;
    this.el.querySelector('.construction-scroll').scrollTop = scroll;
  }

  setHover(ll, x, y) {
    this.hover = ll;
    if (!this.active || !ll) { this.ghost.hidden = true; return; }
    const why = this.siteError(ll);
    this.ghost.hidden = false;
    this.ghost.className = `construction-ghost${why ? ' invalid' : ''}`;
    const city = PROJECTS[this.kind]?.city ? cityForProject(this.ctx.game.nations[this.ctx.game.player], this.kind, ll) : null;
    this.ghost.textContent = why ?? `Place ${defOf(this.kind).name}${city ? ` in ${city.name}` : ''}`;
    this.ghost.style.transform = `translate(${Math.min(x + 18, window.innerWidth - 240)}px, ${Math.min(y + 18, window.innerHeight - 80)}px)`;
  }

  update() {
    if (!this.active) return;
    const { game, camera, world } = this.ctx;
    const E = game.nations[game.player].econ;
    const sites = [
      ...E.projects.filter((p) => p.site).map((p) => ({ key: `q${p.id}`, kind: p.kind, site: p.site, progress: p.paid / p.cost, name: PROJECTS[p.kind].name })),
      ...E.completedSites.map((p) => ({ key: `d${p.id}`, kind: p.kind, site: p.site, progress: 1, name: PROJECTS[p.kind].name })),
    ];
    const keys = new Set(sites.map((s) => s.key));
    for (const [key, rec] of this.records) if (!keys.has(key)) { rec.el.remove(); this.records.delete(key); }
    const W = window.innerWidth, H = window.innerHeight;
    const showCities = !!PROJECTS[this.kind]?.city;
    if (showCities) {
      const iso3 = game.nations[game.player].iso3;
      CITIES.forEach((city, i) => {
        if (city.iso3 !== iso3) return;
        const at = pixelOf(city.lat, city.lon);
        if (world.owner[at] !== game.player || world.control[at] !== game.player) {
          const old = this.cityPins.get(i);
          if (old) old.el.hidden = true;
          return;
        }
        let rec = this.cityPins.get(i);
        if (!rec) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'construction-city';
          el.dataset.city = i;
          el.textContent = city.name;
          el.title = `Build ${defOf(this.kind).name} in ${city.name}`;
          this.cities.appendChild(el);
          this.cityPins.set(i, (rec = { el }));
        }
        rec.el.title = `Build ${defOf(this.kind).name} in ${city.name}`;
        const v = ll2v(city.lat, city.lon, 1.0008);
        if (v.dot(camera.position) <= v.lengthSq() * 1.0002) { rec.el.hidden = true; return; }
        v.project(camera);
        rec.el.hidden = v.z >= 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
        if (!rec.el.hidden) rec.el.style.transform = `translate(${(v.x + 1) * W / 2}px, ${(1 - v.y) * H / 2}px) translate(-50%, -50%)`;
      });
    } else for (const rec of this.cityPins.values()) rec.el.hidden = true;
    for (const s of sites) {
      let rec = this.records.get(s.key);
      if (!rec) {
        const el = document.createElement('div');
        el.className = 'construction-marker';
        this.markers.appendChild(el);
        this.records.set(s.key, (rec = { el }));
      }
      const v = ll2v(s.site.lat, s.site.lon, 1.0006);
      const visible = v.dot(camera.position) > v.lengthSq() * 1.0002;
      if (!visible) { rec.el.hidden = true; continue; }
      v.project(camera);
      rec.el.hidden = v.z >= 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      if (rec.el.hidden) continue;
      rec.el.style.transform = `translate(${(v.x + 1) * W / 2}px, ${(1 - v.y) * H / 2}px) translate(-50%, -50%)`;
      const complete = s.progress >= 1;
      const label = `${s.name}${complete ? '' : ` · ${Math.floor(s.progress * 100)}%`}`;
      if (rec.label !== label) {
        rec.label = label;
        rec.el.textContent = label;
        rec.el.title = `${s.name} · ${complete ? 'Complete' : `${Math.floor(s.progress * 100)}% complete`}`;
        rec.el.classList.toggle('complete', complete);
      }
    }
  }
}
