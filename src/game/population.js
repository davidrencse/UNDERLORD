// Population: a single-year cohort model, so a country's people age, die and are born instead of
// being one frozen number.
//
// The method is the demographers' cohort-component one. Every nation carries 101 single-year
// cohorts (ages 0-100+) in thousands of people. Each month a twelfth of a year's worth of
// transitions is applied:
//
//   births   = Σ women(a) × ASFR(a)      ASFR is a fertility curve whose sum is the country's TFR
//   deaths   = Σ people(a) × q(a)        q comes from a Siler hazard fitted to life expectancy
//   ageing   = a twelfth of each cohort moves up one year
//   migration= net migrants spread over working ages
//
// Starting cohorts are reconstructed from the World Bank age bands in public/data/demographics.json
// (0-14, 15-64, 65+), then shaped by the country's own fertility and life expectancy, so a young
// high-fertility country and an old low-fertility one of the same size begin with different
// pyramids. See docs/demographics-data.md for the data and its limits.
//
// Manpower is drawn off this pyramid rather than off total population: the recruitable pool is the
// 18-45 band, and the conscription law says what share of it the state may call up.

import { CONSCRIPTION, CONSCRIPTION_PP, LAW_INDEX, lawOf } from '../data/conscription.js';

export const MAX_AGE = 100;
const AGES = MAX_AGE + 1;
const MONTH = 1 / 12;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Recruitable band, and the share of each age that is female.
const FIRST_SERVICE = 18;
const LAST_SERVICE = 45;
const femaleShare = (a) => 0.487 + clamp((a - 45) * 0.0022, 0, 0.09);

// ------------------------------------------------------------------ mortality
// Siler hazard: infant mortality that falls away, a flat accident risk, and senescence that
// climbs exponentially. One scale factor is fitted per country to match observed life expectancy.
function hazard(a, k) {
  const infant = 0.055 * Math.exp(-1.1 * a);
  const accident = 0.0007;
  const senescent = 0.000035 * Math.exp(0.0917 * a);
  return k * (infant + accident + senescent);
}

function lifeTable(k) {
  const q = new Float64Array(AGES);
  for (let a = 0; a < AGES; a++) q[a] = clamp(1 - Math.exp(-hazard(a, k)), 0, 1);
  q[MAX_AGE] = 1; // closed out: nobody survives past the open-ended top cohort
  return q;
}

function expectancy(q) {
  let l = 1, e = 0;
  for (let a = 0; a < AGES; a++) {
    const next = l * (1 - q[a]);
    e += (l + next) / 2;
    l = next;
  }
  return e;
}

// Fit the hazard scale to a target life expectancy at birth.
function fitMortality(e0) {
  let lo = 0.05, hi = 20;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (expectancy(lifeTable(mid)) > e0) lo = mid; else hi = mid;
  }
  return lifeTable((lo + hi) / 2);
}

// ------------------------------------------------------------------ fertility
// A beta-shaped curve over ages 15-49 whose mean is the mean age at childbearing. Richer, longer-
// lived countries have children later; high-fertility countries have them earlier.
function fertilityCurve(tfr, e0) {
  const mac = clamp(26 + (e0 - 65) * 0.22 - (tfr - 2) * 1.1, 21, 34);
  const m = clamp((mac - 15) / 35, 0.08, 0.92);
  const c = 9;
  const p = c * m, qq = c * (1 - m);
  const w = new Float64Array(AGES);
  let sum = 0;
  for (let a = 15; a <= 49; a++) {
    const x = (a - 15 + 0.5) / 35;
    const d = Math.pow(x, p - 1) * Math.pow(1 - x, qq - 1);
    w[a] = d;
    sum += d;
  }
  if (sum > 0) for (let a = 15; a <= 49; a++) w[a] /= sum; // weights sum to one, so Σ ASFR = TFR
  return w;
}

// ------------------------------------------------------------------ starting pyramid
// Rebuild single-year cohorts from the three observed age bands. Within a band the density leans
// toward the neighbouring band's density, so the pyramid has no cliffs at 15 and 65, and the oldest
// ages fall away on the country's own mortality.
function startingCohorts(totalThousands, shares, q) {
  const [s1, s2, s3] = shares;
  const bands = [[0, 14, s1], [15, 64, s2], [65, MAX_AGE, s3]];
  const density = bands.map(([lo, hi, s]) => s / (hi - lo + 1));
  const pop = new Float64Array(AGES);
  bands.forEach(([lo, hi, share], i) => {
    const own = density[i];
    const prev = density[i - 1] ?? own;
    const next = density[i + 1] ?? own;
    let raw = 0;
    const tmp = new Float64Array(hi - lo + 1);
    for (let a = lo; a <= hi; a++) {
      const t = (a - lo) / Math.max(1, hi - lo); // 0 at the band's young edge, 1 at its old edge
      let d = own + (prev - own) * (1 - t) * 0.25 + (next - own) * t * 0.25;
      if (i === 2) d *= Math.exp(-(a - 65) * 0.085); // the open band thins out fast
      tmp[a - lo] = Math.max(d, 1e-6);
      raw += tmp[a - lo];
    }
    for (let a = lo; a <= hi; a++) pop[a] = (tmp[a - lo] / raw) * share * totalThousands;
  });
  void q;
  return pop;
}

