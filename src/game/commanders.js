// Commanders, army experience and land doctrine, after Hearts of Iron IV.
//
// Three things sit in this file, because in HOI4 they are one loop:
//   * commanders, who are attached to an army, gain experience by commanding it in battle, go up
//     levels, and pick up traits from the kind of fighting they keep doing;
//   * army experience, a national pool filled by combat and by peacetime exercises;
//   * land doctrine, which that pool buys, and which moves every formation in the country.
//
// Combat reads one number out of all this: `commandFactor`, the multiplier a formation's weight
// gets from the officer in front of it and the doctrine behind it.

import { haversine } from '../util/geo.js';

const DAY = 86400000;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ------------------------------------------------------------------ names
// Surnames by language group. A country is mapped by name where it is obvious, and otherwise to
// the nearest mapped capital, so a commander is at least plausibly from the country he serves.
const SURNAMES = {
  anglo: ['Harding', 'Whitfield', 'Carraway', 'Lennox', 'Ashcroft', 'Mercer', 'Royce', 'Thorne'],
  latin: ['Albán', 'Carvalho', 'Duarte', 'Ferreira', 'Montalvo', 'Rivas', 'Saavedra', 'Vidal'],
  germanic: ['Brandt', 'Dirksen', 'Haupt', 'Kessler', 'Reinhardt', 'Stauffer', 'Vogel', 'Zeller'],
  slavic: ['Baranov', 'Dvořák', 'Kovalenko', 'Marić', 'Nowicki', 'Petrov', 'Stanek', 'Zajac'],
  nordic: ['Aalto', 'Dahl', 'Eriksen', 'Halvorsen', 'Lindqvist', 'Nyberg', 'Sandvik', 'Vinter'],
  arabic: ['Al-Fahd', 'Al-Masri', 'Haddad', 'Khalidi', 'Mansour', 'Nasser', 'Rahal', 'Zahran'],
  turkic: ['Aydın', 'Demir', 'Ersoy', 'Kaplan', 'Özkan', 'Şahin', 'Tekin', 'Yilmaz'],
  persian: ['Ardalan', 'Behzadi', 'Ghaffari', 'Kiani', 'Mirzaei', 'Nazari', 'Rostami', 'Shirazi'],
  indic: ['Bedi', 'Chandra', 'Deshmukh', 'Iyer', 'Khatri', 'Nair', 'Rastogi', 'Sandhu'],
  sinitic: ['Cheng', 'Fang', 'Guo', 'Liang', 'Qiao', 'Shen', 'Xiao', 'Zhou'],
  japanese: ['Arakawa', 'Fujimori', 'Hayashi', 'Kurosawa', 'Nakano', 'Okada', 'Sugiyama', 'Tachibana'],
  korean: ['Baek', 'Choi', 'Hwang', 'Jeong', 'Kang', 'Moon', 'Seo', 'Yoon'],
  malay: ['Abdullah', 'Hamzah', 'Kusuma', 'Mahmud', 'Prasetyo', 'Rahman', 'Santoso', 'Wirawan'],
  viet: ['Bui', 'Dang', 'Doan', 'Hoang', 'Ngo', 'Pham', 'Tran', 'Vu'],
  westAfrican: ['Adeyemi', 'Bamba', 'Diallo', 'Eze', 'Koffi', 'Mensah', 'Okafor', 'Sow'],
  eastAfrican: ['Abebe', 'Chege', 'Juma', 'Kamau', 'Mwangi', 'Nkurunziza', 'Omondi', 'Tesfaye'],
  southernAfrican: ['Dlamini', 'Khumalo', 'Mabaso', 'Mokoena', 'Ndlovu', 'Sithole', 'Tsholo', 'Zulu'],
};
const EXEMPLARS = {
  USA: 'anglo', GBR: 'anglo', CAN: 'anglo', AUS: 'anglo', NZL: 'anglo', IRL: 'anglo',
  ESP: 'latin', PRT: 'latin', ITA: 'latin', FRA: 'latin', BRA: 'latin', MEX: 'latin', ARG: 'latin', COL: 'latin', CHL: 'latin',
  DEU: 'germanic', AUT: 'germanic', CHE: 'germanic', NLD: 'germanic', BEL: 'germanic',
  RUS: 'slavic', UKR: 'slavic', POL: 'slavic', CZE: 'slavic', SRB: 'slavic', BGR: 'slavic', HRV: 'slavic', BLR: 'slavic',
  SWE: 'nordic', NOR: 'nordic', DNK: 'nordic', FIN: 'nordic', ISL: 'nordic',
  SAU: 'arabic', EGY: 'arabic', ARE: 'arabic', IRQ: 'arabic', DZA: 'arabic', MAR: 'arabic', SYR: 'arabic', JOR: 'arabic',
  TUR: 'turkic', AZE: 'turkic', KAZ: 'turkic', UZB: 'turkic',
  IRN: 'persian', AFG: 'persian', TJK: 'persian',
  IND: 'indic', PAK: 'indic', BGD: 'indic', NPL: 'indic', LKA: 'indic',
  CHN: 'sinitic', TWN: 'sinitic', SGP: 'sinitic',
  JPN: 'japanese', KOR: 'korean', PRK: 'korean',
  IDN: 'malay', MYS: 'malay', PHL: 'malay', THA: 'malay', VNM: 'viet', KHM: 'viet',
  ROU: 'latin', MDA: 'latin',
  NGA: 'westAfrican', GHA: 'westAfrican', SEN: 'westAfrican', CIV: 'westAfrican', MLI: 'westAfrican',
  ETH: 'eastAfrican', KEN: 'eastAfrican', TZA: 'eastAfrican', UGA: 'eastAfrican', SOM: 'eastAfrican',
  ZAF: 'southernAfrican', ZWE: 'southernAfrican', ZMB: 'southernAfrican', AGO: 'southernAfrican', MOZ: 'southernAfrican',
};
const INITIALS = 'ABCDEGHIJKLMNOPRSTVZ';

