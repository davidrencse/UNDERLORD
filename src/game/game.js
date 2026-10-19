import { SPIRITS, PARTIES, POWER_CENTRES, genericPowerCentres, FOCUS_TREES } from '../data/politics.js';
import { PACTS, RIVALRIES, WARS, FACTIONS } from '../data/nations.js';
import { haversine, rng } from '../util/geo.js';
import { CRISES } from './crises.js';

export const START = Date.UTC(2025, 0, 20, 12);
export const SPEEDS = [0, 2, 6, 16, 40, 120]; // game hours per real second

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DAY = 86400000;
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// A Set of pairKey strings that also mirrors its contents into a 256×256 byte matrix, so hot paths
// can test a pair without building a string. Nation indices fit a byte (the control raster is Uint8).
class PairSet extends Set {
  constructor() { super(); this.m = new Uint8Array(65536); }
  _mark(k, v) {
    const bar = typeof k === 'string' ? k.indexOf('|') : -1;
    if (bar < 0) return;
    const k2 = pairIdx(Number(k.slice(0, bar)), Number(k.slice(bar + 1)));
    if (k2 >= 0) { this.m[k2] = v; this.m[((k2 & 255) << 8) | (k2 >> 8)] = v; }
  }
  add(k) { super.add(k); if (this.m) this._mark(k, 1); return this; }
  delete(k) { const had = super.delete(k); if (had) this._mark(k, 0); return had; }
  clear() { super.clear(); this.m.fill(0); }
}
const pairIdx = (a, b) => ((a & 255) === a && (b & 255) === b ? (a << 8) | b : -1);
// Election dates are ISO day strings; parse each distinct one once.
const dateCache = new Map();
const parseDay = (s) => { let t = dateCache.get(s); if (t === undefined) { t = Date.parse(s); dateCache.set(s, t); } return t; };
function addFx(fx, src) { if (src) for (const k in src) fx[k] = (fx[k] ?? 0) + src[k]; }
function addOwn(fx, src) { const ks = Object.keys(src); for (let i = 0; i < ks.length; i++) { const k = ks[i]; fx[k] = (fx[k] ?? 0) + src[k]; } }

const KNOWN_LEADERS = {
  DEU: { CDU: 'Friedrich Merz', AFD: 'Alice Weidel', SPD: 'Olaf Scholz', GRU: 'Robert Habeck' },
  FRA: { RN: 'Jordan Bardella', ENS: 'Gabriel Attal', LFI: 'Jean-Luc Mélenchon', LR: 'Laurent Wauquiez', PS: 'Olivier Faure' },
  GBR: { LAB: 'Keir Starmer', REF: 'Nigel Farage', CON: 'Kemi Badenoch', LD: 'Ed Davey' },
  USA: { GOP: 'Donald Trump', DEM: 'Democratic nominee' },
  TUR: { AKP: 'Recep Tayyip Erdoğan', CHP: 'Özgür Özel' },
  IND: { BJP: 'Narendra Modi', INC: 'Rahul Gandhi' },
};

function parseShare(s) {
  const m = /([\d.]+)\s*%/.exec(s || '');
  return m ? Number(m[1]) : null;
}

function partiesFromWatchTower(n) {
  const list = [];
  for (const p of n.wt.parties) {
    const share = parseShare(p.support);
    if (share == null) continue;
    const t = `${p.name} ${p.note}`;
    let ideo = 'dem';
    if (p.side === 'right' && /national|populis|far-right|radical right|anti-immigra|identitar|sovereign/i.test(t)) ideo = 'nat';
    if (p.side === 'left' && /communis|far-left|radical left|marxis/i.test(t)) ideo = 'com';
    if (/ruling|party of power/i.test(t) && /putin|lukashenko|vučić|orbán/i.test(t + n.leader)) ideo = n.ideology;
    list.push({ id: p.name.replace(/[^A-Za-z]/g, '').slice(0, 8), name: p.name, ideo, share, note: p.note });
  }
  if (!list.length) return null;
  const ruling = list.filter((p) => /govern|leads government|ruling|coalition partner|in government|party of power|majority/i.test(p.note) && !/opposition/i.test(p.note)).map((p) => p.id);
  if (!ruling.length) ruling.push([...list].sort((a, b) => b.share - a.share)[0].id);
  return { ruling, next: null, list };
}