// ------------------------------------------------------------------ state
const band = (d, key, fallback) => {
  const v = d?.[key]?.value;
  return Number.isFinite(v) ? v : fallback;
};

export function createPopulation(n) {
  const d = n.demographics;
  // Fallbacks keep every nation playable when the World Bank snapshot has no row for it.
  const young = band(d, 'ages0to14', 26);
  const old = band(d, 'ages65plus', 9);
  const workingAge = band(d, 'ages15to64', 100 - young - old);
  const total = young + workingAge + old;
  const shares = [young / total, workingAge / total, old / total];
  const tfr = clamp(band(d, 'fertility', 2.2), 0.6, 7.5);
  const e0 = clamp(band(d, 'lifeExpectancy', 72), 45, 90);
  const q = fitMortality(e0);
  const pop = startingCohorts(Math.max(1, n.pop * 1000), shares, q);
  const net = Number.isFinite(n.wt?.netMigration) ? n.wt.netMigration / 1000 : 0; // thousands a year
  const asfr = fertilityCurve(tfr, e0);
  // Annualised flows, so the first reading is honest before a month has been simulated.
  let births = 0, deaths = 0;
  for (let a = 15; a <= 49; a++) births += pop[a] * femaleShare(a) * asfr[a] * tfr;
  for (let a = 0; a < AGES; a++) deaths += pop[a] * q[a];
  return {
    pop, q, e0, tfr, tfrBase: tfr, asfr,
    netMigration: clamp(net, -n.pop * 2, n.pop * 2),
    births, deaths, warDead: 0, // annualised, for the UI
    lastCasualties: n.casualties ?? 0,
  };
}

export function createConscription(n) {
  // Democracies at peace sit on a volunteer force; conscript states and war economies start higher.
  const conscriptNow = /israel|korea|singapore|finland|greece|turkey|ukraine|russia/i.test(n.name);
  const key = conscriptNow ? 'limited' : n.ideology === 'dem' ? 'volunteer' : 'limited';
  return { law: key, changed: null, since: 0 };
}

// ------------------------------------------------------------------ monthly step
export function populationMonth(g, n) {
  const P = n.population;
  if (!P) return;
  const pop = P.pop;

  // Fertility moves with the country's condition: family policy lifts it, war and hardship push it
  // down. The effect is slow; a TFR does not turn around in a year.
  const policy = (n.demographicPolicy?.familyServices ?? 0) * 0.04 + (n.immigration?.fertility ?? 0);
  const strain = (g.warsOf(n.index).length ? 0.12 : 0) + Math.max(0, n.unemployment - 8) * 0.012
    + Math.max(0, n.inflation - 6) * 0.008;
  const target = clamp(P.tfrBase + policy - strain, 0.5, 8);
  P.tfr += (target - P.tfr) * 0.02;

  // Mortality rises with war exhaustion and falls as health spending holds up.
  const health = n.budget?.lines?.health?.pct ?? null;
  const mortMult = 1 + (n.exhaustion ?? 0) * 0.004 - (health ? clamp((health - 5) * 0.01, -0.03, 0.05) : 0);

  let births = 0, deaths = 0;
  for (let a = 15; a <= 49; a++) births += pop[a] * femaleShare(a) * P.asfr[a] * P.tfr;
  births *= MONTH;

  for (let a = 0; a < AGES; a++) {
    const die = pop[a] * P.q[a] * mortMult * MONTH;
    pop[a] -= die;
    deaths += die;
  }

  // Combat deaths come out of the serving ages, not out of the pyramid as a whole.
  const casualties = n.casualties ?? 0;
  const fallen = Math.max(0, casualties - P.lastCasualties);
  P.lastCasualties = casualties;
  if (fallen > 0) {
    let pool = 0;
    for (let a = FIRST_SERVICE; a <= LAST_SERVICE; a++) pool += pop[a] * (1 - femaleShare(a));
    if (pool > 0) {
      const take = Math.min(fallen, pool * 0.5);
      for (let a = FIRST_SERVICE; a <= LAST_SERVICE; a++) pop[a] -= take * (pop[a] * (1 - femaleShare(a))) / pool;
      P.warDead = take;
      deaths += take;
    }
  }

  // Net migration lands on the working ages, weighted toward the young end.
  const migrants = (P.netMigration + (n.immigration?.netAnnual ?? 0)) * MONTH;
  if (migrants) {
    let w = 0;
    for (let a = 18; a <= 45; a++) w += 46 - a;
    for (let a = 18; a <= 45; a++) pop[a] = Math.max(0, pop[a] + migrants * ((46 - a) / w));
  }

  // Everyone a twelfth of a year older; the top cohort is open-ended.
  const top = pop[MAX_AGE] + pop[MAX_AGE - 1] * MONTH;
  for (let a = MAX_AGE - 1; a > 0; a--) pop[a] += (pop[a - 1] - pop[a]) * MONTH;
  pop[MAX_AGE] = top;
  pop[0] += births - pop[0] * MONTH;

  P.births = births * 12;
  P.deaths = deaths * 12;

  let total = 0;
  for (let a = 0; a < AGES; a++) total += pop[a];
  n.pop = total / 1000; // millions, the unit the rest of the game uses
}