export function nameGroup(g, n) {
  const direct = EXEMPLARS[n.iso3];
  if (direct) return direct;
  // Nearest mapped capital. Countries without a capital fix fall back to the anglophone pool.
  let best = 'anglo', bestKm = Infinity;
  const here = n.capital;
  if (!here) return best;
  for (const [iso, group] of Object.entries(EXEMPLARS)) {
    const there = g.world?.byIso?.get(iso)?.capital;
    if (!there) continue;
    const km = haversine(here, there);
    if (km < bestKm) { bestKm = km; best = group; }
  }
  return best;
}

// ------------------------------------------------------------------ traits
// Each trait is earned by doing the thing, as in HOI4: command armour and you become a panzer
// leader. `gain` is checked monthly against what the commander's army has been doing.
export const TRAITS = {
  panzer_leader: {
    name: 'Panzer leader', desc: 'Has spent a career with the armoured formations.',
    fx: { atk: 0.08, speed: 0.1 }, gain: (c) => c.log.armour >= 24,
  },
  infantry_leader: {
    name: 'Infantry leader', desc: 'Knows what foot soldiers can be asked to do, and what they cannot.',
    fx: { def: 0.08, org: 0.05 }, gain: (c) => c.log.infantry >= 24,
  },
  trickster: {
    name: 'Trickster', desc: 'Wins by being somewhere the enemy was not looking.',
    fx: { atk: 0.06, planning: 0.1 }, gain: (c) => c.log.offensives >= 8,
  },
  defensive_doctrine: {
    name: 'Unyielding', desc: 'Has held a line that should not have held.',
    fx: { def: 0.12 }, gain: (c) => c.log.defended >= 10,
  },
  logistics_wizard: {
    name: 'Logistics wizard', desc: 'Keeps an army fed at the end of a long road.',
    fx: { supply: 0.12, fuel: 0.1 }, gain: (c) => c.log.months >= 36,
  },
  old_guard: {
    name: 'Old guard', desc: 'Respected, decorated, and slow to learn anything new.',
    fx: { def: 0.05, xp: -0.4 }, gain: (c) => c.level >= 5 && c.log.months >= 48,
  },
  winter_specialist: {
    name: 'Winter specialist', desc: 'Has fought through winters that stopped other armies.',
    fx: { def: 0.06, speed: 0.05 }, gain: (c) => c.log.winters >= 3,
  },
  organiser: {
    name: 'Organiser', desc: 'Formations under this command come back to strength quickly.',
    fx: { org: 0.1 }, gain: (c) => c.level >= 4,
  },
};