function genericParties(n, r) {
  const auto = n.ideology !== 'dem' && n.ideology !== 'nat';
  if (auto || /junta|monarchy|emirate|one-party/i.test(n.gov)) {
    return { ruling: ['REG'], next: null, list: [
      { id: 'REG', name: /junta/i.test(n.gov) ? 'Military council' : /monarch|emir/i.test(n.gov) ? 'Royal court' : 'Ruling party', ideo: n.ideology, share: 62 + Math.round(r() * 20), note: 'Controls the state' },
      { id: 'OPP', name: 'Tolerated opposition', ideo: 'dem', share: 8 + Math.round(r() * 8), note: 'Allowed to exist within limits' },
      { id: 'UND', name: 'Underground opposition', ideo: n.ideology === 'the' ? 'dem' : 'the', share: 6 + Math.round(r() * 10), note: 'Banned; support is estimated' },
    ] };
  }
  const a = 34 + Math.round(r() * 14);
  return { ruling: ['GOV'], next: null, list: [
    { id: 'GOV', name: 'Governing party', ideo: n.ideology, share: a, note: 'Leads the government' },
    { id: 'OPP', name: 'Main opposition', ideo: n.ideology === 'dem' ? 'nat' : 'dem', share: Math.round((100 - a) * 0.6), note: 'Largest opposition party' },
    { id: 'OTH', name: 'Smaller parties', ideo: 'dem', share: Math.round((100 - a) * 0.4), note: 'Regional and minor parties' },
  ] };
}

export class Game {
  constructor(world) {
    this.world = world;
    this.nations = world.nations;
    this.time = START;
    this.speed = 2;
    this.paused = true;
    this.player = null;
    this.wars = [];
    this.warPairs = new PairSet();
    this._coal = new Uint8Array(65536); // 1 where both nations fight on the same side of some war
    this._enemyCache = new Map();
    this._warsOfCache = new Map();
    this.relations = new Map();
    this.news = [];
    this.history = [];
    this.globalMods = [];
    this.pendingEvents = [];
    this.listeners = new Map();
    this.r = rng(2025);
    this.hourAcc = 0;
    this.day = 0;
    this._initNations();
    this._initRelations();
    for (const w of WARS) {
      const a = world.byKey.get(w.attacker), d = world.byKey.get(w.defender);
      if (a && d) this.startWar(a.index, d.index, { name: w.name, silent: true, since: Date.parse(w.since) });
    }
    this._seedHistory();
  }

  on(ev, fn) { (this.listeners.get(ev) ?? this.listeners.set(ev, []).get(ev)).push(fn); }
  emit(ev, ...a) { for (const fn of this.listeners.get(ev) ?? []) fn(...a); }

  get date() { return new Date(this.time); }
  // Cached: n.inert is fixed when the world loads. Callers must treat the array as read-only.
  live() { return this._live ??= this.nations.slice(1).filter((n) => !n.inert); }

  _initNations() {
    for (const n of this.nations.slice(1)) {
      const r = rng(n.index * 7919);
      const w = n.wt || {};
      n.pp = 40 + Math.round(r() * 60);
      n.inflation = w.inflation ?? clamp(3 + (n.ideology === 'dem' ? 0 : 3) + r() * 3, 1, 20);
      n.unemployment = w.unemployment ?? clamp(5 + r() * 6, 2, 30);
      n.interest = w.interestRate ?? clamp(n.inflation + 1, 0.5, 40);
      n.spirits = [...(n.spirits || [])];
      n.timed = [];
      n.mods = { stab: 0, ws: 0, growth: 0, pp: 0, infl: 0 };
      n.manpower = Math.round(n.pop * 1000 * 0.012 * (0.5 + n.warSupport / 100));
      n.casualties = 0;
      n.exhaustion = 0;
      n.cooldowns = {};
      n.sanctionedBy = new Set();
      n.guarantees = new Set();
      n.justifying = null;
      n.wargoals = new Set();
      n.gdpHistory = [];

      const curated = PARTIES[n.iso3];
      const politics = curated ? structuredClone(curated) : (n.wt?.parties && partiesFromWatchTower(n)) || genericParties(n, r);
      if (!politics.next && /republic|monarchy|democra/i.test(n.gov) && n.ideology !== 'com' && !/junta|absolute|emirate|islamic|one-party/i.test(n.gov)) {
        politics.next = new Date(START + Math.round((200 + r() * 1200)) * DAY).toISOString().slice(0, 10);
      }
      n.politics = politics;

      const pc = POWER_CENTRES[n.iso3];
      n.powerCentres = pc ? pc.map(([type, name, influence, loyalty]) => ({ type, name, influence, loyalty })) : genericPowerCentres(n);

      const tree = FOCUS_TREES[n.iso3] ? n.iso3 : 'generic';
      n.focus = { tree, done: new Set(), current: null };

      // Capture the starting equilibrium so the world holds still until something changes it.
      const fx = this.effects(n);
      n.base = {
        stab: n.stability - fx.stab - this._econStab(n) - this._loyaltyStab(n),
        ws: n.warSupport - fx.ws,
        growth: n.growth - fx.growth,
        infl: n.inflation - fx.infl,
        unemp: n.unemployment,
        growth0: n.growth,
        defPct: n.defPct,
      };
    }
  }

