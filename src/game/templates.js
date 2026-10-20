// Division templates on Hearts of Iron IV's designer grid (five combat columns of up to five
// battalions, plus a support column), and the combat they fight by.
//
// The triangle: piercing beats armour · armour beats soft attack · soft attack beats piercing.
// - Soft attack hits soft targets; against a hard (armoured) division only the soft share lands.
//   Piercing (hard attack) is what hurts hard targets.
// - A division whose armour exceeds the attacker's penetration turns most blows aside.
// - Piercing-heavy formations are soft-skinned and carry little soft attack, so a soft-attack
//   force (infantry and guns) grinds them down.
//
// Combined arms, after RUSI's findings that drones, electronic warfare, artillery, air defence and
// logistics work as one system rather than substitutes:
// - Artillery needs spotting: reconnaissance drones and recon units raise its effect; enemy EW
//   blinds them. Guns also need ammunition, drawn from the stockpile as they fire.
// - Strike drones (FPV and loitering munitions) hit from above, through tank armour, and are used
//   up as they fly; enemy counter-drone teams, EW and air defence knock them down.
// - Air defence also cancels enemy air support.

import { CLASSES } from '../data/equipment.js';

export const EQUIPMENT = CLASSES;
export const EQUIPMENT_IDS = Object.keys(CLASSES);

// Combat battalions. Attack values: soft (direct fire), arty (indirect soft attack, needs ammo and
// spotting), drone (strike-drone soft and piercing), pierce (direct hard attack), pen/dpen
// (penetration of direct fire and of drones), armor, hard. Also def, brk, org, recon, ew, cdrone,
// aa (0-1 coverage), ammo and fpv (rounds and munitions used per hour of battle), and the
// equipment class (`q`) whose quality scales it.
export const BATTALIONS = {
  inf: { name: 'Infantry', width: 2, men: 900, soft: 6, pierce: 2, pen: 4, def: 22, brk: 3, org: 60, days: 3, q: 'rifles', eq: { rifles: 90, atgm: 6 } },
  motor: { name: 'Motorised infantry', width: 2, men: 800, soft: 6, pierce: 2, pen: 4, def: 20, brk: 5, org: 55, days: 4, q: 'rifles', eq: { rifles: 80, atgm: 6, trucks: 25 } },
  mech: { name: 'Mechanised infantry', width: 2, men: 700, soft: 6, pierce: 12, pen: 22, armor: 14, hard: 0.6, def: 18, brk: 9, org: 45, days: 5, q: 'ifv', eq: { rifles: 60, ifv: 40, atgm: 6 } },
  tank: { name: 'Tanks', width: 2, men: 400, soft: 10, pierce: 26, pen: 34, armor: 45, hard: 0.95, def: 6, brk: 28, org: 30, days: 7, q: 'mbt', eq: { mbt: 44, trucks: 10 } },
  recon: { name: 'Reconnaissance', width: 1, men: 400, soft: 4, pierce: 4, pen: 10, armor: 8, hard: 0.4, def: 8, brk: 8, org: 40, days: 4, recon: 0.35, q: 'ifv', eq: { ifv: 12, uav: 4, rifles: 30 } },
  spa: { name: 'Self-propelled artillery', width: 3, men: 500, arty: 24, pierce: 3, pen: 6, def: 4, brk: 4, org: 20, days: 4, ammo: 2, q: 'spg', eq: { spg: 18, trucks: 15, rifles: 20 } },
  mlrs: { name: 'Rocket artillery', width: 3, men: 400, arty: 30, pierce: 4, pen: 8, def: 3, brk: 6, org: 20, days: 5, ammo: 1.5, q: 'mlrs', eq: { mlrs: 12, trucks: 12, rifles: 15 } },
  at: { name: 'Anti-tank', width: 1, men: 400, soft: 2, pierce: 36, pen: 48, def: 10, brk: 2, org: 30, days: 3, q: 'atgm', eq: { atgm: 36, rifles: 20 } },
  shorad: { name: 'Short-range air defence', width: 1, men: 300, soft: 1, pierce: 2, pen: 6, def: 4, brk: 1, org: 20, days: 4, aa: 0.35, cdrone: 0.3, q: 'sam', eq: { sam: 6, rifles: 15, trucks: 6 } },
  drones: { name: 'Drone operators', width: 1, men: 250, drone: 10, dpierce: 10, dpen: 45, def: 3, brk: 6, org: 25, days: 3, recon: 0.3, fpv: 6, q: 'fpv', eq: { fpv: 400, uav: 6, rifles: 15 } },
  ewbn: { name: 'Electronic warfare', width: 1, men: 250, def: 2, brk: 1, org: 20, days: 4, ew: 0.45, cdrone: 0.15, q: 'ew', eq: { ew: 6, trucks: 6, rifles: 10 } },
  para: { name: 'Airborne', width: 2, men: 800, soft: 6, pierce: 3, pen: 6, def: 18, brk: 6, org: 70, days: 6, q: 'rifles', eq: { rifles: 80, atgm: 6 } },
  marine: { name: 'Marines', width: 2, men: 900, soft: 6, pierce: 4, pen: 8, armor: 2, hard: 0.1, def: 20, brk: 5, org: 65, days: 5, q: 'rifles', eq: { rifles: 90, ifv: 6, atgm: 4 } },
};
export const BATTALION_IDS = Object.keys(BATTALIONS);

