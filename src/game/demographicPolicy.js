import { DEMOGRAPHIC_PROPOSALS } from '../data/demographicDoctrine.js';

const DAY = 86400000;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

export function createDemographicPolicy() {
  return {
    doctrine: null, unlockedStats: false, legislation: false, researchSpeed: 0,
    proposals: [], active: [], pending: [], rejected: [], events: [],
    socialContact: 0, supportCapacity: 0, familyServices: 0, cohesion: 0, civilLiberties: 0,
    constitutionalPressure: 0, unrestPressure: 0, condemnation: 0,
    registrationDisruption: 0, enforcement: 1, stability: 0, annualCost: 0,
    bonus: {}, // permanent modifier adjustments from event choices
  };
}

export function legalContext(n) {
  const democratic = n.ideology === 'dem' || !!n.politics?.next;
  const constitutional = democratic || n.spirits?.includes('constitutional_checks') || /constitutional/i.test(n.gov);
  const judiciary = democratic ? .75 : n.ideology === 'aut' || n.ideology === 'the' ? .25 : .5;
  const federal = /federal/i.test(n.gov) || n.spirits?.includes('federal_vetoes') || n.spirits?.includes('coalition_federalism');
  const international = (n.blocs?.includes('EU') ? .25 : 0) + (n.blocs?.includes('UN-P5') ? .1 : 0) + .2;
  return { constitutional, judiciary, federal, international: clamp(international) };
}

export function applyDemographicEffect(g, n, effect) {
  const state = n.demographicPolicy;
  if (!state || !effect) return;
  if (effect.unlockStats) state.unlockedStats = true;
  if (effect.legislation) state.legislation = true;
  if (effect.researchSpeed) state.researchSpeed += effect.researchSpeed;
  if (effect.doctrine && !state.doctrine) state.doctrine = effect.doctrine;
  if (effect.proposal && !state.proposals.includes(effect.proposal)) state.proposals.push(effect.proposal);
  if (effect.response) resolveDemographicResponse(g, n, effect.response);
}

export function demographicDecisions(n) {
  const state = n.demographicPolicy;
  if (!state?.legislation) return [];
  return state.proposals.filter((key) => !state.active.includes(key) && !state.pending.some((p) => p.key === key))
    .map((key) => {
      const proposal = DEMOGRAPHIC_PROPOSALS[key];
      return {
        id: `demographic_${key}`, name: `Introduce: ${proposal.name}`, cost: proposal.cost, cd: 120,
        desc: proposal.doctrine === 'coercive'
          ? `${proposal.desc} A proposal can be struck down or suspended.`
          : `${proposal.desc} Enactment funds a gradual program, not an immediate demographic result.`,
        needs: (g, country) => country.demographicPolicy?.doctrine === proposal.doctrine || 'Requires the matching demographic doctrine.',
        run: (g, country) => introduceDemographicPolicy(g, country, key),
      };
    });
}

export function introduceDemographicPolicy(g, n, key) {
  const state = n.demographicPolicy;
  const proposal = DEMOGRAPHIC_PROPOSALS[key];
  if (!state?.proposals.includes(key) || state.doctrine !== proposal?.doctrine || state.active.includes(key) || state.pending.some((p) => p.key === key)) return false;
  if (proposal.doctrine === 'coercive') {
    const legal = legalContext(n);
    const challenge = clamp(proposal.legalSeverity * (.5 + (legal.constitutional ? .3 : 0) + legal.judiciary * .2 + (legal.federal ? .12 : 0) + legal.international * .16));
    state.pending.push({ key, due: g.time + 60 * DAY, challenge });
    state.constitutionalPressure = clamp(state.constitutionalPressure + proposal.legalSeverity * .16
      + (proposal.modifiers.challengePressure ?? 0) + (proposal.modifiers.constitutionalPressure ?? 0));
    state.unrestPressure = clamp(state.unrestPressure + (proposal.modifiers.unrestPressure ?? .08));
    state.condemnation = clamp(state.condemnation + legal.international * proposal.legalSeverity * .15);
    g.log(`${n.name} proposes ${proposal.name.toLowerCase()}; judicial review and civil resistance begin.`, { nation: n.index, kind: 'politics', major: n.index === g.player });
  } else {
    state.active.push(key);
    g.log(`${n.name} funds ${proposal.name.toLowerCase()}.`, { nation: n.index, kind: 'politics' });
    if (PROGRAM_EVENTS[key]) queueProgramEvent(g, n, PROGRAM_EVENTS[key]);
  }
  g.emit?.('nation', n);
  return true;
}

