// UNDERLORD's economy: a sector-based national-accounts model, settled once a month.
//
// GDP is measured on the production side, as the value added of eight sectors plus net product
// taxes. Each sector has productive capacity (real gross output a year at full use), runs at a
// utilisation set by demand, and is held back by shortages of energy, metals, food and labour.
// The expenditure side (C + I + G + X − M) is computed independently; the difference between the
// two is inventory change, so the ledger always reconciles. Shocks act on state variables
// (capacity, trade access, prices, labour) rather than subtracting from GDP directly.
//
// Units: real values are $bn a year at 2025 prices and 2025 exchange rates, so a country starts
// with real GDP equal to its nominal dollar GDP. `P` is the domestic price level and `xr` the
// exchange rate (local currency per dollar), both 1 at the start; dollar GDP is real × P ÷ xr.
// Public debt is held in local currency at that scale plus a dollar-denominated share.
//
// The model is calibrated so that, with nothing changed, each country keeps its starting growth,
// inflation, unemployment and policy rate. Every response function is a game estimate.

import { ECONOMIES, EURO, PEGGED, MACRO, estimateEconomy } from '../data/economies.js';
import { CITIES } from '../data/places.js';
import { rng, haversine } from '../util/geo.js';
import { immigrationMonth } from './immigration.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DAY = 86400000;
const UN = 0.8; // normal capacity utilisation
const DEPREC = 0.05; // capital depreciation, a year
export const OUT_PER_FACTORY = 1.05; // $bn of defence-industry gross output a year per military factory
const BN_PER_FACTORY = 3; // matches PRODUCTION.bnPerFactory: one factory per $3bn of defence budget
const MAX_FACTORIES = 160; // matches PRODUCTION.maxFactories

export const SECTORS = [
  { id: 'agriculture', name: 'Agriculture', va: 0.45, labor: 4, gap: 0.15, capOut: 1.6, dep: { energy: 0.15, metals: 0.02 }, makes: 'food' },
  { id: 'mining', name: 'Mining', va: 0.55, labor: 0.7, gap: 0.3, capOut: 3, dep: { energy: 0.2 }, makes: 'metals' },
  { id: 'energy', name: 'Energy & utilities', va: 0.45, labor: 0.4, gap: 0.3, capOut: 3.2, dep: { metals: 0.05 }, makes: 'energy' },
  { id: 'manufacturing', name: 'Manufacturing', va: 0.3, labor: 1.3, gap: 1.4, capOut: 1.5, dep: { energy: 0.35, metals: 0.45 } },
  { id: 'defence', name: 'Defence industry', va: 0.4, labor: 1.5, gap: 0, capOut: 1.6, dep: { energy: 0.25, metals: 0.55 } },
  { id: 'construction', name: 'Construction', va: 0.4, labor: 2, gap: 1.8, capOut: 0.8, dep: { energy: 0.15, metals: 0.3 } },
  { id: 'technology', name: 'Technology', va: 0.55, labor: 0.55, gap: 0.9, capOut: 2.2, dep: { energy: 0.15, metals: 0.08 } },
  { id: 'services', name: 'Services', va: 0.62, labor: 1, gap: 0.6, capOut: 2.4, dep: { energy: 0.08, food: 0.08 } },
];
export const SECTOR = Object.fromEntries(SECTORS.map((s) => [s.id, s]));

// val: domestic demand at start, as a share of GDP. house: households' share of that demand.
// cpi: weight in consumer prices.
export const COMMODITIES = {
  energy: { name: 'Energy', val: 0.06, house: 0.3, cpi: 0.08, sector: 'energy' },
  metals: { name: 'Metals & minerals', val: 0.025, house: 0, cpi: 0.02, sector: 'mining' },
  food: { name: 'Food', val: 0.05, house: 0.8, cpi: 0.12, sector: 'agriculture' },
};
export const COMMODITY_IDS = Object.keys(COMMODITIES);

// Budget lines by economic nature. Everything else is government consumption.
const INVEST_LINES = ['infrastructure', 'housing'];
const TRANSFER_LINES = ['pensions', 'immigrantAssistance'];
const ABROAD_LINES = ['foreignAid'];

// ------------------------------------------------------------------------------------- laws
// mods: invPriv/invPub (investment), tfp (productivity growth, points a year), cons (consumption),
// natU (natural unemployment, points), wage (wage pressure, points of inflation), inflP (price
// pressure), cred (central-bank credibility), risk (bond risk premium, points), conv (share of
// manufacturing capacity converted to arms production each month), steer (credit steered to
// strategic sectors), exportCtl (share of commodity surpluses kept at home), capCtl (capital
// controls), manual (you set the policy rate), monetize (share of new borrowing bought by the
// central bank), peg. stab/ws/pp feed the political model.
export const LAWS = [
  { id: 'model', name: 'Economic model', options: [
    { id: 'liberal', name: 'Market liberalism', desc: 'Light regulation and open capital markets. Private investment and productivity rise; insecurity costs stability.', mods: { invPriv: 0.1, tfp: 0.15, invPub: -0.1, natU: 0.5, stab: -3 } },
    { id: 'mixed', name: 'Mixed economy', desc: 'Markets with a regulating, redistributing state.', mods: {} },
    { id: 'state', name: 'State-led development', desc: 'State banks steer credit into strategic industry. Public investment goes further; productivity growth slows.', mods: { invPriv: -0.08, invPub: 0.25, steer: 0.3, tfp: -0.15, stab: 2, pp: 0.1 } },
    { id: 'war', name: 'War economy', desc: 'Planners convert civilian industry to arms production, ration consumption and control prices.', mods: { conv: 0.025, cons: -0.07, invPriv: -0.15, inflP: 1.5, natU: -1.2, ws: 6, stab: -4 }, req: (g, n) => (g.warsOf(n.index).length || n.warSupport >= 60 ? null : 'Needs a war or 60% war support.') },
  ] },
  { id: 'labor', name: 'Labour market', options: [
    { id: 'flexible', name: 'Flexible', desc: 'Easy hiring and firing. Lower structural unemployment and wage pressure; less security.', mods: { natU: -0.8, wage: -0.3, tfp: 0.05, stab: -2 } },
    { id: 'standard', name: 'Regulated', desc: 'Collective bargaining within statutory protections.', mods: {} },
    { id: 'protected', name: 'Protected', desc: 'Strong unions and job security. Higher wages and stability, slower adjustment.', mods: { natU: 1, wage: 0.4, tfp: -0.05, stab: 2 } },
  ] },
  { id: 'exports', name: 'Strategic exports', options: [
    { id: 'open', name: 'Open', desc: 'Energy, metals and food are sold wherever buyers pay most.', mods: {} },
    { id: 'controls', name: 'Export controls', desc: 'Licences hold back part of each commodity surplus. Cheaper at home, tighter abroad.', mods: { exportCtl: 0.35, pp: 0.05 } },
    { id: 'ban', name: 'Export ban', desc: 'Strategic commodities stay at home. Producers cut output; world prices jump.', mods: { exportCtl: 0.9, stab: 1, pp: 0.1 } },
  ] },
  { id: 'monetary', name: 'Central bank', options: [
    { id: 'independent', name: 'Independent', desc: 'Sets rates by rule to hit its inflation target. Markets trust it.', mods: { cred: 0.15 } },
    { id: 'directed', name: 'Government-directed', desc: 'You set the policy rate. Markets discount its promises.', mods: { cred: -0.1, manual: 1 } },
    { id: 'financing', name: 'Monetary financing', desc: 'You set the rate and the central bank buys most new government debt. Cheap borrowing, dear prices.', mods: { cred: -0.3, manual: 1, monetize: 0.6 } },
    { id: 'ecb', name: 'European Central Bank', desc: 'Rates are set in Frankfurt for the whole euro area.', mods: { cred: 0.15 }, locked: true },
  ] },
  { id: 'currency', name: 'Exchange rate', options: [
    { id: 'float', name: 'Floating', desc: 'The market sets the rate; reserves only smooth swings.', mods: {} },
    { id: 'managed', name: 'Managed peg', desc: 'Reserves hold the rate steady. If they run out, the peg breaks.', mods: { peg: 1 } },
    { id: 'controls', name: 'Capital controls', desc: 'Limits on moving money abroad steady the currency but deter investors.', mods: { capCtl: 0.6, invPriv: -0.05, risk: 0.5 } },
    { id: 'euro', name: 'Euro', desc: 'A shared currency with the rest of the euro area.', mods: {}, locked: true },
  ] },
  { id: 'fiscal', name: 'Fiscal rule', options: [
    { id: 'none', name: 'Discretion', desc: 'No binding limit on borrowing.', mods: {} },
    { id: 'rule', name: 'Deficit rule', desc: 'A 3% of GDP deficit ceiling lowers borrowing costs. Breaking it costs political power.', mods: { risk: -0.3, limit: 3 } },
    { id: 'brake', name: 'Debt brake', desc: 'A constitutional 0.5% ceiling makes debt cheap. Breaking it costs stability and political power.', mods: { risk: -0.6, limit: 0.5 } },
  ] },
];
const LAW = Object.fromEntries(LAWS.map((l) => [l.id, l]));
export const lawOption = (lawId, optId) => LAW[lawId]?.options.find((o) => o.id === optId);
const LAW_PP = 80;
const LAW_COOLDOWN = 90;

function lawMods(laws) {
  const m = {};
  for (const [lawId, optId] of Object.entries(laws)) {
    const mods = lawOption(lawId, optId)?.mods ?? {};
    for (const k in mods) m[k] = (m[k] ?? 0) + mods[k];
  }
  return m;
}