// ------------------------------------------------------------------ readings
export function ageBands(n) {
  const pop = n.population?.pop;
  if (!pop) return { young: 0, working: 0, old: 0 };
  let young = 0, working = 0, old = 0;
  for (let a = 0; a <= 14; a++) young += pop[a];
  for (let a = 15; a <= 64; a++) working += pop[a];
  for (let a = 65; a < AGES; a++) old += pop[a];
  return { young, working, old };
}

export function medianAge(n) {
  const pop = n.population?.pop;
  if (!pop) return 0;
  let total = 0;
  for (let a = 0; a < AGES; a++) total += pop[a];
  let seen = 0;
  for (let a = 0; a < AGES; a++) {
    seen += pop[a];
    if (seen >= total / 2) return a + 0.5 - (seen - total / 2) / Math.max(1e-9, pop[a]);
  }
  return MAX_AGE;
}

export const dependencyRatio = (n) => {
  const b = ageBands(n);
  return b.working > 0 ? (b.young + b.old) / b.working : 0;
};

// Civilians available to work, in thousands: the working-age band less those in uniform.
export function labourForce(n) {
  const b = ageBands(n);
  const serving = (n.divisions ?? 0) * 15;
  return Math.max(0, b.working * 0.66 - serving);
}

// The pool a draft can reach: ages 18-45, men in full and women by the law's own share.
export function recruitablePool(n) {
  const pop = n.population?.pop;
  if (!pop) return n.pop * 1000 * 0.3;
  const law = lawOf(n.conscription?.law);
  let pool = 0;
  for (let a = FIRST_SERVICE; a <= LAST_SERVICE; a++) {
    const f = femaleShare(a);
    pool += pop[a] * ((1 - f) + f * law.female);
  }
  return pool;
}

// The manpower ceiling in thousands, as HOI4 does it: a share of the recruitable pool, moved a
// little by how willing the country is to fight.
export function manpowerCap(n) {
  const law = lawOf(n.conscription?.law);
  const willing = 0.75 + (n.warSupport ?? 50) / 200;
  return recruitablePool(n) * law.share * willing;
}

// Daily refill toward the ceiling. An exhausted country refills more slowly.
export function manpowerTick(n, current) {
  const cap = manpowerCap(n);
  const rate = 0.004 * clamp(1 - (n.exhaustion ?? 0) / 60, 0.25, 1);
  if (current >= cap) return Math.max(cap, current - (current - cap) * 0.01);
  return Math.min(cap, current + (cap - current) * rate + cap * 0.0004);
}

// What the law costs the country, folded into the ordinary modifier bag.
export function conscriptionFx(n) {
  const law = lawOf(n.conscription?.law);
  return { stab: law.stab, ws: law.ws, growth: law.growth, pp: 0, infl: 0 };
}

export const conscriptionTraining = (n) => lawOf(n.conscription?.law).training;
export const conscriptionFactories = (n) => lawOf(n.conscription?.law).factories;

// ------------------------------------------------------------------ changing the law
export function conscriptionBlocker(g, n, key) {
  const law = lawOf(key);
  const at = LAW_INDEX.get(n.conscription?.law ?? 'volunteer');
  const to = LAW_INDEX.get(key);
  if (to === at) return 'Already in force.';
  if (Math.abs(to - at) > 1) return 'The country can only move one step at a time.';
  const atWar = g.warsOf(n.index).length > 0;
  if (to > at) {
    if ((n.warSupport ?? 0) < law.needWs) return `Needs ${law.needWs}% war support.`;
    if (!law.peacetimeDemocracy && !atWar && n.ideology === 'dem') return 'A democracy will not go this far short of war.';
  }
  return null;
}

export function setConscription(g, n, key) {
  if (conscriptionBlocker(g, n, key)) return false;
  n.conscription.law = key;
  n.conscription.changed = g.time;
  return true;
}

// Decisions offered to the player, in the same shape as the rest of the decision list.
export function conscriptionDecisions(n) {
  const at = LAW_INDEX.get(n.conscription?.law ?? 'volunteer');
  const out = [];
  for (const step of [1, -1]) {
    const law = CONSCRIPTION[at + step];
    if (!law) continue;
    out.push({
      id: `conscription_${law.key}`,
      name: step > 0 ? `Conscription: ${law.name}` : `Stand down to ${law.name.toLowerCase()}`,
      cost: CONSCRIPTION_PP,
      cd: 60,
      desc: `${law.desc} Calls up ${(law.share * 100).toFixed(1)}% of the ${Math.round(recruitablePool(n)).toLocaleString()}k people of service age.`,
      needs: (g, country) => conscriptionBlocker(g, country, law.key) ?? true,
      run: (g, country) => setConscription(g, country, law.key),
    });
  }
  return out;
}

export { CONSCRIPTION, lawOf };