  _initRelations() {
    const N = this.nations;
    for (const [a, b, v] of RIVALRIES) {
      const A = this.world.byKey.get(a), B = this.world.byKey.get(b);
      if (A && B) this.relations.set(pairKey(A.index, B.index), v);
    }
    this.pacts = new PairSet();
    for (const [a, b] of PACTS) {
      const A = this.world.byKey.get(a), B = this.world.byKey.get(b);
      if (A && B) { this.pacts.add(pairKey(A.index, B.index)); A.guarantees.add(B.index); }
    }
    void N;
  }

  _seedHistory() {
    const r = rng(99);
    let t = 52;
    for (let i = 120; i > 0; i--) {
      t = clamp(t + (r() - 0.48) * 3, 38, 70);
      this.history.push({ time: START - i * DAY, tension: t, battles: 0, events: [] });
    }
  }

  // ---------------------------------------------------------------- relationships
  opinion(a, b) {
    if (a === b) return 100;
    const k = pairKey(a, b);
    let v = this.relations.get(k) ?? 0;
    const A = this.nations[a], B = this.nations[b];
    if (A.faction && A.faction === B.faction) v += 50;
    if (this.pacts.has(k)) v += 40;
    if (A.ideology === B.ideology) v += 10;
    for (const bl of A.blocs) if (B.blocs.includes(bl)) v += 6;
    if (this.atWar(a, b)) v = -100;
    return clamp(Math.round(v), -100, 100);
  }
  addOpinion(a, b, d) { const k = pairKey(a, b); this.relations.set(k, clamp((this.relations.get(k) ?? 0) + d, -150, 150)); }
  atWar(a, b) {
    if (a === b) return false;
    const k = pairIdx(a, b);
    return k >= 0 ? this.warPairs.m[k] === 1 : this.warPairs.has(pairKey(a, b));
  }
  allied(a, b) {
    if (a === b) return true;
    const A = this.nations[a], B = this.nations[b];
    if (!A || !B) return false;
    if (A.faction && A.faction === B.faction) return true;
    const k = pairIdx(a, b);
    if (k >= 0) return this.pacts.m[k] === 1 || this._coal[k] === 1;
    if (this.pacts.has(pairKey(a, b))) return true;
    for (const w of this.wars) if ((w.a.has(a) && w.a.has(b)) || (w.d.has(a) && w.d.has(b))) return true;
    return false;
  }
  // Both are cached until the war list changes; callers must treat the results as read-only.
  enemiesOf(i) {
    let out = this._enemyCache.get(i);
    if (!out) {
      out = new Set();
      for (const w of this.wars) { if (w.a.has(i)) w.d.forEach((x) => out.add(x)); if (w.d.has(i)) w.a.forEach((x) => out.add(x)); }
      this._enemyCache.set(i, out);
    }
    return out;
  }
  warsOf(i) {
    let out = this._warsOfCache.get(i);
    if (!out) { out = this.wars.filter((w) => w.a.has(i) || w.d.has(i)); this._warsOfCache.set(i, out); }
    return out;
  }