// ------------------------------------------------------------------------------- construction
// gain: share of the sector's capacity added. Costs scale with the sector, so a project means the
// same thing to a small economy and a large one.
export const PROJECTS = {
  militaryFactory: { name: 'Military factory', factories: 1, days: 180, desc: '+1 military factory' },
  militaryComplex: { name: 'Military complex', factories: 5, days: 420, desc: '+5 military factories' },
  civilianFactory: { name: 'Civilian factory', sector: 'manufacturing', gain: 0.01, days: 180, desc: '+1% manufacturing capacity' },
  civilianComplex: { name: 'Civilian complex', sector: 'manufacturing', gain: 0.05, days: 420, desc: '+5% manufacturing capacity' },
  offices: { name: 'Offices', sector: 'services', gain: 0.01, days: 180, city: true, desc: '+1% services capacity · city only' },
  officeComplex: { name: 'Office complex', sector: 'services', gain: 0.05, days: 420, city: true, desc: '+5% services capacity · city only' },
  airports: { name: 'Airports', sector: 'services', gain: 0.004, all: 0.002, facilities: { airports: 1 }, days: 240, desc: 'Air transport · +0.2% capacity nationwide' },
  infrastructure: { name: 'Infrastructure', all: 0.006, days: 240, desc: '+0.6% capacity nationwide' },
  powerGenerator: { name: 'Power generator', sector: 'energy', gain: 0.04, days: 180, desc: '+4% energy output' },
  nuclearGenerator: { name: 'Nuclear generator', sector: 'energy', gain: 0.1, days: 540, desc: '+10% energy output' },
  dockyards: { name: 'Dockyards', sector: 'manufacturing', gain: 0.01, facilities: { dockyards: 1 }, days: 240, desc: '+1 dockyard · +1% manufacturing capacity' },
  dockyardComplex: { name: 'Dockyard complex', sector: 'manufacturing', gain: 0.05, facilities: { dockyards: 5 }, days: 540, desc: '+5 dockyards · +5% manufacturing capacity' },
  powerGrid: { name: 'Power grid', sector: 'energy', gain: 0.02, all: 0.002, days: 300, desc: '+2% energy output · +0.2% capacity nationwide' },
  // Modern-day buildings, after the Hearts of Iron IV construction list and its present-day mods:
  // what a state builds when it is preparing for a war it has not started yet.
  refinery: { name: 'Oil refinery', sector: 'energy', gain: 0.02, facilities: { refineries: 1 }, days: 330, desc: '+40 kt of fuel a day · +2% energy output' },
  synthFuel: { name: 'Synthetic fuel plant', sector: 'energy', gain: 0.01, capital: 0.002, facilities: { synth: 1 }, days: 600, desc: '+25 kt of fuel a day without crude · +1% energy output' },
  fuelDepot: { name: 'Fuel depot', capital: 0.0005, facilities: { silos: 1 }, days: 150, desc: '+8 days of fuel storage' },
  railYard: { name: 'Rail yard', all: 0.003, capital: 0.001, facilities: { railYards: 1 }, days: 270, desc: '+4% supply throughput · +0.3% capacity nationwide' },
  researchCampus: { name: 'Research campus', sector: 'technology', gain: 0.015, city: true, facilities: { campuses: 1 }, days: 420, desc: '+6% research speed · +1.5% technology capacity · city only' },
  dataCentre: { name: 'Data centre', sector: 'technology', gain: 0.02, facilities: { dataCentres: 1 }, days: 240, desc: '+3% research speed · +2% technology capacity' },
  airDefence: { name: 'Air defence network', capital: 0.0025, facilities: { airDefence: 1 }, days: 300, desc: 'Blunts enemy air support over your own ground' },
  desalination: { name: 'Desalination plant', sector: 'agriculture', gain: 0.03, capital: 0.0008, days: 330, desc: '+3% farm output and food self-sufficiency' },
  miningComplex: { name: 'Mining complex', sector: 'mining', gain: 0.04, days: 390, desc: '+4% mining output and metals self-sufficiency' },
};
export const MAX_PROJECTS = 12;

function projectSpec(E, kind) {
  const p = PROJECTS[kind];
  if (p.factories) return { cost: p.factories * OUT_PER_FACTORY * SECTOR.defence.capOut };
  let cost = 0;
  if (p.sector) {
    const s = E.sectors[p.sector];
    cost += s.cap * p.gain * SECTOR[p.sector].va * SECTOR[p.sector].capOut;
  }
  const civilianVA = () => Object.values(E.sectors).reduce((t, s) => t + (s.id === 'defence' ? 0 : s.cap * SECTOR[s.id].va), 0);
  if (p.all) cost += civilianVA() * p.all * 2.2;
  // `capital` buys something that is not sector capacity — storage, track, launchers — so it is
  // priced against the economy without adding to it.
  if (p.capital) cost += civilianVA() * p.capital * 2.2;
  return { cost: Math.max(0.01, cost) };
}

// ------------------------------------------------------------------------------- creation
const pct = (s) => { const m = /(-?\d+(?:\.\d+)?)/.exec(s ?? ''); return m ? Number(m[1]) : null; };