// Support companies: no frontage, one of each per division.
export const SUPPORT = {
  engineers: { name: 'Engineers', men: 300, days: 2, eq: { trucks: 10, rifles: 20 }, fx: { def: 0.1, dig: 0.5 }, note: '+10% defence, dig in 50% faster' },
  logistics: { name: 'Logistics', men: 300, days: 2, eq: { trucks: 40 }, fx: { supply: -0.2 }, note: '20% less supply drawn from hubs' },
  maintenance: { name: 'Maintenance', men: 250, days: 2, eq: { trucks: 12 }, fx: { eqUse: -0.2 }, note: 'replacements need 20% less equipment' },
  medical: { name: 'Medical', men: 250, days: 2, eq: { trucks: 8 }, fx: { menUse: -0.25 }, note: 'replacements need 25% fewer recruits' },
  police: { name: 'Military police', men: 200, days: 1, eq: { rifles: 20, trucks: 4 }, fx: { org: 5 }, note: '+5 organisation' },
  signals: { name: 'Signals', men: 250, days: 2, eq: { trucks: 8, ew: 1 }, fx: { plan: 0.25, org: 3 }, note: '+25% planning bonus, +3 organisation' },
  recondrones: { name: 'Recon drones', men: 100, days: 1, eq: { uav: 8 }, fx: { recon: 0.4 }, note: 'spots for the guns' },
  counterdrone: { name: 'Counter-drone', men: 150, days: 2, eq: { ew: 2, sam: 2 }, fx: { cdrone: 0.35 }, note: 'shoots down enemy drones' },
  ewco: { name: 'EW company', men: 150, days: 2, eq: { ew: 3 }, fx: { ew: 0.25 }, note: 'jams enemy drones and spotting' },
};
export const SUPPORT_IDS = Object.keys(SUPPORT);

export const COLS = 5;
export const ROWS = 5;
export const SUPPORT_SLOTS = 5;
export const MAX_WIDTH = 40;

export const DEFAULT_TEMPLATES = [
  { name: 'Infantry Division', cols: [['inf', 'inf', 'inf'], ['inf', 'inf', 'inf'], ['spa', 'spa'], ['at', 'drones']], support: ['engineers', 'logistics', 'recondrones', 'medical'] },
  { name: 'Mechanised Division', cols: [['mech', 'mech'], ['mech', 'mech'], ['tank'], ['spa', 'spa'], ['shorad', 'drones']], support: ['engineers', 'logistics', 'maintenance', 'counterdrone', 'signals'] },
  { name: 'Armoured Division', cols: [['tank', 'tank'], ['tank', 'tank'], ['mech', 'mech', 'mech'], ['spa', 'mlrs'], ['shorad']], support: ['engineers', 'logistics', 'maintenance', 'recondrones', 'ewco'] },
  { name: 'Airborne Division', cols: [['para', 'para', 'para'], ['para', 'para', 'para'], ['spa'], ['at', 'drones']], support: ['recondrones', 'medical', 'signals'] },
  { name: 'Marine Division', cols: [['marine', 'marine', 'marine'], ['marine', 'marine', 'marine'], ['spa'], ['at', 'shorad']], support: ['engineers', 'logistics', 'medical'] },
];
const DEFAULT_FOR_TYPE = { inf: 0, mech: 1, armor: 2, airborne: 3, marine: 4 };

// A 5×5 grid (column-major: index = col * ROWS + row) from columns of battalion ids.
export function gridOf(cols) {
  const grid = Array(COLS * ROWS).fill(null);
  cols.slice(0, COLS).forEach((c, i) => c.slice(0, ROWS).forEach((id, j) => { if (BATTALIONS[id]) grid[i * ROWS + j] = id; }));
  return grid;
}

