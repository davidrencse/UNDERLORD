// World Development Indicators available at or before the game's January 2025 start.
import { writeFile } from 'node:fs/promises';

const indicators = {
  ages0to14: 'SP.POP.0014.TO.ZS',
  ages15to64: 'SP.POP.1564.TO.ZS',
  ages65plus: 'SP.POP.65UP.TO.ZS',
  urbanShare: 'SP.URB.TOTL.IN.ZS',
  lifeExpectancy: 'SP.DYN.LE00.IN',
  birthRate: 'SP.DYN.CBRT.IN',
  fertility: 'SP.DYN.TFRT.IN',
};

const countries = {};
const names = {};
for (const [field, indicator] of Object.entries(indicators)) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000&date=2020:2024`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${indicator}: HTTP ${response.status}`);
  const [metadata, rows] = await response.json();
  if (metadata.pages !== 1 || !Array.isArray(rows)) throw new Error(`${indicator}: incomplete response`);
  for (const row of rows) {
    if (!row.countryiso3code || row.value == null) continue;
    names[row.countryiso3code] = row.country.value;
    const record = countries[row.countryiso3code] ??= {};
    if (!record[field] || Number(row.date) > record[field].year) {
      record[field] = { value: row.value, year: Number(row.date) };
    }
  }
}

const result = { source: 'World Bank World Development Indicators', through: 2024, names, countries };
await writeFile(new URL('../public/data/demographics.json', import.meta.url), `${JSON.stringify(result)}\n`);
console.log(`Saved demographics for ${Object.keys(countries).length} country and aggregate codes.`);
