// The living-population section of the demographics screen: the pyramid the simulation actually
// carries, what it means for the labour force, and the conscription law drawn off it.

import { esc, int } from './format.js';
import { CONSCRIPTION, LAW_INDEX } from '../data/conscription.js';
import { ageBands, medianAge, dependencyRatio, labourForce, recruitablePool, manpowerCap, MAX_AGE } from '../game/population.js';

const femaleShare = (a) => 0.487 + Math.max(0, Math.min(0.09, (a - 45) * 0.0022));

// A mirrored age pyramid in five-year steps. Two series, so both are named in a legend and the
// widest bar on each side is labelled; the rest carry a native tooltip.
export function agePyramidSVG(n) {
  const pop = n.population?.pop;
  if (!pop) return '';
  const step = 5;
  const rows = [];
  for (let lo = 0; lo <= MAX_AGE; lo += step) {
    let men = 0, women = 0;
    for (let a = lo; a < Math.min(lo + step, MAX_AGE + 1); a++) {
      const f = femaleShare(a);
      women += pop[a] * f;
      men += pop[a] * (1 - f);
    }
    rows.push({ lo, hi: Math.min(lo + step - 1, MAX_AGE), men, women });
  }
  const max = Math.max(...rows.map((r) => Math.max(r.men, r.women))) || 1;
  const rowH = 9, gap = 2, mid = 150, half = 112, top = 18;
  const h = top + rows.length * rowH + 16;
  const w = mid * 2;
  const widest = rows.reduce((best, r) => (Math.max(r.men, r.women) > Math.max(best.men, best.women) ? r : best), rows[0]);
  const bar = (r, i) => {
    const y = top + (rows.length - 1 - i) * rowH;
    const mw = (r.men / max) * half, ww = (r.women / max) * half;
    const label = `${r.lo}–${r.hi === MAX_AGE ? `${MAX_AGE}+` : r.hi}`;
    return `
      <rect class="m" x="${(mid - 2 - mw).toFixed(1)}" y="${y}" width="${mw.toFixed(1)}" height="${rowH - gap}" rx="1.5"><title>${label}: ${int(Math.round(r.men))}k men</title></rect>
      <rect class="f" x="${mid + 2}" y="${y}" width="${ww.toFixed(1)}" height="${rowH - gap}" rx="1.5"><title>${label}: ${int(Math.round(r.women))}k women</title></rect>
      ${r.lo % 20 === 0 ? `<text class="ax" x="2" y="${y + rowH - gap - 1}">${r.lo}</text>` : ''}`;
  };
  return `
    <svg class="pyramid" viewBox="0 0 ${w} ${h}" role="img" aria-label="Age pyramid by five-year band, men on the left and women on the right">
      <text class="lg m" x="${mid - 10}" y="11" text-anchor="end">Men</text>
      <text class="lg f" x="${mid + 10}" y="11">Women</text>
      ${rows.map(bar).join('')}
      <text class="cap" x="${mid}" y="${h - 4}" text-anchor="middle">widest band ${widest.lo}–${widest.hi}: ${int(Math.round(widest.men))}k men, ${int(Math.round(widest.women))}k women</text>
    </svg>`;
}

const num = (v, unit = '') => `${int(Math.round(v))}${unit}`;

export function manpowerSectionHTML(n) {
  const P = n.population;
  if (!P) return '';
  const b = ageBands(n);
  const total = b.young + b.working + b.old;
  const law = CONSCRIPTION[LAW_INDEX.get(n.conscription?.law ?? 'volunteer')];
  const pool = recruitablePool(n);
  const cap = manpowerCap(n);
  const natural = P.births - P.deaths;
  const ladder = CONSCRIPTION.map((l) => {
    const at = l.key === law.key;
    return `<li class="${at ? 'on' : ''}"><b>${esc(l.short)}</b><span>${(l.share * 100).toFixed(1)}%</span></li>`;
  }).join('');
  return `
    <section class="demo-section mp-section" aria-label="Population in motion and manpower">
      <h2>The people, year by year</h2>
      <p class="mp-lede">Every month the simulation ages this country by a twelfth of a year: children are born on its
        fertility rate, people die on its life table, and migrants arrive. Soldiers are drawn from the
        18&ndash;45 band of this pyramid, so an old country runs out of men before it runs out of money.</p>
      <div class="mp-grid">
        <div class="mp-pyramid">${agePyramidSVG(n)}</div>
        <dl class="demo-data mp-data">
          <div class="demo-datum"><dt>Population</dt><dd class="num mp-total">${num(total / 1000, 'm').replace(/\.0m$/, 'm')}</dd><small>${int(Math.round(total))}k people</small></div>
          <div class="demo-datum"><dt>Births a year</dt><dd class="num">${num(P.births)}k</dd><small>fertility ${P.tfr.toFixed(2)} children per woman</small></div>
          <div class="demo-datum"><dt>Deaths a year</dt><dd class="num">${num(P.deaths)}k</dd><small>life expectancy ${P.e0.toFixed(1)} years</small></div>
          <div class="demo-datum"><dt>Natural change</dt><dd class="num ${natural >= 0 ? 'pos' : 'neg'}">${natural >= 0 ? '+' : '−'}${num(Math.abs(natural))}k</dd><small>${natural >= 0 ? 'the country still grows on its own' : 'more funerals than christenings'}</small></div>
          <div class="demo-datum"><dt>Median age</dt><dd class="num">${medianAge(n).toFixed(1)}</dd><small>half the country is older than this</small></div>
          <div class="demo-datum"><dt>Dependency</dt><dd class="num">${dependencyRatio(n).toFixed(2)}</dd><small>children and pensioners per working adult</small></div>
          <div class="demo-datum"><dt>Civilian workers</dt><dd class="num">${num(labourForce(n) / 1000, 'm').replace(/\.0m$/, 'm')}</dd><small>working age, out of uniform</small></div>
        </dl>
      </div>
      <h3>Service</h3>
      <div class="mp-law">
        <div class="mp-law-now">
          <b>${esc(law.name)}</b>
          <p>${esc(law.desc)}</p>
          <small>Change the law from the country panel's decisions. Each step costs 150 political power.</small>
        </div>
        <dl class="demo-data mp-service">
          <div class="demo-datum"><dt>Service age pool</dt><dd class="num">${num(pool)}k</dd><small>ages 18–45 the law can reach</small></div>
          <div class="demo-datum"><dt>Manpower ceiling</dt><dd class="num">${num(cap)}k</dd><small>${(law.share * 100).toFixed(1)}% of the pool, moved by war support</small></div>
          <div class="demo-datum"><dt>Available now</dt><dd class="num">${num(n.manpower)}k</dd><small>${n.manpower >= cap * 0.98 ? 'the pool is full' : 'refilling as the young come of age'}</small></div>
        </dl>
      </div>
      <ol class="mp-ladder" aria-label="Conscription ladder">${ladder}</ol>
    </section>`;
}