export function countsOf(grid) {
  const bats = {};
  for (const id of grid) if (id) bats[id] = (bats[id] ?? 0) + 1;
  return bats;
}

// Combat and cost figures for a grid and support column. `quality` scales each battalion by the
// standard of the equipment class it depends on (production.js keeps it per nation, and research.js
// `ratings` raises it by researched class improvements); its `mods` are research's explicit
// modifiers (fibre-optic drones, spectrum-agile radios, precision rockets and so on).
export function templateStats(grid, support = [], quality = null) {
  const M = quality?.mods;
  const sup = support.filter((id) => SUPPORT[id]);
  let n = 0, width = 0, men = 0, soft = 0, arty = 0, drone = 0, pierce = 0, dpierce = 0, def = 0, brk = 0, orgW = 0, hardW = 0, days = 20;
  let penMax = 0, penSum = 0, penN = 0, dpen = 0, armMax = 0, armSum = 0, recon = 0, ew = 0, cdrone = 0, aa = 0, ammo = 0, fpv = 0;
  const eq = {};
  const addEq = (e) => { for (const [k, v] of Object.entries(e)) eq[k] = (eq[k] ?? 0) + v; };
  for (const id of grid) {
    const b = BATTALIONS[id];
    if (!b) continue;
    const q = quality?.[b.q] ?? 1;
    n++; width += b.width; men += b.men; days += b.days;
    soft += (b.soft ?? 0) * q; arty += (b.arty ?? 0) * q; drone += (b.drone ?? 0) * q;
    pierce += (b.pierce ?? 0) * q; dpierce += (b.dpierce ?? 0) * q;
    def += b.def; brk += b.brk * q; orgW += b.org * b.width; hardW += (b.hard ?? 0) * b.width;
    if (b.pen) { penMax = Math.max(penMax, b.pen * q); penSum += b.pen * q; penN++; }
    if (b.dpen) dpen = Math.max(dpen, b.dpen * q);
    if (b.armor) armMax = Math.max(armMax, b.armor * q);
    armSum += (b.armor ?? 0) * q;
    recon += (b.recon ?? 0) * q; ew += (b.ew ?? 0) * q; cdrone += (b.cdrone ?? 0) * q; aa += (b.aa ?? 0) * q;
    ammo += b.ammo ?? 0; fpv += b.fpv ?? 0;
    addEq(b.eq);
  }
  const fx = { def: 0, dig: 0, supply: 0, eqUse: 0, menUse: 0, org: 0, plan: 0 };
  for (const id of sup) {
    const c = SUPPORT[id];
    men += c.men; days += c.days; addEq(c.eq);
    for (const [k, v] of Object.entries(c.fx)) {
      if (k === 'recon') recon += v * (quality?.uav ?? 1);
      else if (k === 'ew') ew += v * (quality?.ew ?? 1);
      else if (k === 'cdrone') cdrone += v * (quality?.ew ?? 1);
      else fx[k] += v;
    }
  }
  const cap = (v) => Math.min(0.9, v);
  const cost = Object.entries(eq).reduce((t, [e, v]) => t + v * (COST[e] ?? 1), 0);
  if (!n) return { n: 0, width: 0, men, soft: 0, arty: 0, drone: 0, pierce: 0, dpierce: 0, pen: 0, dpen: 0, armor: 0, hard: 0, def: 0, brk: 0, org: 0, days, recon: 0, ew: 0, cdrone: 0, aa: 0, ammo: 0, fpv: 0, ewResist: 0, jamResist: 0, eq, cost, fx, sup, type: 'inf' };
  // Research adds to coverage a division already has: radars help guns that are there to cue.
  if (M) {
    if (arty > 0) recon += M.recon;
    if (cdrone > 0) cdrone += M.cdrone;
    if (aa > 0) aa += M.aa;
    ammo *= Math.max(0, 1 + M.ammoUse);
  }
  return {
    n, width, men, days, eq, cost, fx, sup,
    soft, arty, drone, pierce, dpierce, dpen,
    pen: penN ? 0.4 * penMax + 0.6 * (penSum / penN) : 0,
    armor: 0.3 * armMax + 0.7 * (armSum / n),
    hard: hardW / width,
    def: def * (1 + fx.def), brk,
    org: orgW / width + fx.org,
    recon: cap(recon), ew: cap(ew), cdrone: cap(cdrone), aa: cap(aa),
    ammo, fpv,
    ewResist: drone || dpierce ? M?.ewResist ?? 0 : 0,
    jamResist: arty ? M?.jamResist ?? 0 : 0,
    type: typeOf(countsOf(grid), width),
  };
}

