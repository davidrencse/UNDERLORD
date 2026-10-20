// Equipment research, after Hearts of Iron IV. A nation works on a few technologies at once, one
// per research slot; each has a cost in days at standard speed, prerequisites, and effects. Some
// unlock models from the 2025 catalog (data/equipment.js: a model's `tech` names the technology it
// needs), the rest improve a whole class of equipment (folded into the quality map that division
// stats scale with) or change how divisions fight (explicit modifiers read by templateStats).
//
// Slots follow what the nation spends on education, as a share of GDP: one slot below ~$5bn a year,
// up to six for the largest economies. Speed follows education spending and income per head.
// Researching a technology before its historical year costs more, as Hearts of Iron's
// ahead-of-time penalty does.
//
// Costs, years and effects are game estimates informed by open sources (IISS Military Balance 2025,
// RUSI, manufacturer data), for relative standing only.

import { MODELS, CLASSES, CLASS_IDS } from '../data/equipment.js';

export const RESEARCH = {
  maxSlots: 6,
  slotBn: 12, // education spending ($bn a year) behind the second slot; each further slot doubles it
  ahead: 1, // each year ahead of a technology's date adds this much to its cost
};

export const CATEGORIES = {
  armour: 'Armour',
  infantry: 'Infantry and anti-tank',
  fires: 'Artillery and rockets',
  drones: 'Drones',
  airdef: 'Air defence',
  ew: 'Electronic warfare',
};
export const CATEGORY_IDS = Object.keys(CATEGORIES);

// Explicit modifiers a technology can give every division (templates.js reads them):
// - ewResist: share of enemy EW that no longer affects our strike drones
// - jamResist: share of enemy EW that no longer blinds our spotting
// - recon, cdrone, aa: added to spotting, counter-drone and air-defence coverage of divisions that
//   already have some
// - ammoUse: change in artillery ammunition used per hour of battle
export const MODS = { ewResist: 0, jamResist: 0, recon: 0, cdrone: 0, aa: 0, ammoUse: 0 };
const MOD_TEXT = {
  ewResist: (v) => `${pct(v)} of enemy EW no longer stops our drones`,
  jamResist: (v) => `${pct(v)} of enemy EW no longer blinds our spotting`,
  recon: (v) => `+${pct(v)} spotting for divisions with guns`,
  cdrone: (v) => `+${pct(v)} counter-drone coverage`,
  aa: (v) => `+${pct(v)} air-defence coverage`,
  ammoUse: (v) => `${pct(-v)} less artillery ammunition used`,
};
const pct = (v) => `${Math.round(v * 100)}%`;