export function createEconomy(n, fx0 = {}) {
  const base = ECONOMIES[n.iso3] ?? estimateEconomy(n);
  const wt = n.wt ?? {};
  const macro = MACRO[n.iso3];
  if (macro && wt.inflation == null) [n.inflation, n.interest, n.unemployment] = macro;
  const Y0 = Math.max(0.05, n.gdp);
  const perCap = wt.gdpPerCapita ?? (Y0 * 1000) / Math.max(0.01, n.pop);
  const rich = clamp(Math.log10(Math.max(300, perCap) / 1000) / Math.log10(60), 0, 1);
  const euro = EURO.has(n.iso3);
  const laws = { model: 'mixed', labor: 'standard', exports: 'open', monetary: 'independent', currency: PEGGED.has(n.iso3) ? 'managed' : 'float', fiscal: 'none', ...base.laws };
  if (euro) { laws.monetary = 'ecb'; laws.currency = 'euro'; }

  // Defence industry: one factory per $3bn of defence budget, each making $1.05bn a year.
  const defPct = n.budget?.lines.military.value ?? n.defPct ?? 1.5;
  const milFunded = (Y0 * defPct) / 100 / BN_PER_FACTORY;
  const tP0 = 0.06; // net product taxes, share of GDP
  const vaTotal = Y0 * (1 - tP0);
  const defVA = Math.min(vaTotal * 0.15, milFunded * OUT_PER_FACTORY * SECTOR.defence.va);
  let shares = [...base.sec];
  const sum6 = shares.reduce((a, b) => a + b, 0);
  const room = 100 - (defVA / vaTotal) * 100 - 15; // services keep at least 15%
  if (sum6 > room) shares = shares.map((v) => (v * room) / sum6);
  const civil = ['agriculture', 'mining', 'energy', 'manufacturing', 'construction', 'technology'];
  const vaOf = { defence: defVA };
  civil.forEach((id, i) => (vaOf[id] = (shares[i] / 100) * vaTotal));
  vaOf.services = vaTotal - Object.values(vaOf).reduce((a, b) => a + b, 0);

  // Labour: employment per $bn of value added, calibrated to the starting unemployment rate.
  const u0 = clamp(n.unemployment ?? 6, 0.5, 45);
  const LF0 = Math.max(0.01, n.pop * clamp(0.42 + rich * 0.1, 0.35, 0.55));
  const rawL = {};
  for (const s of SECTORS) rawL[s.id] = s.labor * (s.id === 'agriculture' ? 1 + 2.5 * (1 - rich) : 1) * vaOf[s.id];
  const rawSum = Object.values(rawL).reduce((a, b) => a + b, 0) || 1;
  const k = (LF0 * (1 - u0 / 100)) / rawSum;

  const g0 = n.growth ?? 2;
  const gTrend = clamp(g0, -10, 10) / 100;
  let tfp0 = gTrend > 0 ? 0.35 * gTrend : 0.5 * gTrend;
  let gK = gTrend - tfp0;
  if (gK + DEPREC < 0.01) { gK = 0.01 - DEPREC; tfp0 = gTrend - gK; }

  // Expenditure shares at start (of real GDP).
  const lines = n.budget?.lines ?? {};
  const lv = (id) => lines[id]?.value ?? 0;
  const other = n.budget?.other ?? 0;
  const consLines = Object.keys(lines).filter((id) => !INVEST_LINES.includes(id) && !TRANSFER_LINES.includes(id) && !ABROAD_LINES.includes(id));
  let G0 = (consLines.reduce((t, id) => t + lv(id), 0) + other) / 100;
  const Ig0 = INVEST_LINES.reduce((t, id) => t + lv(id), 0) / 100;
  const T0 = TRANSFER_LINES.reduce((t, id) => t + lv(id), 0) / 100;
  const Ip0 = Math.max(0.05, base.inv / 100 - Ig0);
  const X0 = clamp(base.exp, 1, 150) / 100;
  let M0 = (base.imp ?? base.exp * 1.04) / 100;
  let C0 = 1 - G0 - Ig0 - Ip0 - X0 + M0;
  if (C0 < 0.35) { M0 += 0.35 - C0; C0 = 0.35; }
  if (C0 > 0.8) { M0 -= C0 - 0.8; C0 = 0.8; }

  // Commodities: domestic demand is 1 unit at start; production is the self-sufficiency ratio.
  const comm = {};
  let Xc0 = 0, Mc0 = 0;
  COMMODITY_IDS.forEach((c, i) => {
    const val = c === 'food' ? 0.03 + 0.09 * (1 - rich) : COMMODITIES[c].val;
    const self = base.self[i];
    const net = (1 - self) * val; // + import, − export, share of GDP
    if (net > 0) Mc0 += net; else Xc0 -= net;
    comm[c] = { self, val, dem: 1, prod: self, imp: Math.max(0, 1 - self), exp: Math.max(0, self - 1), r: 1, sellFrac: 1, stock: 1, stockCap: 1, price: 1, ration: 0 };
  });
  const Xg0 = Math.max(0.02, X0 - Xc0);
  const Mg0 = Math.max(0.02, M0 - Mc0);
  // Keep the identity C + I + G + X − M = 1 after the goods/commodity split.
  C0 = 1 - G0 - Ig0 - Ip0 - (Xg0 + Xc0) + (Mg0 + Mc0);

  const sectors = {};
  const capW = {};
  for (const s of SECTORS) capW[s.id] = s.id === 'defence' ? 0 : vaOf[s.id] * s.capOut;
  const capWSum = Object.values(capW).reduce((a, b) => a + b, 0);
  for (const s of SECTORS) {
    const Q0 = vaOf[s.id] / s.va;
    const alpha = capW[s.id] / capWSum;
    const I0 = Ip0 * Y0 * alpha;
    const cap = s.id === 'defence' ? milFunded * 1.08 * OUT_PER_FACTORY : Q0 / UN;
    sectors[s.id] = {
      id: s.id, cap, cap0: cap, Q: Q0, Q0, VA: vaOf[s.id], VA0: vaOf[s.id], U: UN, inMult: 1,
      L: k * rawL[s.id], lam: (k * rawL[s.id]) / Math.max(1e-9, vaOf[s.id]), lp: 1,
      alpha, I: I0, I0, kappa: alpha > 0 ? ((gK + DEPREC) * cap) / I0 : 0, sub: 0, growth: g0,
    };
  }

  // Taxes: headline rates from WatchTower where known. Revenue split at start (% of GDP).
  const spend0 = n.budget ? Object.values(lines).reduce((t, l) => t + l.value, 0) + other : 30;
  const tax = {
    income: clamp(pct(wt.tax?.topIncome) ?? (rich > 0.6 ? 42 : 30), 0, 70),
    corporate: clamp(pct(wt.tax?.corporate) ?? (rich > 0.6 ? 24 : 25), 0, 50),
    consumption: clamp(pct(wt.tax?.vat) || (n.iso3 === 'USA' ? 7 : rich > 0.6 ? 20 : 12), 0, 30),
  };
  const debtPct = n.debt ?? 50;
  const target = base.tgt;
  const pi0 = n.inflation ?? 3;
  const i0 = n.interest ?? pi0 + 1;
  const safe = n.iso3 === 'JPN' ? 230 : n.iso3 === 'USA' ? 110 : rich > 0.6 ? 90 : 50;
  const risk0 = riskPremium({ debtRatio: debtPct, deficit: base.def, pi: pi0, target, safe, lawRisk: lawMods(laws).risk ?? 0, reserveCcy: n.iso3 === 'USA', restr: 0, war: 0, defaultMem: 0 });
  const yld0 = Math.max(0.2, i0 + 0.6 + risk0);
  const rD0 = Math.max(0.2, yld0 * 0.72);
  const rFx0 = Math.max(0.5, 5 + 0.6 * risk0) * 0.8;
  const interest0 = (debtPct * (rD0 * (1 - base.fx) + rFx0 * base.fx)) / 100;
  // The starting budget total included interest; keep it in its own account from here on.
  if (n.budget) {
    n.budget.other = Math.max(0, n.budget.other - interest0);
    // Interest is a transfer to bondholders, not government consumption: C absorbs the difference.
    const G1 = (consLines.reduce((t, id) => t + lv(id), 0) + n.budget.other) / 100;
    C0 += G0 - G1;
    G0 = G1;
  }
  const primary0 = n.budget ? Object.values(lines).reduce((t, l) => t + l.value, 0) + n.budget.other : spend0 - interest0;
  const rev0 = Math.max(5, primary0 + interest0 - base.def);
  const rent0 = Math.min(rev0 * 0.75, 0.55 * (vaOf.energy + vaOf.mining * 0.5) / Y0 * 100 * (base.self[0] > 1.3 ? 1 : 0.2));
  const tariffRev0 = (base.tariff / 100) * Mg0 * 0.8 * 100;
  const aid0 = base.aid ?? 0;
  const restRev = Math.max(2, rev0 - rent0 - tariffRev0 - aid0);
  const rev = { aid: aid0, income: restRev * 0.42, consumption: restRev * 0.3, corporate: restRev * 0.12, other: restRev * 0.16, rent: rent0, tariff: tariffRev0 };
  const imports0 = (Mg0 + Mc0) * Y0;
  const lm = lawMods(laws);
  const cred0 = clamp((rich > 0.6 ? 0.75 : 0.5) + (lm.cred ?? 0) - 0.01 * Math.max(0, pi0 - target - 5), 0.08, 0.95);
  const popG = clamp(((wt.fertility ?? 2.1) - 2.0) * 1.1 + 0.25 + (rich > 0.6 ? 0.2 : 0), -0.8, 3);

  const E = {
    euro, laws, laws0: { ...laws }, lawCooldown: {}, lawMods0: lm,
    rich, sectors, comm, Y0, Y: Y0, Ystar: Y0, Yprev: Y0, AD: Y0, gap: 0, gTrend, tfp0, g0,
    fx0: { growth: fx0.growth ?? 0, infl: fx0.infl ?? 0 },
    shares0: { C: C0, Ip: Ip0, Ig: Ig0, G: G0, T: T0, Xg: Xg0, Mg: Mg0, Xc: Xc0, Mc: Mc0, tP: tP0 },
    spend0: { infra: lv('infrastructure'), education: lv('education'), health: lv('health') },
    eduS: lv('education'),
    acc: null,
    LF0, LF: LF0, lfIdx: 1, popG, u0, u: u0, k, soldiers0: null, held0: null, uMin: Math.max(1.2, u0 * 0.35),
    P: 1, pi: pi0, pi0, anchor: pi0, target, cred: cred0, cred0, vatShock: 0, tariffShock: 0,
    i: i0, i0, iSet: i0, rStar: i0 - pi0 - 0.5 * (pi0 - target), rReal0: i0 - pi0, taylor: i0,
    xr: 1, rxHist: [1], reserves: base.res ?? imports0 / 3, safe, risk0, risk: risk0, yld: yld0, rD: rD0, rFx: rFx0, mat: base.mat,
    fxShare: base.fx, debtLoc: (debtPct / 100) * Y0 * (1 - base.fx), debtFx: (debtPct / 100) * Y0 * base.fx, defaultMem: 0,
    tax, tax0: { ...tax }, taxCooldown: {}, tariff: base.tariff, tariff0: base.tariff,
    rev0: rev, revPct: rev0, deficit: base.def, deficit0: base.def, interestPct: interest0, monetized: 0,
    // The baseline split, so the budget and finance tabs read correctly before the first month runs.
    revParts: [['Foreign aid', rev.aid], ['Income tax', rev.income], ['Consumption tax', rev.consumption], ['Corporate tax', rev.corporate], ['Resource rents', rev.rent], ['Tariffs', rev.tariff], ['Other revenue', rev.other]],
    // Spending and the external accounts at the starting position: no subsidies, war operations,
    // migration programmes or construction projects are running yet, so spending is the budget itself.
    spendPct: Object.values(lines).reduce((t, l) => t + l.value, 0) + (n.budget?.other ?? 0),
    subsidyPct: 0, warOps: 0, migrationSpend: 0, constrRatio: 1, projSpendPct: 0,
    imports: (Mg0 + Mc0) * Y0, ca: ((Xg0 + Xc0 - Mg0 - Mc0) * Y0 - (debtPct / 100) * Y0 * base.fx * rFx0 / 100) / Y0 * 100, pressure: 0,
    ka0: null, ca0: null, restr0: 0, restr: 0, sanctionLoss: 0,
    milCap: milFunded * 1.08, milFunded, milUsed: milFunded, milFactories: Math.max(1, Math.min(MAX_FACTORIES, Math.round(milFunded))), milLimit: 'budget',
    projects: [], completedSites: [],
    facilities: { airports: 0, dockyards: 0, refineries: 0, synth: 0, silos: 0, railYards: 0, campuses: 0, dataCentres: 0, airDefence: 0 },
    nextProject: 1, aiTimer: 0, warMonths: 0, peaceMonths: 0,
    hist: [], growth: g0, alerts: [], lawFx: { stab: 0, ws: 0, pp: 0 }, ruleBroken: false, devalued: false,
    inflParts: [], growthParts: [], months: 0, r: rng(9173 + n.index * 31),
    boosts: [], // timed effects from events: { kind, c, until, v }
  };
  E.lawFx = lawPolitics(E);
  return E;
}

function riskPremium({ debtRatio, deficit, pi, target, safe, lawRisk, reserveCcy, restr, war, defaultMem }) {
  return 0.035 * Math.max(0, debtRatio - safe) + 0.12 * Math.max(0, deficit - 3) + 0.08 * Math.max(0, pi - target - 1)
    + (reserveCcy ? -0.5 : 0) + lawRisk + 2 * restr + war + defaultMem;
}

function lawPolitics(E) {
  const m = lawMods(E.laws);
  const fx = { stab: m.stab ?? 0, ws: m.ws ?? 0, pp: m.pp ?? 0 };
  if (E.ruleBroken) { fx.pp -= 0.25; if (E.laws.fiscal === 'brake') fx.stab -= 2; }
  return fx;
}

