// Imports country intelligence from the WatchTower project into UNDERLORD's static data.
//
//   node scripts/import-watchtower.mjs [path-to-WatchTower]
//
// Writes public/data/watchtower.json and copies flags to public/flags/<ISO3>.png.
// Needs Node 22.18+ (TypeScript type stripping) because WatchTower's data modules are .ts.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const WT = resolve(process.argv[2] ?? 'C:/Users/david/Desktop/WatchTower');
const OUT = resolve('public');
const imp = (p) => import(pathToFileURL(join(WT, p)).href);

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
const csv = (p) => parseCsv(readFileSync(join(WT, p), 'utf8'));
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

const NAME_FIX = { 'Czech Republic': 'CZE', Czechia: 'CZE', 'Bosnia and Herzegovina': 'BIH', 'United States': 'USA', 'United Kingdom': 'GBR' };

const out = { source: 'WatchTower', importedAt: new Date().toISOString().slice(0, 10), countries: {}, frontline: null };
const C = (iso3) => (out.countries[iso3] ??= {});

// --- Economy & society (World Bank via WatchTower) ---------------------------------------
const merged = csv('Assets/Data/shared/centralized_merged_country_stats.csv');
const nameToIso = {};
for (const r of merged) {
  nameToIso[r.country] = r.iso3;
  Object.assign(C(r.iso3), {
    name: r.country,
    gdpUsd: num(r.gdp_current_usd),
    gdpPerCapita: num(r.gdp_per_capita_current_usd),
    migrantStock: num(r.immigrants_stock_total),
    fertility: num(r.total_birth_rate),
    topOrigins: r.top_immigrant_countries || null,
    crimeTheft: num(r.crime_theft_latest_value),
  });
}
const isoOf = (name) => nameToIso[name] ?? NAME_FIX[name] ?? null;

for (const r of csv('Assets/Data/shared/countries_latest_inflation_unemployment_interest_with_real_median_wage.csv')) {
  const iso = isoOf(r.country);
  if (!iso) continue;
  Object.assign(C(iso), {
    inflation: num(r.inflation_rate_pct),
    unemployment: num(r.unemployment_rate_pct),
    interestRate: num(r.interest_rate_pct),
    netWageUsd: num(r.real_median_wage_usd),
  });
}
for (const r of csv('Assets/Data/shared/corruption_money_lost_modeled_estimates.csv')) {
  const iso = isoOf(r.Country);
  if (iso) C(iso).corruptionLossUsd = num(r['Money Lost in Dollars']);
}
for (const r of csv('Assets/Data/shared/expenditures.csv')) {
  const iso = isoOf(r.Country);
  if (!iso) continue;
  C(iso).spending = {
    total: r['Total Govt Expenditure (% of GDP or bn USD)'],
    social: r['Social Protection (% of total exp)'],
    health: r['Health (% of total exp)'],
    education: r['Education (% of total exp)'],
    defence: r['Defence (% of total exp)'],
  };
}

// --- Politics, tax, trade, migration (broad strokes) --------------------------------------
const { broadStrokesFor } = await imp('src/data/countries/countryBroadStrokes.ts');
for (const iso of Object.keys(out.countries)) {
  const bs = broadStrokesFor(iso);
  if (!bs) continue;
  Object.assign(C(iso), {
    headOfGovernment: bs.headOfGovernment,
    governingBloc: bs.governingBloc,
    legislature: bs.legislature,
    lastElection: bs.lastElection,
    parties: [
      ...bs.left.map((p) => ({ ...p, side: 'left' })),
      ...bs.right.map((p) => ({ ...p, side: 'right' })),
    ],
    tax: bs.tax,
    trade: bs.trade,
    migration: bs.migration,
  });
}

// --- Military (Global Firepower profiles) -------------------------------------------------
const { COUNTRY_MILITARY_DATA } = await imp('src/data/military/globalFirepower.ts');
for (const [iso, m] of Object.entries(COUNTRY_MILITARY_DATA)) {
  if (m.status !== 'ranked') continue;
  const inv = {};
  for (const branch of [m.airForce, m.army, m.navy]) for (const it of branch.items) inv[it.key] = it.total;
  C(iso).military = {
    rank: m.rank,
    rankTotal: m.rankTotal,
    powerIndex: m.powerIndex,
    active: m.activePersonnel,
    reserve: m.reservePersonnel,
    budgetUsd: m.defenseBudgetUsd,
    aircraft: m.airForce.total,
    ships: m.navy.total,
    inventory: inv,
  };
}

// --- Russo-Ukrainian war control geometry -------------------------------------------------
const fl = await imp('src/data/warFrontlineGeometry.ts');
out.frontline = {
  capturedAt: fl.FRONTLINE_SNAPSHOT.capturedAt,
  generatedAt: fl.FRONTLINE_SNAPSHOT.generatedAt,
  occupied: [...fl.CONTROL_RINGS.map((s) => s.ring), ...fl.CRIMEA_RINGS],
  contact: fl.CONTACT_SEGMENTS.map((s) => s.path),
};

// --- Flags ---------------------------------------------------------------------------------
const FLAG_NAME = { 'Bosnia-Herzegovina': 'BIH', 'Czech-Republic': 'CZE', 'United-States-of-America': 'USA', 'United-Kingdom': 'GBR', 'South-Korea': 'KOR', 'North-Macedonia': 'MKD', 'New-Zealand': 'NZL', 'South-Africa': 'ZAF', 'San-Marino': 'SMR', China: 'CHN', Japan: 'JPN', Taiwan: 'TWN', Andorra: 'AND', Albania: 'ALB', Armenia: 'ARM', Azerbaijan: 'AZE', Georgia: 'GEO', Malta: 'MLT', Monaco: 'MCO', Liechtenstein: 'LIE' };
mkdirSync(join(OUT, 'flags'), { recursive: true });
const flagDir = join(WT, 'Assets/Flags');
const flags = [];
if (existsSync(flagDir)) {
  for (const f of readdirSync(flagDir)) {
    const m = /^flag-of-(.+)\.png$/.exec(f);
    if (!m) continue;
    const iso = FLAG_NAME[m[1]] ?? isoOf(m[1].replace(/-/g, ' '));
    if (!iso) { console.warn('no ISO3 for flag', f); continue; }
    copyFileSync(join(flagDir, f), join(OUT, 'flags', `${iso}.png`));
    flags.push(iso);
  }
}
out.flags = flags.sort();

mkdirSync(join(OUT, 'data'), { recursive: true });
writeFileSync(join(OUT, 'data/watchtower.json'), JSON.stringify(out));
console.log(`countries ${Object.keys(out.countries).length}, flags ${flags.length}, occupied rings ${out.frontline.occupied.length}`);