// `quality` adds to the rating of a class (0.1 = +10%); `mods` are the modifiers above.
export const TECHS = [
  // Armour
  { id: 'mbt_cage', cat: 'armour', name: 'Drone protection kits', days: 60, year: 2023, req: [], quality: { mbt: 0.04, ifv: 0.03 }, note: 'Cope cages, slat armour and reactive armour against FPV drones and top-attack munitions.' },
  { id: 'ifv_turret', cat: 'armour', name: 'Remote turrets and IFV missiles', days: 120, year: 2022, req: [], quality: { ifv: 0.08 }, note: 'Unmanned turrets with fitted anti-tank missiles, as on Puma, Lynx and the latest CV90.' },
  { id: 'mbt_aps', cat: 'armour', name: 'Active protection systems', days: 150, year: 2024, req: ['mbt_cage'], quality: { mbt: 0.06, ifv: 0.03 }, note: 'Hard-kill systems (Trophy, Arena-M) that shoot down incoming missiles and drones. The Leopard 2A8 and Challenger 3 are built around them.' },
  { id: 'mbt_next', cat: 'armour', name: 'Next-generation tanks', days: 360, year: 2028, req: ['mbt_aps', 'ifv_turret'], quality: { mbt: 0.04 }, note: 'Lighter hulls, autoloaders, hybrid drives and networked sensors: the M1E3 Abrams and KF51 Panther.' },
  // Infantry and anti-tank
  { id: 'inf_kit', cat: 'infantry', name: 'Soldier networks and night vision', days: 120, year: 2022, req: [], quality: { rifles: 0.08 }, note: 'Digital night sights, squad radios and battle-management tablets down to the section.' },
  { id: 'atgm_topattack', cat: 'infantry', name: 'Top-attack ATGMs', days: 120, year: 2020, req: [], quality: { atgm: 0.12 }, note: 'Missiles that dive onto the thin roof armour of tanks (Javelin, NLAW, Spike).' },
  { id: 'atgm_ff', cat: 'infantry', name: 'Fire-and-forget seekers', days: 150, year: 2024, req: ['atgm_topattack'], quality: { atgm: 0.08 }, note: 'Imaging seekers that lock on before launch, so the team can move straight after firing.' },
  // Artillery and rockets
  { id: 'art_counterbattery', cat: 'fires', name: 'Counter-battery radar networks', days: 120, year: 2023, req: [], quality: { spg: 0.04 }, mods: { recon: 0.05 }, note: 'Radars and acoustic sensors that find enemy guns from their shells and pass the targets straight to our own.' },
  { id: 'art_autoload', cat: 'fires', name: 'Automated howitzers', days: 150, year: 2024, req: [], quality: { spg: 0.08 }, note: 'Automatic loading and laying: shoot-and-scoot in under a minute, as PzH 2000, K9A2 and PCL-181 do.' },
  { id: 'art_guided', cat: 'fires', name: 'Guided artillery shells', days: 150, year: 2022, req: ['art_counterbattery'], note: 'GPS-guided 155 mm shells that land within metres: the M982 Excalibur.' },
  { id: 'mlrs_precision', cat: 'fires', name: 'Rocket artillery precision', days: 150, year: 2021, req: [], quality: { mlrs: 0.12 }, mods: { ammoUse: -0.1 }, note: 'Satellite-guided rockets (GMLRS, guided Tornado-S, PHL-16) hit with one salvo what used to take ten.' },
  { id: 'mlrs_er', cat: 'fires', name: 'Extended-range rockets', days: 200, year: 2025, req: ['mlrs_precision'], quality: { mlrs: 0.08 }, note: 'Rockets reaching 150 km and more, holding enemy depots and command posts at risk.' },
  // Drones
  { id: 'fpv_mass', cat: 'drones', name: 'Mass FPV production', days: 90, year: 2024, req: [], quality: { fpv: 0.08 }, note: 'Standardised frames, warheads and flight controllers turned out by the million, as in Ukraine and Russia.' },
  { id: 'uav_loiter', cat: 'drones', name: 'Loitering munitions', days: 150, year: 2022, req: [], quality: { fpv: 0.04 }, note: 'Munitions that circle the battlefield until they find a target: Switchblade and Lancet.' },
  { id: 'fpv_fibre', cat: 'drones', name: 'Fibre-optic FPV', days: 120, year: 2025, req: ['fpv_mass'], mods: { ewResist: 0.4 }, note: 'Drones steered down a spooled optical fibre rather than by radio, so jammers cannot touch them.' },
  { id: 'uav_relay', cat: 'drones', name: 'Drone relays and mesh networks', days: 150, year: 2025, req: [], quality: { uav: 0.08 }, mods: { recon: 0.05 }, note: 'Relay drones and mesh radios that keep reconnaissance UAVs on station deeper and longer.' },
  { id: 'fpv_ai', cat: 'drones', name: 'AI terminal guidance', days: 240, year: 2026, req: ['fpv_mass', 'uav_relay'], quality: { fpv: 0.08 }, mods: { ewResist: 0.2 }, note: 'Onboard target recognition that finishes the attack on its own once the link is lost.' },
  // Air defence
  { id: 'ad_ibcs', cat: 'airdef', name: 'Integrated air defence networks', days: 180, year: 2023, req: [], quality: { sam: 0.08 }, note: 'One battle-management network fusing every radar and launcher, as IBCS does for Patriot.' },
  { id: 'ad_medium', cat: 'airdef', name: 'Modern medium-range SAMs', days: 180, year: 2023, req: ['ad_ibcs'], quality: { sam: 0.03 }, note: 'Vertical-launch, all-round medium-range missiles: IRIS-T SLM.' },
  { id: 'ad_cuas', cat: 'airdef', name: 'Counter-UAS interceptors', days: 150, year: 2025, req: [], quality: { sam: 0.04 }, mods: { cdrone: 0.08 }, note: 'Cheap interceptors and radar-cued guns (Coyote, Skyranger) sized for drones rather than jets.' },
  { id: 'ad_laser', cat: 'airdef', name: 'Laser air defence', days: 300, year: 2027, req: ['ad_cuas'], mods: { cdrone: 0.1, aa: 0.05 }, note: 'High-energy lasers (Iron Beam, DragonFire) that down drones and rockets for pennies a shot.' },
  // Electronic warfare
  { id: 'ew_counterdrone', cat: 'ew', name: 'Counter-drone EW', days: 120, year: 2024, req: [], quality: { ew: 0.1 }, mods: { cdrone: 0.05 }, note: 'Wideband jammers on every vehicle and trench line that break the control links of enemy drones.' },
  { id: 'ew_hopping', cat: 'ew', name: 'Spectrum-agile radios', days: 150, year: 2024, req: [], mods: { jamResist: 0.25 }, note: 'Frequency-hopping, low-probability-of-intercept links that keep our spotters talking through jamming.' },
  { id: 'ew_brigade', cat: 'ew', name: 'Brigade EW systems', days: 180, year: 2024, req: ['ew_counterdrone'], quality: { ew: 0.05 }, note: 'Vehicle-mounted sensing and jamming for a whole brigade: the US Army\'s TLS-BCT.' },
  { id: 'ew_strategic', cat: 'ew', name: 'Strategic jamming', days: 200, year: 2018, req: [], note: 'Heavy jammers that blind airborne radars and satellites at long range: Krasukha-4.' },
];
export const TECH = Object.fromEntries(TECHS.map((t) => [t.id, t]));
for (const t of TECHS) t.unlocks = MODELS.filter((m) => m.tech === t.id).map((m) => m.id);

