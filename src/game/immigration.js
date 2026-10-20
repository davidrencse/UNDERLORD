import { IMMIGRATION_TREES, ORIGINS } from '../data/immigration.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0);
const DAY = 86400000;
export const MIGRATION_MODIFIERS = {
  admissions: 'Legal admissions', enforcement: 'Border enforcement', removals: 'Removal authority',
  family: 'Family admissions', asylum: 'Humanitarian admissions', naturalization: 'Citizenship processing',
  regularization: 'Status regularization', administration: 'Administrative capacity', housing: 'Housing construction',
  language: 'Language tuition', credentials: 'Credential recognition', inclusion: 'Social inclusion',
  civic: 'Civic education', trust: 'Institutional trust', workerProtection: 'Worker protections',
  services: 'Local and survivor services', prevention: 'Violence prevention', justice: 'Judicial capacity',
  legal: 'Legal safeguards', coercion: 'Compliance burden', participation: 'Employment access',
  domesticTraining: 'Domestic workforce training', returnMigration: 'Return migration',
  circular: 'Circular migration', diplomacy: 'Diplomatic cooperation', nationalist: 'Sovereignty voter appeal',
  polarization: 'Political polarization', spending: 'Annual program cost',
};
// Pathway assumptions only. Identical needs give identical outcomes regardless of origin.
const ROUTES = [
  { route: 'skilled_work', status: 'permanent_resident', weight: .4, education: .75, language: .65, employment: .75 },
  { route: 'study', status: 'temporary_resident', weight: .22, education: .8, language: .6, employment: .45 },
  { route: 'family', status: 'permanent_resident', weight: .25, education: .55, language: .5, employment: .55 },
  { route: 'protection', status: 'asylum_pending', weight: .1, education: .55, language: .4, employment: .35 },
  { route: 'irregular', status: 'undocumented', weight: .03, education: .55, language: .45, employment: .45 },
];
const BASE = { admissions: 1, family: 1, asylum: 1, naturalization: .1, enforcement: .25, removals: .1, administration: .55,
  language: .4, credentials: .4, inclusion: .55, civic: .4, trust: .6, workerProtection: .5, services: .5,
  prevention: .3, justice: .5, legal: .6, coercion: 0, participation: 0, domesticTraining: 0,
  housing: 0, returnMigration: 0, circular: 0, diplomacy: 0, nationalist: 0, polarization: 0, regularization: 0 };

function makeCohort(n, origin, pathway, population, native = false) {
  return {
    id: native ? `${n.iso3}_native` : `${origin.iso}_${pathway.route}`,
    origin: origin.iso, name: origin.name, region: native ? 'domestic' : origin.region, subregion: origin.subregion,
    countryOfBirth: native ? n.iso3 : origin.iso, ancestry: native ? 'Not specified' : origin.iso,
    generation: native ? 'native_born' : 'first', status: native ? 'citizen' : pathway.status, route: pathway.route,
    population, age: { child: native ? .19 : .15, working: native ? .62 : .76, older: native ? .19 : .09 },
    sex: { female: .5, male: .5 }, citizens: native ? population : 0, eligible: 0,
    residenceYears: native ? 20 : 3, education: pathway.education, language: native ? .98 : pathway.language,
    credentials: native ? .95 : .5, employment: native ? .75 : pathway.employment, unemployment: (n.unemployment ?? 6) / 100,
    inclusion: .6, trust: .6, civic: native ? .7 : .4, participation: .6,
    income: 0, taxes: 0, housingDemand: population / 2.4, inflows: 0, outflows: 0,
    asylumDecisions: 0, naturalizations: 0, partyPreferences: {},
  };
}