// Voluntary programs open public debates; the choice adjusts delivery, never preferences.
const PROGRAM_EVENTS = {
  marriage: {
    id: 'UDL.intercultural_marriage_debate', title: 'The intercultural marriage debate',
    text: 'Commentators and faith groups argue over state support for intercultural couples. Supporters stress that the program funds counselling and registration help, not matchmaking.',
    options: [
      { label: 'Make the public case', desc: 'Spend political capital to widen program uptake.', pp: -15, action: 'champion' },
      { label: 'Keep a low profile', desc: 'Fund quietly. Less controversy, slower uptake.', action: 'quiet' },
    ],
  },
  grants: {
    id: 'UDL.community_program_expansion', title: 'Community programs ask to expand',
    text: 'Municipal grant recipients report full waiting lists for shared sports leagues, language cafés and neighbourhood festivals.',
    options: [
      { label: 'Expand nationwide', desc: 'More participation at a higher annual cost.', action: 'expand' },
      { label: 'Hold at current scale', desc: 'Keep the budget flat.', action: 'hold' },
    ],
  },
};
const BONUSES = {
  champion: { voluntaryMarriageSupport: .05, protestPressure: .02 },
  quiet: { voluntaryMarriageSupport: -.04, integrationCosts: -.01 },
  expand: { communityParticipation: .06, cohesionPotential: .03, integrationCosts: .03 },
  hold: {},
};
const RESPONSE_TITLES = {
  withdraw: 'withdrawn after the ruling', appeal: 'ruling appealed', suspend: 'enforcement suspended',
  enforce: 'enforcement continues', champion: 'government makes the public case', quiet: 'funded quietly',
  expand: 'expanded nationwide', hold: 'held at current scale',
};

function queueProgramEvent(g, n, event) {
  if (n.index !== g.player) return;
  const key = Object.keys(PROGRAM_EVENTS).find((k) => PROGRAM_EVENTS[k] === event);
  g.pendingEvents.push({ nation: n.index, def: {
    id: event.id, title: event.title, text: () => event.text,
    options: event.options.map((o) => ({ label: o.label, desc: o.desc,
      fx: { ...(o.pp ? { pp: o.pp } : {}), demographic: { response: { key, action: o.action } } } })),
  } });
  g.emit?.('event');
}

function recordEvent(g, n, id, title) {
  const state = n.demographicPolicy;
  state.events.unshift({ id, title, time: g.time });
  state.events.length = Math.min(8, state.events.length);
  g.log(`${n.name}: ${title}.`, { nation: n.index, kind: 'crisis', major: n.index === g.player });
}

function queueReviewEvent(g, n, key, blocked) {
  if (n.index !== g.player) return;
  const proposal = DEMOGRAPHIC_PROPOSALS[key];
  const title = blocked ? `${proposal.name} struck down` : `${proposal.name} faces resistance`;
  const def = {
    id: `demographic_review_${key}`, title,
    text: () => blocked
      ? 'Courts reject the measure. Registration continues under existing law while the government decides whether to accept the ruling.'
      : 'The measure survived initial review, but registrars, civil society and foreign partners contest its enforcement.',
    options: blocked ? [
      { label: 'Respect the ruling', desc: 'Withdraw the measure and ease the constitutional crisis.', fx: { demographic: { response: { key, action: 'withdraw' } } } },
      { label: 'Challenge the ruling', desc: 'Appeal and intensify unrest without changing private relationships.', fx: { demographic: { response: { key, action: 'appeal' } } } },
    ] : [
      { label: 'Suspend enforcement', desc: 'Protect registration and reduce unrest.', fx: { demographic: { response: { key, action: 'suspend' } } } },
      { label: 'Continue enforcement', desc: 'Raise costs, resistance and international condemnation.', fx: { demographic: { response: { key, action: 'enforce' } } } },
    ],
  };
  g.pendingEvents.push({ def, nation: n.index });
  g.emit?.('event');
}

function resolveDemographicResponse(g, n, response) {
  const state = n.demographicPolicy;
  const { key, action } = response;
  if (!DEMOGRAPHIC_PROPOSALS[key]) return;
  if (action === 'withdraw' || action === 'suspend') {
    state.active = state.active.filter((item) => item !== key);
    state.constitutionalPressure = clamp(state.constitutionalPressure - .12);
    state.unrestPressure = clamp(state.unrestPressure - .1);
  } else if (action === 'appeal') {
    state.constitutionalPressure = clamp(state.constitutionalPressure + .15);
    state.unrestPressure = clamp(state.unrestPressure + .1);
  } else if (action === 'enforce' && state.active.includes(key)) {
    state.unrestPressure = clamp(state.unrestPressure + .12);
    state.condemnation = clamp(state.condemnation + .1);
  } else if (BONUSES[action]) {
    state.bonus ??= {};
    for (const [mod, value] of Object.entries(BONUSES[action])) state.bonus[mod] = (state.bonus[mod] ?? 0) + value;
  }
  recordEvent(g, n, `response_${key}`, `${DEMOGRAPHIC_PROPOSALS[key].name}: ${RESPONSE_TITLES[action] ?? action}`);
}