// What the major powers (and Ukraine, the leading drone power) field in 2025. Prerequisites are
// granted with them.
export const STARTING = {
  USA: ['inf_kit', 'atgm_ff', 'ifv_turret', 'mbt_aps', 'art_guided', 'mlrs_er', 'uav_loiter', 'uav_relay', 'ad_medium', 'ad_cuas', 'ew_brigade', 'ew_hopping'],
  CHN: ['inf_kit', 'atgm_ff', 'ifv_turret', 'mbt_aps', 'art_autoload', 'art_counterbattery', 'mlrs_er', 'uav_loiter', 'uav_relay', 'fpv_mass', 'ad_medium', 'ew_counterdrone', 'ew_strategic', 'ew_hopping'],
  RUS: ['mbt_cage', 'art_counterbattery', 'mlrs_precision', 'uav_loiter', 'fpv_fibre', 'ad_ibcs', 'ew_brigade', 'ew_strategic'],
  DEU: ['inf_kit', 'atgm_ff', 'ifv_turret', 'mbt_aps', 'art_autoload', 'art_counterbattery', 'mlrs_precision', 'ad_medium', 'ad_cuas', 'ew_hopping'],
  FRA: ['inf_kit', 'atgm_ff', 'ifv_turret', 'art_counterbattery', 'mlrs_precision', 'ad_medium', 'ew_hopping'],
  GBR: ['inf_kit', 'atgm_topattack', 'mbt_aps', 'art_counterbattery', 'mlrs_precision', 'ad_medium', 'ew_hopping'],
  IND: ['inf_kit', 'atgm_topattack', 'art_autoload', 'mlrs_precision', 'uav_loiter', 'ad_ibcs'],
  TUR: ['inf_kit', 'atgm_topattack', 'mlrs_precision', 'uav_loiter', 'uav_relay', 'ad_ibcs', 'ew_counterdrone'],
  UKR: ['mbt_cage', 'art_counterbattery', 'mlrs_precision', 'fpv_fibre', 'ew_counterdrone'],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const YEAR = 365.25 * 86400000;

export const hasTech = (n, id) => !id || !!n?.research?.done.has(id);
const eduPct = (n) => n.budget?.lines?.education?.value ?? 4;
export const eduBn = (n) => ((n.gdp ?? 0) * eduPct(n)) / 100;

// Research slots: one, plus one per doubling of education spending past `slotBn`.
export const slotsFor = (n) => clamp(1 + Math.floor(Math.log2(1 + eduBn(n) / RESEARCH.slotBn)), 1, RESEARCH.maxSlots);

// Days of progress each slot makes per day: education spending as a share of GDP and income per
// head (the depth of the engineering base) both count.
export function speedFor(n) {
  const perCapita = n.wt?.gdpPerCapita ?? (n.pop > 0 ? (n.gdp * 1000) / n.pop : 10000);
  return clamp(0.45 + 0.3 * Math.min(1.6, eduPct(n) / 4.5) + 0.25 * Math.min(1.6, perCapita / 40000), 0.4, 1.4);
}

// Cost multiplier for researching ahead of a technology's year.
export const aheadOf = (t, time) => 1 + RESEARCH.ahead * Math.max(0, (Date.UTC(t.year, 0, 1) - time) / YEAR);
export const costOf = (t, time) => t.days * aheadOf(t, time);

function recompute(R) {
  R.bonus = Object.fromEntries(CLASS_IDS.map((c) => [c, 0]));
  R.mods = { ...MODS };
  for (const id of R.done) {
    const t = TECH[id];
    for (const [c, v] of Object.entries(t.quality ?? {})) R.bonus[c] += v;
    for (const [k, v] of Object.entries(t.mods ?? {})) R.mods[k] += v;
  }
  R.mods.ewResist = Math.min(0.8, R.mods.ewResist);
  R.mods.jamResist = Math.min(0.8, R.mods.jamResist);
}

function grant(R, id) {
  if (R.done.has(id)) return;
  for (const r of TECH[id].req) grant(R, r);
  R.done.add(id);
}

export function seedResearch(n) {
  const R = n.research = { done: new Set(), progress: {}, slots: [], bonus: {}, mods: {}, auto: true };
  for (const id of STARTING[n.iso3] ?? []) grant(R, id);
  recompute(R);
  fitSlots(n);
  return R;
}

function fitSlots(n) {
  const R = n.research, k = slotsFor(n);
  // Losing slots to a smaller education budget drops the last projects; their progress is kept.
  while (R.slots.length < k) R.slots.push(null);
  R.slots.length = k;
}

export const isActive = (R, id) => R.slots.includes(id);
export const canResearch = (R, id) => !!TECH[id] && !R.done.has(id) && TECH[id].req.every((r) => R.done.has(r));

// Starts `id` in slot `i`; returns why not, or null.
export function startResearch(n, i, id) {
  const R = n.research;
  if (!R) return 'No research.';
  fitSlots(n);
  if (i < 0 || i >= R.slots.length) return 'No such research slot.';
  const t = TECH[id];
  if (!t) return 'No such technology.';
  if (R.done.has(id)) return `${t.name} is already researched.`;
  if (isActive(R, id)) return `${t.name} is already being researched.`;
  const missing = t.req.filter((r) => !R.done.has(r));
  if (missing.length) return `Research ${missing.map((r) => TECH[r].name).join(' and ')} first.`;
  R.slots[i] = id;
  return null;
}

// Stops a slot's project. Progress is kept, so picking it up again carries on.
export function cancelResearch(n, i) {
  const R = n.research;
  if (R && i >= 0 && i < R.slots.length) R.slots[i] = null;
}

// The first empty slot, or -1.
export const freeSlot = (n) => { fitSlots(n); return n.research.slots.indexOf(null); };

// One day: each slot advances its project; finished ones apply. Returns the ids completed today.
export function researchDay(n, time) {
  const R = n.research;
  if (!R) return [];
  fitSlots(n);
  const speed = speedFor(n), done = [];
  for (let i = 0; i < R.slots.length; i++) {
    const id = R.slots[i];
    if (!id) continue;
    const t = TECH[id];
    R.progress[id] = (R.progress[id] ?? 0) + speed / aheadOf(t, time);
    if (R.progress[id] >= t.days) {
      R.done.add(id);
      delete R.progress[id];
      R.slots[i] = null;
      done.push(id);
    }
  }
  if (done.length) recompute(R);
  return done;
}

// Days a project still needs at the current speed.
export const daysLeft = (n, id, time) => Math.ceil(Math.max(0, TECH[id].days - (n.research.progress[id] ?? 0)) * aheadOf(TECH[id], time) / speedFor(n));

// How much a technology is worth to a nation: class improvements (more for classes its army uses),
// models it could build, and modifiers.
export function techValue(n, t, uses = null) {
  let v = 0;
  for (const [c, q] of Object.entries(t.quality ?? {})) v += q * (uses ? (uses[c] ? 1 : 0.3) : 1);
  for (const id of t.unlocks) {
    const m = MODELS.find((x) => x.id === id);
    if (m.makers.includes(n.iso3) || m.makers.includes('*')) v += 0.12 * m.q;
  }
  const M = t.mods ?? {};
  v += (M.ewResist ?? 0) * 0.3 + (M.jamResist ?? 0) * 0.3 + (M.recon ?? 0) + (M.cdrone ?? 0) + (M.aa ?? 0) - (M.ammoUse ?? 0) * 0.5;
  return v;
}

// The AI fills every empty slot with the technology worth most per day of work. Prerequisites
// count for what they lead to, so a nation works its way toward a model it can build.
export function autoResearch(n, time, uses = null) {
  const R = n.research;
  if (!R) return [];
  fitSlots(n);
  const started = [];
  for (let i = 0; i < R.slots.length; i++) {
    if (R.slots[i]) continue;
    let best = null, bestScore = 0;
    for (const t of TECHS) {
      if (!canResearch(R, t.id) || isActive(R, t.id)) continue;
      let value = techValue(n, t, uses);
      for (const u of TECHS) if (u.req.includes(t.id) && !R.done.has(u.id)) value += 0.5 * techValue(n, u, uses);
      const score = value / Math.max(1, costOf(t, time) - (R.progress[t.id] ?? 0));
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (!best) break;
    R.slots[i] = best.id;
    started.push(best.id);
  }
  return started;
}

// The quality map division stats are rated by: the stock's rating in each class (production.js)
// raised by the nation's class improvements, with the explicit modifiers alongside under `mods`.
export function ratings(n) {
  const P = n.production, R = n.research;
  const out = { mods: R?.mods ?? MODS };
  for (const c of CLASS_IDS) out[c] = (P?.quality?.[c] ?? 1) * (1 + (R?.bonus?.[c] ?? 0));
  return out;
}

// One line per effect, for the research screen.
export function effectsOf(t) {
  const out = [];
  for (const [c, v] of Object.entries(t.quality ?? {})) out.push(`${CLASSES[c].name} +${pct(v)}`);
  for (const [k, v] of Object.entries(t.mods ?? {})) out.push(MOD_TEXT[k](v));
  return out;
}
