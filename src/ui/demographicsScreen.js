import { esc, flagHTML, int } from './format.js';
import { ImmigrationPanel } from './immigrationPanel.js';
import { DemographicDoctrinePanel } from './demographicDoctrinePanel.js';

const known = (value) => value != null && value !== '';

export function demographicProfile(n) {
  const w = n.wt ?? {};
  const d = n.demographics ?? {};
  const migration = w.migration ?? {};
  const origins = (w.topOrigins || migration.topOrigins || '')
    .split(';').map((s) => s.trim()).filter(Boolean);
  return {
    population: Math.round(n.pop * 1e6),
    fertility: d.fertility ?? (known(w.fertility) ? { value: Number(w.fertility), year: null } : null),
    ages: [d.ages0to14, d.ages15to64, d.ages65plus],
    urbanShare: d.urbanShare ?? null,
    lifeExpectancy: d.lifeExpectancy ?? null,
    birthRate: d.birthRate ?? null,
    migrantStock: known(w.migrantStock) ? Number(w.migrantStock) : null,
    foreignBornShare: known(migration.foreignBornShare) ? migration.foreignBornShare : null,
    netMigration: known(migration.netMigration) ? migration.netMigration : null,
    origins,
    sourced: !!n.wt || !!n.demographics,
  };
}

const datum = (label, value, detail = '') => `<div class="demo-datum"><dt>${label}</dt><dd class="${value == null ? 'unavailable' : ''}">${value == null ? 'Not available' : esc(value)}</dd>${detail ? `<small>${detail}</small>` : ''}</div>`;

export class DemographicsScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.el = document.createElement('div');
    this.el.className = 'screen demographics-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Country demographics');
    root.appendChild(this.el);
    this.immigrationPanel = new ImmigrationPanel(this, ctx);
    this.doctrinePanel = new DemographicDoctrinePanel(this, ctx);
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) this.close();
      if (e.target.closest('[data-overview]')) this.ctx.openDossier(this.nation);
    });
    this.el.addEventListener('change', (e) => {
      if (e.target.matches('[data-country]')) this.open(Number(e.target.value));
    });
  }

  close() { this.el.hidden = true; }
  render() {
    if (this.el.hidden) return;
    const n = this.ctx.game.nations[this.nation];
    const population = this.el.querySelector('.demo-total');
    if (population && n) population.textContent = int(Math.round(n.pop * 1e6));
    this.immigrationPanel.render();
    this.doctrinePanel.render();
  }

  open(i) {
    const { game } = this.ctx;
    const n = game.nations[i];
    if (!n || n.inert) return;
    this.nation = i;
    const p = demographicProfile(n);
    const countries = game.live().slice().sort((a, b) => a.name.localeCompare(b.name));
    const agesAvailable = p.ages.every((age) => age?.value != null);
    this.el.innerHTML = `
      <button class="btn x" data-x>Close <span class="num">Esc</span></button>
      <div class="wrap demo-wrap">
        <div class="demo-head">
          ${flagHTML(n)}
          <div class="demo-title"><h1>${esc(n.name)}</h1><p>Demographics</p></div>
          <label class="demo-picker">Country
            <select data-country aria-label="View demographics for country">${countries.map((c) => `<option value="${c.index}" ${c.index === i ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          </label>
        </div>
        <section class="demo-population" aria-label="Population">
          <div><h2>Population</h2><div class="demo-total num">${int(p.population)}</div><p>Game population baseline · ${esc(n.iso3)}</p></div>
          <div class="demo-context"><p>Population follows the game baseline. Age, settlement and health figures use the most recent available World Bank observation through 2024.</p></div>
        </section>
        <section class="demo-age demo-section" aria-label="Age structure">
          <h2>Age structure</h2>
          ${agesAvailable ? `<div class="demo-agebar" role="img" aria-label="Ages 0 to 14: ${p.ages[0].value.toFixed(1)} percent; ages 15 to 64: ${p.ages[1].value.toFixed(1)} percent; ages 65 and over: ${p.ages[2].value.toFixed(1)} percent">${p.ages.map((age, index) => `<span class="age-${index}" style="width:${age.value}%"></span>`).join('')}</div>
            <div class="demo-agekey">${[['0–14', 0], ['15–64', 1], ['65+', 2]].map(([label, index]) => `<div><span class="age-swatch age-${index}"></span><span>${label}</span><b class="num">${p.ages[index].value.toFixed(1)}%</b></div>`).join('')}</div>
            <p class="demo-observation">World Bank · ${p.ages[0].year}</p>` : '<p class="demo-empty">Age structure is not available for this country.</p>'}
        </section>
        <div class="demo-columns">
          <section class="demo-section">
            <h2>Population profile</h2>
            <dl class="demo-data">
              ${datum('Fertility rate', p.fertility == null ? null : p.fertility.value.toFixed(2), p.fertility?.year ? `Children per woman · ${p.fertility.year}` : 'Children per woman')}
              ${datum('Life expectancy', p.lifeExpectancy == null ? null : `${p.lifeExpectancy.value.toFixed(1)} years`, p.lifeExpectancy ? `At birth · ${p.lifeExpectancy.year}` : '')}
              ${datum('Birth rate', p.birthRate == null ? null : p.birthRate.value.toFixed(1), p.birthRate ? `Per 1,000 people · ${p.birthRate.year}` : '')}
              ${datum('Urban population', p.urbanShare == null ? null : `${p.urbanShare.value.toFixed(1)}%`, p.urbanShare ? `Share of population · ${p.urbanShare.year}` : '')}
              ${datum('Foreign-born population', p.migrantStock == null ? null : int(p.migrantStock), 'Migrant stock · 2021')}
              ${datum('Foreign-born share', p.foreignBornShare)}
            </dl>
          </section>
          <section class="demo-section">
            <h2>Migration</h2>
            <dl class="demo-data">${datum('Net migration', p.netMigration)}</dl>
            <h3>Largest origin countries</h3>
            ${p.origins.length ? `<ol class="demo-origins">${p.origins.map((origin) => `<li>${esc(origin)}</li>`).join('')}</ol>` : '<p class="demo-empty">Origin data is not available for this country.</p>'}
          </section>
        </div>
        <div data-immigration-panel></div>
        <div data-doctrine-panel></div>
        <div class="demo-foot">
          <p>${p.sourced ? 'Age, settlement, health and dated fertility: <a href="https://data.worldbank.org/indicator/SP.POP.0014.TO.ZS" target="_blank" rel="noopener noreferrer">World Bank World Development Indicators</a>, latest available through 2024. Undated fertility and migration: WatchTower dossier where available. Population: game baseline.' : 'No sourced demographic profile for this country. Population is the game baseline; other fields await a source.'}</p>
          <button class="btn" data-overview>Country overview</button>
        </div>
      </div>`;
    this.el.hidden = false;
    this.immigrationPanel.render(true);
    this.doctrinePanel.render(true);
    this.el.scrollTop = 0;
  }
}
