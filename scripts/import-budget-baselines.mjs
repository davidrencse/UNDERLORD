// Refresh the compact, local fiscal seed. Values are the latest observations no later than
// 2024, so the 2025 game start does not rely on future observations. OECD pension values are
// transcribed from Pensions at a Glance 2025, Table 8.2 (latest year 2021-23).
// Usage: node scripts/import-budget-baselines.mjs
import { writeFileSync } from 'node:fs';

const WB = 'https://api.worldbank.org/v2/country/all/indicator/';
const indicators = {
  education: 'SE.XPD.TOTL.GD.ZS',
  health: 'SH.XPD.GHED.GD.ZS',
  military: 'MS.MIL.XPND.GD.ZS',
};
const pensions = {
  AUS: [3.4, 2022], AUT: [14, 2021], BEL: [10.7, 2021], CAN: [5.9, 2022],
  CZE: [8.2, 2021], DNK: [7.5, 2021], EST: [6.8, 2021], FIN: [12.2, 2021],
  FRA: [13.4, 2022], DEU: [10.8, 2021], GRC: [16.2, 2021], HUN: [7.6, 2021],
  ISL: [2.9, 2021], IRL: [2.9, 2021], ITA: [16.1, 2021], JPN: [9.2, 2022],
  KOR: [3.8, 2022], LVA: [7.5, 2021], LTU: [6.5, 2021], LUX: [8.6, 2021],
  NLD: [6.4, 2021], NZL: [5.1, 2022], NOR: [6.5, 2021], POL: [11.2, 2021],
  PRT: [12.9, 2021], SVK: [7.4, 2021], SVN: [10.6, 2021], ESP: [12.3, 2021],
  SWE: [8.0, 2021], CHE: [6.6, 2021], GBR: [7.1, 2022], USA: [7.3, 2023],
};
const countries = {};
for (const [category, indicator] of Object.entries(indicators)) {
  const response = await fetch(`${WB}${indicator}?format=json&per_page=25000&date=2018:2024`);
  if (!response.ok) throw new Error(`${indicator}: HTTP ${response.status}`);
  const [, observations] = await response.json();
  if (!Array.isArray(observations)) throw new Error(`${indicator}: no observations`);
  for (const item of observations) {
    const iso = item.countryiso3code;
    if (!/^[A-Z]{3}$/.test(iso) || item.value == null) continue;
    const year = Number(item.date);
    if (countries[iso]?.[category]?.year >= year) continue;
    (countries[iso] ??= {})[category] = { pctGdp: Math.round(item.value * 100) / 100, year };
  }
}
for (const [iso, [pctGdp, year]] of Object.entries(pensions)) {
  (countries[iso] ??= {}).pensions = { pctGdp, year };
}
const output = {
  sources: {
    education: 'World Bank / UNESCO, SE.XPD.TOTL.GD.ZS',
    health: 'World Bank / WHO, SH.XPD.GHED.GD.ZS',
    military: 'World Bank / SIPRI, MS.MIL.XPND.GD.ZS',
    pensions: 'OECD, Pensions at a Glance 2025, Table 8.2',
  },
  countries,
};
writeFileSync('public/data/budget-baselines.json', JSON.stringify(output));
console.log(`Wrote fiscal observations for ${Object.keys(countries).length} countries.`);