// ------------------------------------------------------------------ doctrine
// Four branches, as in HOI4. Each step costs army experience and moves every land formation.
export const DOCTRINE = {
  mobile: {
    name: 'Mobile warfare', desc: 'Armour punches a hole and never stops to consolidate.',
    steps: [
      { name: 'Massed motorisation', cost: 30, fx: { speed: 0.08, org: 0.03 } },
      { name: 'Combined arms', cost: 55, fx: { atk: 0.06, org: 0.04 } },
      { name: 'Deep battle', cost: 85, fx: { atk: 0.08, speed: 0.06 } },
      { name: 'Operational manoeuvre', cost: 130, fx: { atk: 0.1, org: 0.06, fuel: -0.1 } },
    ],
  },
  firepower: {
    name: 'Superior firepower', desc: 'Let the guns and the drones do the work before anyone advances.',
    steps: [
      { name: 'Fire support', cost: 30, fx: { atk: 0.07 } },
      { name: 'Dispersed support', cost: 55, fx: { atk: 0.05, def: 0.04 } },
      { name: 'Shock and awe', cost: 85, fx: { atk: 0.1 } },
      { name: 'Sustained fires', cost: 130, fx: { atk: 0.12, supply: -0.08 } },
    ],
  },
  battleplan: {
    name: 'Grand battleplan', desc: 'Plan it properly, then execute the plan.',
    steps: [
      { name: 'Staff work', cost: 30, fx: { planning: 0.15 } },
      { name: 'Assault concentration', cost: 55, fx: { atk: 0.05, planning: 0.1 } },
      { name: 'Elastic defence', cost: 85, fx: { def: 0.08, org: 0.04 } },
      { name: 'Grand assault', cost: 130, fx: { atk: 0.08, def: 0.06, planning: 0.1 } },
    ],
  },
  mass: {
    name: 'Mass mobilisation', desc: 'There are always more men, and they cost less than tanks.',
    steps: [
      { name: 'People’s army', cost: 30, fx: { def: 0.06, manpower: 0.1 } },
      { name: 'Large front', cost: 55, fx: { def: 0.05, org: 0.04 } },
      { name: 'Human wave', cost: 85, fx: { atk: 0.08, casualties: 0.12 } },
      { name: 'Guerrilla tactics', cost: 130, fx: { def: 0.1, supply: 0.08 } },
    ],
  },
};

export const XP = {
  warPerDay: 0.35, // experience a country at war earns a day
  battlePerDay: 0.12, // extra for each army that is actually in contact
  exercisePerDay: 0.04,
  commanderPerDay: 0.5,
  levelCost: (level) => 100 + level * 60,
};

// ------------------------------------------------------------------ creation
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