  // ---------------------------------------------------------------- effects
  effects(n) {
    const m = n.mods;
    const fx = { stab: m?.stab ?? 0, ws: m?.ws ?? 0, growth: m?.growth ?? 0, pp: m?.pp ?? 0, infl: m?.infl ?? 0 };
    const sp = n.spirits;
    for (let i = 0; i < sp.length; i++) addFx(fx, SPIRITS[sp[i]]?.fx);
    const timed = n.timed;
    if (timed) for (let i = 0; i < timed.length; i++) { const t = timed[i]; if (t.mod) addOwn(fx, t.mod); else addFx(fx, SPIRITS[t.id]?.fx); }
    const gm = this.globalMods;
    if (gm) for (let i = 0; i < gm.length; i++) addFx(fx, gm[i].mod);
    return fx;
  }
  _econStab(n) { return clamp((n.growth - 2) * 1.2, -8, 5) - Math.max(0, n.inflation - 5) * 0.25 - Math.max(0, n.unemployment - 7) * 0.5; }
  _loyaltyStab(n) {
    let w = 0, s = 0;
    for (const p of n.powerCentres) { w += p.influence; s += p.influence * p.loyalty; }
    return w ? (s / w - 50) * 0.18 : 0;
  }
  ppGain(n, fx = this.effects(n)) {
    const ruling = n.politics.ruling.length;
    return 1.6 + fx.pp + (ruling > 2 ? -0.3 : 0) + (n.stability - 50) * 0.008;
  }

  addTimed(n, id, days, mod) {
    const until = this.time + days * DAY;
    const ex = n.timed.find((t) => t.id === id);
    if (ex) ex.until = Math.max(ex.until, until);
    else n.timed.push({ id, until, mod });
  }
  hasSpirit(n, id) {
    if (n.spirits.includes(id)) return true;
    const timed = n.timed;
    for (let i = 0; i < timed.length; i++) if (timed[i].id === id) return true;
    return false;
  }

  log(text, { nation = null, kind = 'info', major = false } = {}) {
    const item = { time: this.time, text, nation, kind, major };
    this.news.unshift(item);
    if (this.news.length > 200) this.news.pop();
    const today = this.history[this.history.length - 1];
    if (major && today) today.events.push(text);
    this.emit('news', item);
  }

  // ---------------------------------------------------------------- war and peace
  startWar(a, d, { name, silent = false, since } = {}) {
    if (this.atWar(a, d)) return null;
    const A = this.nations[a], D = this.nations[d];
    const war = { id: this.wars.length + 1, name: name || `${A.name}–${D.name} war`, a: new Set([a]), d: new Set([d]), since: since ?? this.time, leadA: a, leadD: d };
    this.wars.push(war);
    // Defensive obligations: faction members and pact partners join the defender.
    const callers = this.nations.slice(1).filter((n) => !n.inert && n.index !== a && n.index !== d && !war.a.has(n.index));
    for (const n of callers) {
      const bound = (D.faction && n.faction === D.faction) || this.pacts.has(pairKey(n.index, d));
      if (bound && !(A.faction && n.faction === A.faction)) war.d.add(n.index);
    }
    this._rebuildWarPairs();
    if (!silent) {
      this.log(`${A.name} declares war on ${D.name}.`, { nation: a, kind: 'war', major: true });
      const joined = [...war.d].filter((x) => x !== d);
      if (joined.length) this.log(`${joined.length} nation${joined.length > 1 ? 's' : ''} join the war in defence of ${D.name}.`, { nation: d, kind: 'war' });
      for (const i of war.d) this.addTimed(this.nations[i], 'wartime_rally', 120);
      this.addOpinion(a, d, -120);
    }
    this.emit('wars');
    return war;
  }

  _rebuildWarPairs() {
    this.warPairs.clear();
    for (const w of this.wars) for (const x of w.a) for (const y of w.d) this.warPairs.add(pairKey(x, y));
    const coal = this._coal;
    coal.fill(0);
    for (const w of this.wars) for (const side of [w.a, w.d]) for (const x of side) for (const y of side) { const k = pairIdx(x, y); if (k >= 0) coal[k] = 1; }
    this._enemyCache.clear();
    this._warsOfCache.clear();
  }

  makePeace(war, { capitulated = null } = {}) {
    this.wars = this.wars.filter((w) => w !== war);
    this._rebuildWarPairs();
    const { owner, control } = this.world;
    let annexed = false;
    for (let i = 0; i < control.length; i++) {
      const c = control[i], o = owner[i];
      if (c === o || !c) continue;
      const cInA = war.a.has(c), cInD = war.d.has(c), oInA = war.a.has(o), oInD = war.d.has(o);
      if (!((cInA && oInD) || (cInD && oInA))) continue;
      if (capitulated != null && o === capitulated) { owner[i] = c; annexed = true; }
      else control[i] = o;
    }
    this.recount();
    this.emit('control', annexed);
    this.emit('wars');
  }

