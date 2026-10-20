import { DOCTRINES, ORIGIN_REGIONS, IMMIGRATION_TREES } from '../data/immigration.js';
import { matchesTargets, setMigrationFunding, setAfghanistanRegion } from '../game/immigration.js';
import { esc, int, signed } from './format.js';

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const label = (value) => value.replaceAll('_', ' ');
const total = (items, key) => items.reduce((s, c) => s + c[key], 0);
const weighted = (items, key) => items.reduce((s, c) => s + c[key] * c.population, 0) / Math.max(1, total(items, 'population'));

export class ImmigrationPanel {
  constructor(screen, ctx) {
    this.screen = screen;
    this.ctx = ctx;
    this.region = 'all';
    this.origin = 'all';
    this.status = 'all';
    screen.el.addEventListener('click', (event) => {
      const region = event.target.closest('[data-migration-region]');
      if (region) { this.region = region.dataset.migrationRegion; this.origin = 'all'; this.render(true); }
      const focus = event.target.closest('[data-migration-focus]');
      if (focus) this.ctx.openFocus('immigration', focus.dataset.migrationFocus || undefined);
    });
    screen.el.addEventListener('change', (event) => {
      const n = this.ctx.game.nations[this.screen.nation];
      if (event.target.matches('[data-migration-origin]')) this.origin = event.target.value;
      else if (event.target.matches('[data-migration-status]')) this.status = event.target.value;
      else if (event.target.matches('[data-migration-funding]')) setMigrationFunding(this.ctx.game, n, +event.target.value);
      else if (event.target.matches('[data-migration-afghanistan]')) setAfghanistanRegion(this.ctx.game, n, event.target.value);
      else return;
      this.render(true);
    });
  }

