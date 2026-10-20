import * as THREE from 'three';
import { ll2v, DEG, haversine, interpolate, destination } from '../util/geo.js';
import { setBack } from '../game/fronts.js';
import { hubCap, fullKm } from '../game/supply.js';
import { CITIES } from '../data/places.js';
import { TYPES, echelon } from '../game/units.js';
import { svg, counter } from './symbols.js';
import { esc } from './format.js';

const v = new THREE.Vector3();
const p3 = new THREE.Vector3();
// One shared projection result: every caller reads it before the next _project call.
const PR = { x: 0, y: 0, ok: false };
const REL_CLS = ['own', 'enemy', 'ally', 'neutral'];
const DOMAINS = new Map();
for (const t of Object.values(TYPES)) if (!DOMAINS.has(t.domain)) DOMAINS.set(t.domain, DOMAINS.size);
const byPri = (a, b) => a.pri - b.pri;
const INTEL_SHIFT = { event: 'translate(-50%, calc(-100% - 10px))', node: 'translate(-50%, -100%)' };
const SVGNS = 'http://www.w3.org/2000/svg';

// Great-circle points every ~30 km along a drawn line, so long legs follow the globe.
function densify(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (i) {
      const steps = Math.ceil(haversine(pts[i - 1], pts[i]) / 30);
      for (let k = 1; k < steps; k++) out.push(interpolate(pts[i - 1], pts[i], k / steps));
    }
    out.push(pts[i]);
  }
  return out;
}
const toV = (p) => ll2v(p.lat, p.lon, 1.0004);

// Every per-frame DOM write below is skipped when the value it would write is unchanged, so a
// still camera over a paused (or slow) game touches no styles at all.
export class Overlay {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.countryEls = new Map();
    this.cityEls = [];
    this.unitEls = new Map();
    this.battleEls = [];
    this.intelEls = [];
    this.selected = new Set();
    this.selectedNation = null;
    this.activeArmy = null;
    this.mode = 0;
    this.hubEls = new Map();
    // Battle plans and fronts, drawn as screen-space strokes under the counters.
    this.plansSvg = document.createElementNS(SVGNS, 'svg');
    this.plansSvg.setAttribute('class', 'plans');
    this.plansSvg.innerHTML = '<defs><marker id="plan-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0 10 5 0 10 3 5Z"/></marker></defs><g></g>';
    root.appendChild(this.plansSvg);
    this._planG = this.plansSvg.lastChild;
    this._planEls = [];
    this._planItems = [];
    this._planKey = null;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    window.addEventListener('resize', () => { this.W = window.innerWidth; this.H = window.innerHeight; });

    // Reused per-frame scratch for the unit declutter pass.
    this._frame = 0;
    this._items = [];
    this._vis = [];
    this._cells = new Map();
    this._heads = [];
    this._entries = [];
    this._rel = new Int8Array(0);

