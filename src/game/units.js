import { haversine, bearing, destination, interpolate, rng, hashString, DEG } from '../util/geo.js';
import { pixelOf, pixelToLL, MAP_W, MAP_H } from '../world/geo.js';
import { CITIES, NAVAL_BASES, CARRIER_POSITIONS } from '../data/places.js';
import { clamp } from './game.js';
import { landSpeed, kitOf, URBAN_DEFENCE } from './orbat.js';
import { doctrine } from '../world/unitModels.js';

export const TYPES = {
  armor: { label: 'Armoured', domain: 'land', speed: 9, atk: 1.55, def: 1.0, men: 15000 },
  mech: { label: 'Mechanised', domain: 'land', speed: 8, atk: 1.25, def: 1.15, men: 16000 },
  inf: { label: 'Infantry', domain: 'land', speed: 5, atk: 0.85, def: 1.25, men: 14000 },
  airborne: { label: 'Airborne', domain: 'land', speed: 7, atk: 1.05, def: 0.95, men: 12000 },
  marine: { label: 'Marine', domain: 'land', speed: 6, atk: 1.1, def: 1.05, men: 13000 },
  air: { label: 'Air wing', domain: 'air', speed: 750, atk: 0, def: 0, men: 2500 },
  fleet: { label: 'Surface fleet', domain: 'sea', speed: 32, atk: 1.2, def: 1.0, men: 4000 },
  carrier: { label: 'Carrier strike group', domain: 'sea', speed: 34, atk: 1.6, def: 1.2, men: 7500 },
  sub: { label: 'Submarine flotilla', domain: 'sea', speed: 28, atk: 1.4, def: 0.7, men: 1200 },
};

// Built-up areas: a radius that grows with the square root of metro population.
const URBAN = CITIES.map((c) => ({ ...c, r: 4 + 5 * Math.sqrt(c.pop) }));
// URBAN indices bucketed by whole degree of latitude, so a lookup only tests nearby cities.
const URBAN_BANDS = new Map();
URBAN.forEach((c, i) => { const k = Math.floor(c.lat); (URBAN_BANDS.get(k) ?? URBAN_BANDS.set(k, []).get(k)).push(i); });
// A slight underestimate of km per degree of latitude (true: 111.1949), for safe distance prefilters.
const KM_PER_DEG_LO = 111.19;

export function cityAt(p) {
  // Returns the first URBAN entry (in list order) that matches, exactly as a full scan would.
  const lat = p.lat;
  if (!(lat === lat)) return null;
  let best = -1;
  for (let k = Math.floor(lat - 0.8) - 1, k1 = Math.floor(lat + 0.8) + 1; k <= k1; k++) {
    const band = URBAN_BANDS.get(k);
    if (!band) continue;
    for (const i of band) {
      if (best >= 0 && i > best) break;
      const c = URBAN[i];
      if (Math.abs(c.lat - lat) < 0.8 && haversine(p, c) < c.r) { best = i; break; }
    }
  }
  return best >= 0 ? URBAN[best] : null;
}

const ORD = (i) => { const s = ['th', 'st', 'nd', 'rd'], v = i % 100; return i + (s[(v - 20) % 10] || s[v] || s[0]); };
const ROMAN = (n) => { const m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let r = ''; for (const [v, s] of m) while (n >= v) { r += s; n -= v; } return r; };

// Forces stationed abroad on 20 January 2025: [owner, type, divisions, lat, lon, name]
const DEPLOYMENTS = [
  ['USA', 'armor', 2, 49.45, 11.85, 'V Corps (Germany)'], ['USA', 'mech', 2, 52.45, 16.7, '3rd Infantry Division (Poland)'],
  ['USA', 'mech', 2, 37.05, 127.05, '2nd Infantry Division (Korea)'], ['USA', 'marine', 2, 26.35, 127.8, 'III Marine Expeditionary Force'],
  ['USA', 'air', 1, 49.44, 7.6, '86th Airlift Wing (Ramstein)'], ['USA', 'air', 1, 26.35, 127.77, '18th Wing (Kadena)'],
  ['USA', 'air', 1, 25.12, 51.32, '379th Expeditionary Wing (Al Udeid)'], ['USA', 'air', 1, 46.03, 12.6, '31st Fighter Wing (Aviano)'],
  ['RUS', 'mech', 2, 53.4, 27.0, 'Union State garrison (Belarus)'], ['RUS', 'inf', 1, 47.0, 29.6, 'Operational Group (Transnistria)'],
  ['FRA', 'inf', 1, 11.55, 43.15, 'Djibouti garrison'], ['GBR', 'inf', 1, 58.8, 25.2, 'Forward Land Forces (Estonia)'],
  ['DEU', 'armor', 1, 54.9, 23.9, '45th Panzer Brigade (Lithuania)'], ['TUR', 'inf', 1, 36.6, 37.0, 'Euphrates Shield (northern Syria)'],
  ['TUR', 'inf', 1, 35.2, 33.5, 'Cyprus Turkish Peace Force'], ['IRN', 'inf', 1, 33.3, 44.2, 'Quds Force advisers (Iraq)'],
];

