import * as THREE from 'three';
import { ll2v, DEG } from '../util/geo.js';
import { CITIES } from '../data/places.js';
import { TYPES } from '../game/units.js';
import { svg } from './symbols.js';
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

    this.cross = document.createElement('div');
    this.cross.className = 'crosshair';
    this.cross.innerHTML = '<div class="h"></div><div class="v"></div><div class="dot"></div><div class="title"><b></b><span></span></div>';
    this.cross.style.display = 'none';
    root.appendChild(this.cross);
    this._crossShown = false;
    this._crossX = NaN;
    this._crossY = NaN;
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

    if (game.player != null) this._units(W, H);
    this._battles(W, H);
    this._intel(W, H, cityLayer.labels);
    this._crosshair(W, H);
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
    const cell = compact ? 16 : 30;
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
        const r = (rec = { el, s, shown: false, kType: null, kDivs: 0, kFlags: 0, kStr: 0, kCount: 0, x: NaN, y: NaN, seen: 0, rep: null, members: [] });
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
      let sel = false, strSum = 0, divSum = 0;
      for (const m of members) {
        if (!sel && selected.has(m.id)) sel = true;
        strSum += m.str * m.divs;
        divSum += m.divs;
      }
      const strength = strSum / Math.max(1, divSum);
      const strQ = Math.round(strength * 20);
      const flags = rel | (sel ? 4 : 0) | (compact ? 8 : 0) | (tags ? 16 : 0) | (s.battle ? 32 : 0);
      if (s.type !== rec.kType || divs !== rec.kDivs || flags !== rec.kFlags || strQ !== rec.kStr || members.length !== rec.kCount) {
        rec.kType = s.type; rec.kDivs = divs; rec.kFlags = flags; rec.kStr = strQ; rec.kCount = members.length;
        const relCls = REL_CLS[rel];
        const n = this.ctx.game.nations[s.owner];
        rec.el.className = `unit ${relCls}${sel ? ' sel' : ''}${compact ? ' compact' : ''}${s.battle ? ' battle' : ''}${tags ? ' tagged' : ''}`;
        rec.el.title = members.length > 1 ? `${n.name}: ${members.length} formations, ${divs} divisions` : `${n.name}: ${s.name}`;
        const count = TYPES[s.type].domain === 'land' ? divs : members.length > 1 ? members.length : '';
        rec.el.innerHTML = `<span class="tag">${esc(n.iso3)}</span>${svg(s.type)}<span class="n">${count}</span><span class="bar"><i style="width:${Math.round(strength * 100)}%"></i></span>`;
      }
      const x = Math.round(it.x), y = Math.round(it.y);
      if (x !== rec.x || y !== rec.y) { rec.x = x; rec.y = y; rec.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; }
      this._show(rec, true);
    }
    // Drop references so pooled scratch does not pin removed stacks.
    for (let i = vis.length; i < items.length && items[i].s; i++) { items[i].s = null; items[i].rec = null; }
    for (let i = heads.length; i < entries.length && entries[i].rec; i++) { entries[i].it = null; entries[i].rec = null; }
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

  _setCross(on) { if (this._crossShown !== on) { this._crossShown = on; this.cross.style.display = on ? '' : 'none'; } }

  // Positioned with transforms rather than left/top, so moving it never invalidates layout.
  _crosshair(W, H) {
    const { game } = this.ctx;
    const n = this.selectedNation != null ? game.nations[this.selectedNation] : null;
    if (!n || this.ctx.cam.dist < 0.05) { this._setCross(false); return; }
    const pos = ll2v(n.label.lat, n.label.lon, 1.0005, p3);
    const pr = this._facing(pos) && this._project(pos, W, H);
    if (!pr || !pr.ok) { this._setCross(false); return; }
    this._setCross(true);
    const [h, vv, dot, title] = this.cross.children;
    if (pr.x !== this._crossX || pr.y !== this._crossY) {
      this._crossX = pr.x; this._crossY = pr.y;
      // Snap to device pixels as layout did for the old left/top, keeping the 1px hairlines crisp.
      const dpr = window.devicePixelRatio || 1;
      const x = Math.round(pr.x * dpr) / dpr, y = Math.round(pr.y * dpr) / dpr;
      h.style.transform = `translateY(${y}px)`;
      vv.style.transform = `translateX(${x}px)`;
      dot.style.transform = `translate(${x}px, ${y}px)`;
      title.style.transform = `translate(${x}px, ${y}px) translate(-50%, -140%)`;
    }
    if (title._n !== n || title._leader !== n.leader || title._title !== n.title || title._name !== n.name) {
      title._n = n; title._leader = n.leader; title._title = n.title; title._name = n.name;
      title.children[0].textContent = n.name;
      title.children[1].textContent = `${n.leader}${n.title ? `, ${n.title}` : ''}`;
    }
  }
}