  recount() {
    const { owner, control } = this.world;
    const held = new Uint32Array(256);
    for (let i = 0; i < owner.length; i++) if (owner[i] && owner[i] === control[i]) held[owner[i]]++;
    for (const n of this.nations.slice(1)) n.held = held[n.index];
    this.heldCounts = held;
  }

  // ---------------------------------------------------------------- simulation
  advance(realDt) {
    if (this.paused) return;
    this.hourAcc += realDt * SPEEDS[this.speed];
    let steps = 0;
    while (this.hourAcc >= 1 && steps < 200) {
      this.hourAcc -= 1;
      steps++;
      this.time += 3600000;
      this.emit('hour');
      if (new Date(this.time).getUTCHours() === 0) this.dailyTick();
    }
  }

  dailyTick() {
    this.day++;
    const today = { time: this.time, tension: 0, battles: 0, events: [] };
    this.history.push(today);
    if (this.history.length > 400) this.history.shift();
    this.globalMods = this.globalMods.filter((g) => g.until > this.time);
    this._monthStart = new Date(this.time).getUTCDate() === 1;
    for (const n of this.live()) this._dailyNation(n);
    this._monthStart = undefined;
    CRISES.daily(this);
    this._tension(today);
    this.emit('day');
  }

  _dailyNation(n) {
    // Only build a new list when something has actually expired.
    if (!n.timed.every((t) => t.until > this.time)) n.timed = n.timed.filter((t) => t.until > this.time);
    const fx = this.effects(n);
    n.pp = clamp(n.pp + this.ppGain(n, fx), 0, 2000);

    const atWar = this.warsOf(n.index).length > 0;
    const growthTarget = n.base.growth + fx.growth + (n.stability - 50) * 0.02 + (atWar && !n.spirits.includes('war_economy') ? -0.8 : 0) - (n.sanctionedBy.size ? 0.6 : 0);
    n.growth += (growthTarget - n.growth) * 0.03;
    n.gdp *= 1 + n.growth / 100 / 365;
    n.inflation += (Math.max(-2, n.base.infl + fx.infl + (atWar ? 1.5 : 0)) - n.inflation) * 0.02;
    n.unemployment += (clamp(n.base.unemp - (n.growth - n.base.growth0) * 0.6, 1, 45) - n.unemployment) * 0.01;
    n.interest += (clamp(n.inflation + 1 + Math.max(0, n.debt - 100) * 0.02, 0, 60) - n.interest) * 0.01;
    const deficit = (n.defPct - n.base.defPct) + (this.hasSpirit(n, 'stimulus') ? 2 : 0) - (this.hasSpirit(n, 'austerity') ? 2.5 : 0) + (atWar ? 1.5 : 0);
    n.debt = clamp(n.debt + deficit / 365 - n.debt * (n.growth / 100) / 365 * 0.5, 0, 400);

    const exhaustion = clamp(n.casualties / Math.max(1, n.pop * 1000) * 2500, 0, 30);
    n.exhaustion = exhaustion;
    const stabTarget = clamp(n.base.stab + fx.stab + this._econStab(n) + this._loyaltyStab(n) - exhaustion * 0.4, 0, 100);
    n.stability += (stabTarget - n.stability) * 0.025;
    const enemies = this.enemiesOf(n.index);
    const defensive = enemies.size &&this.wars.some((w) => w.d.has(n.index));
    const wsTarget = clamp(n.base.ws + fx.ws + (defensive ? 12 : 0) - exhaustion, 0, 100);
    n.warSupport += (wsTarget - n.warSupport) * 0.025;

    n.manpower = Math.min(n.manpower + n.pop * 0.012 * (0.4 + n.warSupport / 100), n.pop * 1000 * 0.03);

    // Power centres drift toward a loyalty the state's condition can sustain.
    for (const p of n.powerCentres) {
      const eq = 50 + (n.stability - 50) * 0.35 + (p.type === 'military' && atWar ? 6 : 0);
      p.loyalty = clamp(p.loyalty + (eq - p.loyalty) * 0.004, 0, 100);
    }

    this._partyDrift(n);
    this._focusTick(n);
    if (n.justifying && this.time >= n.justifying.until) {
      n.wargoals.add(n.justifying.target);
      if (n.index === this.player) this.log(`War goal against ${this.nations[n.justifying.target].name} is ready.`, { nation: n.index, kind: 'diplo' });
      n.justifying = null;
    }
    if (this._monthStart ?? new Date(this.time).getUTCDate() === 1) {
      n.gdpHistory.push(n.gdp);
      if (n.gdpHistory.length > 60) n.gdpHistory.shift();
    }
  }

