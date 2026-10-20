import { DEMOGRAPHIC_DOCTRINES, DEMOGRAPHIC_PROPOSALS, DEMOGRAPHIC_TREE } from '../data/demographicDoctrine.js';
import { demographicDecisions, interculturalMarriageModel } from '../game/demographicPolicy.js';
import { decisionState, takeDecision } from '../game/actions.js';
import { esc, int } from './format.js';

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const weighted = (cohorts, key) => {
  const population = cohorts.reduce((sum, c) => sum + c.population, 0);
  return population ? cohorts.reduce((sum, c) => sum + c.population * c[key], 0) / population : null;
};
const focusKey = (id) => `UDL_DEM_${id}`;
const BRANCHES = {
  voluntary: ['dating', 'marriage', 'grants', 'social', 'equality', 'freedom'],
  pronatalist: ['family', 'services'],
  coercive: ['propaganda', 'pornography', 'sameRace'],
};
const LABELS = {
  socialContact: 'Social contact opportunities', integrationCosts: 'Integration spending',
  voluntaryMarriageSupport: 'Voluntary marriage support', communityParticipation: 'Community participation',
  cohesionPotential: 'Social cohesion potential', civilLiberties: 'Civil liberties', legalStability: 'Marriage-law stability',
  familySpending: 'Family policy spending', familyAccess: 'Family services access',
  expressionProtections: 'Expression protections', censorshipCosts: 'Censorship enforcement costs',
  protestPressure: 'Protest pressure', mediaEnforcementCosts: 'Media enforcement costs',
  challengePressure: 'Constitutional challenge pressure', constitutionalPressure: 'Constitutional crisis pressure',
  unrestPressure: 'Civil unrest pressure', registrationDisruption: 'Marriage-registration disruption',
};

export class DemographicDoctrinePanel {
  constructor(screen, ctx) {
    this.screen = screen;
    this.ctx = ctx;
    this.preview = 'voluntary';
    this.specOpen = false;
    screen.el.addEventListener('click', (event) => {
      const preview = event.target.closest('[data-doctrine-preview]');
      if (preview) { this.preview = preview.dataset.doctrinePreview; this.render(true); return; }
      const focus = event.target.closest('[data-demographic-focus]');
      if (focus) { this.ctx.openFocus('demographic', focus.dataset.demographicFocus); return; }
      const decision = event.target.closest('[data-demographic-decision]');
      if (decision) {
        const { game } = this.ctx;
        const n = game.nations[this.screen.nation];
        if (n.index !== game.player) return;
        const entry = demographicDecisions(n).find((d) => d.id === decision.dataset.demographicDecision);
        const error = takeDecision(game, n, entry);
        if (error) this.ctx.toast(error);
        this.ctx.refreshTop();
        this.render(true);
        return;
      }
      if (event.target.closest('[data-doctrine-spec]')) { this.specOpen = !this.specOpen; this.render(true); }
    });
  }