export function createImmigration(n) {
  if (!IMMIGRATION_TREES[n.iso3] || n.pop <= 0) return null;
  const population = n.pop * 1e6;
  const native = makeCohort(n, { iso: n.iso3, name: 'Native-born residents', subregion: 'domestic' }, { route: 'birth', education: .65 }, population * .92, true);
  const origins = ORIGINS.filter((o) => o.iso !== n.iso3);
  const cohorts = [native];
  for (const origin of origins) for (const pathway of ROUTES) cohorts.push(makeCohort(n, origin, pathway, population * .08 / origins.length * pathway.weight));
  const m = {
    version: 1, fictional: true, baselinePopulation: population, baselineNative: native.population, baselineUnemployment: n.unemployment ?? 6,
    baselineLabor: sum(cohorts, (c) => c.population * c.age.working * c.employment),
    cohorts, programs: [], applied: [], doctrine: null, settlement: null, regionalDoctrines: {},
    taxonomy: { afghanistan: 'other' }, funding: 1, months: 0, lastMonth: null,
    housingUnits: population / 2.4 / .88, integrationCapacity: .325, housingUse: .88,
    publicOpinion: .5, polarization: .1, safety: .6, reporting: .5, trust: .6,
    spending: 0, laborDelta: 0, demandMultiplier: 1, productivity: 0, stability: 0, diplomaticStanding: 0,
    annualNet: 0, flows: { inflows: 0, outflows: 0, naturalizations: 0, asylumDecisions: 0, removals: 0 },
    history: [], events: [], cooldowns: {}, naturalIndex: 1,
  };
  return m;
}

export function matchesTargets(cohort, targets, m) {
  if (!targets) return true;
  const region = cohort.origin === 'AFG' ? m.taxonomy.afghanistan : cohort.region;
  return (!targets.origin_regions?.length || targets.origin_regions.includes(region))
    && (!targets.migration_status?.length || targets.migration_status.includes(cohort.status))
    && (!targets.country_of_birth?.length || targets.country_of_birth.includes(cohort.countryOfBirth))
    && (!targets.routes?.length || targets.routes.includes(cohort.route));
}

// Statutory limits and political choices persist when delivery funding is cut.
const STATUTORY = new Set(['admissions', 'family', 'asylum', 'coercion', 'polarization', 'nationalist', 'naturalization', 'diplomacy']);
// Political balances run either way; the rest are shares, and admissions lines may be raised above one.
const SIGNED = new Set(['polarization', 'nationalist', 'diplomacy']);
const RAISABLE = new Set(['admissions', 'family', 'asylum', 'naturalization']);
const BASE_KEYS = Object.keys(BASE);

export function policyFor(m, cohort) {
  const p = { ...BASE };
  let keys = BASE_KEYS;
  for (const program of m.programs) {
    if (program.targets && (!cohort || !matchesTargets(cohort, program.targets, m))) continue;
    for (const [key, value] of Object.entries(program.effects)) {
      if (key === 'spending') continue;
      // A program may introduce a modifier the baseline does not carry.
      if (keys === BASE_KEYS && !(key in BASE)) keys = null;
      p[key] = (p[key] ?? 0) + value * (STATUTORY.has(key) ? 1 : m.funding);
    }
  }
  for (const key of keys ?? Object.keys(p)) p[key] = SIGNED.has(key)
    ? clamp(p[key], -1, 1) : clamp(p[key], 0, RAISABLE.has(key) ? 2.5 : 1);
  return p;
}

export function applyImmigration(n, program) {
  const m = n.immigration;
  if (!m || !program || (program.id && m.applied.includes(program.id))) return false;
  if (program.doctrine && m.doctrine && program.doctrine !== m.doctrine) return false;
  if (program.regionalDoctrine && m.regionalDoctrines[program.regionalDoctrine.region]
    && m.regionalDoctrines[program.regionalDoctrine.region] !== program.regionalDoctrine.doctrine) return false;
  if (program.settlement && program.settlement !== m.doctrine) return false;
  if (Object.entries(program.effects ?? {}).some(([key, value]) => !(key in MIGRATION_MODIFIERS) || !Number.isFinite(value))) return false;
  m.programs.push(structuredClone(program));
  if (program.id) m.applied.push(program.id);
  if (program.doctrine) m.doctrine = program.doctrine;
  if (program.settlement) m.settlement = program.settlement;
  if (program.regionalDoctrine) m.regionalDoctrines[program.regionalDoctrine.region] = program.regionalDoctrine.doctrine;
  return true;
}