  _partyDrift(n) {
    const pol = n.politics;
    if (!pol.list.length || pol.list.length < 2) return;
    const unhappy = clamp((50 - n.stability) / 50, -0.5, 1);
    for (const p of pol.list) {
      const ruling = pol.ruling.includes(p.id);
      let d = (this.r() - 0.5) * 0.06;
      if (ruling) d -= unhappy * 0.02;
      else if (p.ideo === 'nat' && this.hasSpirit(n, 'refugee_pressure')) d += 0.02;
      else d += unhappy * 0.008;
      p.share = clamp(p.share + d, 0.3, 95);
    }
    if (pol.next && this.time >= parseDay(pol.next))this.holdElection(n);
  }

  holdElection(n) {
    const pol = n.politics;
    const total = pol.list.reduce((s, p) => s + p.share, 0);
    for (const p of pol.list) p.share = clamp(p.share + (this.r() - 0.5) * 4, 0.3, 95);
    const ranked = [...pol.list].sort((a, b) => b.share - a.share);
    const winner = ranked[0];
    const share = (winner.share / total) * 100;
    const before = pol.ruling.join(',');
    let ruling = [winner.id];
    if (share < 45) {
      const partner = ranked.slice(1).find((p) => p.ideo === winner.ideo || (p.ideo === 'dem' && winner.ideo !== 'nat') || (winner.ideo === 'nat' && p.ideo === 'nat'));
      if (partner) ruling.push(partner.id);
    }
    pol.ruling = ruling;
    const years = n.iso3 === 'USA' ? 2 : n.iso3 === 'FRA' ? 5 : 4;
    const d = new Date(this.time); d.setUTCFullYear(d.getUTCFullYear() + years);
    pol.next = d.toISOString().slice(0, 10);
    const changed = before !== ruling.join(',');
    if (changed && !(n.iso3 === 'USA' && years === 2)) {
      n.leader = KNOWN_LEADERS[n.iso3]?.[winner.id] ?? `${winner.name} leader`;
      n.ideology = winner.ideo;
      n.spirits = n.spirits.filter((s) => s !== 'coalition_collapse' && s !== 'hung_parliament');
      for (const p of n.powerCentres) p.loyalty = clamp(p.loyalty + (this.r() - 0.5) * 20, 0, 100);
    }
    n.stability = clamp(n.stability + (changed ? 3 : 1), 0, 100);
    this.log(`${n.name} votes: ${winner.name} first with ${share.toFixed(1)}%.${changed ? ` New government: ${ruling.map((id) => pol.list.find((p) => p.id === id)?.name).join(' + ')}.` : ' The government holds.'}`, { nation: n.index, kind: 'politics', major: n.gdp > 500 || n.index === this.player });
    this.emit('politics', n);
  }