export class Units {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    this.stacks = [];
    this.byId = new Map();
    this.nextId = 1;
    this.battles = [];
    this.r = rng(31337);
    this.controlDirty = false;
    this.impacts = []; // artillery and air strikes: { lat, lon, time, urban }
    this.wrecks = []; // destroyed vehicles left where they fell: { lat, lon, kind, yaw, time }
    game.recount();
    this._generate();
    game.on('hour', () => this.hourTick());
    game.on('day', () => this.dailyAI());
    game.on('raise', (n, fx) => this.raise(n, fx));
  }

  add(spec) {
    // Every stack gets the same fields in the same order (later-assigned ones start undefined), so the
    // hot loops see one object shape instead of a dozen and their property loads stay monomorphic.
    const s = {
      id: this.nextId++, owner: spec.owner, type: spec.type, divs: spec.divs, lat: spec.lat, lon: spec.lon, name: spec.name,
      str: spec.str ?? 1, org: spec.org ?? 1, path: [], state: 'idle', exp: spec.exp ?? 0.3, kit: null,
      planes: spec.planes, ships: spec.ships,
      prev: undefined, battle: undefined, contested: undefined, attack: undefined, wreckAcc: undefined, _face: undefined, _faceAt: undefined,
    };
    for (const k in spec) if (!(k in s)) s[k] = spec[k];
    s.kit = kitOf(s, doctrine(this.game.nations[s.owner].iso3));
    this.stacks.push(s);
    this.byId.set(s.id, s);
    return s;
  }
  remove(s) { this.stacks = this.stacks.filter((x) => x !== s); this.byId.delete(s.id); }
  of(i) { return this.stacks.filter((s) => s.owner === i); }
  _countOf(i) { let k = 0; for (const s of this.stacks) if (s.owner === i) k++; return k; }

  // ---------------------------------------------------------------- order of battle
  _generate() {
    const g = this.game;
    const byIso = this.world.byIso;
    const front = this.world.frontline?.contact?.flat() ?? [];
    for (const n of g.live()) {
      const a = n.army || estimateArmy(n);
      n.army = a;
      const r = rng(hashString(n.iso3));
      const totalDivs = clamp(Math.round(a.active / 14), a.active > 3 ? 1 : 0, 80);
      const nStacks = clamp(Math.ceil(totalDivs / 4), totalDivs ? 1 : 0, 18);
      const armorShare = clamp(a.mbt / (a.active * 3 + 1), 0.04, 0.45);
      let left = totalDivs;
      for (let i = 0; i < nStacks; i++) {
        const divs = i === nStacks - 1 ? left : Math.max(1, Math.round(totalDivs / nStacks + (r() - 0.5) * 2));
        left -= divs;
        if (divs <= 0) break;
        const roll = r();
        let type = roll < armorShare ? 'armor' : roll < armorShare * 2.1 ? 'mech' : 'inf';
        if (i === 1 && a.active > 150) type = 'airborne';
        if (i === 2 && n.iso3 === 'USA') type = 'marine';
        let pos = null;
        if ((n.iso3 === 'RUS' || n.iso3 === 'UKR') && front.length && i < nStacks * 0.7) pos = this._frontPos(n, front, r);
        if (!pos && n.iso3 === 'ISR' && i < 3) pos = [{ lat: 31.42, lon: 34.58 }, { lat: 33.05, lon: 35.45 }, { lat: 31.75, lon: 35.3 }][i];
        if (!pos && n.iso3 === 'PSE') pos = { lat: 31.42 - i * 0.07, lon: 34.38 - i * 0.04 };
        pos ??= this._homePos(n, r, i);
        this.add({ owner: n.index, type, divs, lat: pos.lat, lon: pos.lon, name: divs >= 3 ? `${ROMAN(i + 1)} ${TYPES[type].label} Corps` : `${ORD(i + 1)} ${TYPES[type].label} Division`, exp: 0.25 + r() * 0.35 + (n.iso3 === 'UKR' || n.iso3 === 'RUS' || n.iso3 === 'ISR' ? 0.3 : 0) });
      }
      const wings = clamp(Math.round(a.air / 110), 0, 7);
      for (let i = 0; i < wings; i++) {
        const p = this._homePos(n, r, i + 3);
        this.add({ owner: n.index, type: 'air', divs: 1, lat: p.lat, lon: p.lon, name: `${ORD(i + 1)} Air Wing`, planes: Math.round(a.air / Math.max(1, wings)) });
      }
      const bases = NAVAL_BASES.filter((b) => b.iso3 === n.iso3);
      const seaHome = bases.length ? bases : this._nearestSea(n);
      if (seaHome.length) {
        const fleets = clamp(Math.round(a.ships / 12), a.ships > 2 ? 1 : 0, 5);
        for (let i = 0; i < fleets; i++) {
          const b = seaHome[i % seaHome.length];
          this.add({ owner: n.index, type: 'fleet', divs: 1, lat: b.lat + (r() - 0.5) * 0.3, lon: b.lon + (r() - 0.5) * 0.3, name: `${b.name.replace(/ \(.+\)/, '')} Squadron`, ships: Math.round(a.ships / Math.max(1, fleets)) });
        }
        const subs = clamp(Math.round(a.subs / 14), a.subs > 3 ? 1 : 0, 3);
        for (let i = 0; i < subs; i++) {
          const b = seaHome[(i + 1) % seaHome.length];
          this.add({ owner: n.index, type: 'sub', divs: 1, lat: b.lat - 0.4 + r() * 0.2, lon: b.lon + 0.4, name: `${ORD(i + 1)} Submarine Flotilla`, ships: Math.round(a.subs / Math.max(1, subs)) });
        }
        const carriers = CARRIER_POSITIONS[n.iso3] ?? [];
        for (const [name, lat, lon] of carriers) this.add({ owner: n.index, type: 'carrier', divs: 1, lat, lon, name, ships: 8 });
      }
    }
    for (const [iso, type, divs, lat, lon, name] of DEPLOYMENTS) {
      const n = byIso.get(iso);
      if (n) this.add({ owner: n.index, type, divs, lat, lon, name, exp: 0.5 });
    }
  }

  _frontPos(n, front, r) {
    const { control } = this.world;
    for (let k = 0; k < 20; k++) {
      const p = front[Math.floor(r() * front.length)];
      const at = { lat: p[1], lon: p[0] };
      const d = destination(at, r() * 360, 12 + r() * 30);
      if (control[pixelOf(d.lat, d.lon)] === n.index) return d;
    }
    return null;
  }

  _homePos(n, r, i) {
    const { control } = this.world;
    const cities = CITIES.filter((c) => c.iso3 === n.iso3);
    for (let k = 0; k < 30; k++) {
      let p;
      if (cities.length && (i % 2 === 0 || n.samples.length < 50)) {
        const c = cities[Math.floor(r() * cities.length)];
        p = destination(c, r() * 360, 20 + r() * 120);
      } else if (n.samples.length) {
        p = pixelToLL(n.samples[Math.floor(r() * n.samples.length)]);
      } else break;
      if (control[pixelOf(p.lat, p.lon)] === n.index) return p;
    }
    return { ...n.capital };
  }

  _nearestSea(n) {
    const { owner } = this.world;
    const c = n.capital;
    for (let rad = 20; rad <= 700; rad += 30) {
      for (let b = 0; b < 360; b += 20) {
        const p = destination(c, b, rad);
        if (owner[pixelOf(p.lat, p.lon)] === 0) {
          const q = destination(c, b, rad + 25);
          return [{ name: n.name, lat: q.lat, lon: q.lon }];
        }
      }
    }
    return [];
  }

  raise(n, fx) {
    const r = this.r;
    for (let i = 0; i < (fx.divisions ?? 0); i++) {
      const p = this._homePos(n, r, 0);
      this.add({ owner: n.index, type: r() < 0.4 ? 'mech' : 'inf', divs: 1, lat: p.lat, lon: p.lon, name: `${ORD(this._countOf(n.index) + 1)} Division (new)`, str: 0.6, org: 0.5, exp: 0.15 });
    }
    for (let i = 0; i < (fx.airWings ?? 0); i++) {
      const p = this._homePos(n, r, 1);
      this.add({ owner: n.index, type: 'air', divs: 1, lat: p.lat, lon: p.lon, name: 'New Air Wing', planes: 40 });
    }
    for (let i = 0; i < (fx.fleets ?? 0); i++) {
      const b = NAVAL_BASES.find((x) => x.iso3 === n.iso3) ?? this._nearestSea(n)[0];
      if (b) this.add({ owner: n.index, type: 'fleet', divs: 1, lat: b.lat, lon: b.lon, name: 'New Squadron', ships: 8 });
    }
    this.game.emit('units');
  }

  // ---------------------------------------------------------------- orders
  // Returns null if the order is valid, or a reason it isn't.
  validate(s, dest) {
    const g = this.game, { owner, control } = this.world, n = g.nations[s.owner];
    const dom = TYPES[s.type].domain;
    const km = haversine(s, dest);
    if (dom === 'air') {
      const c = control[pixelOf(dest.lat, dest.lon)];
      if (!c || !(g.allied(c, s.owner))) return 'Air wings can only rebase to your own or allied territory.';
      if (km > 4500) return 'That base is beyond ferry range (4,500 km).';
      return null;
    }
    const steps = Math.max(2, Math.ceil(km / 12));
    let wet = 0;
    for (let i = 1; i <= steps; i++) {
      const p = interpolate(s, dest, i / steps);
      const px = pixelOf(p.lat, p.lon);
      const o = owner[px], c = control[px];
      if (dom === 'sea') {
        const nearEnd = i * 12 < 30 || (steps - i) * 12 < 30;
        if (o && !nearEnd) return 'Ships cannot sail overland.';
        continue;
      }
      if (!o) { wet += km / steps; if (wet > 45) return 'Land units cannot cross open water.'; continue; }
      wet = 0;
      if (c !== s.owner && !g.allied(c, s.owner) && !g.atWar(c, s.owner)) return `No military access through ${g.nations[c].name}.`;
    }
    void n;
    return null;
  }

  order(s, dest, { force = false } = {}) {
    const why = force ? null : this.validate(s, dest);
    if (why) return why;
    s.path = [dest];
    s.state = 'moving';
    s.attack = null;
    if (s.battle) this._endBattle(s.battle);
    return null;
  }

  // ---------------------------------------------------------------- hourly simulation
  hourTick() {
    const g = this.game, control = this.world.control;
    for (const s of this.stacks) {
      if (s.state === 'moving' || s.state === 'retreat') this._move(s);
      const land = TYPES[s.type].domain === 'land';
      if (!s.battle) {
        s.org = Math.min(1, s.org + 0.012);
        if (s.str < 1 && land) {
          const n = g.nations[s.owner];
          if (n.manpower > 1 && g.allied(control[pixelOf(s.lat, s.lon)], s.owner)) { const add = Math.min(0.0025, 1 - s.str); s.str += add; n.manpower -= add * s.divs * 14; }
        }
      }
      // A deployed division holds ground a few kilometres around it; an advancing one clears a wider swath.
      if (land && g.enemiesOf(s.owner).size) this._occupy(s, s.state === 'moving' ? 9 : 5);
    }
    this._engage();
    if (this.battles.length) {
      // Air wings never fight, so their positions are fixed for the rest of the hour.
      this._air = this.stacks.filter((s) => s.type === 'air');
      for (const b of this.battles) this._fight(b);
      this._air = null;
      // Keep only the newest impacts and wrecks; trimming once an hour leaves the same tail as trimming after every push.
      if (this.impacts.length > 6000) this.impacts.splice(0, this.impacts.length - 6000);
      if (this.wrecks.length > 4000) this.wrecks.splice(0, this.wrecks.length - 4000);
    }
    if (this.controlDirty) { this.controlDirty = false; g.emit('control'); }
  }

  _move(s) {
    const dest = s.path[0];
    if (!dest) { s.state = 'idle'; return; }
    const t = TYPES[s.type];
    s.prev = { lat: s.lat, lon: s.lon };
    let speed = t.speed;
    if (t.domain === 'land') {
      // Road-march pace on friendly ground; Dupuy's opposed-advance rates once the ground is enemy-held.
      const { control } = this.world, g = this.game;
      const ahead = interpolate(s, dest, Math.min(1, 6 / Math.max(6, haversine(s, dest))));
      const contested = s.state !== 'retreat' && (g.atWar(control[pixelOf(s.lat, s.lon)], s.owner) || g.atWar(control[pixelOf(ahead.lat, ahead.lon)], s.owner));
      speed = landSpeed(s.type, { contested, urban: !!cityAt(s), org: s.org }) * (s.state === 'retreat' ? 0.5 : 1);
      s.contested = contested;
    }
    const remain = haversine(s, dest);
    if (remain <= speed) {
      s.lat = dest.lat; s.lon = dest.lon; s.path.shift();
      if (!s.path.length) s.state = 'idle';
      return;
    }
    const p = interpolate(s, dest, speed / remain);
    s.lat = p.lat; s.lon = p.lon;
  }

  _occupy(s, radiusKm) {
    const g = this.game, { owner, control } = this.world;
    const mover = s.owner;
    const cx = ((s.lon + 180) / 360) * MAP_W, cy = ((90 - s.lat) / 180) * MAP_H;
    const kmPerPxY = 20015 / MAP_H, kmPerPxX = kmPerPxY * Math.max(0.15, Math.cos(s.lat * DEG));
    const rx = Math.ceil(radiusKm / kmPerPxX), ry = Math.ceil(radiusKm / kmPerPxY);
    let changed = 0;
    const held = g.heldCounts, nations = g.nations;
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(MAP_H - 1, Math.ceil(cy + ry)); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const i = y * MAP_W + ((x % MAP_W) + MAP_W) % MAP_W;
        const c = control[i];
        if (!c || c === mover || !g.atWar(c, mover)) continue;
        const o = owner[i];
        const nc = o === mover || (g.allied(o, mover) && !g.atWar(o, mover)) ? o : mover;
        if (o === c) held[o]--;
        if (o === nc) held[o]++;
        control[i] = nc;
        changed++;
        // Only o's count moved; mirror it onto the nation the way a full live() sweep would.
        const n = nations[o];
        if (o && n && !n.inert && n.index === o) n.held = held[o];
      }
    }
    if (changed) {
      this.controlDirty = true;
      this._checkCapitulation();
    }
  }

  _checkCapitulation() {
    const g = this.game;
    // Only a war leader can capitulate. Leaders come first in their own side's insertion order,
    // so this visits them in the same order as a full sweep of both sides.
    for (const w of g.wars) {
      const A = w.leadA, D = w.leadD;
      if (this._capitulates(w, w.a.has(A) ? A : null) || this._capitulates(w, w.a.has(D) ? D : null)) return;
      if (this._capitulates(w, w.d.has(D) ? D : null) || this._capitulates(w, w.d.has(A) ? A : null)) return;
    }
  }

  _capitulates(w, i) {
    if (i == null) return false;
    const g = this.game, n = g.nations[i];
    if (!(n.pixels > 200 && n.held / n.pixels < 0.33)) return false;
    g.log(`${n.name} capitulates. ${w.name} ends.`, { nation: i, kind: 'war', major: true });
    g.makePeace(w, { capitulated: i });
    return true;
  }

  _engage() {
    const g = this.game;
    // Only stacks of nations at war can engage or be engaged, so the rest are left out of the grid.
    // Movers are collected first; with none, there is nothing to search.
    const movers = [];
    for (const s of this.stacks) if (!s.battle && s.state === 'moving' && TYPES[s.type].domain !== 'air' && g.enemiesOf(s.owner).size) movers.push(s);
    if (!movers.length) return;
    const grid = this._grid ??= new Map();
    grid.clear();
    // Integer cell key; floor() is applied to the shifted coordinate exactly as the string key did.
    const key = (lat, lon) => (Math.floor(lat) + 200) * 1000 + Math.floor(lon) + 400;
    for (const s of this.stacks) {
      if (TYPES[s.type].domain === 'air' || !g.enemiesOf(s.owner).size) continue;
      const k = key(s.lat, s.lon);
      (grid.get(k) ?? grid.set(k, []).get(k)).push(s);
    }
    for (const s of movers) {
      if (s.battle || s.state !== 'moving') continue;
      const dom = TYPES[s.type].domain;
      // Contact range: tube artillery reaches 20-30 km, so formations engage well before they touch.
      let target = null, best = dom === 'sea' ? 70 : 18;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cell = grid.get(key(s.lat + dy, s.lon + dx));
        if (cell) for (const o of cell) {
          if (TYPES[o.type].domain !== dom || !g.atWar(s.owner, o.owner)) continue;
          // Great-circle distance is never below the latitude gap, so far rows can't beat `best`.
          if (Math.abs(o.lat - s.lat) * KM_PER_DEG_LO > best) continue;
          const d = haversine(s, o);
          if (d < best) { best = d; target = o; }
        }
      }
      if (target) {
        const b = target.battle ?? { id: s.id * 100000 + target.id, att: new Set(), def: new Set([target]), lat: target.lat, lon: target.lon, start: g.time, dom };
        b.att.add(s);
        s.battle = b; target.battle = b;
        s.state = 'battle';
        if (!this.battles.includes(b)) this.battles.push(b);
      }
    }
    grid.clear();
  }

  _support(owner, at) {
    let wings = 0;
    const g = this.game, lat = at.lat;
    for (const s of this._air ?? this.stacks) {
      if (s.type !== 'air' || Math.abs(s.lat - lat) * KM_PER_DEG_LO > 800) continue;
      if ((s.owner === owner || g.allied(s.owner, owner)) && haversine(s, at) < 800) wings++;
    }
    return 1 + Math.min(0.45, wings * 0.09);
  }

  _fight(b) {
    const g = this.game;
    const att = [...b.att].filter((s) => this.byId.has(s.id));
    const def = [...b.def].filter((s) => this.byId.has(s.id));
    if (!att.length || !def.length) { this._endBattle(b); return; }
    const pow = (list, role) => list.reduce((t, s) => t + s.divs * s.str * (0.3 + 0.7 * s.org) * TYPES[s.type][role] * (0.7 + s.exp), 0);
    const pa = pow(att, 'atk') * this._support(att[0].owner, b);
    const urban = b.dom === 'land' ? cityAt(b) : null;
    const pd = pow(def, 'def') * 1.25 * this._support(def[0].owner, b) * (urban ? URBAN_DEFENCE : 1);
    const ratio = pa / Math.max(0.05, pd);
    const hitD = 0.0042 * Math.min(4, ratio) * (0.6 + this.r() * 0.8);
    const hitA = 0.0036 * Math.min(4, 1 / ratio) * (0.6 + this.r() * 0.8);
    const apply = (list, hit) => {
      for (const s of list) {
        const dmg = hit / Math.sqrt(s.divs);
        s.str = Math.max(0.05, s.str - dmg);
        s.org = Math.max(0, s.org - dmg * 6);
        s.exp = Math.min(1, s.exp + 0.0004);
        const n = g.nations[s.owner];
        n.casualties += dmg * (s.kit?.men ?? s.divs * TYPES[s.type].men) * 0.18;
        this._wrecks(s, dmg);
      }
    };
    apply(def, hitD);
    apply(att, hitA);
    if (b.dom === 'land') {
      // Each side's guns land on the other's positions, inside a few kilometres.
      const shots = (n, around) => {
        for (let i = 0; i < n; i++) {
          const p = destination(around, this.r() * 360, 0.2 + this.r() * 2.6);
          this.impacts.push({ lat: p.lat, lon: p.lon, time: g.time, urban: !!cityAt(p) });
        }
      };
      shots(Math.min(9, Math.round(2 + 3 * Math.min(3, ratio))), def[0]);
      shots(Math.min(9, Math.round(2 + 3 * Math.min(3, 1 / ratio))), att[0]);
      if (this.impacts.length > 6000 && !this._air) this.impacts.splice(0, this.impacts.length - 6000); // hourTick trims once
    }
    const today = g.history[g.history.length - 1];
    if (today && g.time - b.start < 3600000) today.battles++;
    if (def.every((s) => s.org < 0.12)) {
      for (const s of def) this._retreat(s, att[0]);
      this._endBattle(b);
      for (const s of att) { s.state = 'moving'; if (!s.path.length) s.path = [{ lat: b.lat, lon: b.lon }]; }
    } else if (att.every((s) => s.org < 0.12)) {
      for (const s of att) this._retreat(s, def[0]);
      this._endBattle(b);
    }
  }

  // Turns strength lost into burnt-out vehicles on the ground, ahead of the formation.
  _wrecks(s, dmg) {
    const k = s.kit;
    if (!k) return;
    s.wreckAcc = (s.wreckAcc ?? 0) + dmg * (k.mbt + k.ifv + k.apc + k.spg) * 0.6;
    if (!(s.wreckAcc >= 1)) return;
    const face = s.path.length ? bearing(s, s.path[0]) : s.battle ? bearing(s, s.battle) : 0;
    while (s.wreckAcc >= 1) {
      s.wreckAcc -= 1;
      const pool = [['mbt', k.mbt], ['ifv', k.ifv], ['apc', k.apc], ['spg', k.spg]].filter(([, v]) => v > 0);
      let roll = this.r() * pool.reduce((a, [, v]) => a + v, 0), kind = pool[0]?.[0] ?? 'apc';
      for (const [kk, v] of pool) { if ((roll -= v) <= 0) { kind = kk; break; } }
      const p = destination(s, face + (this.r() - 0.5) * 120, 0.3 + this.r() * 2.2);
      this.wrecks.push({ lat: p.lat, lon: p.lon, kind, owner: s.owner, yaw: this.r() * 360, time: this.game.time });
    }
    if (this.wrecks.length > 4000 && !this._air) this.wrecks.splice(0, this.wrecks.length - 4000); // hourTick trims once
  }

  _retreat(s, from) {
    const g = this.game;
    const home = g.nations[s.owner].capital;
    let brg = bearing(from, s);
    const toHome = bearing(s, home);
    if (Math.abs(((toHome - brg + 540) % 360) - 180) < 100) brg = (brg + toHome) / 2;
    const dest = destination(s, brg, TYPES[s.type].domain === 'sea' ? 120 : 15);
    s.path = [dest];
    s.state = 'retreat';
    s.battle = null;
  }

  _endBattle(b) {
    for (const s of [...b.att, ...b.def]) if (s.battle === b) { s.battle = null; if (s.state === 'battle') s.state = s.path.length ? 'moving' : 'idle'; }
    this.battles = this.battles.filter((x) => x !== b);
  }

  // ---------------------------------------------------------------- AI
  dailyAI() {
    const g = this.game;
    for (const s of this.stacks) {
      if (s.owner === g.player || s.battle || s.state !== 'idle') continue;
      if (TYPES[s.type].domain !== 'land') continue;
      const enemies = g.enemiesOf(s.owner);
      if (!enemies.size) continue;
      const n = g.nations[s.owner];
      const aggression = 0.06 + (n.warSupport / 100) * 0.12;
      if (this.r() > aggression) continue;
      let target = null, best = 260;
      for (const o of this.stacks) {
        if (!enemies.has(o.owner) || TYPES[o.type].domain !== 'land') continue;
        if (Math.abs(o.lat - s.lat) * KM_PER_DEG_LO > best) continue;
        const d = haversine(s, o);
        if (d < best) { best = d; target = o; }
      }
      if (!target) continue;
      const mine = s.divs * s.str * s.org * TYPES[s.type].atk;
      const theirs = target.divs * target.str * Math.max(0.2, target.org) * TYPES[target.type].def * 1.25;
      if (mine / Math.max(0.1, theirs) > 0.75 && s.org > 0.7 && s.str > 0.5) this.order(s, { lat: target.lat, lon: target.lon });
    }
  }
}

export function estimateArmy(n) {
  const active = clamp(Math.round(n.pop * 1.8 + n.gdp * 0.08), 1, 200);
  return { active, mbt: Math.round(active * 1.2), air: Math.round(n.gdp * 0.08), carriers: 0, subs: 0, ships: Math.round(n.gdp / 60), nukes: 0 };
}