export function createCommand(g, n, r) {
  const group = nameGroup(g, n);
  const pool = SURNAMES[group] ?? SURNAMES.anglo;
  // The staff is sized on the country's weight, since divisions are not counted until the
  // unit layer has been built.
  const count = n.gdp > 5000 ? 6 : n.gdp > 1000 ? 5 : n.gdp > 200 ? 4 : 3;
  const used = new Set();
  const officers = [];
  for (let i = 0; i < count; i++) {
    let surname = pick(pool, r);
    for (let tries = 0; used.has(surname) && tries < 8; tries++) surname = pick(pool, r);
    used.add(surname);
    const level = 1 + Math.floor(r() * 3);
    officers.push({
      id: `${n.iso3}-${i + 1}`,
      name: `${pick([...INITIALS], r)}. ${surname}`,
      rank: i === 0 ? 'marshal' : 'general',
      level, xp: 0,
      skill: {
        attack: 1 + Math.floor(r() * 3),
        defence: 1 + Math.floor(r() * 3),
        planning: 1 + Math.floor(r() * 3),
        logistics: 1 + Math.floor(r() * 3),
      },
      traits: [],
      army: null,
      log: { armour: 0, infantry: 0, offensives: 0, defended: 0, months: 0, winters: 0 },
    });
  }
  return {
    officers,
    xp: 0, // the national army-experience pool
    spent: 0,
    doctrine: { mobile: 0, firepower: 0, battleplan: 0, mass: 0 },
    exercises: false,
  };
}

// ------------------------------------------------------------------ effects
const EMPTY_FX = { atk: 0, def: 0, org: 0, speed: 0, planning: 0, supply: 0, fuel: 0, manpower: 0, casualties: 0, xp: 0 };