  render(force = false) {
    if (this.screen.el.hidden) return;
    const { game } = this.ctx;
    const n = game.nations[this.screen.nation];
    const box = this.screen.el.querySelector('[data-immigration-panel]');
    if (!box || !n) return;
    if (!n.immigration) { box.innerHTML = ''; return; }
    if (this.nation !== n.index) { this.region = 'all'; this.origin = 'all'; this.status = 'all'; this.nation = n.index; }
    const m = n.immigration;
    const key = [n.index, m.months, m.programs.length, m.funding, n.focus.current?.id, n.focus.done.size, this.region, this.origin, this.status].join(':');
    if (!force && key === this.key) return;
    this.key = key;
    const own = n.index === game.player;
    const regionCohorts = m.cohorts.filter((c) => this.region === 'all' || matchesTargets(c, { origin_regions: [this.region] }, m));
    const cohorts = regionCohorts.filter((c) => (this.origin === 'all' || c.origin === this.origin) && (this.status === 'all' || c.status === this.status));
    const countries = [...new Map(regionCohorts.map((c) => [c.origin, c.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const population = total(m.cohorts, 'population');
    const scope = total(cohorts, 'population');
    const tree = IMMIGRATION_TREES[n.iso3];
    const regional = ['south_asia', 'sub_saharan_africa'].includes(this.region);
    const focusButton = (focus, text = focus.name) => {
      const state = game.focusState(n, focus);
      return `<button data-migration-focus="${esc(focus.id)}" ${own ? '' : 'disabled'}><span>${esc(text)}</span><small>${esc(state)} · ${focus.days}d</small></button>`;
    };
    const programFocuses = regional ? tree.focuses.filter((f) => f.targets?.origin_regions?.includes(this.region) && !f.regionalDoctrine) : [];
    box.innerHTML = `
      <section class="imm-ledger" aria-label="Immigration simulation">
        <div class="imm-heading"><div><h2>Immigration and settlement</h2><p>${esc(DOCTRINES[m.doctrine] ?? 'The immigration question is unresolved')}${m.settlement ? ' · National settlement ratified' : ''}</p></div>
        ${own ? '<button class="btn" data-migration-focus="">Open immigration focus tree</button>' : '<span class="imm-observer">Observing another country</span>'}</div>
        <p class="imm-note">Fictional scenario simulation. Cohort composition, capacities and policy effects below are game assumptions, separate from the sourced demographic observations above.</p>
        <dl class="imm-metrics">
          <div><dt>Annual net migration</dt><dd class="num">${m.months ? `${m.annualNet >= 0 ? '+' : ''}${int(m.annualNet)}` : 'Awaiting first month'}</dd><small>Annualized from up to 12 months</small></div>
          <div><dt>Housing occupied</dt><dd class="num">${pct(m.housingUse)}</dd><small>${m.housingUse > 1 ? 'Demand exceeds available homes' : 'Share of housing capacity in use'}</small></div>
          <div><dt>Integration delivery</dt><dd class="num">${pct(m.integrationCapacity)}</dd><small>Staffing, services and fiscal capacity</small></div>
          <div><dt>Annual program spending</dt><dd class="num">${m.spending.toFixed(2)}% GDP</dd><small>Settled through the national budget</small></div>
        </dl>
        <div class="imm-composition" role="img" aria-label="${Object.entries(ORIGIN_REGIONS).map(([region, name]) => `${name}: ${pct(total(m.cohorts.filter((c) => matchesTargets(c, { origin_regions: [region] }, m)), 'population') / population)}`).join('; ')}">
          ${Object.keys(ORIGIN_REGIONS).map((region, i) => `<span style="flex:${total(m.cohorts.filter((c) => matchesTargets(c, { origin_regions: [region] }, m)), 'population') / population}" class="imm-region-${i}"></span>`).join('')}
        </div>
        <nav class="imm-tabs" aria-label="Population region">
          ${Object.entries({ all: 'All residents', ...ORIGIN_REGIONS }).map(([key, name]) => `<button data-migration-region="${key}" aria-pressed="${this.region === key}">${name}</button>`).join('')}
        </nav>
        <div class="imm-controls">
          <label>Country of origin<select data-migration-origin><option value="all">All origin countries</option>${countries.map(([iso, name]) => `<option value="${iso}" ${this.origin === iso ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
          <label>Migration status<select data-migration-status>${['all', 'citizen', 'permanent_resident', 'temporary_resident', 'asylum_pending', 'undocumented'].map((status) => `<option value="${status}" ${this.status === status ? 'selected' : ''}>${status === 'all' ? 'All statuses' : label(status)}</option>`).join('')}</select></label>
          <label>Program funding<select data-migration-funding ${own ? '' : 'disabled'}>${[0, .25, .5, .75, 1, 1.25, 1.5].map((v) => `<option value="${v}" ${m.funding === v ? 'selected' : ''}>${Math.round(v * 100)}% of commitments</option>`).join('')}</select></label>
          <label>Afghanistan taxonomy<select data-migration-afghanistan ${own ? '' : 'disabled'}><option value="other" ${m.taxonomy.afghanistan === 'other' ? 'selected' : ''}>Separate / other origins</option><option value="south_asia" ${m.taxonomy.afghanistan === 'south_asia' ? 'selected' : ''}>South Asia</option></select></label>
        </div>
        <div class="imm-cohort-summary"><h3>${esc(ORIGIN_REGIONS[this.region] ?? 'All residents')}</h3><p class="num">${int(scope)} residents · ${pct(scope / population)} of population</p></div>
        ${cohorts.length ? `<div class="imm-table-scroll" tabindex="0" aria-label="Population cohorts, scroll horizontally for more measures"><table class="imm-cohorts">
          <thead><tr><th scope="col">Origin / migration route</th><th scope="col">Residents</th><th scope="col">Status</th><th scope="col">Employment</th><th scope="col">Language</th><th scope="col">Citizens</th><th scope="col">Monthly arrivals</th><th scope="col">Monthly departures</th></tr></thead>
          <tbody>${cohorts.map((c) => `<tr><th scope="row">${esc(c.name)}<small>${esc(label(c.route))} · ${esc(label(c.subregion))}</small></th><td class="num">${int(c.population)}</td><td>${esc(label(c.status))}</td><td class="num">${pct(c.employment)}</td><td class="num">${pct(c.language)}</td><td class="num">${int(c.citizens)}</td><td class="num">${int(c.inflows)}</td><td class="num">${int(c.outflows)}</td></tr>`).join('')}</tbody>
        </table></div>
        <details class="imm-detail"><summary>Education, citizenship, income and participation</summary><dl class="imm-metrics">
          <div><dt>Credential recognition</dt><dd>${pct(weighted(cohorts, 'credentials'))}</dd></div>
          <div><dt>Educational attainment index</dt><dd>${pct(weighted(cohorts, 'education'))}</dd></div>
          <div><dt>Eligible for citizenship</dt><dd>${int(total(cohorts, 'eligible'))}</dd></div>
          <div><dt>Citizenship grants this month</dt><dd>${int(total(cohorts, 'naturalizations'))}</dd></div>
          <div><dt>Civic participation</dt><dd>${pct(weighted(cohorts, 'participation'))}</dd></div>
          <div><dt>Institutional trust</dt><dd>${pct(weighted(cohorts, 'trust'))}</dd></div>
          <div><dt>Average annual income</dt><dd>$${int(weighted(cohorts, 'income'))}</dd></div>
          <div><dt>Estimated annual income tax</dt><dd>$${int(total(cohorts, 'taxes'))}</dd></div>
          <div><dt>Working-age residents</dt><dd>${int(cohorts.reduce((s, c) => s + c.population * c.age.working, 0))}</dd></div>
          <div><dt>Unemployment estimate</dt><dd>${pct(weighted(cohorts, 'unemployment'))}</dd></div>
          <div><dt>Children / older residents</dt><dd>${int(cohorts.reduce((s, c) => s + c.population * c.age.child, 0))} / ${int(cohorts.reduce((s, c) => s + c.population * c.age.older, 0))}</dd></div>
          <div><dt>Female / male residents</dt><dd>${int(scope * .5)} / ${int(scope * .5)}</dd></div>
          <div><dt>Housing demand</dt><dd>${int(total(cohorts, 'housingDemand'))} homes</dd></div>
          <div><dt>Asylum decisions this month</dt><dd>${int(total(cohorts, 'asylumDecisions'))}</dd></div>
        </dl><p>Age and sex shares are simplified scenario assumptions. Citizenship is tracked separately from residency route; naturalized residents retain their cohort history.</p></details>` : '<p class="imm-empty">No residents match these filters. Choose another origin or migration status.</p>'}
        <section class="imm-policy"><h3>${regional ? `${esc(ORIGIN_REGIONS[this.region])} migration policy` : 'National immigration doctrine'}</h3>
          <p>Choose one strategic doctrine. Supporting policies remain available across branches where their prerequisites allow it. All focuses share the national focus slot.</p>
          <div class="imm-doctrines">${regional
            ? tree.focuses.filter((f) => f.regionalDoctrine?.region === this.region).map((f) => focusButton(f, f.name.split(': ')[1])).join('')
            : Object.entries(DOCTRINES).map(([key, name]) => focusButton(tree.focuses.find((f) => f.doctrine === key), name)).join('')}</div>
          ${regional ? `<h4>Programs for eligible residents</h4><div class="imm-programs">${programFocuses.map((f) => focusButton(f)).join('')}</div><p>Language and qualification support depends on unmet needs and lawful eligibility. Regional admission choices affect future flows; they do not assign behavior to ancestry.</p>` : ''}
        </section>
        <section class="imm-outcomes"><h3>Political and public-safety consequences</h3><dl class="imm-metrics">
          <div><dt>Settlement approval</dt><dd>${pct(m.publicOpinion)}</dd></div>
          <div><dt>Polarization</dt><dd>${pct(m.polarization)}</dd></div>
          <div><dt>Safety delivery index</dt><dd>${pct(m.safety)}</dd></div>
          <div><dt>Reporting access</dt><dd>${pct(m.reporting)}</dd></div>
        </dl><p>Safety depends on housing stress, unemployment, prevention, survivor services, courts and trust. Better reporting access can expose previously unreported harm. These indices are not crime rates.</p>
        <p>Current stability pressure: ${signed(m.stability, 1)} · Diplomatic cooperation: ${signed(m.diplomaticStanding * 100, 0)} pts.</p>
        ${m.events.length ? `<ul>${m.events.map((event) => `<li>${esc(event.title)} <time>${new Date(event.time).toISOString().slice(0, 10)}</time></li>`).join('')}</ul>` : '<p>No migration policy events yet. Consequences are reviewed monthly.</p>'}</section>
      </section>`;
    this.screen.doctrinePanel?.render();
  }
}
