import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNations } from '../src/data/nations.js';
import { demographicProfile } from '../src/ui/demographicsScreen.js';

const data = JSON.parse(readFileSync(new URL('../public/data/demographics.json', import.meta.url)));

test('the imported baseline covers nearly every curated playable country', () => {
  const countries = Object.values(parseNations());
  const covered = countries.filter((country) => data.countries[country.iso3]?.ages0to14);
  assert.ok(covered.length >= 140);
  assert.equal(data.countries.USA.ages0to14.year, 2024);
  assert.equal(data.countries.USA.ages15to64.year, 2024);
});

test('demographics preserve source gaps and do not invent missing age values', () => {
  const n = { pop: 2.4, wt: { fertility: 1.7, migration: { netMigration: 'net outflow' } } };
  const p = demographicProfile(n);
  assert.equal(p.population, 2_400_000);
  assert.deepEqual(p.fertility, { value: 1.7, year: null });
  assert.deepEqual(p.ages, [undefined, undefined, undefined]);
  assert.equal(p.netMigration, 'net outflow');
});