export function setMigrationFunding(g, n, value) {
  if (n.index !== g.player || !n.immigration || !Number.isFinite(value) || value < 0 || value > 1.5) return false;
  n.immigration.funding = value;
  g.emit('nation', n);
  return true;
}

export function setAfghanistanRegion(g, n, region) {
  if (n.index !== g.player || !n.immigration || !['other', 'south_asia'].includes(region)) return false;
  n.immigration.taxonomy.afghanistan = region;
  g.emit('nation', n);
  return true;
}

function changePopulation(c, delta) {
  const before = c.population;
  c.population = Math.max(0, before + delta);
  if (delta < 0 && before > 0) { c.citizens *= c.population / before; c.eligible *= c.population / before; }
}

function moveResidents(from, to, amount) {
  amount = Math.min(amount, Math.max(0, from.population - from.citizens));
  if (amount <= 0) return;
  const before = to.population;
  for (const key of ['education', 'language', 'credentials', 'employment', 'inclusion', 'trust', 'civic', 'residenceYears']) {
    to[key] = (to[key] * before + from[key] * amount) / (before + amount);
  }
  from.population -= amount;
  to.population += amount;
}

export function immigrationMonth(g, n, naturalGrowth = 0) {
  const m = n.immigration;
  if (!m) { n.pop *= 1 + naturalGrowth; return; }
  const month = new Date(g.time).toISOString().slice(0, 7);
  if (m.lastMonth === month) return;
  m.lastMonth = month;
  m.months++;
  m.naturalIndex *= 1 + naturalGrowth;
  const p = policyFor(m);
  const flow = { inflows: 0, outflows: 0, naturalizations: 0, asylumDecisions: 0, removals: 0 };
  // Reconcile external population changes, then apply the existing economic population trend once.
  const before = sum(m.cohorts, (c) => c.population);
  const scale = n.pop * 1e6 / Math.max(1, before) * (1 + naturalGrowth);
  const migrants = m.cohorts.filter((c) => c.generation === 'first');
  const originCount = new Set(migrants.map((c) => c.origin)).size;
  const byId = new Map(m.cohorts.map((c) => [c.id, c]));
  // Only a program that targets cohorts can make their policies differ; otherwise every cohort
  // reads the one policy already computed above. Policies are read, never written.
  const targeted = m.programs.some((program) => program.targets);
  const cohortPolicies = targeted ? new Map(m.cohorts.map((c) => [c.id, policyFor(m, c)])) : null;
  const policyOf = (c) => (cohortPolicies ? cohortPolicies.get(c.id) : p);
  const demand = n.pop * 1e6 * .004 / 12;
  const spending = Math.max(0, sum(m.programs, (program) => program.effects.spending ?? 0));
  m.spending = spending * m.funding;
  const fiscalDelivery = clamp(1 - Math.max(0, (n.debt ?? 60) - 120) / 300, .35, 1);
  const delivery = clamp(p.administration * fiscalDelivery + .2, .1, 1);
  const serviceLoad = clamp(1 / Math.max(1, m.housingUse), .3, 1);
  m.integrationCapacity = clamp(sum(m.cohorts, (c) => {
    const pc = policyOf(c);
    return c.population * (pc.language + pc.credentials + pc.services) / 3;
  }) / Math.max(1, before) * delivery * serviceLoad);
  for (const c of m.cohorts) {
    c.population *= scale; c.citizens *= scale; c.eligible *= scale;
    c.inflows = 0; c.outflows = 0; c.asylumDecisions = 0; c.naturalizations = 0;
  }
  for (const c of m.cohorts) {
    const pc = policyOf(c);
    const native = c.generation !== 'first';
    const nonCitizen = Math.max(0, c.population - c.citizens);
    if (!native) {
      const route = ROUTES.find((r) => r.route === c.route);
      const admission = c.route === 'irregular' ? 1 - (pc.enforcement - BASE.enforcement)
        : c.route === 'protection' ? pc.asylum : c.route === 'family' ? pc.family : pc.admissions;
      const arrivals = demand / originCount * route.weight * clamp(admission, 0, 2.5);
      // New arrivals dilute accumulated skills and residence time.
      for (const [key, value] of Object.entries({ language: route.language, credentials: .5, education: route.education, residenceYears: 0 })) {
        c[key] = (c[key] * c.population + arrivals * value) / Math.max(1, c.population + arrivals);
      }
      c.population += arrivals; c.inflows = arrivals; flow.inflows += arrivals;
      const departures = Math.min(c.population, c.population * (.05 + pc.circular * .05 + Math.max(0, .55 - c.inclusion) * .03) / 12);
      changePopulation(c, -departures); c.outflows += departures; flow.outflows += departures;
      if (c.status === 'undocumented') {
        const removals = Math.min(c.population - c.citizens, c.population * pc.removals * pc.justice * delivery / 12);
        changePopulation(c, -removals); c.outflows += removals; flow.outflows += removals; flow.removals += removals;
        moveResidents(c, byId.get(`${c.origin}_skilled_work`), c.population * pc.regularization * delivery / 12);
      }
      if (c.status === 'asylum_pending') {
        const decisions = Math.min(c.population, c.population * pc.justice * delivery / 12);
        const approved = decisions * clamp(.55 + (pc.legal - .6) * .3);
        moveResidents(c, byId.get(`${c.origin}_skilled_work`), approved);
        const rejected = decisions - approved;
        moveResidents(c, byId.get(`${c.origin}_irregular`), rejected);
        c.asylumDecisions = decisions; flow.asylumDecisions += decisions;
      }
      c.residenceYears += 1 / 12;
      // Eligibility is an aggregate residence-and-language approximation, not an ancestry rule.
      c.eligible = c.status === 'permanent_resident' && c.residenceYears >= 5 ? Math.min(nonCitizen, c.population - c.citizens) * c.language : 0;
      const naturalized = Math.min(c.eligible, c.eligible * pc.naturalization * delivery / 12);
      c.citizens += naturalized; c.eligible -= naturalized; c.naturalizations = naturalized; flow.naturalizations += naturalized;
      c.language += (1 - c.language) * Math.max(0, pc.language - BASE.language) * delivery * .06;
      c.credentials += (1 - c.credentials) * Math.max(0, pc.credentials - BASE.credentials) * delivery * .07;
    }
    const jobs = clamp((1 - (n.unemployment ?? 6) / 100) / (1 - m.baselineUnemployment / 100), .1, 1.2);
    const pathway = native ? null : ROUTES.find((r) => r.route === c.route);
    const training = native ? pc.domesticTraining * .15 : (c.language - pathway.language) * .18 + (c.credentials - .5) * .2;
    const targetEmployment = clamp((native ? .75 : pathway.employment) + training + pc.participation * .2 + (pc.workerProtection - .5) * .12, .1, .92) * jobs;
    c.employment += (targetEmployment - c.employment) * .035 * delivery;
    c.unemployment = clamp((n.unemployment ?? 6) / 100 + Math.max(0, .5 - c.credentials) * .08 - pc.participation * .02, .005, .6);
    const inclusionTarget = clamp(pc.inclusion + (pc.workerProtection - .5) * .1 - pc.coercion * .25 - Math.max(0, m.housingUse - 1) * .3);
    c.inclusion += (inclusionTarget - c.inclusion) * .04;
    c.trust += (clamp(pc.trust + (pc.legal - .6) * .15 - pc.coercion * .2 + (m.safety - .6) * .1) - c.trust) * .035 * delivery;
    c.civic += (pc.civic - c.civic) * .03 * delivery;
    c.participation = clamp(.45 + c.civic * .2 + c.trust * .2);
    c.citizens = clamp(c.citizens, 0, c.population);
    c.eligible = clamp(c.eligible, 0, c.population - c.citizens);
  }
  const native = m.cohorts[0];
  const returns = demand * p.returnMigration * .2;
  native.population += returns; native.citizens += returns; native.inflows = returns; flow.inflows += returns;
  const total = sum(m.cohorts, (c) => c.population);
  n.pop = total / 1e6;
  // Housing is a stock: funded construction adds units over time.
  m.housingUnits *= 1 + naturalGrowth + p.housing * .002 * delivery;
  m.housingUse = total / 2.4 / Math.max(1, m.housingUnits);
  m.trust = sum(m.cohorts, (c) => c.trust * c.population) / total;
  const employed = sum(m.cohorts, (c) => c.population * c.age.working * c.employment);
  m.laborDelta = (employed - m.baselineLabor * m.naturalIndex) / 1e6;
  m.demandMultiplier = clamp(total / (m.baselinePopulation * m.naturalIndex), .8, 1.3);
  m.productivity = sum(migrants, (c) => c.population * Math.max(0, c.credentials - .5) * c.employment) / total * .1;
  m.polarization += (clamp(.1 + p.polarization + Math.max(0, m.housingUse - .95) * .6) - m.polarization) * .1;
  const housingStress = Math.max(0, m.housingUse - 1);
  m.publicOpinion = clamp(.5 + (m.trust - .6) * .4 - housingStress * .5 - m.polarization * .12 + m.integrationCapacity * .08);
  m.stability = clamp((m.publicOpinion - .5) * 12 - m.polarization * 3, -12, 6);
  // General safety: unemployment, crowded housing, prevention, services, courts and trust.
  // Origin and regional membership are deliberately absent from this calculation.
  const safetyTarget = clamp(.65 - (n.unemployment ?? 6) / 200 - housingStress * .2
    + (p.prevention - .3) * .2 * delivery + (p.services - .5) * .15 * delivery + (p.justice - .5) * .15 * m.trust);
  m.safety += (safetyTarget - m.safety) * .06;
  m.reporting = clamp(.3 + m.trust * .35 + p.services * .2);
  m.diplomaticStanding = sum(m.cohorts, (c) => policyOf(c).diplomacy * c.population) / total;
  m.flows = flow;
  m.history.push({ month, population: total, ...flow, housingUse: m.housingUse, employment: employed, spending: m.spending });
  if (m.history.length > 24) m.history.shift();
  const lastYear = m.history.slice(-12);
  m.annualNet = sum(lastYear, (h) => h.inflows - h.outflows) * 12 / lastYear.length;
  for (const c of m.cohorts) {
    c.housingDemand = c.population / 2.4;
    c.income = n.gdp * 1e9 / total * (.6 + c.education * .4) * c.employment;
    c.taxes = c.income * c.population * (n.econ?.tax?.income ?? 20) / 100;
    const parties = n.politics?.list ?? [];
    const weights = parties.map((party) => Math.max(.1, 1 + (n.politics.ruling.includes(party.id) ? (c.trust - .6) * 2 + (c.employment - .6) : 0)));
    const weight = sum(weights, (v) => v) || 1;
    c.partyPreferences = Object.fromEntries(parties.map((party, i) => [party.id, weights[i] / weight]));
  }
  // Agreements and removal disputes affect actual bilateral relations, very gradually.
  if (g.addOpinion) for (const origin of new Set(migrants.map((c) => c.origin))) {
    const partner = g.world?.byIso?.get(origin);
    const residents = migrants.filter((c) => c.origin === origin);
    const cooperation = sum(residents, (c) => policyOf(c).diplomacy * c.population) / Math.max(1, sum(residents, (c) => c.population));
    if (partner && cooperation) g.addOpinion(n.index, partner.index, cooperation * .15);
  }
  immigrationEvents(g, n);
}