export function doctrineFx(n) {
  const C = n.command;
  const out = { ...EMPTY_FX };
  if (!C) return out;
  for (const [key, taken] of Object.entries(C.doctrine)) {
    const branch = DOCTRINE[key];
    for (let i = 0; i < taken; i++) {
      for (const [k, v] of Object.entries(branch.steps[i].fx)) out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export function traitFx(commander) {
  const out = { ...EMPTY_FX };
  for (const key of commander?.traits ?? []) {
    for (const [k, v] of Object.entries(TRAITS[key]?.fx ?? {})) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export const commanderOfArmy = (n, armyId) => n.command?.officers.find((o) => o.army === armyId) ?? null;

// What a formation's fighting weight gains from its commander and its country's doctrine.
export function commandFactor(g, s) {
  const n = g.nations?.[s.owner];
  const C = n?.command;
  if (!C) return 1;
  const d = doctrineFx(n);
  let atk = d.atk, def = d.def;
  const officer = s.army != null ? commanderOfArmy(n, s.army) : null;
  if (officer) {
    const t = traitFx(officer);
    atk += t.atk + officer.skill.attack * 0.015 + officer.level * 0.01;
    def += t.def + officer.skill.defence * 0.015;
  }
  const attacking = s.state === 'moving' || s.attack || s.contested;
  return clamp(1 + (attacking ? atk : def), 0.6, 1.8);
}

// ------------------------------------------------------------------ the monthly loop
// An army without a commander gets the most senior officer who is not already in the field.
export function autoAssign(n, armies) {
  const C = n.command;
  if (!C) return;
  const held = new Set(C.officers.map((o) => o.army).filter((a) => a != null));
  const free = C.officers.filter((o) => o.army == null).sort((a, b) => b.level - a.level);
  for (const army of armies.sort((a, b) => b.divs - a.divs)) {
    if (held.has(army.id) || !free.length) continue;
    const officer = free.shift();
    officer.army = army.id;
    held.add(army.id);
  }
}

// Summarise what each army did this month, from the formation list the fuel layer already reads.
export function armySummaries(n, stacks) {
  const by = new Map();
  for (const s of stacks) {
    if (s.owner !== n.index || s.army == null) continue;
    let a = by.get(s.army);
    if (!a) by.set(s.army, (a = { id: s.army, divs: 0, armour: 0, engaged: false, attacking: false, defending: false }));
    const divs = s.divs ?? 1;
    a.divs += divs;
    if (s.type === 'armor' || s.type === 'mech') a.armour += divs;
    if (s.battle) a.engaged = true;
    if (s.attack || s.state === 'moving') a.attacking = true;
    else if (s.contested || s.dig > 0) a.defending = true;
  }
  for (const a of by.values()) a.armourShare = a.divs ? a.armour / a.divs : 0;
  return [...by.values()];
}

export function commandMonth(g, n, stacks = []) {
  const armies = armySummaries(n, stacks);
  autoAssign(n, armies);
  const C = n.command;
  if (!C) return;
  const atWar = g.warsOf(n.index).length > 0;
  const month = new Date(g.time).getUTCMonth();
  const winter = month <= 1 || month === 11;

  // The national pool.
  let gain = atWar ? XP.warPerDay * 30 : C.exercises ? XP.exercisePerDay * 30 : 0;
  if (atWar) gain += Math.min(6, armies.filter((a) => a.engaged).length) * XP.battlePerDay * 30;
  C.xp = Math.min(1500, C.xp + gain);

  for (const o of C.officers) {
    const army = armies.find((a) => a.id === o.army);
    if (!army) continue;
    o.log.months += 1;
    if (army.armourShare > 0.4) o.log.armour += 1;
    if (army.armourShare < 0.25) o.log.infantry += 1;
    if (army.attacking) o.log.offensives += 1;
    if (army.defending) o.log.defended += 1;
    if (winter && army.engaged) o.log.winters += 1 / 3;

    const t = traitFx(o);
    const earned = (atWar ? XP.commanderPerDay * 30 : XP.commanderPerDay * 6) * (1 + t.xp);
    o.xp += Math.max(0, earned);
    while (o.level < 9 && o.xp >= XP.levelCost(o.level)) {
      o.xp -= XP.levelCost(o.level);
      o.level += 1;
      const best = army.armourShare > 0.4 ? 'attack' : 'defence';
      o.skill[best] += 1;
      g.log(`${rankName(o)} ${o.name} is promoted to level ${o.level}.`, { nation: n.index, kind: 'war' });
    }
    for (const [key, trait] of Object.entries(TRAITS)) {
      if (o.traits.includes(key) || !trait.gain(o)) continue;
      o.traits.push(key);
      g.log(`${rankName(o)} ${o.name} earns the ${trait.name.toLowerCase()} trait.`, { nation: n.index, kind: 'war' });
    }
  }
}

export const rankName = (o) => (o.rank === 'marshal' ? 'Field Marshal' : 'General');

// ------------------------------------------------------------------ spending
export function doctrineCost(n, branch) {
  const taken = n.command?.doctrine?.[branch] ?? 0;
  return DOCTRINE[branch]?.steps[taken]?.cost ?? null;
}

export function doctrineBlocker(n, branch) {
  const C = n.command;
  if (!C) return 'No general staff.';
  const cost = doctrineCost(n, branch);
  if (cost == null) return 'This branch is complete.';
  if (C.xp < cost) return `Needs ${cost} army experience.`;
  return null;
}

export function takeDoctrine(g, n, branch) {
  if (doctrineBlocker(n, branch)) return false;
  const cost = doctrineCost(n, branch);
  n.command.xp -= cost;
  n.command.spent += cost;
  n.command.doctrine[branch] += 1;
  const step = DOCTRINE[branch].steps[n.command.doctrine[branch] - 1];
  g.log(`${n.name} adopts ${step.name.toLowerCase()}.`, { nation: n.index, kind: 'war' });
  return true;
}

export function assignCommander(n, officerId, armyId) {
  const C = n.command;
  if (!C) return false;
  const officer = C.officers.find((o) => o.id === officerId);
  if (!officer) return false;
  for (const other of C.officers) if (other.army === armyId) other.army = null;
  officer.army = armyId;
  return true;
}

export const toggleExercises = (n) => (n.command ? (n.command.exercises = !n.command.exercises) : false);