// --------------------------------------------------------------------------------- the world
// Commodity prices, world demand, world inflation and interest rates, and the euro area.
export function createWorldEconomy(g) {
  const W = { prices: { energy: 1, metals: 1, food: 1 }, priceHist: [], ratio0: null, gap: 0, piW: 3, iW: 4, pW: 1, months: 0, shocks: [] };
  g.econ = W;
  worldAggregates(g, W, true);
  return W;
}

function worldAggregates(g, W, first = false) {
  let gw = 0, piw = 0, iw = 0, gapw = 0;
  const live = g.live().filter((n) => n.econ);
  for (const n of live) { gw += n.gdp; piw += n.gdp * n.econ.pi; iw += n.gdp * n.econ.i; gapw += n.gdp * n.econ.gap; }
  W.gdp = gw;
  W.piW = gw ? piw / gw : 3;
  W.iW = gw ? iw / gw : 4;
  W.gap = gw ? gapw / gw : 0;
  // Commodity balance: what importers want against what exporters can sell.
  const ratio = {};
  for (const c of COMMODITY_IDS) {
    let want = 0, offer = 0;
    for (const n of live) {
      const k = n.econ.comm[c], scale = k.val * n.econ.Y0;
      want += Math.max(0, k.dem - k.prod) * scale;
      offer += k.exp * scale;
    }
    ratio[c] = want / Math.max(1e-6, offer);
  }
  if (first || !W.ratio0) W.ratio0 = ratio;
  W.ratio = ratio;
  // Sanctions: the share of world output that has cut a country off, and what sanctioning costs.
  for (const n of live) {
    let r = 0, loss = 0;
    for (const m of n.sanctionedBy ?? []) r += (g.nations[m]?.gdp ?? 0) / Math.max(1, gw);
    for (const t of live) if (t.sanctionedBy?.has(n.index)) loss += t.gdp / Math.max(1, gw);
    n.econ.restr = clamp(r * 1.5, 0, 0.8);
    n.econ.sanctionLoss = clamp(loss * 0.6, 0, 0.5);
    if (first) n.econ.restr0 = n.econ.restr;
  }
  // The euro area: one policy rate, one exchange rate.
  const ez = live.filter((n) => n.econ.euro);
  if (ez.length) {
    let w = 0, pi = 0, gap = 0, i0 = 0, press = 0;
    for (const n of ez) { w += n.gdp; pi += n.gdp * n.econ.pi; gap += n.gdp * n.econ.gap; i0 += n.gdp * n.econ.i0; press += n.gdp * (n.econ.pressure ?? 0); }
    pi /= w; gap /= w; i0 /= w; press /= w;
    if (!W.euro) {
      W.euro = { i: i0, i0, rStar: i0 - pi - 0.5 * (pi - 2), xr: 1 };
      for (const n of ez) { const E = n.econ; E.i = E.i0 = E.iSet = i0; E.rReal0 = i0 - E.pi0; }
    }
    const EZ = W.euro;
    EZ.pi = pi; EZ.gap = gap;
    if (!first) {
      const iT = EZ.rStar + pi + 0.5 * (pi - 2) + 0.5 * gap * 100;
      EZ.i = Math.max(-0.5, EZ.i + 0.2 * (iT - EZ.i));
      EZ.rStar += (1 - EZ.rStar) / 120;
      EZ.xr *= Math.exp(-0.005 * press + (pi - W.piW) / 1200);
    }
  }
}

function worldMonth(g) {
  const W = g.econ;
  W.months++;
  worldAggregates(g, W);
  W.pW *= 1 + W.piW / 1200;
  W.shocks = W.shocks.filter((s) => s.until > g.time);
  for (const c of COMMODITY_IDS) {
    let target = (W.ratio[c] / Math.max(1e-6, W.ratio0[c])) ** 2.5; // short-run supply and demand are inelastic
    for (const s of W.shocks) if (s.c === c) target *= s.mult;
    target = clamp(target, 0.35, 4.5);
    W.prices[c] += 0.3 * (target - W.prices[c]);
  }
  W.priceHist.push({ ...W.prices });
  if (W.priceHist.length > 24) W.priceHist.shift();
}

// A world commodity shock: `mult` on the price for `days` (e.g. a closed strait).
export function worldShock(g, c, mult, days) { g.econ.shocks.push({ c, mult, until: g.time + days * DAY }); }

// ---------------------------------------------------------------------------------- monthly
export function economyMonth(g) {
  if (!g.econ) createWorldEconomy(g);
  worldMonth(g);
  const soldiers = g.uniformedAll?.();
  for (const n of g.live()) if (n.econ) settle(g, n, soldiers?.[n.index]);
}