export function immigrationPartyDrift(n, party) {
  const m = n.immigration;
  if (!m || !m.programs.length) return 0;
  const p = policyFor(m);
  const eligible = sum(m.cohorts, (c) => c.citizens * c.age.working * c.participation);
  const preference = eligible > 0 ? sum(m.cohorts, (c) => c.citizens * c.age.working * c.participation * (c.partyPreferences[party.id] ?? 0)) / eligible : 0;
  return clamp((n.politics.ruling.includes(party.id) ? m.publicOpinion - .5 : .5 - m.publicOpinion) * .015
    + (party.ideo === 'nat' ? p.nationalist * .006 : 0)
    + (preference - 1 / n.politics.list.length) * .005, -.01, .01);
}

const eventOption = (label, desc, effects) => ({ label, desc, fx: { immigration: { effects } } });
export const MIGRATION_EVENTS = [
  { id: 'housing_protest', title: 'The reception housing dispute', when: (m) => m.housingUse > .98,
    text: () => 'Municipal leaders report that settlement is outpacing housing. Residents and employers want competing responses.',
    options: [eventOption('Fund municipal construction', 'Increase annual spending by 0.12% of GDP and expand construction capacity.', { housing: .15, spending: .12 }),
      eventOption('Reduce new admissions', 'Lower legal admissions; employers must adjust their recruitment plans.', { admissions: -.15, polarization: .03 })] },
  { id: 'labor_shortage', title: 'Employers demand a recruitment window', when: (m, n) => policyFor(m).admissions < .6 && (n.econ?.laborShort > .005 || m.months % 12 === 0),
    text: () => 'Recruitment restrictions have sharpened the debate over wages, training and overseas hiring.',
    options: [eventOption('Fund domestic apprenticeships', 'Commit 0.1% of GDP annually to gradual workforce training.', { domesticTraining: .15, spending: .1 }),
      eventOption('Open a selective visa window', 'Restore part of the admission cap and pay for credential processing.', { admissions: .15, credentials: .1, spending: .06 })] },
  { id: 'constitutional_challenge', title: 'Residency rules face judicial review', when: (m) => policyFor(m).coercion > .18 && policyFor(m).legal < .8,
    text: () => 'Courts question the proportionality of civic obligations. The government must fund safeguards or continue the confrontation.',
    options: [eventOption('Provide appeal and tuition guarantees', 'Add safeguards and instruction at an annual cost of 0.08% of GDP.', { legal: .15, language: .1, spending: .08 }),
      eventOption('Defend the compulsory rules', 'Increase polarization and weaken confidence in legal safeguards.', { polarization: .1, legal: -.05 })] },
  { id: 'integration_outcome', title: 'The first settlement review', when: (m) => m.months >= 12 && m.integrationCapacity > .55,
    text: () => 'The review finds that funded language and recognition services are reaching more residents. Parliament debates the next commitment.',
    options: [eventOption('Extend the municipal partnership', 'Expand local services with 0.06% of GDP in annual funding.', { services: .1, spending: .06 }),
      eventOption('Publish results and consolidate', 'Build confidence without adding another spending commitment.', { trust: .04 })] },
  { id: 'funding_dispute', title: 'Programs without delivery', when: (m) => m.programs.length > 3 && m.funding < .5,
    text: () => 'Local providers report that the funding allocation cannot deliver the programs already announced.',
    options: [eventOption('Simplify compliance requirements', 'Reduce administrative burdens and mandatory obligations.', { coercion: -.08, administration: .06 }),
      eventOption('Defend the spending restraint', 'The political dispute deepens while providers await funding.', { polarization: .08 })] },
];