  render(force = false) {
    if (this.screen.el.hidden) return;
    const { game } = this.ctx;
    const n = game.nations[this.screen.nation];
    const box = this.screen.el.querySelector('[data-doctrine-panel]');
    if (!box || !n?.demographicPolicy) return;
    const state = n.demographicPolicy;
    const immigration = this.screen.immigrationPanel;
    const region = immigration?.region ?? 'all';
    const origin = immigration?.origin ?? 'all';
    const key = [n.index, n.focus.done.size, n.focus.current?.id, state.doctrine, state.active.join(','), state.pending.length,
      state.events.length, state.events[0]?.time, state.socialContact.toFixed(3), state.unrestPressure.toFixed(3), region, origin, this.preview, this.specOpen].join(':');
    if (!force && this.key === key) return;
    this.key = key;
    const own = n.index === game.player;
    const branch = BRANCHES[this.preview];
    const decisions = new Map(demographicDecisions(n).map((decision) => [decision.id.slice('demographic_'.length), decision]));
    const southAsia = n.immigration?.cohorts.filter((c) => c.region === 'south_asia' || (c.origin === 'AFG' && n.immigration.taxonomy.afghanistan === 'south_asia')) ?? [];
    const selected = southAsia.filter((c) => origin === 'all' || c.origin === origin);
    const selectedOrigins = new Set(selected.map((c) => c.origin));
    const marriage = selected.length ? interculturalMarriageModel(n, selectedOrigins) : null;
    const inclusion = weighted(selected, 'inclusion'), trust = weighted(selected, 'trust');
    const showOrigin = region === 'south_asia';
    const specification = {
      scenario: '2025 fictional game balance', doctrine: this.preview,
      focuses: DEMOGRAPHIC_TREE.focuses.filter((f) => f.id === focusKey(this.preview) || branch.some((item) => f.id === focusKey(item)))
        .map((f) => ({ id: f.id, name: f.name, days: f.days, prerequisites: f.req, proposal: f.fx.demographic.proposal ?? null })),
      proposals: Object.fromEntries(branch.map((item) => [item, DEMOGRAPHIC_PROPOSALS[item]])),
      implementation: 'Focus completion unlocks a decision; enactment, review, funding and delivery determine outcomes. Coercive law does not alter private preferences.',
    };
    box.innerHTML = `<section class="dem-doctrine" aria-label="Demographic doctrine designer">
      <div class="dem-doctrine-head"><div><h2>National demographic doctrine</h2><p>${esc(state.doctrine ? `Adopted: ${DEMOGRAPHIC_DOCTRINES[state.doctrine]}` : 'The national debate is unresolved')}</p></div>
        ${own ? `<button class="btn" data-demographic-focus="${focusKey('question')}">Open focus tree</button>` : '<span>Observing another country</span>'}</div>
      <p class="dem-doctrine-note">Focuses are political proposals. Introduce unlocked policies through country decisions. Legal review, delivery and public resistance determine what happens afterward.</p>
      <div class="dem-doctrine-options" role="group" aria-label="Preview demographic doctrine">${Object.entries(DEMOGRAPHIC_DOCTRINES).map(([id, name]) => `<button data-doctrine-preview="${id}" aria-pressed="${this.preview === id}"><strong>${esc(name)}</strong><small>${id === 'voluntary' ? 'Choice and civic inclusion' : id === 'pronatalist' ? 'Family services and incentives' : 'Restrictions and resistance'}</small></button>`).join('')}</div>
      <div class="dem-doctrine-summary"><h3>${esc(DEMOGRAPHIC_DOCTRINES[this.preview])}</h3><p>${this.preview === 'voluntary' ? 'Encourage relationships and cultural exchange without restricting partner choice.' : this.preview === 'pronatalist' ? 'Improve access to family services without directing private fertility choices.' : 'Authoritarian factions propose controls on speech and marriage. Courts, civil society and registrars can block or resist them.'}</p></div>
      <div class="dem-doctrine-focuses">${branch.map((id) => {
        const proposal = DEMOGRAPHIC_PROPOSALS[id];
        const focus = DEMOGRAPHIC_TREE.focuses.find((f) => f.id === focusKey(id));
        const status = game.focusState(n, focus);
        const decision = decisions.get(id);
        const decisionStatus = decision && decisionState(game, n, decision);
        const policyStatus = state.active.includes(id) ? 'In force' : state.pending.some((p) => p.key === id) ? 'Under review' : state.rejected.includes(id) ? 'Struck down' : status === 'done' ? 'Decision unlocked' : status;
        return `<article><div><button class="dem-focus-link" data-demographic-focus="${focus.id}">${esc(proposal.name)}</button><small>Requires: ${esc(focus.req.map((req) => DEMOGRAPHIC_TREE.focuses.find((item) => item.id === req)?.name ?? req).join(', '))} · ${focus.days}d</small></div><span class="dem-focus-status">${esc(policyStatus)}</span>
          <p>${esc(proposal.desc)}</p><div class="dem-focus-modifiers">${Object.entries(proposal.modifiers).map(([modifier, value]) => `<span>${esc(LABELS[modifier] ?? modifier)} <b>${value > 0 ? '+' : ''}${Math.round(value * 100)}%</b></span>`).join('')}</div>
          ${own && decision ? `<button class="btn" data-demographic-decision="${decision.id}" ${decisionStatus.ok ? '' : 'disabled'} title="${esc(decisionStatus.why ?? '')}">Introduce policy · ${decision.cost} PP</button>` : ''}</article>`;
      }).join('')}</div>
      <button class="btn" data-doctrine-spec aria-expanded="${this.specOpen}">${this.specOpen ? 'Hide' : 'Generate'} full doctrine specification</button>
      ${this.specOpen ? `<pre class="dem-spec">${esc(JSON.stringify(specification, null, 2))}</pre>` : ''}
      <div class="dem-conflict"><h3>Political conflict</h3><dl><div><dt>Constitutional pressure</dt><dd>${pct(state.constitutionalPressure)}</dd></div><div><dt>Civil unrest pressure</dt><dd>${pct(state.unrestPressure)}</dd></div><div><dt>International condemnation</dt><dd>${pct(state.condemnation)}</dd></div><div><dt>Enforcement capacity</dt><dd>${pct(state.enforcement)}</dd></div><div><dt>Registration disruption</dt><dd>${pct(state.registrationDisruption)}</dd></div></dl>
        ${state.events.length ? `<ul>${state.events.map((event) => `<li>${esc(event.title)}</li>`).join('')}</ul>` : '<p>No demographic legislation has been reviewed yet.</p>'}</div>
      ${showOrigin ? `<div class="dem-origin"><h3>South Asian origin${origin === 'all' ? '' : ` · ${esc(origin)}`}</h3><p>Scenario model for ${int(selected.reduce((sum, c) => sum + c.population, 0))} residents. Country of origin is a filter, not a proxy for race or relationship preferences.</p><dl>
        <div><dt>Intercultural marriages</dt><dd>${state.unlockedStats && marriage ? pct(marriage.rate) : 'Complete The Demographic Question'}</dd><small>Modeled share of annual formations</small></div>
        <div><dt>Total fertility rate</dt><dd>Not observed for this cohort</dd><small>National fertility is shown above</small></div>
        <div><dt>Social inclusion index</dt><dd>${inclusion == null ? 'Unavailable' : `${Math.round(inclusion * 100)}/100`}</dd><small>Fictional scenario state</small></div>
        <div><dt>Public policy trust</dt><dd>${trust == null ? 'Unavailable' : `${Math.round(trust * 100)}/100`}</dd><small>Fictional scenario state</small></div></dl>
        <p>Contact opportunities respond to funded voluntary programs. Network overlap and mutual preference are fixed scenario assumptions; coercive measures affect registration and legitimacy, never attraction.</p></div>` : ''}
    </section>`;
  }
}