function settle(g, n, soldiers) {
  const E = n.econ, W = g.econ, S = E.sectors, sh = E.shares0;
  E.months++;
  const first = E.months === 1;
  const lm = lawMods(E.laws), l0 = E.lawMods0;
  const d = (k) => (lm[k] ?? 0) - (l0[k] ?? 0);
  const fx = g.effects(n);
  const dGrowth = (fx.growth ?? 0) - E.fx0.growth;
  const dInfl = (fx.infl ?? 0) - E.fx0.infl;
  const atWar = g.warsOf(n.index).length > 0;
  if (first) E.war0 = atWar;
  const warD = (atWar ? 1 : 0) - (E.war0 ? 1 : 0); // wars under way at the start are in the baseline
  E.boosts = E.boosts.filter((b) => b.until > g.time);
  const boost = (kind, c) => E.boosts.reduce((t, b) => t + (b.kind === kind && (!c || b.c === c) ? b.v : 0), 0);
  const lines = n.budget.lines;
  const lv = (id) => lines[id]?.value ?? 0;

  // ---- labour force: trend growth, participation, mobilisation and occupation
  if (E.held0 == null && n.held) E.held0 = n.held;
  const occ = E.held0 ? clamp(1 - n.held / E.held0, -0.5, 0.95) : 0;
  const capFactor = occ >= 0 ? 1 - 0.85 * occ : Math.min(1.5, 1 - 0.6 * occ);
  E.occupied = Math.max(0, occ);
  E.lfIdx *= 1 + E.popG / 1200;
  immigrationMonth(g, n, E.popG / 1200);
  if (soldiers != null && E.soldiers0 == null) E.soldiers0 = soldiers;
  E.mobilised = soldiers != null ? Math.max(0, soldiers - E.soldiers0) / 1e6 : 0;
  const part = 1 + 0.004 * (lv('health') - E.spend0.health) - 0.0015 * (E.tax.income - E.tax0.income);
  E.LF = Math.max(0.005, (E.LF0 * E.lfIdx * part + (n.immigration?.laborDelta ?? 0)) * (1 - 0.8 * Math.max(0, occ)) - E.mobilised);

  // ---- potential output
  for (const s of SECTORS) if (s.id !== 'defence') S[s.id].capEff = S[s.id].cap * capFactor;
  const Ystar = SECTORS.reduce((t, s) => t + (s.id === 'defence' ? S.defence.VA : s.va * S[s.id].capEff * UN), 0) / (1 - sh.tP);
  const Yprev = E.Y * (1 + E.gTrend / 12);
  const B = 0.6 * Ystar + 0.4 * Yprev; // the income households and firms plan on

  const comp = (E.xr * W.pW) / Math.max(0.05, E.P); // real exchange rate: higher = cheaper exports
  const rReal = E.i - E.anchor;
  if (E.stab0 == null) E.stab0 = n.stability;
  const stabD = n.stability - E.stab0;
  E.migrationSpend = n.immigration?.spending ?? 0;
  const otherSpend = (n.budget.other ?? 0) + E.migrationSpend;
  const subsidyPct = (SECTORS.reduce((t, s) => t + S[s.id].sub * 0.04 * S[s.id].VA, 0) / Math.max(1e-6, E.Y)) * 100;
  const warOps = 1.5 * warD;
  const consPct = Object.keys(lines).filter((id) => !INVEST_LINES.includes(id) && !TRANSFER_LINES.includes(id) && !ABROAD_LINES.includes(id)).reduce((t, id) => t + lv(id), 0) + otherSpend + warOps;
  const invPct = INVEST_LINES.reduce((t, id) => t + lv(id), 0);
  const transPct = TRANSFER_LINES.reduce((t, id) => t + lv(id), 0) + subsidyPct * 0.5;

  // ---- tax revenue responds to rates (% of GDP)
  const r0 = E.rev0, t = E.tax, t0 = E.tax0;
  const ratio = (a, b, e) => (b > 0 ? (Math.max(0, a) / b) ** e : 1 + a / 20);
  const revInc = r0.income * ratio(t.income, t0.income, 0.35);
  const revCons = r0.consumption * ratio(t.consumption, t0.consumption, 0.9);
  const revCorp = r0.corporate * ratio(t.corporate, t0.corporate, 0.7);
  const hhTax = revInc + revCons, hhTax0 = r0.income + r0.consumption;

  // Terms of trade: commodity exporters gain income when world prices rise; importers lose it.
  let tot = 0;
  for (const c of COMMODITY_IDS) { const k = E.comm[c]; tot += (W.prices[c] - 1) * (k.exp - k.imp) * k.val; }

  // ---- expenditure side (real $bn a year)
  const demandShift = 1 + 0.008 * dGrowth;
  const restrD = E.restr - E.restr0;
  const riskD = E.risk - E.risk0;
  const consMult = (1 - 0.005 * (rReal - E.rReal0)) * (1 + 0.0008 * stabD) * (1 + d('cons')) * (1 - 0.5 * (1 - E.comm.food.r)) * demandShift;
  const disp = (1 - hhTax / 100 + transPct / 100 + tot) / (1 - hhTax0 / 100 + sh.T);
  const C = sh.C * B * disp * consMult * (n.immigration?.demandMultiplier ?? 1);
  const invMult = clamp(1 - 0.02 * (rReal - E.rReal0) - 0.012 * (t.corporate - t0.corporate) + 0.3 * E.gap + 0.001 * stabD + d('invPriv') - 0.15 * warD - 0.4 * restrD - 0.03 * riskD + boost('invest'), 0.3, 1.8) * demandShift;
  const Ip = sh.Ip * B * invMult;
  const Ig = (invPct / 100) * B;
  const G = (consPct / 100) * B;
  const retaliation = (0.6 * Math.max(0, E.tariff - E.tariff0)) / 100;
  const X = sh.Xg * Ystar * (1 + 0.8 * W.gap) * comp ** 0.6 * (1 - 0.8 * restrD) * (1 - retaliation) * (1 - E.sanctionLoss) * demandShift;
  const absorb = C + Ip + Ig + G;
  const absorb0 = sh.C + sh.Ip + sh.Ig + sh.G;
  const tariffF = ((1 + E.tariff / 100) / (1 + E.tariff0 / 100)) ** -2;
  const Mg = sh.Mg * B * ((absorb + 0.4 * X) / B / (absorb0 + 0.4 * sh.Xg)) * comp ** -0.5 * tariffF * (1 - 0.6 * restrD);

  // ---- commodities, in units of starting domestic demand; $ value = units × val × Y0
  const impAccess = clamp(1 - 0.7 * restrD + boost('access'), 0, 1);
  const expAccess = clamp(1 - 0.65 * restrD, 0, 1); // some cargoes still find buyers
  const exportCtl = Math.max(0, d('exportCtl'));
  const fxAvail = lm.peg || lm.capCtl ? clamp(E.reserves / Math.max(1e-6, (E.imports ?? Infinity) / 12), 0.4, 1) : 1;
  const C0abs = sh.C * E.Y0;
  let Xc = 0, Mc = 0, xcNom = 0, mcNom = 0;
  for (const c of COMMODITY_IDS) {
    const k = E.comm[c], src = S[COMMODITIES[c].sector];
    let use = 0, w = 0;
    for (const s of SECTORS) { const dep = s.dep[c]; if (!dep) continue; use += dep * S[s.id].Q; w += dep * S[s.id].Q0; }
    const house = COMMODITIES[c].house;
    k.dem = ((1 - house) * (w ? use / w : 1) + (house * (E.Cprev ?? C0abs)) / C0abs) * W.prices[c] ** -0.06 * (1 - k.ration);
    const want = UN * (1 + 0.3 * E.gap) * (1 + 0.05 * (W.prices[c] - 1));
    const potential = (k.self * (src.capEff * want)) / src.Q0;
    const sellable = Math.max(0, potential - k.dem) * expAccess * (1 - exportCtl);
    const sold = Math.min(potential, k.dem + sellable);
    k.prod = sold;
    k.sellFrac = potential > 0 ? sold / potential : 1;
    k.exp = Math.max(0, sold - k.dem);
    const got = Math.max(0, k.dem - sold) * impAccess * fxAvail;
    let supply = Math.min(sold, k.dem) + got;
    // Strategic stockpiles (months of demand) cover a shortfall and refill in good times.
    if (supply < k.dem && k.stock > 0) { const draw = Math.min(k.stock, 1 - supply / k.dem); k.stock -= draw; supply += draw * k.dem; }
    else if (k.stock < k.stockCap) k.stock = Math.min(k.stockCap, k.stock + 0.1);
    k.imp = got;
    k.r = clamp(supply / Math.max(1e-6, k.dem), 0, 1);
    k.price = W.prices[c] * (k.exp > 0 ? 1 - 0.5 * exportCtl : 1);
    const scale = k.val * E.Y0;
    Xc += k.exp * scale; Mc += k.imp * scale;
    xcNom += k.exp * scale * k.price; mcNom += k.imp * scale * W.prices[c];
  }
  const AD = C + Ip + Ig + G + X + Xc - Mg - Mc;
  const gap = clamp(AD / Ystar - 1, -0.35, 0.15);

  // ---- production
  let gsW = 0, vaW = 0;
  for (const s of SECTORS) if (s.id !== 'defence' && !s.makes && s.id !== 'construction') { gsW += s.gap * S[s.id].VA0; vaW += S[s.id].VA0; }
  const gsNorm = vaW ? gsW / vaW : 1;
  const investRatio = (Ip + Ig) / Math.max(1e-6, (sh.Ip + sh.Ig) * B);
  const constrDemand = UN * (1 + 1.5 * (investRatio - 1));
  const constrLimit = 0.97;
  E.constrRatio = constrDemand > constrLimit ? constrLimit / constrDemand : 1;
  for (const s of SECTORS) {
    const x = S[s.id];
    let inMult = 1;
    for (const c in s.dep) inMult -= 1.4 * s.dep[c] * (1 - E.comm[c].r);
    x.inMult = clamp(inMult, 0.15, 1);
    if (s.id === 'defence') continue;
    let U;
    if (s.id === 'construction') U = Math.min(constrLimit, constrDemand);
    else if (s.makes) U = UN * (1 + 0.3 * E.gap) * (1 + 0.05 * (W.prices[s.makes] - 1)) * E.comm[s.makes].sellFrac;
    else U = UN * (1 + (s.gap / gsNorm) * gap);
    x.U = clamp(U, 0.2, 0.98);
    x.Q = x.capEff * x.U * x.inMult;
  }

  // Defence industry: procurement funds factories; plant, inputs and labour bound them.
  E.milFunded = (n.gdp * lv('military')) / 100 / BN_PER_FACTORY;
  const capF = E.milCap * capFactor;
  let used = Math.min(E.milFunded, capF);
  E.milLimit = E.milFunded <= capF ? 'budget' : 'capacity';
  if (S.defence.inMult < 0.995) { used *= S.defence.inMult; E.milLimit = 'inputs'; }

  // Labour: the jobs this output needs; a shortage caps every sector.
  const lpStep = (E.gTrend - E.popG / 100 + (0.6 * dGrowth) / 100 + d('tfp') / 100 + (n.immigration?.productivity ?? 0)) / 12;
  let Ld = 0;
  for (const s of SECTORS) {
    const x = S[s.id];
    x.lp *= 1 + lpStep;
    x.Ldem = (x.lam * s.va * (s.id === 'defence' ? used * OUT_PER_FACTORY : x.Q)) / x.lp;
    Ld += x.Ldem;
  }
  const maxEmp = E.LF * (1 - E.uMin / 100);
  const lab = Ld > maxEmp ? maxEmp / Ld : 1;
  E.laborShort = 1 - lab;
  if (lab < 1) { used *= lab ** 0.7; if (E.milLimit === 'budget' && E.milFunded > 1) E.milLimit = 'labour'; }
  E.milUsed = used;
  E.milFactories = clamp(Math.round(used), 1, MAX_FACTORIES);
  S.defence.Q = used * OUT_PER_FACTORY;
  S.defence.U = capF > 0 ? used / capF : 0;
  S.defence.capEff = capF * OUT_PER_FACTORY;
  S.defence.cap = E.milCap * OUT_PER_FACTORY;
  let vaSum = 0;
  for (const s of SECTORS) {
    const x = S[s.id];
    if (lab < 1 && s.id !== 'defence') x.Q *= lab ** 0.7;
    x.VA = s.va * x.Q;
    x.L = x.Ldem * lab;
    vaSum += x.VA;
  }
  const tP = sh.tP * B * (C / Math.max(1e-6, sh.C * B)) * (t0.consumption > 0 ? t.consumption / t0.consumption : 1);
  const Y = vaSum + tP;
  const uNow = clamp((1 - Math.min(Ld, maxEmp) / E.LF) * 100, E.uMin, 60);
  E.u += 0.5 * (uNow - E.u);

  // ---- inflation: an anchor (expectations) plus pressures
  const uNat = E.u0 + d('natU');
  const wageP = 0.45 * (uNat - E.u) + d('wage') + 6 * E.laborShort;
  // Pass-through is year on year: a one-off jump in import prices raises inflation for twelve
  // months, then drops out. Only real depreciation counts; the drift that tracks inflation is
  // already in the anchor.
  const rx12 = E.rxHist[0];
  const importShare = sh.Mg + sh.Mc;
  const importP = (comp / rx12 - 1) * 100 * (0.1 + 0.5 * importShare);
  let commodityP = 0, shortP = 0;
  const ph = W.priceHist.length > 12 ? W.priceHist[W.priceHist.length - 13] : null;
  for (const c of COMMODITY_IDS) {
    const k = E.comm[c];
    const w = COMMODITIES[c].cpi * (c === 'food' ? 1 + (1 - E.rich) : 1);
    commodityP += w * (k.price / (ph?.[c] ?? 1) - 1) * 100;
    shortP += (c === 'food' ? 30 : c === 'energy' ? 14 : 4) * (1 - k.r);
  }
  const demandP = 0.35 * gap * 100 + 2 * Math.max(0, 1 - E.constrRatio);
  E.vatShock *= 0.85;
  E.tariffShock *= 0.92;
  if (first) E.mon0 = E.monetized;
  const moneyP = 2.5 * (E.monetized - E.mon0);
  const controls = E.laws.model === 'war' ? 0.7 : 1;
  const parts = [
    ['Expectations', E.anchor],
    ['Demand', demandP * controls],
    ['Wages', wageP * controls],
    ['Currency', importP],
    ['Commodities', commodityP],
    ['Shortages', shortP],
    ['Taxes & tariffs', E.vatShock + E.tariffShock],
    ['Money printing', moneyP],
    ['Other pressures', dInfl + d('inflP') + boost('infl')],
  ];
  const piTarget = parts.reduce((s, p) => s + p[1], 0);
  E.pi += 0.35 * (clamp(piTarget, -5, 400) - E.pi);
  E.inflParts = parts;
  const credT = clamp(E.cred0 + d('cred') - 0.01 * Math.max(0, E.pi - E.target - 8), 0.05, 0.95);
  E.cred += 0.1 * (credT - E.cred);
  E.anchor += E.cred * 0.025 * (E.target - E.anchor) + (1 - E.cred) * 0.04 * (E.pi - E.anchor);
  E.P *= 1 + E.pi / 1200;

  // ---- policy rate
  E.taylor = E.rStar + E.pi + 0.5 * (E.pi - E.target) + 0.5 * gap * 100;
  if (E.euro) E.i = W.euro.i;
  else if (lm.manual && n.index === g.player) E.i += 0.5 * (E.iSet - E.i);
  else {
    // A government-run central bank follows the rule half-heartedly; one financing the deficit
    // keeps money cheap (financial repression).
    const follow = E.laws.monetary === 'financing' ? 0.2 : E.laws.monetary === 'directed' ? 0.5 : 1;
    E.i = clamp(E.i + 0.2 * (E.i0 + follow * (E.taylor - E.i0) - E.i), -0.5, 150);
  }
  // A neutral rate implied by an extreme starting position (deep negative after an inflation
  // shock) normalises over about ten years.
  E.rStar += (clamp(E.rStar, 0.5, 6) - E.rStar) / 120;

  // ---- the public accounts (local currency)
  const NGDP = Y * E.P;
  const cyc = 1 + 0.9 * gap;
  let rentIdx = 0, rentBase = 0;
  for (const c of ['energy', 'metals']) { const k = E.comm[c]; rentIdx += k.prod * k.price * k.val; rentBase += k.self * k.val; }
  const rentPct = r0.rent * (rentBase > 0 ? rentIdx / rentBase / Math.max(0.2, Y / E.Y0) : 1);
  const tariffPct = (E.tariff / 100) * (Mg / Y) * 0.8 * 100;
  // Foreign budget support is a fixed dollar sum, paid while the donors' commitment lasts.
  const aidPct = r0.aid && g.hasSpirit(n, 'western_aid') ? (r0.aid * E.Y0 * E.xr) / (Y * E.P) : 0;
  const revPct = (revInc + revCons + revCorp + r0.other) * cyc + rentPct + tariffPct + aidPct;
  E.revParts = [['Foreign aid', aidPct], ['Income tax', revInc * cyc], ['Consumption tax', revCons * cyc], ['Corporate tax', revCorp * cyc], ['Resource rents', rentPct], ['Tariffs', tariffPct], ['Other revenue', r0.other * cyc]];
  const interest = (E.debtLoc * E.rD + E.debtFx * E.xr * E.rFx) / 100; // a year
  const spendPct = Object.values(lines).reduce((s, l) => s + l.value, 0) + otherSpend + subsidyPct + warOps;
  const deficitAnnual = ((spendPct - revPct) / 100) * NGDP + interest;
  E.revPct = revPct; E.spendPct = spendPct; E.subsidyPct = subsidyPct; E.warOps = warOps;
  E.interestPct = (interest / NGDP) * 100;
  E.deficit = (deficitAnnual / NGDP) * 100;
  let need = deficitAnnual / 12;
  if (need > 0 && n.budget.reserve > 0) {
    const use = Math.min(n.budget.reserve * E.xr, need);
    n.budget.reserve -= use / E.xr;
    need -= use;
  }
  const mon = lm.monetize ?? 0;
  E.monetized = need > 0 ? ((need * mon * 12) / NGDP) * 100 : 0;
  const borrow = need > 0 ? need * (1 - mon) : need;
  // Dollar debt is priced off world rates plus part of the country's risk premium.
  const yFx = Math.max(0.5, W.iW + 1 + 0.6 * E.risk);
  if (borrow > 0) {
    const fxPart = borrow * E.fxShare;
    const loc = borrow - fxPart;
    E.rD = (E.rD * E.debtLoc + E.yld * loc) / Math.max(1e-6, E.debtLoc + loc);
    E.rFx = (E.rFx * E.debtFx + yFx * (fxPart / E.xr)) / Math.max(1e-6, E.debtFx + fxPart / E.xr);
    E.debtFx += fxPart / E.xr;
    E.debtLoc += loc;
  } else if (borrow < 0) E.debtLoc = Math.max(0, E.debtLoc + borrow);
  E.rD += (E.yld - E.rD) / E.mat; // maturing debt rolls over at today's yield
  E.rFx += (yFx - E.rFx) / E.mat;
  const debtRatio = ((E.debtLoc + E.debtFx * E.xr) / NGDP) * 100;
  E.defaultMem *= 0.97;
  E.risk = riskPremium({ debtRatio, deficit: E.deficit, pi: E.pi, target: E.target, safe: E.safe, lawRisk: lm.risk ?? 0, reserveCcy: n.iso3 === 'USA', restr: E.restr, war: atWar ? 1 : 0, defaultMem: E.defaultMem });
  if (first) E.risk0 = E.risk;
  E.risk = Math.min(E.risk, 40);
  E.yld = clamp(E.i + 0.6 + E.risk, 0.1, 200);
  E.ruleBroken = lm.limit != null && E.deficit > Math.max(lm.limit, E.deficit0) + 0.25 && !atWar;

  // ---- balance of payments and the exchange rate
  const extInterest = (E.debtFx * E.xr * E.rFx) / 100 / E.P; // real, like the trade flows
  const ca = ((X + xcNom - Mg - mcNom - extInterest) / Y) * 100;
  const rDiff = E.i - E.anchor - (W.iW - W.piW);
  if (first) { E.ca0 = ca; E.ka0 = -ca; E.rDiff0 = rDiff; }
  let ka = E.ka0 + 0.4 * (rDiff - E.rDiff0) - 1.5 * (E.risk - E.risk0) - 4 * restrD;
  if (lm.capCtl) ka = E.ka0 + (ka - E.ka0) * (1 - lm.capCtl);
  const pressure = ca + ka + boost('fxflow');
  E.ca = ca; E.pressure = pressure;
  E.imports = ((Mg + mcNom) * E.P) / E.xr;
  const usdGDP = NGDP / E.xr;
  if (E.euro) E.xr = W.euro.xr;
  else if (lm.peg) {
    E.reserves += ((pressure / 100) * usdGDP) / 12;
    E.xr *= 1 + Math.max(0, E.pi - W.piW - 4) / 1200; // a crawl when inflation runs well ahead
    if (E.reserves < (E.imports / 12) * 1.5) {
      E.xr *= 1.3;
      E.laws.currency = 'float';
      E.devalued = true;
      E.cred0 = Math.max(0.05, E.cred0 - 0.15);
      g.log(`${n.name}'s currency peg breaks: a 30% devaluation.`, { nation: n.index, kind: 'crisis', major: n.gdp > 300 });
    }
  } else {
    const smooth = E.reserves > (E.imports / 12) * 3 ? 0.25 : 0; // the central bank leans against swings
    E.reserves += ((smooth * pressure) / 100) * usdGDP / 12;
    E.xr *= Math.exp(-0.006 * pressure * (n.iso3 === 'USA' ? 0.3 : 1) * (1 - smooth) + (E.pi - W.piW) / 1200);
  }
  E.reserves = Math.max(0, E.reserves);
  E.xr = clamp(E.xr, 1e-3, 1e9);
  E.rxHist.push((E.xr * W.pW) / E.P);
  if (E.rxHist.length > 13) E.rxHist.shift();

  // ---- investment, construction, the arms industry
  const tfpYear = E.tfp0 + (0.6 * dGrowth) / 100 + d('tfp') / 100;
  const projSpend = runProjects(g, n, ((lv('infrastructure') / 100) * B * 0.7 * E.constrRatio) / 12);
  E.projSpendPct = ((projSpend * 12) / B) * 100;
  const generic = lv('infrastructure') - E.projSpendPct;
  E.eduS += (lv('education') - E.eduS) / 60;
  const tfpPub = (0.1 * (generic - E.spend0.infra) * (1 + d('invPub')) + 0.06 * (E.eduS - E.spend0.education)) / 100;
  const steer = d('steer');
  let capG = 0, capW = 0;
  for (const s of SECTORS) {
    if (s.id === 'defence') continue;
    const x = S[s.id];
    const prof = 1 + (0.8 * (x.U - UN)) / UN;
    const strategic = ['manufacturing', 'technology', 'energy', 'mining'].includes(s.id) ? steer : -0.3 * steer;
    x.I = Ip * x.alpha * prof * (1 + 0.35 * x.sub) * (1 + strategic);
    const before = x.cap;
    x.cap *= 1 + ((x.kappa * x.I) / x.cap - DEPREC + tfpYear + tfpPub) / 12;
    x.growth = ((x.cap / before) ** 12 - 1) * 100;
    capG += x.growth * x.VA; capW += x.VA;
  }
  // Arms makers expand when orders outrun plant; idle plant is mothballed. A war economy also
  // converts civilian factories to arms production.
  if (E.milFunded > E.milCap) E.milCap += 0.02 * (E.milFunded - E.milCap);
  else if (E.milFunded < 0.6 * E.milCap) E.milCap -= 0.005 * E.milCap;
  if (lm.conv && E.milFunded > E.milCap) {
    const m = S.manufacturing, take = m.cap * lm.conv;
    m.cap -= take;
    E.milCap += (take * 0.8) / OUT_PER_FACTORY;
  }

  // ---- record
  E.gap = gap; E.Ystar = Ystar; E.Cprev = C; E.AD = AD;
  E.acc = { C, I: Ip + Ig, Ip, Ig, G, X: X + Xc, M: Mg + Mc, Xc, Mc, inventories: Y - AD, tP };
  E.hist.push({ t: g.time, Y, pi: E.pi, u: E.u, debt: debtRatio, deficit: E.deficit, gdp: usdGDP, gap });
  if (E.hist.length > 72) E.hist.shift();
  const h = E.hist, m = h.length;
  const growth = m > 12 ? (Y / h[m - 13].Y - 1) * 100 : ((((Y / E.Y0) ** (12 / m) - 1) * 100) * m + E.g0 * (12 - m)) / 12;
  const gap12 = m > 12 ? h[m - 13].gap : 0;
  E.growthParts = [
    ['Productive capacity', capW ? capG / capW : 0],
    ['Demand', (gap - gap12) * 100 * (12 / Math.min(12, m))],
    ['Input shortages', (-100 * SECTORS.reduce((s2, s) => s2 + (1 - S[s.id].inMult) * S[s.id].VA, 0)) / Math.max(1e-6, vaSum)],
    ['Occupation', -85 * Math.max(0, occ)],
    ['Labour shortage', -70 * E.laborShort],
  ];
  if (!Number.isFinite(Y) || !Number.isFinite(usdGDP) || !Number.isFinite(E.pi)) throw new Error(`economy diverged in ${n.iso3}: Y ${Y} gdp ${usdGDP} pi ${E.pi} xr ${E.xr} P ${E.P}`);
  E.Y = Y;
  n.gdp = usdGDP;
  n.growth = growth;
  n.inflation = E.pi;
  n.unemployment = E.u;
  n.interest = E.i;
  n.debt = debtRatio;
  E.lawFx = lawPolitics(E);
  aiEconomy(g, n, atWar);
  E.alerts = alerts(n);
}

