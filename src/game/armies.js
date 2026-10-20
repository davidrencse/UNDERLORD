// Armies and battle plans, after Hearts of Iron IV. Divisions are grouped into armies; an army
// is given a front line (traced along its border with a chosen enemy and kept up to date as the
// border moves), a fallback line to dig in on, and an offensive line to push to. Its divisions
// spread themselves evenly along whichever line applies. Planning time before an offensive
// builds an attack bonus; executing spends it. Supply hubs feed the divisions, and new
// divisions trained at home deploy to an army as reinforcements.

import { haversine, destination, rng, hashString, bearing as bearingTo } from '../util/geo.js';
import { pixelOf, MAP_W, MAP_H } from '../world/geo.js';
import { CITIES, NAVAL_BASES } from '../data/places.js';
import { traceFront, spread, paramAlong, setBack, lineKm } from './fronts.js';
import { seedHubs, computeSupply, hubCap, SUPPLY, upgradePP } from './supply.js';
import { EQUIPMENT_IDS, COST } from './templates.js';
import { needOf, draw, produceDay, autoAssign, optionsFor } from './production.js';
import { restat } from './templates.js';
import { researchDay, autoResearch, seedResearch, hasTech, ratings, TECH } from './research.js';

const DAY = 86400000;
const LAND = new Set(['armor', 'mech', 'inf', 'airborne', 'marine']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const ordinal = (i) => { const s = ['th', 'st', 'nd', 'rd'], v = i % 100; return i + (s[(v - 20) % 10] || s[v] || s[0]); };

export const PLAN = {
  days: 14, // planning time to the full bonus
  max: 0.3, // +30% attack at full planning
  setBackKm: 6, // divisions hold this far behind the contact line
  pushKm: 15, // how far past the line each division drives per bound when a front executes
  updateHours: 6,
};

// Divisions a nation can have in training at once, from its defence spending ($10bn a line).
export const trainingLines = (n) => clamp(Math.round((n.gdp * (n.defPct ?? 1.5)) / 100 / 10), 1, 10);

export class Armies {
  constructor(units) {
    this.units = units;
    this.game = units.game;
    this.world = units.world;
    this.list = [];
    this.byId = new Map();
    this.nextId = 1;
    this.queue = [];
    this.nextQ = 1;
    this.hubs = seedHubs(this.game.live(), CITIES, NAVAL_BASES);
    // Hubs already behind the enemy's line on day one (occupied Ukraine) start in their hands.
    for (const h of this.hubs) h.ctrl = this.world.control[pixelOf(h.lat, h.lon)] || h.owner;
    this.warFront = [];
    this.version = 0; // bumped whenever anything a renderer draws changes
    this.r = rng(hashString('armies'));
    this._hours = 0;
    this._names = new Map();
  }

  // ---------------------------------------------------------------- membership
  of(owner) { return this.list.filter((a) => a.owner === owner); }
  members(a) {
    const out = [];
    for (const id of a.ids) { const s = this.units.byId.get(id); if (s) out.push(s); else a.ids.delete(id); }
    return out;
  }

  create(owner, stacks = [], name) {
    const k = (this._names.get(owner) ?? 0) + 1;
    this._names.set(owner, k);
    const a = {
      id: this.nextId++, owner, name: name ?? `${ordinal(k)} Army`, ids: new Set(),
      front: null, fallback: null, offensive: null, stance: 'front', executing: false, plan: 0, slots: [],
    };
    this.list.push(a);
    this.byId.set(a.id, a);
    this.assign(a, stacks);
    this.version++;
    return a;
  }

  assign(a, stacks) {
    for (const s of stacks) {
      if (s.owner !== a.owner || !LAND.has(s.type)) continue;
      if (s.army && s.army !== a.id) this.detach(s);
      s.army = a.id;
      a.ids.add(s.id);
    }
    this.refresh(a);
  }

  detach(s) {
    const a = this.byId.get(s.army);
    s.army = 0; s.slot = null; s.plan = 0;
    if (a) { a.ids.delete(s.id); this.version++; }
  }

  disband(a) {
    for (const s of this.members(a)) { s.army = 0; s.slot = null; s.plan = 0; }
    this.list = this.list.filter((x) => x !== a);
    this.byId.delete(a.id);
    this.version++;
  }

  // ---------------------------------------------------------------- lookup tables
  _lut(fn) {
    const t = new Uint8Array(256);
    const ns = this.game.nations;
    for (let i = 1; i < 256 && i < ns.length; i++) if (ns[i] && fn(i)) t[i] = 1;
    return t;
  }
  _mine(owner) { return this._lut((c) => c === owner); }
  _theirs(owner, target) {
    const g = this.game;
    if (!g.atWar(owner, target)) return this._lut((c) => c === target);
    return this._lut((c) => c === target || (g.atWar(owner, c) && g.allied(c, target)));
  }

  // ---------------------------------------------------------------- plans
  // A front line along the border with `target` near `centre` (where the player clicked).
  setFront(a, target, centre) {
    const g = this.game;
    if (target === a.owner) return 'Pick a neighbouring country, not your own.';
    if (!g.nations[target] || g.nations[target].inert) return 'There is no border there.';
    const segs = traceFront(this.world.control, MAP_W, MAP_H, centre, this._mine(a.owner), this._theirs(a.owner, target));
    if (!segs.length) return `No border with ${g.nations[target].name} within 1,000 km of that point.`;
    a.front = { target, centre: { lat: centre.lat, lon: centre.lon }, segs };
    a.stance = 'front';
    a.plan = Math.min(a.plan, 0.2);
    this.refresh(a);
    return null;
  }

  setFallback(a, pts) {
    if (pts.length < 2) return 'A fallback line needs at least two points.';
    const { control } = this.world;
    const own = pts.filter((p) => control[pixelOf(p.lat, p.lon)] === a.owner).length;
    if (own < pts.length / 2) return 'Draw the fallback line on ground you hold.';
    a.fallback = pts.map((p) => ({ lat: p.lat, lon: p.lon }));
    if (!a.front) a.stance = 'fallback';
    this.refresh(a);
    return null;
  }

  setOffensive(a, pts) {
    if (pts.length < 2) return 'An offensive line needs at least two points.';
    a.offensive = pts.map((p) => ({ lat: p.lat, lon: p.lon }));
    a.plan = Math.min(a.plan, 0.2);
    this.version++;
    return null;
  }

  setStance(a, stance) {
    if (stance === 'fallback' && !a.fallback) return 'Draw a fallback line first.';
    if (stance === 'front' && !a.front) return 'Draw a front line first.';
    a.stance = stance;
    if (stance === 'fallback') a.executing = false;
    this.refresh(a);
    return null;
  }

  clear(a, kind) {
    if (kind === 'front') { a.front = null; a.executing = false; if (a.fallback) a.stance = 'fallback'; }
    else if (kind === 'fallback') { a.fallback = null; a.stance = 'front'; }
    else if (kind === 'offensive') a.offensive = null;
    this.refresh(a);
  }

  execute(a, on) {
    const g = this.game;
    if (!on) { a.executing = false; this.refresh(a); return null; }
    if (!a.front && !a.offensive) return 'Give the army a front line or an offensive line first.';
    if (a.front && !g.atWar(a.owner, a.front.target) && !a.offensive) return `You are not at war with ${g.nations[a.front.target].name}.`;
    if (!g.enemiesOf(a.owner).size) return 'You are not at war.';
    a.executing = true;
    a.stance = 'front';
    for (const s of this.members(a)) s.plan = a.plan * PLAN.max;
    this.refresh(a);
    return null;
  }

  // The line the army's divisions are spread along right now.
  lineOf(a) {
    if (a.stance === 'fallback' && a.fallback) return { segs: [a.fallback], drawn: true };
    if (a.front?.segs.length) return { segs: a.front.segs, drawn: false };
    if (a.fallback) return { segs: [a.fallback], drawn: true };
    return null;
  }

  // Re-traces the front and hands every division its slot (or its objective when attacking).
  refresh(a, { snap = false } = {}) {
    const g = this.game, units = this.units;
    this.version++;
    if (a.front) {
      const segs = traceFront(this.world.control, MAP_W, MAP_H, a.front.centre, this._mine(a.owner), this._theirs(a.owner, a.front.target));
      a.front.segs = segs;
      // Follow the front as it moves, so a long advance never carries it out of the search window.
      if (segs.length) {
        const mid = segs[0][Math.floor(segs[0].length / 2)];
        if (haversine(mid, a.front.centre) > 500) a.front.centre = { lat: mid.lat, lon: mid.lon };
      }
    }
    const line = this.lineOf(a);
    const members = this.members(a);
    a.slots = [];
    if (!line || !members.length) return;
    const free = members.filter((s) => !s.battle && s.state !== 'retreat');
    let order = free.map((s) => ({ s, t: paramAlong(line.segs, s) })).sort((x, y) => x.t - y.t);
    // An offensive line is taken by the divisions nearest it, about one per 15 km of objective;
    // the rest of the army keeps holding its line so the front is not stripped bare.
    let strike = [];
    const fit = (s) => s.org >= 0.45 && s.str >= 0.3;
    if (a.executing && a.offensive && g.enemiesOf(a.owner).size) {
      const k = Math.min(order.length, Math.max(2, Math.round(lineKm(a.offensive) / 15)));
      const probe = spread([a.offensive], 12);
      const near = (s) => Math.min(...probe.map((p) => haversine(p, s)));
      const picked = new Set(order.filter(({ s }) => fit(s)).map((o) => o.s).sort((x, y) => near(x) - near(y)).slice(0, k));
      strike = order.filter(({ s }) => picked.has(s)).map(({ s }) => ({ s, t: paramAlong([a.offensive], s) })).sort((x, y) => x.t - y.t);
      order = order.filter(({ s }) => !picked.has(s));
    }
    const slots = spread(line.segs, order.length);
    a.slots = slots;
    const goals = strike.length ? spread([a.offensive], strike.length) : null;
    const enemy = a.front ? this._theirs(a.owner, a.front.target) : this._lut((c) => g.atWar(a.owner, c));
    const { control } = this.world;
    // A division already holding near its slot stays dug in: the slots shift a little every time
    // the line is re-traced or a neighbour drops out, and chasing that would cost the entrenchment.
    const spacing = line.segs.reduce((t, p) => t + lineKm(p), 0) / Math.max(1, order.length);
    const slack = Math.min(25, Math.max(6, spacing * 0.6));
    const send = (s, dest, tol) => {
      if (snap) { s.lat = dest.lat; s.lon = dest.lon; s.path = []; s.state = 'idle'; s.dig = 0.6; return; }
      // Holding units on their own side of the line count as in place if they are near the slot.
      if (s.state !== 'moving' && haversine(s, dest) < tol && !enemy[control[pixelOf(s.lat, s.lon)]]) return;
      if (s.path.length && haversine(s.path[s.path.length - 1], dest) < Math.min(tol, 6)) return;
      units.order(s, dest);
    };
    order.forEach(({ s }, i) => {
      const slot = slots[i];
      // A division the player moved by hand finishes that move first, then rejoins the line.
      if (s.manual) { if (s.state === 'moving') return; s.manual = false; }
      const hold = line.drawn ? { lat: slot.lat, lon: slot.lon } : setBack(slot, PLAN.setBackKm);
      s.slot = hold;
      // Executing a front with no offensive line: every fit division drives a bound forward.
      // Worn-out divisions stop attacking and hold the line until they recover.
      if (a.executing && !a.offensive && g.enemiesOf(a.owner).size && fit(s) && slot.out != null) {
        const ahead = destination(slot, slot.out, PLAN.pushKm);
        if (enemy[control[pixelOf(ahead.lat, ahead.lon)]]) { send(s, ahead, 3); return; }
      }
      send(s, hold, slack);
    });
    strike.forEach(({ s }, i) => {
      if (s.manual) { if (s.state === 'moving') return; s.manual = false; }
      s.slot = goals[i];
      send(s, goals[i], 3);
    });
    if (goals && strike.every(({ s }, i) => haversine(s, goals[i]) < 10)) {
      a.offensive = null;
      a.executing = false;
      if (a.owner === g.player) g.log(`${a.name} has reached its objective.`, { nation: a.owner, kind: 'war' });
    }
  }

  // ---------------------------------------------------------------- supply hubs
  canBuildHub(owner, p) {
    const n = this.game.nations[owner];
    if (this.world.control[pixelOf(p.lat, p.lon)] !== owner) return 'Supply hubs can only be built on ground you hold.';
    if (this.hubs.some((h) => h.ctrl === owner && haversine(h, p) < SUPPLY.minGapKm)) return `Too close to another hub (${SUPPLY.minGapKm} km minimum).`;
    if (n.pp < SUPPLY.buildPP) return `Needs ${SUPPLY.buildPP} political power.`;
    return null;
  }

  buildHub(owner, p) {
    const why = this.canBuildHub(owner, p);
    if (why) return why;
    const g = this.game, n = g.nations[owner];
    n.pp -= SUPPLY.buildPP;
    const city = CITIES.filter((c) => haversine(c, p) < 40).sort((x, y) => haversine(x, p) - haversine(y, p))[0];
    const near = this.hubs.filter((h) => h.owner === owner && h.kind === 'built').length + 1;
    this.hubs.push({
      id: this.hubs.length + 1, owner, ctrl: owner, lat: p.lat, lon: p.lon, name: city ? `${city.name} railhead` : `Railhead ${near}`,
      level: SUPPLY.buildLevel, kind: 'built', damagedUntil: 0, readyAt: g.time + SUPPLY.buildDays * DAY, upgradeAt: 0, load: 0,
    });
    this.version++;
    return null;
  }

  // Why hub `h` cannot be upgraded by `owner` right now, or null.
  canUpgradeHub(owner, h) {
    if (!h || h.ctrl !== owner) return 'You do not hold this hub.';
    if (h.readyAt > this.game.time) return 'Still under construction.';
    if (h.upgradeAt) return 'Already being upgraded.';
    if (h.level >= SUPPLY.maxLevel) return 'Already at the highest level.';
    if (this.game.nations[owner].pp < upgradePP(h.level)) return `Needs ${upgradePP(h.level)} political power.`;
    return null;
  }

  upgradeHub(owner, id) {
    const h = this.hubs.find((x) => x.id === id);
    const why = this.canUpgradeHub(owner, h);
    if (why) return why;
    this.game.nations[owner].pp -= upgradePP(h.level);
    h.upgradeAt = this.game.time + SUPPLY.upgradeDays * DAY;
    this.version++;
    return null;
  }

  _hubsDaily() {
    const g = this.game, { control } = this.world;
    for (const h of this.hubs) {
      const c = control[pixelOf(h.lat, h.lon)];
      if (c && c !== h.ctrl) {
        const was = h.ctrl;
        h.ctrl = c;
        h.damagedUntil = g.time + SUPPLY.captureDays * DAY;
        this.version++;
        if (was === g.player) g.log(`Supply hub at ${h.name} lost to ${g.nations[c].name}.`, { nation: was, kind: 'war' });
        else if (c === g.player) g.log(`${h.name} supply hub captured. It runs at half capacity while it is repaired.`, { nation: c, kind: 'war' });
      }
      if (h.readyAt && h.readyAt <= g.time && h.readyAt > g.time - DAY && h.ctrl === g.player) {
        g.log(`${h.name} supply hub is open.`, { nation: h.ctrl, kind: 'info' });
        this.version++;
      }
      if (h.upgradeAt && h.upgradeAt <= g.time) {
        h.upgradeAt = 0;
        // An upgrade is lost if the hub changed hands while it was under way.
        if (h.ctrl === h.owner || h.kind === 'built') h.level = Math.min(SUPPLY.maxLevel, h.level + 1);
        this.version++;
        if (h.ctrl === g.player) g.log(`${h.name} supply hub upgraded to level ${h.level}.`, { nation: h.ctrl, kind: 'info' });
      }
    }
  }

  _supplyDaily() {
    const g = this.game, units = this.units;
    // Every land formation is supplied, at war or not; only a nation at war can have a route cut.
    const land = units.stacks.filter((s) => LAND.has(s.type));
    const usable = new Map(), enemies = new Map();
    computeSupply(land, this.hubs, {
      time: g.time, control: this.world.control, pixelOf,
      usable: (o) => {
        let l = usable.get(o);
        if (!l) usable.set(o, (l = this.hubs.filter((h) => hubCap(h, g.time) > 0 && (h.ctrl === o || (g.allied(h.ctrl, o) && !g.atWar(h.ctrl, o))))));
        return l;
      },
      isEnemyOf: (o) => {
        if (!g.enemiesOf(o).size) return null;
        let t = enemies.get(o);
        if (!t) enemies.set(o, (t = this._lut((c) => g.atWar(o, c))));
        return (c) => t[c] === 1;
      },
    });
  }

  // ---------------------------------------------------------------- training and reinforcement
  queued(owner) { return this.queue.filter((q) => q.owner === owner); }

  // Queues a division of template `tplId`. Recruits are taken now; equipment when it deploys.
  train(owner, tplId, armyId = 0) {
    const g = this.game, n = g.nations[owner];
    const tpl = n.templates.find((t) => t.id === tplId);
    if (!tpl) return 'Unknown division template.';
    if (this.queued(owner).length >= trainingLines(n)) return `All ${trainingLines(n)} training lines are busy. Raise military spending for more.`;
    const men = Math.ceil(tpl.stats.men / 1000);
    if (n.manpower < men) return `Needs ${men}k manpower.`;
    n.manpower -= men;
    this.queue.push({ id: this.nextQ++, owner, tpl, men, start: g.time, ready: g.time + tpl.stats.days * DAY, army: armyId });
    this.version++;
    return null;
  }

  cancel(id) {
    const q = this.queue.find((x) => x.id === id);
    if (!q) return;
    this.game.nations[q.owner].manpower += q.men;
    this.queue = this.queue.filter((x) => x !== q);
    this.version++;
  }

  _trainingDaily() {
    const g = this.game;
    const done = this.queue.filter((q) => q.ready <= g.time);
    if (!done.length) return;
    this.queue = this.queue.filter((q) => q.ready > g.time);
    for (const q of done) {
      const n = g.nations[q.owner];
      const a = this.byId.get(q.army);
      // Deploy at the owner's working hub nearest the army it will join, else the capital.
      const toward = a ? (this.members(a)[0] ?? n.capital) : n.capital;
      const hubs = this.hubs.filter((h) => h.ctrl === q.owner && hubCap(h, g.time) > 0);
      const at = hubs.sort((x, y) => haversine(x, toward) - haversine(y, toward))[0] ?? n.capital;
      const p = destination(at, this.r() * 360, 4 + this.r() * 10);
      // It deploys with whatever share of its equipment the stockpile can give it.
      const fill = draw(n, needOf(q.tpl));
      const s = this.units.add({ owner: q.owner, type: q.tpl.stats.type, tpl: q.tpl, divs: 1, lat: p.lat, lon: p.lon, str: Math.max(0.2, fill), org: 0.6, exp: 0.15, fresh: true });
      if (a && a.owner === q.owner) this.assign(a, [s]);
      if (q.owner === g.player) g.log(`${s.name} has finished training${a ? ` and is moving up to ${a.name}` : ` at ${at.name ?? 'the capital'}`}${fill < 0.95 ? `, at ${Math.round(Math.max(0.2, fill) * 100)}% strength for want of equipment` : ''}.`, { nation: q.owner, kind: 'war' });
    }
    this.game.emit('units');
  }

  // ---------------------------------------------------------------- production
  // Equipment a nation is short of, in factory-days: what its divisions need to refill, what its
  // queued divisions will need, less the stockpile.
  demand(owner) {
    const n = this.game.nations[owner];
    const want = {};
    for (const s of this.units.stacks) {
      if (s.owner !== owner || !s.tpl || s.str >= 0.999) continue;
      for (const [e, v] of Object.entries(needOf(s.tpl, (1 - s.str) * s.divs))) want[e] = (want[e] ?? 0) + v;
    }
    for (const q of this.queue) if (q.owner === owner) for (const [e, v] of Object.entries(needOf(q.tpl))) want[e] = (want[e] ?? 0) + v;
    // Consumables: three months of the current rate of fire on top, since guns and drone units
    // without them fall silent.
    const P = n.production;
    for (const e of ['ammo', 'fpv']) want[e] = (want[e] ?? 0) + (P.need?.[e] ?? 0) * 90;
    const out = {};
    for (const e of EQUIPMENT_IDS) out[e] = Math.max(0, (want[e] ?? 0) - (P.stock[e] ?? 0)) * (COST[e] ?? 1);
    return out;
  }

  // What a nation may build, and its templates' ratings, after alliances, stock or research change.
  refreshOptions(n) {
    const g = this.game, byIso = this.world.byIso;
    const isPartner = (iso) => { const m = byIso.get(iso); return !!m && m !== n && g.allied(n.index, m.index); };
    n.production.options = optionsFor(n, isPartner, g.time, (iso, tech) => hasTech(byIso.get(iso), tech));
    for (const t of n.templates) restat(t, ratings(n));
  }

  // Research slots advance; the AI keeps every slot busy, favouring the classes its army fields.
  // A finished technology opens its models to the production lines at once.
  _researchDaily() {
    const g = this.game;
    for (const n of g.live()) {
      if (!n.production) continue;
      if (!n.research) seedResearch(n);
      const done = researchDay(n, g.time);
      // Picks happen when a project finishes, and every ten days for slots left idle (a new slot
      // from a bigger budget, or a nation that has run out of technologies).
      if (n.index !== g.player && n.research.slots.includes(null) && (done.length || (g.day + n.index) % 10 === 0 || !n.research.picked)) {
        n.research.picked = true;
        const uses = {};
        for (const s of this.units.stacks) if (s.owner === n.index && s.tpl) for (const e of Object.keys(s.tpl.stats.eq)) uses[e] = true;
        autoResearch(n, g.time, uses);
      }
      if (!done.length) continue;
      this.refreshOptions(n);
      // Partners may now build its models under licence.
      if (done.some((id) => TECH[id].unlocks.length)) for (const m of g.live()) if (m !== n && m.production && g.allied(n.index, m.index)) this.refreshOptions(m);
      if (n.index === g.player) g.emit('research', n, done);
    }
  }

  _productionDaily() {
    const g = this.game;
    const monthly = g.day % 30 === 0;
    for (const n of g.live()) {
      if (!n.production) continue;
      produceDay(n);
      // Alliances change what may be built under licence; stock quality changes division stats.
      if (monthly) this.refreshOptions(n);
      // Nations on automatic production (the AI, and the player until they change a line) rebalance
      // their lines toward shortages once a month, with a floor for each kind they field.
      if (n.production.auto && (g.day + n.index) % 30 === 0) {
        const want = this.demand(n.index);
        const fielded = {};
        for (const s of this.units.stacks) if (s.owner === n.index && s.tpl) for (const [e, v] of Object.entries(needOf(s.tpl, s.divs))) fielded[e] = (fielded[e] ?? 0) + v * (COST[e] ?? 1) * 0.02;
        // No one shortage may claim more than two months of every factory, so a lost tank park
        // cannot starve the guns of shells; consumables count double, as the line runs on them.
        const cap = n.production.factories * 60;
        for (const e of EQUIPMENT_IDS) want[e] = Math.min(cap, ((want[e] ?? 0) + (fielded[e] ?? 0)) * (e === 'ammo' || e === 'fpv' ? 2 : 1));
        const before = new Map(n.production.lines.map((l) => [l.eq, l.eff]));
        autoAssign(n, want);
        for (const l of n.production.lines) if (before.has(l.eq)) l.eff = before.get(l.eq);
      }
    }
  }

  // ---------------------------------------------------------------- simulation hooks
  hourly() {
    if (++this._hours % PLAN.updateHours) return;
    for (const a of this.list) if (a.front || a.fallback || a.executing) this.refresh(a);
    this.traceWarFront();
  }

  daily() {
    const g = this.game;
    this._hubsDaily();
    this._supplyDaily();
    this._researchDaily();
    this._productionDaily();
    this._trainingDaily();
    for (const a of this.list) {
      a.plan = a.executing ? Math.max(0, a.plan - 0.1) : (a.front || a.offensive) ? Math.min(1, a.plan + 1 / PLAN.days) : Math.max(0, a.plan - 0.05);
      const bonus = a.plan * PLAN.max;
      for (const s of this.members(a)) s.plan = a.executing ? bonus : 0;
    }
    this._ai();
  }

  // The player's war fronts: every border between ground they (or allies) hold and enemy ground.
  traceWarFront() {
    const g = this.game, p = g.player;
    const before = this.warFront.length;
    this.warFront = [];
    if (p != null && g.enemiesOf(p).size) {
      const mine = this._lut((c) => c === p || (g.allied(c, p) && !g.atWar(c, p)));
      const theirs = this._lut((c) => g.atWar(p, c));
      this.warFront = traceFront(this.world.control, MAP_W, MAP_H, g.nations[p].capital, mine, theirs, { dLat: 13, minKm: 15 });
    }
    if (before || this.warFront.length) this.version++;
  }

  // ---------------------------------------------------------------- AI
  // Builds one army per nation at war, puts it on the front with its nearest enemy, attacks when
  // planned and stronger, holds when worn out, and trains replacements.
  bootstrap() {
    this._ai({ snap: true });
    this._supplyDaily();
    this.traceWarFront();
  }

  _ai({ snap = false } = {}) {
    const g = this.game, units = this.units;
    for (const a of [...this.list]) if (a.owner !== g.player && !g.enemiesOf(a.owner).size) this.disband(a);
    for (const n of g.live()) {
      if (n.index === g.player) continue;
      const enemies = g.enemiesOf(n.index);
      if (!enemies.size) continue;
      let army = this.of(n.index)[0];
      const free = units.stacks.filter((s) => s.owner === n.index && LAND.has(s.type) && !s.army && !s.estimated && !s.battle && haversine(s, n.capital) < 3500);
      if (!army) {
        if (!free.length || (n._frontRetry ?? 0) > g.time) continue;
        // Nearest enemy first: their capital's distance from ours.
        const targets = [...enemies].filter((e) => !g.nations[e].inert).sort((x, y) => haversine(g.nations[x].capital, n.capital) - haversine(g.nations[y].capital, n.capital));
        army = this.create(n.index, []);
        let ok = false;
        for (const t of targets) {
          const c = g.nations[t].capital;
          const mid = { lat: c.lat + (n.capital.lat - c.lat) * 0.35, lon: c.lon + (n.capital.lon - c.lon) * 0.35 };
          if (!this.setFront(army, t, mid) || !this.setFront(army, t, c)) { ok = true; break; }
        }
        if (!ok) { this.disband(army); n._frontRetry = g.time + 7 * DAY; continue; }
      }
      if (free.length) {
        this.assign(army, free);
        if (snap) this.refresh(army, { snap: true });
      }
      if (!snap) { this._aiOffensive(n, army); this._aiLogistics(n, army); }
      // Replacements for the line come first; new divisions only from a healthy reserve.
      if (!snap && this.queued(n.index).length < trainingLines(n) && n.manpower > 80 && this.r() < 0.3) {
        const roll = this.r();
        this.train(n.index, n.templates[roll < 0.6 ? 0 : roll < 0.85 ? 1 : 2]?.id, army.id);
      }
    }
  }

  // Builds a railhead behind the worst-supplied stretch of the line, and upgrades overloaded hubs.
  _aiLogistics(n, a) {
    if (this.r() > 0.25) return;
    const g = this.game;
    const over = this.hubs.filter((h) => h.ctrl === n.index && h.load > hubCap(h, g.time) && !this.canUpgradeHub(n.index, h)).sort((x, y) => y.load - x.load)[0];
    if (over) { this.upgradeHub(n.index, over.id); return; }
    const short = this.members(a).filter((s) => s.supply < 0.6 && s.supply > SUPPLY.cutFactor * 1.5 && !s.battle);
    if (short.length < 3) return;
    const s = short[Math.floor(this.r() * short.length)];
    const back = destination(s, bearingTo(s, n.capital), 50);
    if (!this.canBuildHub(n.index, back)) this.buildHub(n.index, back);
  }

  _aiOffensive(n, a) {
    const g = this.game;
    if (!a.front?.segs.length) return;
    const members = this.members(a);
    if (!members.length) return;
    const atk = (t) => t.soft + t.arty + t.drone + t.pierce + t.dpierce;
    const pow = (s, role) => s.divs * s.str * (0.3 + 0.7 * s.org) * (s.tpl ? (role === 'atk' ? atk(s.tpl.stats) : s.tpl.stats.def) / 100 : 1) * (0.4 + 0.6 * (s.supply ?? 1));
    const mine = members.reduce((t, s) => t + pow(s, 'atk'), 0);
    // Enemy divisions within 60 km of the front.
    const pts = a.front.segs.flat().filter((_, i) => i % 3 === 0);
    if (!pts.length) return;
    let theirs = 0;
    for (const o of this.units.stacks) {
      if (!LAND.has(o.type) || !g.atWar(n.index, o.owner)) continue;
      if (Math.abs(o.lat - pts[0].lat) > 25) continue;
      if (pts.some((p) => Math.abs(p.lat - o.lat) < 0.6 && haversine(p, o) < 60)) theirs += pow(o, 'def') * (1 + 0.4 * (o.dig ?? 0));
    }
    const ratio = mine / Math.max(0.5, theirs);
    const org = members.reduce((t, s) => t + s.org, 0) / members.length;
    const eager = 0.15 + n.warSupport / 400;
    if (!a.executing && a.plan >= 0.5 && ratio > 1.1 && org > 0.75 && this.r() < eager) this.execute(a, true);
    else if (a.executing && (org < 0.4 || ratio < 0.85)) this.execute(a, false);
  }
}

export { LAND, lineKm };
