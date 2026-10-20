import { ll2v } from '../util/geo.js';
import { pixelOf } from '../world/geo.js';
import { CITIES } from '../data/places.js';
import { PROJECTS, MAX_PROJECTS, projectCost, queueProject, cancelProject, cityForProject } from '../game/economy.js';
import { esc, money } from './format.js';

const TYPES = Object.entries(PROJECTS);

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

  open() { this.active = true; this.el.hidden = false; this.render(); }
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
    const { game, world } = this.ctx;
    if (!ll) return 'Choose land in your country.';
    const n = game.nations[game.player];
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
    const { game } = this.ctx;
    const n = game.nations[game.player];
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
    } else if (button.dataset.ledger !== undefined) this.ctx.openEconomy('construction');
    else if (button.dataset.close !== undefined) this.ctx.setMode(0);
  }

  render() {
    if (!this.active) return;
    const scroll = this.el.querySelector('.construction-scroll')?.scrollTop ?? 0;
    const { game } = this.ctx;
    const n = game.nations[game.player], E = n.econ;
    const options = TYPES.map(([id, def]) => {
      const cost = money(projectCost(n, id) * E.P / E.xr);
      return `<button class="construction-choice${id === this.kind ? ' selected' : ''}" data-kind="${id}" aria-pressed="${id === this.kind}"><span><b>${esc(def.name)}</b><small>${esc(def.desc)}</small></span><em class="num">${cost}</em></button>`;
    }).join('');
    const queue = E.projects.map((p) => `<div class="construction-queue-row"><button data-focus="${p.id}" ${p.site ? '' : 'disabled'} title="Show on map">${esc(PROJECTS[p.kind].name)}${p.city ? ` · ${esc(p.city)}` : p.site ? '' : ' · national'}</button><span class="num">${Math.floor(p.paid / p.cost * 100)}%</span><button data-cancel="${p.id}" aria-label="Cancel ${esc(PROJECTS[p.kind].name)}">×</button></div>`).join('');
    this.el.innerHTML = `<header><div><h2>Construction</h2><p>Select a building, then click your territory. Offices require a city.</p></div><button data-close aria-label="Close construction map">×</button></header>
      <div class="construction-scroll"><div class="construction-choices">${options}</div>
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
    const city = PROJECTS[this.kind].city ? cityForProject(this.ctx.game.nations[this.ctx.game.player], this.kind, ll) : null;
    this.ghost.textContent = why ?? `Place ${PROJECTS[this.kind].name}${city ? ` in ${city.name}` : ''}`;
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
    const showCities = !!PROJECTS[this.kind].city;
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
          el.title = `Build ${PROJECTS[this.kind].name} in ${city.name}`;
          this.cities.appendChild(el);
          this.cityPins.set(i, (rec = { el }));
        }
        rec.el.title = `Build ${PROJECTS[this.kind].name} in ${city.name}`;
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