function runProjects(g, n, budget) {
  const E = n.econ;
  let spent = 0;
  for (const p of E.projects) {
    if (budget <= 0) break;
    const max = p.cost / (PROJECTS[p.kind].days / 30);
    const take = Math.min(max, budget, p.cost - p.paid);
    p.paid += take;
    p.rate = take / max;
    budget -= take;
    spent += take;
  }
  const done = E.projects.filter((p) => p.paid >= p.cost - 1e-9);
  for (const p of done) {
    completeProject(n, p);
    if (n.index === g.player) g.log(`${PROJECTS[p.kind].name} completed.`, { nation: n.index, kind: 'info' });
  }
  if (done.length) E.projects = E.projects.filter((p) => p.paid < p.cost - 1e-9);
  return spent;
}

function completeProject(n, p) {
  const E = n.econ, def = PROJECTS[p.kind];
  if (p.site) E.completedSites.push({ id: p.id, kind: p.kind, site: p.site });
  if (def.factories) E.milCap += def.factories;
  if (def.sector) {
    const x = E.sectors[def.sector];
    x.cap *= 1 + def.gain;
    // A commodity sector's new capacity raises self-sufficiency in the same proportion.
    for (const c of COMMODITY_IDS) if (COMMODITIES[c].sector === def.sector) E.comm[c].self *= 1 + def.gain;
  }
  if (def.all) for (const s of SECTORS) if (s.id !== 'defence') E.sectors[s.id].cap *= 1 + def.all;
  if (def.facilities) for (const [kind, count] of Object.entries(def.facilities)) E.facilities[kind] += count;
}