  // ---------------------------------------------------------------- focus trees
  tree(n) { return FOCUS_TREES[n.focus.tree]; }
  focusState(n, f) {
    if (n.focus.done.has(f.id)) return 'done';
    if (n.focus.current?.id === f.id) return 'active';
    const tree = this.tree(n);
    if (f.mutex?.some((m) => n.focus.done.has(m) || n.focus.current?.id === m)) return 'blocked';
    if (f.req?.length) {
      const ok = f.reqAll ? f.req.every((r) => n.focus.done.has(r)) : f.req.some((r) => n.focus.done.has(r));
      if (!ok) return 'locked';
    }
    void tree;
    return 'available';
  }
  startFocus(n, id) {
    const f = this.tree(n).focuses.find((x) => x.id === id);
    if (!f || this.focusState(n, f) !== 'available' || n.focus.current) return false;
    n.focus.current = { id, progress: 0, days: f.days };
    this.emit('focus', n);
    return true;
  }
  _focusTick(n) {
    const tree = this.tree(n);
    if (!n.focus.current && n.index !== this.player) {
      // Same draws as before: one roll when anything is available, a second to pick. The list is only built on a hit.
      if (tree.focuses.some((f) => this.focusState(n, f) === 'available') && this.r() < 0.05) {
        const avail = tree.focuses.filter((f) => this.focusState(n, f) === 'available');
        n.focus.current = { id: avail[Math.floor(this.r() * avail.length)].id, progress: 0, days: 0 };
      }
    }
    const c = n.focus.current;
    if (!c) return;
    const f = tree.focuses.find((x) => x.id === c.id);
    c.progress += 1;
    if (c.progress >= f.days) {
      n.focus.done.add(f.id);
      n.focus.current = null;
      this.applyFx(n, f.fx);
      if (n.index === this.player || (n.gdp > 1500 && f.days >= 49)) this.log(`${n.name} completes “${f.name}”.`, { nation: n.index, kind: 'focus', major: n.index === this.player });
      this.emit('focus', n);
    }
  }

  // Applies an effect bundle shared by focuses, decisions and event options.
  applyFx(n, fx = {}) {
    if (fx.pp) n.pp = Math.max(0, n.pp + fx.pp);
    if (fx.stab) { n.mods.stab += fx.stab; n.stability = clamp(n.stability + fx.stab * 0.5, 0, 100); }
    if (fx.ws) { n.mods.ws += fx.ws; n.warSupport = clamp(n.warSupport + fx.ws * 0.5, 0, 100); }
    if (fx.stabNow) n.stability = clamp(n.stability + fx.stabNow, 0, 100);
    if (fx.wsNow) n.warSupport = clamp(n.warSupport + fx.wsNow, 0, 100);
    if (fx.growth) n.mods.growth += fx.growth;
    if (fx.infl) n.mods.infl += fx.infl;
    if (fx.debt) n.debt = Math.max(0, n.debt + fx.debt);
    if (fx.defPct) n.defPct += fx.defPct;
    if (fx.spirit && !n.spirits.includes(fx.spirit)) n.spirits.push(fx.spirit);
    if (fx.timed) this.addTimed(n, fx.timed[0], fx.timed[1]);
    if (fx.remove) n.spirits = n.spirits.filter((s) => s !== fx.remove);
    if (fx.loyalty) for (const [t, d] of Object.entries(fx.loyalty)) for (const p of n.powerCentres) if (p.type === t) p.loyalty = clamp(p.loyalty + d, 0, 100);
    if (fx.party) for (const [id, d] of Object.entries(fx.party)) { const p = n.politics.list.find((x) => x.id === id); if (p) p.share = clamp(p.share + d, 0.3, 95); }
    if (fx.opposition) { const opp = n.politics.list.filter((p) => !n.politics.ruling.includes(p.id)).sort((a, b) => b.share - a.share)[0]; if (opp) opp.share += fx.opposition; }
    if (fx.rulingShare) for (const p of n.politics.list) if (n.politics.ruling.includes(p.id)) p.share = clamp(p.share + fx.rulingShare, 0.3, 95);
    if (fx.leader) { n.leader = fx.leader[0]; n.title = fx.leader[1]; }
    if (fx.ruling) n.politics.ruling = fx.ruling.filter((id) => n.politics.list.some((p) => p.id === id));
    if (fx.ideo) n.ideology = fx.ideo;
    if (fx.gov) n.gov = fx.gov;
    if (fx.blocLeave) n.blocs = n.blocs.filter((b) => b !== fx.blocLeave);
    if (fx.manpower) n.manpower += fx.manpower;
    if (fx.election) { n.politics.next = new Date(this.time + 45 * DAY).toISOString().slice(0, 10); }
    if (fx.divisions || fx.airWings || fx.fleets) this.emit('raise', n, fx);
    this.emit('nation', n);
  }

  _tension(today) {
    let t = 30 + this.wars.length * 6;
    for (const w of this.wars) t += Math.min(12, (w.a.size + w.d.size) * 0.6);
    for (const n of this.live()) if (n.stability < 25 && n.gdp > 300) t += 1.5;
    t += this.globalMods.length * 4;
    today.tension = clamp(t, 0, 100);
  }

  factionName(n) { return n.faction ? FACTIONS[n.faction]?.name : null; }
}

export { pairKey, clamp, DAY };