// Rough factory-day costs per item of each class, for template cost estimates (generic patterns).
export const COST = { rifles: 0.02, atgm: 0.1, mbt: 7, ifv: 3.5, spg: 2.5, mlrs: 3, ammo: 0.012, trucks: 0.35, uav: 0.5, fpv: 0.002, sam: 4, ew: 2 };

// The counter and 3D models a template is drawn with.
function typeOf(bats, width) {
  const share = (id) => ((bats[id] ?? 0) * BATTALIONS[id].width) / width;
  if (share('tank') >= 0.25) return 'armor';
  if (share('mech') + share('tank') >= 0.3) return 'mech';
  if (share('para') >= 0.3) return 'airborne';
  if (share('marine') >= 0.3) return 'marine';
  return 'inf';
}

export function makeTemplate(id, name, grid, support = [], quality = null) {
  const g = Array.from({ length: COLS * ROWS }, (_, i) => (BATTALIONS[grid[i]] ? grid[i] : null));
  const s = [...new Set(support.filter((x) => SUPPORT[x]))].slice(0, SUPPORT_SLOTS);
  return { id, name, grid: g, support: s, bats: countsOf(g), stats: templateStats(g, s, quality) };
}

// Re-rates a template after the nation's equipment standard changes.
export function restat(t, quality) { t.bats = countsOf(t.grid); t.stats = templateStats(t.grid, t.support, quality); }

// Every nation starts with the five standard templates.
export function seedTemplates(n) {
  n.templates = DEFAULT_TEMPLATES.map((t, i) => makeTemplate(`t${i + 1}`, t.name, gridOf(t.cols), t.support));
  n.nextTemplate = DEFAULT_TEMPLATES.length + 1;
}
export const defaultTemplate = (n, type) => n.templates[DEFAULT_FOR_TYPE[type] ?? 0] ?? n.templates[0];

// Why a design cannot be saved, or null.
export function templateProblem(grid, support = []) {
  const s = templateStats(grid, support);
  if (!s.n) return 'Add at least one battalion.';
  if (s.width > MAX_WIDTH) return `Combat width ${s.width} is over the ${MAX_WIDTH} limit.`;
  return null;
}

// Weighted average combat profile of one side of a battle. `weight(s)` is each division's share.
// `fill` gives the share of ammunition and strike drones each side actually had this hour.
export function sideProfile(list, weight, fill = { ammo: 1, fpv: 1 }) {
  const keys = ['soft', 'arty', 'drone', 'pierce', 'dpierce', 'pen', 'dpen', 'armor', 'hard', 'def', 'brk', 'recon', 'ew', 'cdrone', 'aa', 'ewResist', 'jamResist'];
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  let w = 0;
  for (const s of list) {
    const t = s.tpl.stats, k = weight(s);
    w += k;
    for (const key of keys) out[key] += (t[key] ?? 0) * k;
  }
  const d = Math.max(1e-9, w);
  for (const key of keys) out[key] /= d;
  return { ...out, w, ammoFill: fill.ammo, fpvFill: fill.fpv };
}

// How hard side `a` hits side `b`, per unit of weight. Armour the attacker cannot penetrate turns
// most blows aside; piercing that gets through hits an armoured target all the harder. Drones
// attack from above with their own penetration. Researched resistance (fibre-optic drones,
// spectrum-agile radios) takes away part of the enemy's EW.
export function strike(a, b) {
  const spot = Math.max(0, Math.min(1, a.recon * (1 - 0.7 * b.ew * (1 - (a.jamResist ?? 0)))));
  const droneEff = (1 - Math.min(0.9, Math.max(b.cdrone, 0.6 * b.ew * (1 - (a.ewResist ?? 0)), 0.5 * b.aa))) * (a.fpvFill ?? 1);
  const artyEff = (0.5 + 0.5 * spot) * (0.25 + 0.75 * (a.ammoFill ?? 1));
  const soft = a.soft + a.arty * artyEff + a.drone * droneEff;
  const holds = b.armor > a.pen;
  const direct = soft * (1 - b.hard) + a.pierce * b.hard;
  const directVal = holds ? direct * 0.4 : direct * (1 + b.hard);
  const droneVal = a.dpierce * droneEff * b.hard * (b.armor > a.dpen ? 0.4 : 1 + b.hard);
  return { value: directVal + droneVal, holds, spot, droneEff, artyEff };
}