// City-only projects need a site. The capital is one for nearly every country; if it is not,
// queueProject refuses and the AI simply builds something else next month.
const capitalSite = (n) => (n.capital ? { lat: n.capital.lat, lon: n.capital.lon } : null);

function aiEconomy(g, n, atWar) {
  const E = n.econ;
  if (atWar) { E.warMonths++; E.peaceMonths = 0; } else { E.peaceMonths++; E.warMonths = 0; }
  if (n.index === g.player) return;
  if (atWar && !E.war0 && E.laws.model !== 'war' && n.warSupport >= 55 && E.warMonths >= 2) {
    E.laws.model = 'war';
    g.log(`${n.name} puts its economy on a war footing.`, { nation: n.index, kind: 'war', major: n.gdp > 500 });
  } else if (!atWar && E.laws.model === 'war' && E.laws0.model !== 'war' && E.peaceMonths >= 12) {
    E.laws.model = E.laws0.model;
  }
  if (n.gdp < 25 || E.projects.length >= 2 || E.r() > 0.3) return;
  let kind = 'civilianFactory';
  const fuel = n.fuel;
  const short = fuel && fuel.use > 0 && (fuel.ratio < 0.98 || fuel.stock < fuel.cap * 0.3);
  if ((atWar || n.warSupport > 60) && E.milFunded > E.milCap * 0.95) kind = 'militaryFactory';
  // A country burning more fuel than it can supply builds its way out: crude if it has any,
  // synthetic if it has none.
  else if (short) kind = E.comm.energy.self > 0.6 ? 'refinery' : E.r() < 0.6 ? 'synthFuel' : 'fuelDepot';
  else if (E.comm.energy.r < 0.99 || E.comm.energy.self < 0.5) kind = E.r() < 0.5 ? 'powerGenerator' : 'powerGrid';
  else if (atWar && E.r() < 0.3) kind = E.r() < 0.6 ? 'railYard' : 'airDefence';
  else if (E.comm.metals.self < 0.5 && E.r() < 0.25) kind = 'miningComplex';
  else if (E.comm.food.self < 0.6 && E.r() < 0.25) kind = 'desalination';
  else {
    const pick = E.r();
    const rich = (n.wt?.gdpPerCapita ?? 10000) > 25000;
    kind = pick < 0.45 ? 'civilianFactory' : pick < 0.6 ? 'infrastructure' : pick < 0.72 ? 'airports'
      : pick < 0.84 ? 'civilianComplex' : rich ? (pick < 0.92 ? 'dataCentre' : 'researchCampus') : 'civilianFactory';
  }
  queueProject(n, kind, kind === 'researchCampus' ? capitalSite(n) : null);
}

// ---------------------------------------------------------------------------------- alerts
function alerts(n) {
  const E = n.econ, out = [];
  if (n.growth < 0) out.push({ level: 'bad', text: `Recession: output ${n.growth.toFixed(1)}% on a year ago.` });
  if (E.pi > E.target + 4) out.push({ level: E.pi > E.target + 15 ? 'bad' : 'warn', text: `Inflation ${E.pi.toFixed(1)}% against a ${E.target}% target.` });
  if (E.u > E.u0 + 2) out.push({ level: 'warn', text: `Unemployment has risen to ${E.u.toFixed(1)}%.` });
  if (E.laborShort > 0.005) out.push({ level: 'warn', text: `Labour shortage: ${(E.laborShort * 100).toFixed(1)}% of jobs cannot be filled.` });
  if (E.yld > 8 || E.interestPct / Math.max(1, E.revPct) > 0.2) out.push({ level: 'bad', text: `Debt stress: borrowing costs ${E.yld.toFixed(1)}%, interest ${(E.interestPct / Math.max(1, E.revPct) * 100).toFixed(0)}% of revenue.` });
  for (const c of COMMODITY_IDS) if (E.comm[c].r < 0.985) out.push({ level: E.comm[c].r < 0.9 ? 'bad' : 'warn', text: `${COMMODITIES[c].name} shortage: ${((1 - E.comm[c].r) * 100).toFixed(0)}% of demand unmet.` });
  if (E.milLimit !== 'budget') out.push({ level: 'warn', text: `Arms production limited by ${E.milLimit === 'capacity' ? 'factory capacity' : E.milLimit === 'inputs' ? 'metal and energy shortages' : 'labour'}.` });
  if ((E.laws.currency === 'managed' || E.laws.currency === 'controls') && E.reserves < ((E.imports ?? 0) / 12) * 3) out.push({ level: 'warn', text: `Reserves cover ${(E.reserves / Math.max(1e-6, (E.imports ?? 1) / 12)).toFixed(1)} months of imports.` });
  if (E.ruleBroken) out.push({ level: 'warn', text: 'The fiscal rule is broken.' });
  if (E.occupied > 0.02) out.push({ level: 'bad', text: `${(E.occupied * 100).toFixed(0)}% of the country is occupied.` });
  return out;
}

// ------------------------------------------------------------------------------- player actions
const isPlayer = (g, n) => n.index === g.player;

export function cityForProject(n, kind, site) {
  if (!PROJECTS[kind]?.city || !site) return null;
  let nearest = null, distance = 45;
  for (const city of CITIES) {
    if (city.iso3 !== n.iso3) continue;
    const d = haversine(site, city);
    if (d < distance) { nearest = city; distance = d; }
  }
  return nearest;
}

export function queueProject(n, kind, site = null) {
  const E = n.econ;
  if (!PROJECTS[kind]) return 'Unknown project.';
  if (E.projects.length >= MAX_PROJECTS) return `At most ${MAX_PROJECTS} projects.`;
  const city = PROJECTS[kind].city ? cityForProject(n, kind, site) : null;
  if (PROJECTS[kind].city && !city) return `${PROJECTS[kind].name} must be built in a city.`;
  E.projects.push({ id: E.nextProject++, kind, paid: 0, rate: 0,
    site: city ? { lat: city.lat, lon: city.lon } : site, city: city?.name ?? null, ...projectSpec(E, kind) });
  return null;
}
export const projectCost = (n, kind) => projectSpec(n.econ, kind).cost;
export function cancelProject(n, id) { n.econ.projects = n.econ.projects.filter((p) => p.id !== id); }
export function moveProject(n, id, dir) {
  const P = n.econ.projects, i = P.findIndex((p) => p.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= P.length) return;
  [P[i], P[j]] = [P[j], P[i]];
}