function immigrationEvents(g, n) {
  const m = n.immigration;
  if (!m.programs.length || !g.log) return;
  const def = MIGRATION_EVENTS.find((event) => event.when(m, n) && (m.cooldowns[event.id] ?? 0) <= g.time);
  if (!def) return;
  m.cooldowns[def.id] = g.time + 540 * DAY;
  m.events.unshift({ id: def.id, title: def.title, time: g.time });
  m.events.length = Math.min(m.events.length, 8);
  g.log(`${n.name}: ${def.title}.`, { nation: n.index, kind: 'crisis' });
  if (n.index === g.player) {
    g.pendingEvents.push({ def, nation: n.index });
    g.emit('event');
  } else applyImmigration(n, def.options[n.debt > 120 ? 1 : 0].fx.immigration);
}

export function immigrationProjection(n, focus) {
  if (!n.immigration || !focus?.fx?.immigration) return null;
  const program = focus.fx.immigration;
  const eligible = n.immigration.cohorts.filter((c) => matchesTargets(c, program.targets, n.immigration));
  return {
    eligible: sum(eligible, (c) => c.population),
    cost: (program.effects.spending ?? 0) * n.immigration.funding,
    effects: Object.entries(program.effects).map(([key, value]) => ({
      key, label: MIGRATION_MODIFIERS[key] ?? key, value,
    })),
  };
}