    const { game } = ctx;
    for (const n of game.live()) {
      if (n.mainArea < 2e-5) continue;
      const el = document.createElement('div');
      el.className = 'clabel';
      el.textContent = n.name;
      el.style.display = 'none';
      root.appendChild(el);
      this.countryEls.set(n.index, { el, n, pos: ll2v(n.label.lat, n.label.lon, 1.0005), size: -1, shown: false, x: NaN, y: NaN, o: NaN, os: '' });
    }
    const capitals = new Set(game.live().map((n) => `${n.capital.lat.toFixed(1)}|${n.capital.lon.toFixed(1)}`));
    for (const c of CITIES) {
      const el = document.createElement('div');
      el.className = 'citylabel' + (capitals.has(`${c.lat.toFixed(1)}|${c.lon.toFixed(1)}`) ? ' capital' : '');
      el.textContent = c.name;
      el.style.display = 'none';
      root.appendChild(el);
      this.cityEls.push({ el, c, pos: ll2v(c.lat, c.lon, 1.0003), shown: false, x: NaN, y: NaN });
    }

  }

  _show(rec, on) { if (rec.shown !== on) { rec.shown = on; rec.el.style.display = on ? '' : 'none'; } }

  _facing(p) { return p.dot(this._C) > p.lengthSq() * 1.0002; }

  _project(pos, W, H) {
    v.copy(pos).project(this.ctx.camera);
    PR.x = (v.x + 1) * 0.5 * W;
    PR.y = (1 - v.y) * 0.5 * H;
    PR.ok = v.z < 1 && v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.15;
    return PR;
  }

  update() {
    const { camera, cam, game, cityLayer } = this.ctx;
    const W = this.W, H = this.H;
    const C = (this._C = camera.position);
    const focal = H / (2 * Math.tan((camera.fov * DEG) / 2));
    const dist = cam.dist;

    // Country names.
    const showCountries = dist > 0.05;
    for (const rec of this.countryEls.values()) {
      if (!showCountries || rec.n.index === this.selectedNation || !this._facing(rec.pos)) { this._show(rec, false); continue; }
      const d = rec.pos.distanceTo(C);
      const px = (Math.sqrt(rec.n.mainArea) * focal) / d;
      if (px < 70) { this._show(rec, false); continue; }
      const pr = this._project(rec.pos, W, H);
      if (!pr.ok) { this._show(rec, false); continue; }
      const style = rec.el.style;
      const size = Math.round(Math.min(26, Math.max(9, px * 0.07)));
      if (size !== rec.size) { rec.size = size; style.fontSize = `${size}px`; }
      if (pr.x !== rec.x || pr.y !== rec.y) { rec.x = pr.x; rec.y = pr.y; style.transform = `translate(${pr.x}px, ${pr.y}px) translate(-50%, -50%)`; }
      const o = Math.min(1, (px - 70) / 60);
      if (o !== rec.o) { rec.o = o; const os = o.toFixed(2); if (os !== rec.os) { rec.os = os; style.opacity = os; } }
      this._show(rec, true);
    }

    // Cities.
    const want0 = dist < 0.09, want1 = dist < 0.3, want2 = dist < 0.75, want3 = dist < 1.2;
    const layerVisible = cityLayer.group.visible;
    const built = cityLayer.built;
    for (const rec of this.cityEls) {
      const pop = rec.c.pop;
      const want = want0 ? true : want1 ? pop > 1.5 : want2 ? pop > 6 : want3 ? pop > 14 : false;
      if (!want || (layerVisible && built.get(rec.c.name)?.group.visible) || !this._facing(rec.pos)) { this._show(rec, false); continue; }
      const pr = this._project(rec.pos, W, H);
      if (!pr.ok) { this._show(rec, false); continue; }
      if (pr.x !== rec.x || pr.y !== rec.y) { rec.x = pr.x; rec.y = pr.y; rec.el.style.transform = `translate(${pr.x - 3}px, ${pr.y - 5}px)`; }
      this._show(rec, true);
    }

    if (game.player != null) { this._plans(W, H); this._hubs(W, H); this._units(W, H); }
    this._battles(W, H);
    this._intel(W, H, cityLayer.labels);
  }

  // Relation of an owner to the player, cached per frame (game.allied walks every war).
  _relOf(owner, player, enemies) {
    let r = this._rel[owner];
    if (r < 0) {
      const { game } = this.ctx;
      r = owner === player ? 0 : enemies.has(owner) ? 1 : player != null && game.allied(owner, player) ? 2 : 3;
      this._rel[owner] = r;
    }
    return r;
  }

  _units(W, H) {
    const { units, game, cam } = this.ctx;
    const compact = cam.dist > 0.7;
    const tags = cam.dist < 0.22;
    const cell = compact ? 14 : 30;
    const player = game.player;
    const enemies = player != null ? game.enemiesOf(player) : new Set();
    const selected = this.selected;
    const frame = ++this._frame;
    if (this._rel.length < game.nations.length + 1) this._rel = new Int8Array(game.nations.length + 64);
    this._rel.fill(-1);

    const items = this._items;
    const vis = this._vis;
    vis.length = 0;
    for (const s of units.stacks) {
      let rec = this.unitEls.get(s.id);
      if (!rec) {
        const el = document.createElement('div');
        el.className = 'unit';
        const r = (rec = { el, s, shown: false, kType: null, kDivs: 0, kFlags: 0, kStr: 0, kOrg: 0, kCount: 0, kRep: null, x: NaN, y: NaN, seen: 0, rep: null, members: [] });
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
        // The members array is reused every frame, so hand out a copy.
        el.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.onUnitClick(r.rep ?? s, e.shiftKey, r.members.slice()); });
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.ctx.onUnitRightClick(s); });
        this.root.appendChild(el);
        this.unitEls.set(s.id, rec);
      }
      rec.seen = frame;
      const pos = ll2v(s.lat, s.lon, 1.0004, p3);
      if (!this._facing(pos)) { this._show(rec, false); continue; }
      const pr = this._project(pos, W, H);
      if (!pr.ok) { this._show(rec, false); continue; }
      const rel = this._relOf(s.owner, player, enemies);
      let it = items[vis.length];
      if (!it) it = items[vis.length] = { rec: null, s: null, x: 0, y: 0, pri: 0, rel: 0 };
      it.rec = rec; it.s = s; it.x = pr.x; it.y = pr.y; it.pri = selected.has(s.id) ? -1 : rel; it.rel = rel;
      vis.push(it);
    }
    for (const [id, rec] of this.unitEls) if (rec.seen !== frame) { rec.el.remove(); this.unitEls.delete(id); }

    vis.sort(byPri);
    const cells = this._cells;
    const heads = this._heads;
    const entries = this._entries;
    cells.clear();
    heads.length = 0;
    for (const it of vis) {
      const s = it.s;
      const cx = Math.round(it.x / cell), cy = Math.round(it.y / cell);
      const k = ((cx + 4096) * 8192 + (cy + 4096)) * 1048576 + s.owner * 4 + DOMAINS.get(TYPES[s.type].domain);
      const head = cells.get(k);
      if (head && !selected.has(s.id)) { head.divs += s.divs; head.rec.members.push(s); this._show(it.rec, false); continue; }
      let entry = entries[heads.length];
      if (!entry) entry = entries[heads.length] = { it: null, rec: null, divs: 0 };
      entry.it = it; entry.rec = it.rec; entry.divs = s.divs;
      it.rec.members.length = 0;
      it.rec.members.push(s);
      heads.push(entry);
      if (!head) cells.set(k, entry);
    }
    for (const entry of heads) {
      const { it, divs } = entry;
      const { rec, s, rel } = it;
      const members = rec.members;
      rec.rep = s;
      let sel = false, strSum = 0, orgSum = 0, divSum = 0, supMin = 1;
      for (const m of members) {
        if (!sel && selected.has(m.id)) sel = true;
        strSum += m.str * m.divs;
        orgSum += m.org * m.divs;
        divSum += m.divs;
        if (m.supply < supMin) supMin = m.supply;
      }
      const strength = strSum / Math.max(1e-6, divSum);
      const strQ = Math.round(strength * 20);
      const orgQ = Math.round((orgSum / Math.max(1e-6, divSum)) * 20);
      const land = TYPES[s.type].domain === 'land';
      // Supply shown only where it bites: amber below half, red when cut off.
      const sup = !land || rel > 2 ? 0 : supMin < 0.25 ? 2 : supMin < 0.5 ? 1 : 0;
      const routed = s.state === 'retreat';
      const army = land && s.army && s.army === this.activeArmy;
      const flags = rel | (sel ? 4 : 0) | (compact ? 8 : 0) | (tags ? 16 : 0) | (s.battle ? 32 : 0) | (sup << 6) | (routed ? 256 : 0) | (army ? 512 : 0);
      if (s.type !== rec.kType || divs !== rec.kDivs || flags !== rec.kFlags || strQ !== rec.kStr || orgQ !== rec.kOrg || members.length !== rec.kCount || s !== rec.kRep) {
        rec.kType = s.type; rec.kDivs = divs; rec.kFlags = flags; rec.kStr = strQ; rec.kOrg = orgQ; rec.kCount = members.length; rec.kRep = s;
        const relCls = REL_CLS[rel];
        const n = this.ctx.game.nations[s.owner];
        const many = members.length > 1;
        if (land) {
          rec.el.className = `unit land ${relCls}${sel ? ' sel' : ''}${compact ? ' compact' : ''}${s.battle ? ' battle' : ''}${tags ? ' tagged' : ''}${routed ? ' routed' : ''}${army ? ' inarmy' : ''}`;
          rec.el.title = many ? `${n.name}: ${members.length} formations, ${+divs.toFixed(2)} division equivalents` : `${n.name}: ${s.name}${s.supply < 0.5 ? `. Supply ${Math.round(s.supply * 100)}%` : ''}`;
          rec.el.innerHTML = `<span class="tag">${esc(n.iso3)}</span>${counter({ type: s.type, ech: echelon(many ? divs : s.divs), num: s.num || '', str: strength, routed })}`
            + `<span class="org"><i style="width:${orgQ * 5}%"></i></span>${many ? `<span class="more">+${members.length - 1}</span>` : ''}${sup ? `<span class="sup ${sup === 2 ? 'cut' : 'low'}"></span>` : ''}`;
        } else {
          rec.el.className = `unit ${relCls}${sel ? ' sel' : ''}${compact ? ' compact' : ''}${s.battle ? ' battle' : ''}${tags ? ' tagged' : ''}`;
          rec.el.title = many ? `${n.name}: ${members.length} formations` : `${n.name}: ${s.name}`;
          rec.el.innerHTML = `<span class="tag">${esc(n.iso3)}</span>${svg(s.type)}<span class="n">${many ? members.length : ''}</span><span class="bar"><i style="width:${Math.round(strength * 100)}%"></i></span>`;
        }
      }
      const x = Math.round(it.x), y = Math.round(it.y);
      if (x !== rec.x || y !== rec.y) { rec.x = x; rec.y = y; rec.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; }
      this._show(rec, true);
    }
    // Drop references so pooled scratch does not pin removed stacks.
    for (let i = vis.length; i < items.length && items[i].s; i++) { items[i].s = null; items[i].rec = null; }
    for (let i = heads.length; i < entries.length && entries[i].rec; i++) { entries[i].it = null; entries[i].rec = null; }
  }

  // Rebuilt when a plan changes; projected every frame.
  _buildPlans() {
    const { units, game } = this.ctx;
    const A = units.armies, items = [];
    const push = (cls, pts, arrow = false, closed = false) => { if (pts.length > 1) items.push({ cls, pts: pts.map(toV), arrow, closed }); };
    // Supply map: the full-supply radius of every hub you or your allies can draw from.
    if (this.mode === 6) {
      const p = game.player;
      for (const h of A.hubs) {
        const own = h.ctrl === p;
        if (!own && !(game.allied(h.ctrl, p) && !game.atWar(h.ctrl, p))) continue;
        const ring = [];
        for (let b = 0; b <= 360; b += 10) ring.push(destination(h, b, fullKm(h.level)));
        push(`reach${own ? '' : ' ally'}${hubCap(h, game.time) ? '' : ' off'}`, ring, false, true);
      }
    }
    for (const seg of A.warFront) { push('wf-h', seg); push('wf', seg); }
    for (const a of A.of(game.player)) {
      const act = a.id === this.activeArmy ? ' act' : '';
      if (a.front) for (const seg of a.front.segs) {
        const line = seg.map((q) => setBack(q, 9));
        push(`af-h${act}`, line);
        push(`af${act}${a.executing ? ' exec' : ''}${a.stance === 'fallback' ? ' off' : ''}`, line);
      }
      if (a.fallback) push(`fb${act}${a.stance === 'fallback' ? ' manned' : ''}`, densify(a.fallback));
      if (a.offensive) push(`of${act}${a.executing ? ' exec' : ''}`, densify(a.offensive), true);
    }
    return items;
  }

  _plans(W, H) {
    const { units, cam } = this.ctx;
    const A = units.armies;
    const key = `${A.version}|${this.activeArmy}|${this.mode}|${this.ctx.game.day}`;
    if (key !== this._planKey) { this._planKey = key; this._planItems = this._buildPlans(); }
    const items = this._planItems.slice();
    // Supply routes: of the selected divisions, or of all your divisions on the supply map.
    const hubs = this._hubById ??= new Map();
    if (hubs.size !== A.hubs.length) { hubs.clear(); for (const h of A.hubs) hubs.set(h.id, h); }
    const route = (s) => {
      const h = s && s.hub && hubs.get(s.hub);
      if (h && s.owner === this.ctx.game.player) items.push({ cls: s.supply < 0.25 ? 'sl cut' : s.supply < 0.5 ? 'sl low' : 'sl', pts: [toV(s), toV(h)], arrow: false });
    };
    if (this.mode === 6) { let k = 0; for (const s of units.stacks) if (s.owner === this.ctx.game.player && s.kit && !s.estimated && k++ < 400) route(s); }
    else if (this.selected.size && this.selected.size <= 40) for (const id of this.selected) route(units.byId.get(id));
    const tool = this.ctx.tool?.();
    if (tool?.pts) {
      const hover = this.ctx.toolHover?.();
      const pts = hover ? [...tool.pts, hover] : tool.pts;
      if (pts.length > 1) items.push({ cls: `draft ${tool.kind}`, pts: densify(pts).map(toV), arrow: tool.kind === 'offensive' });
      for (const p of tool.pts) items.push({ cls: 'draft-pt', pts: [toV(p), toV(p)], arrow: false });
    }
    const els = this._planEls;
    let k = 0;
    const thin = cam.dist > 0.6;
    for (const it of items) {
      let d = '', pen = false;
      for (const p of it.pts) {
        const pr = this._facing(p) && this._project(p, W, H);
        if (!pr || !pr.ok) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${pr.x.toFixed(1)} ${pr.y.toFixed(1)}`;
        pen = true;
      }
      if (!d) continue;
      if (it.closed && !d.includes('M', 1)) d += 'Z';
      let el = els[k];
      if (!el) { el = els[k] = { p: document.createElementNS(SVGNS, 'path'), d: '', cls: '', arrow: null }; this._planG.appendChild(el.p); }
      const cls = thin ? `${it.cls} thin` : it.cls;
      if (el.d !== d) { el.d = d; el.p.setAttribute('d', d); }
      if (el.cls !== cls) { el.cls = cls; el.p.setAttribute('class', cls); }
      if (el.arrow !== it.arrow) { el.arrow = it.arrow; if (it.arrow) el.p.setAttribute('marker-end', 'url(#plan-arrow)'); else el.p.removeAttribute('marker-end'); }
      k++;
    }
    for (let i = k; i < els.length; i++) if (els[i].d) { els[i].d = ''; els[i].p.setAttribute('d', ''); }
  }

  // Supply hubs: railheads and ports, shown once the camera is at theatre scale.
  _hubs(W, H) {
    const { units, game, cam } = this.ctx;
    const A = units.armies, player = game.player, enemies = game.enemiesOf(player);
    const supplyMap = this.mode === 6;
    const show = cam.dist < (supplyMap || this.mode === 7 ? 1.4 : 0.42);
    const labels = cam.dist < (supplyMap ? 0.4 : 0.16);
    for (const h of A.hubs) {
      let rec = this.hubEls.get(h.id);
      if (!rec) {
        if (!show) continue;
        const el = document.createElement('div');
        el.className = 'hub';
        el.innerHTML = '<i></i><b></b>';
        this.root.appendChild(el);
        this.hubEls.set(h.id, (rec = { el, shown: true, key: '', x: NaN, y: NaN, pos: toV(h) }));
      }
      if (!show || !this._facing(rec.pos)) { this._show(rec, false); continue; }
      const pr = this._project(rec.pos, W, H);
      if (!pr.ok) { this._show(rec, false); continue; }
      const rel = this._relOf(h.ctrl, player, enemies);
      const cap = hubCap(h, game.time);
      const building = h.readyAt > game.time, damaged = h.damagedUntil > game.time;
      const load = Math.round(h.load);
      const key = `${rel}|${building}|${damaged}|${labels}|${load}|${Math.round(cap)}|${h.level}|${h.upgradeAt}`;
      if (key !== rec.key) {
        rec.key = key;
        rec.el.className = `hub lv${h.level} ${REL_CLS[rel]}${building ? ' building' : ''}${damaged ? ' damaged' : ''}${labels ? ' labelled' : ''}${load > cap && cap ? ' over' : ''}`;
        rec.el.lastChild.innerHTML = `${esc(h.name)}<em>L${h.level}${h.upgradeAt ? '↑' : ''}${rel === 0 && cap ? ` · ${load}/${Math.round(cap)}` : ''}</em>`;
        rec.el.title = building
          ? `${h.name}: supply hub under construction, open ${new Date(h.readyAt).toISOString().slice(0, 10)}`
          : `${h.name}: level ${h.level} supply hub, ${Math.round(cap)} divisions of throughput, full supply within ${fullKm(h.level)} km${damaged ? ' (damaged, half capacity)' : ''}. ${load ? `${load} drawing.` : 'Unused.'}`;
      }
      if (pr.x !== rec.x || pr.y !== rec.y) { rec.x = pr.x; rec.y = pr.y; rec.el.style.transform = `translate(${pr.x}px, ${pr.y}px)`; }
      this._show(rec, true);
    }
  }

  _battles(W, H) {
    const list = this.ctx.units.battles;
    while (this.battleEls.length < list.length) {
      const el = document.createElement('div');
      el.className = 'battle';
      this.root.appendChild(el);
      this.battleEls.push({ el, shown: true, x: NaN, y: NaN });
    }
    for (let i = 0; i < this.battleEls.length; i++) {
      const rec = this.battleEls[i];
      const b = list[i];
      if (!b) { this._show(rec, false); continue; }
      const pos = ll2v(b.lat, b.lon, 1.0004, p3);
      const pr = this._facing(pos) && this._project(pos, W, H);
      if (!pr || !pr.ok) { this._show(rec, false); continue; }
      if (pr.x !== rec.x || pr.y !== rec.y) { rec.x = pr.x; rec.y = pr.y; rec.el.style.transform = `translate(${pr.x}px, ${pr.y}px)`; }
      this._show(rec, true);
    }
  }

  _intel(W, H, labels) {
    while (this.intelEls.length < labels.length) {
      const el = document.createElement('div');
      this.root.appendChild(el);
      this.intelEls.push({ el, shown: true, kind: null, title: null, sub: null, x: NaN, y: NaN, tk: null });
    }
    for (let i = 0; i < this.intelEls.length; i++) {
      const rec = this.intelEls[i];
      const l = labels[i];
      if (!l) { this._show(rec, false); continue; }
      if (l.kind !== rec.kind || l.title !== rec.title || l.sub !== rec.sub) {
        rec.kind = l.kind; rec.title = l.title; rec.sub = l.sub;
        rec.el.className = `intel ${l.kind}`;
        rec.el.innerHTML = `<div class="t">${esc(l.title)}</div><div class="s">${esc(l.sub)}</div>`;
      }
      const pr = this._facing(l.pos) && this._project(l.pos, W, H);
      if (!pr || !pr.ok) { this._show(rec, false); continue; }
      if (pr.x !== rec.x || pr.y !== rec.y || l.kind !== rec.tk) {
        rec.x = pr.x; rec.y = pr.y; rec.tk = l.kind;
        rec.el.style.transform = `translate(${pr.x}px, ${pr.y}px) ${INTEL_SHIFT[l.kind] ?? 'translate(-50%, -50%)'}`;
      }
      this._show(rec, true);
    }
  }

}