export function lawChangeState(g, n, lawId, optId) {
  const E = n.econ, law = LAW[lawId], opt = lawOption(lawId, optId);
  if (!isPlayer(g, n)) return 'Only your country can change its laws.';
  if (!law || !opt) return 'Unknown law.';
  if (E.laws[lawId] === optId) return 'Already in force.';
  if (opt.locked || lawOption(lawId, E.laws[lawId])?.locked) return E.euro ? 'Set for the whole euro area.' : 'Not available.';
  if ((E.lawCooldown[lawId] ?? 0) > g.time) return `Can change again in ${Math.ceil((E.lawCooldown[lawId] - g.time) / DAY)} days.`;
  const why = opt.req?.(g, n);
  if (why) return why;
  if (n.pp < LAW_PP) return `Needs ${LAW_PP} political power.`;
  return null;
}
export function changeLaw(g, n, lawId, optId) {
  const why = lawChangeState(g, n, lawId, optId);
  if (why) return why;
  const E = n.econ;
  E.laws[lawId] = optId;
  E.lawCooldown[lawId] = g.time + LAW_COOLDOWN * DAY;
  n.pp -= LAW_PP;
  E.lawFx = lawPolitics(E);
  g.log(`${n.name} adopts ${lawOption(lawId, optId).name.toLowerCase()} (${LAW[lawId].name.toLowerCase()}).`, { nation: n.index, kind: 'politics' });
  g.emit('nation', n);
  return null;
}
export const LAW_COST = { pp: LAW_PP, days: LAW_COOLDOWN };

export const TAXES = [
  { id: 'income', name: 'Income tax', note: 'Top marginal rate', step: 1, min: 0, max: 70 },
  { id: 'corporate', name: 'Corporate tax', note: 'Headline rate', step: 1, min: 0, max: 50 },
  { id: 'consumption', name: 'Consumption tax', note: 'VAT or sales tax', step: 1, min: 0, max: 30 },
];
const POLICY_PP = 10;
const POLICY_DAYS = 30;
function policyState(g, n, key) {
  if (!isPlayer(g, n)) return 'Only your country can set policy.';
  if (n.pp < POLICY_PP) return `Needs ${POLICY_PP} political power.`;
  const cd = n.econ.taxCooldown[key] ?? 0;
  if (cd > g.time) return `Can change again in ${Math.ceil((cd - g.time) / DAY)} days.`;
  return null;
}
function spendPolicy(g, n, key) { n.pp -= POLICY_PP; n.econ.taxCooldown[key] = g.time + POLICY_DAYS * DAY; }

export function taxChangeState(g, n, id, dir) {
  const def = TAXES.find((t) => t.id === id);
  if (!def) return 'Unknown tax.';
  const v = n.econ.tax[id] + def.step * dir;
  if (v < def.min || v > def.max) return 'Limit reached.';
  return policyState(g, n, `tax:${id}`);
}
export function changeTax(g, n, id, dir) {
  const why = taxChangeState(g, n, id, dir);
  if (why) return why;
  const E = n.econ, def = TAXES.find((t) => t.id === id);
  E.tax[id] += def.step * dir;
  if (id === 'consumption') E.vatShock += 0.6 * def.step * dir * E.shares0.C;
  // Higher taxes are unpopular with the people who pay them.
  const pc = id === 'corporate' ? 'business' : 'labor';
  for (const p of n.powerCentres ?? []) if (p.type === pc) p.loyalty = clamp(p.loyalty - dir * 1.5, 0, 100);
  spendPolicy(g, n, `tax:${id}`);
  g.log(`${n.name} ${dir > 0 ? 'raises' : 'cuts'} ${def.name.toLowerCase()} to ${E.tax[id]}%.`, { nation: n.index, kind: 'politics' });
  return null;
}

export function tariffChangeState(g, n, dir) {
  const v = n.econ.tariff + 2.5 * dir;
  if (v < 0 || v > 60) return 'Limit reached.';
  return policyState(g, n, 'tariff');
}
export function changeTariff(g, n, dir) {
  const why = tariffChangeState(g, n, dir);
  if (why) return why;
  const E = n.econ;
  E.tariff += 2.5 * dir;
  E.tariffShock += 2.5 * dir * (E.shares0.Mg) * 0.6;
  spendPolicy(g, n, 'tariff');
  g.log(`${n.name} sets its average tariff to ${E.tariff}%.`, { nation: n.index, kind: 'politics', major: n.gdp > 2000 });
  return null;
}

export function rateChangeState(g, n, dir) {
  const E = n.econ;
  if (!lawMods(E.laws).manual) return E.euro ? 'The European Central Bank sets the rate.' : 'The independent central bank sets the rate. Change the central bank law to direct it.';
  if (E.iSet + 0.25 * dir < -0.5) return 'Limit reached.';
  if (!isPlayer(g, n)) return 'Only your country can set policy.';
  if (n.pp < 2) return 'Needs 2 political power.';
  return null;
}
export function changeRate(g, n, dir, step = 0.25) {
  const why = rateChangeState(g, n, dir);
  if (why) return why;
  n.econ.iSet = Math.max(-0.5, n.econ.iSet + step * dir);
  n.pp -= 2;
  return null;
}

export function subsidyChangeState(g, n, id, dir) {
  const x = n.econ.sectors[id];
  if (!x || id === 'defence') return 'Unknown sector.';
  if (x.sub + dir < 0 || x.sub + dir > 3) return 'Limit reached.';
  return policyState(g, n, `sub:${id}`);
}
export function changeSubsidy(g, n, id, dir) {
  const why = subsidyChangeState(g, n, id, dir);
  if (why) return why;
  n.econ.sectors[id].sub += dir;
  spendPolicy(g, n, `sub:${id}`);
  return null;
}

// ------------------------------------------------------------------------------- integration
// Debt changes from events and decisions, in points of GDP. Large write-downs are defaults.
export function adjustDebt(n, pts) {
  const E = n.econ;
  if (!E) { n.debt = Math.max(0, n.debt + pts); return; }
  const NGDP = E.Y * E.P;
  const delta = (pts / 100) * NGDP;
  if (delta >= 0) E.debtLoc += delta;
  else {
    const D = E.debtLoc + E.debtFx * E.xr;
    const k = D > 0 ? Math.max(0, 1 + delta / D) : 1;
    E.debtLoc *= k; E.debtFx *= k;
    if (pts <= -20) E.defaultMem = 4;
  }
  n.debt = ((E.debtLoc + E.debtFx * E.xr) / NGDP) * 100;
}

// Economic aid: the donor borrows it, the recipient's treasury receives dollars.
export function transferAid(P, T, bn) {
  if (P.econ) adjustDebt(P, (bn / P.gdp) * 100);
  T.budget.reserve += bn;
}

// Effects from events and decisions: { rate, law: [lawId, optId], reserves (months of imports),
// stock (months of commodities), ration: [commodity, days], access: [boost, days], invest: [v, days] }.
export function applyEconomyFx(g, n, fx) {
  const E = n.econ;
  if (!E) return;
  if (fx.rate) { E.i += fx.rate; E.iSet = E.i; }
  if (fx.law) { E.laws[fx.law[0]] = fx.law[1]; E.lawFx = lawPolitics(E); }
  if (fx.reserves) E.reserves += (E.imports ?? 0) / 12 * fx.reserves;
  if (fx.stock) for (const c of COMMODITY_IDS) E.comm[c].stock = Math.max(0, E.comm[c].stock + fx.stock);
  if (fx.ration) { E.comm[fx.ration[0]].ration = 0.12; E.boosts.push({ kind: 'ration', c: fx.ration[0], v: 0.12, until: g.time + fx.ration[1] * DAY }); }
  if (fx.access) E.boosts.push({ kind: 'access', v: fx.access[0], until: g.time + fx.access[1] * DAY });
  if (fx.invest) E.boosts.push({ kind: 'invest', v: fx.invest[0], until: g.time + fx.invest[1] * DAY });
  if (fx.fxflow) E.boosts.push({ kind: 'fxflow', v: fx.fxflow[0], until: g.time + fx.fxflow[1] * DAY });
}

// Rationing ends when its timer does.
export function dailyEconomy(g, n) {
  const E = n.econ;
  if (!E) return;
  for (const c of COMMODITY_IDS) if (E.comm[c].ration && !E.boosts.some((b) => b.kind === 'ration' && b.c === c && b.until > g.time)) E.comm[c].ration = 0;
}

// Stability from material conditions the old indicators miss: hunger and blackouts.
export function economyStab(n) {
  const E = n.econ;
  if (!E) return 0;
  return -30 * (1 - E.comm.food.r) - 10 * (1 - E.comm.energy.r);
}

// The share of GDP each sector produces, in display order.
export function sectorShares(n) {
  const E = n.econ;
  const total = SECTORS.reduce((t, s) => t + E.sectors[s.id].VA, 0) || 1;
  return SECTORS.map((s) => ({ ...s, x: E.sectors[s.id], share: (E.sectors[s.id].VA / total) * 100 }));
}

export const nominalGDP = (n) => n.econ ? n.econ.Y * n.econ.P : n.gdp;
