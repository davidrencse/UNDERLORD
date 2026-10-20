// Headless run of the economy on the real starting world. Prints GDP, growth, inflation,
// unemployment, debt, deficit, policy rate and commodity prices for a few countries each year.
//
//   node scripts/economy-sim.mjs [months=36] [ISO3,ISO3,...]

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const months = Number(process.argv[2] ?? 36);
const watch = (process.argv[3] ?? 'USA,CHN,RUS,DEU,JPN,IND,GBR,TUR,SAU,UKR,BRA,ARG').split(',');
const root = resolve('public');
globalThis.fetch = async (url) => {
  const buf = await readFile(resolve(root, '.' + String(url).replace(/^https?:\/\/[^/]+/, '')));
  return { ok: true, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf.buffer };
};

const { loadWorld } = await import('../src/world/geo.js');
const { Game } = await import('../src/game/game.js');
const { Units } = await import('../src/game/units.js');
const world = await loadWorld();
const game = new Game(world);
new Units(game, world);
// Optional scenario: SANCTION=USA,DEU:RUS makes those nations sanction the target.
if (process.env.SANCTION) {
  const [from, to] = process.env.SANCTION.split(':');
  const t = world.byIso.get(to);
  for (const f of from.split(',')) t.sanctionedBy.add(world.byIso.get(f).index);
}

const row = (n) => {
  const E = n.econ;
  return `${n.iso3.padEnd(4)} gdp ${n.gdp.toFixed(0).padStart(6)}  g ${n.growth.toFixed(1).padStart(5)}  π ${n.inflation.toFixed(1).padStart(5)}  u ${n.unemployment.toFixed(1).padStart(4)}  i ${n.interest.toFixed(2).padStart(5)}  debt ${n.debt.toFixed(0).padStart(4)}  def ${E.deficit.toFixed(1).padStart(5)}  xr ${E.xr.toFixed(2)}  res ${E.reserves.toFixed(0).padStart(5)}  mil ${E.milFactories}/${E.milFunded.toFixed(0)}  inv ${(E.acc?.inventories / E.Y * 100 || 0).toFixed(1)}%  stab ${n.stability.toFixed(0)}`;
};
const show = (label) => {
  const W = game.econ;
  console.log(`\n${label} ${new Date(game.time).toISOString().slice(0, 10)}  prices energy ${W.prices.energy.toFixed(2)} metals ${W.prices.metals.toFixed(2)} food ${W.prices.food.toFixed(2)}  world π ${W.piW.toFixed(1)} gap ${(W.gap * 100).toFixed(2)}%`);
  for (const iso of watch) { const n = world.byIso.get(iso); if (n?.econ) console.log('  ' + row(n)); }
};
show('start');
let m = 0;
while (m < months) {
  game.time += 3600000;
  game.emit('hour');
  if (new Date(game.time).getUTCHours() === 0) {
    game.dailyTick();
    if (new Date(game.time).getUTCDate() === 1) { m++; if (m % 12 === 0 || m === 1 || m === 3) show(`month ${m}`); }
  }
}