export function demographicMonth(g, n) {
  const state = n.demographicPolicy;
  if (!state) return;
  for (const review of [...state.pending]) {
    if (review.due > g.time) continue;
    state.pending = state.pending.filter((entry) => entry !== review);
    const context = legalContext(n);
    const threshold = .58 + (n.stability - 50) / 500 - (context.constitutional ? .03 : 0);
    const blocked = review.challenge >= threshold;
    if (blocked) state.rejected.push(review.key);
    else state.active.push(review.key);
    recordEvent(g, n, `review_${review.key}`, blocked ? `${DEMOGRAPHIC_PROPOSALS[review.key].name} struck down` : `${DEMOGRAPHIC_PROPOSALS[review.key].name} survives initial review`);
    queueReviewEvent(g, n, review.key, blocked);
  }
  aiIntroduce(g, n);
  const active = state.active.map((key) => DEMOGRAPHIC_PROPOSALS[key]);
  const modifier = (key) => active.reduce((total, proposal) => total + (proposal.modifiers[key] ?? 0), state.bonus?.[key] ?? 0);
  state.socialContact += (modifier('socialContact') - state.socialContact) * .12;
  state.supportCapacity += (modifier('voluntaryMarriageSupport') - state.supportCapacity) * .1;
  state.familyServices += (modifier('familyAccess') - state.familyServices) * .08;
  state.cohesion += (modifier('cohesionPotential') - state.cohesion) * .08;
  state.civilLiberties = clamp(modifier('civilLiberties') + modifier('expressionProtections'), -.5, .5);
  state.enforcement = clamp((n.stability / 100) * (1 - state.unrestPressure * .55) * (1 - state.constitutionalPressure * .35), .1, 1);
  state.registrationDisruption += ((modifier('registrationDisruption') * state.enforcement) - state.registrationDisruption) * .15;
  state.annualCost = modifier('integrationCosts') * (n.immigration?.spending ?? .05)
    + modifier('familySpending') * .12 + modifier('censorshipCosts') * .12 + modifier('mediaEnforcementCosts') * .12;
  n.debt += state.annualCost / 12;
  state.constitutionalPressure = clamp(state.constitutionalPressure * .99 - modifier('legalStability') * .015);
  state.unrestPressure = clamp(state.unrestPressure * .99 + Math.max(0, modifier('protestPressure') + modifier('unrestPressure')) * .01);
  state.condemnation = clamp(state.condemnation * .995);
  state.stability = clamp(-state.unrestPressure * 8 - state.constitutionalPressure * 6 - state.condemnation * 2 + state.cohesion * 3, -16, 3);
  if (n.immigration?.cohorts?.length) for (const cohort of n.immigration.cohorts) {
    cohort.inclusion = clamp(cohort.inclusion + (state.cohesion * .04 + modifier('communityParticipation') * .02 - state.unrestPressure * .012) * state.enforcement);
    cohort.trust = clamp(cohort.trust + (state.civilLiberties * .02 - state.constitutionalPressure * .012) * state.enforcement);
  }
  g.emit?.('nation', n);
}

// AI governments introduce one unlocked proposal at a time when they can afford it.
// Democracies never table coercive measures, even if a faction drafted them.
function aiIntroduce(g, n) {
  const state = n.demographicPolicy;
  if (n.index === g.player || !state.legislation || state.pending.length || !g.r || g.r() > .15) return;
  const key = state.proposals.find((k) => !state.active.includes(k) && !state.rejected.includes(k)
    && (DEMOGRAPHIC_PROPOSALS[k].doctrine !== 'coercive' || n.ideology !== 'dem'));
  const proposal = DEMOGRAPHIC_PROPOSALS[key];
  if (!proposal || (n.pp ?? 0) < proposal.cost) return;
  if (introduceDemographicPolicy(g, n, key)) n.pp -= proposal.cost;
}

// Game scenario model. Cohort sizes and ages are simulated; network overlap and mutual
// preferences are explicit assumptions, never inferred from birthplace or ancestry.
export function interculturalMarriageModel(n, selectedOrigins = null) {
  const cohorts = n.immigration?.cohorts ?? [];
  const groups = new Map();
  for (const cohort of cohorts) {
    const adults = cohort.population * (cohort.age?.working ?? 0);
    groups.set(cohort.origin, (groups.get(cohort.origin) ?? 0) + adults);
  }
  const total = [...groups.values()].reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  const contacts = n.demographicPolicy?.socialContact ?? 0;
  let weightedCross = 0, selectedAdults = 0;
  for (const [origin, adults] of groups) {
    if (selectedOrigins && !selectedOrigins.has(origin)) continue;
    let denominator = 0, cross = 0;
    for (const [other, available] of groups) {
      const same = other === origin;
      const opportunity = available / total * (same ? 1 : 1 + contacts);
      const networkOverlap = same ? 1 : .68;
      const mutualPreference = same ? 1 : .74;
      const weight = opportunity * networkOverlap * mutualPreference;
      denominator += weight;
      if (!same) cross += weight;
    }
    weightedCross += adults * cross / Math.max(denominator, 1e-9);
    selectedAdults += adults;
  }
  const support = n.demographicPolicy?.supportCapacity ?? 0;
  const formationRate = .025 * (1 + support * .1);
  return { rate: selectedAdults ? weightedCross / selectedAdults : 0, annualFormations: selectedAdults * formationRate / 2, adults: selectedAdults,
    assumptions: { networkOverlap: .68, mutualPreference: .74, formationRate: .025 } };
}
