// Headless run of the military simulation on the real starting world: loads the map, raises the
// armies, then advances a number of days and reports how the fronts moved.
//
//   node scripts/military-sim.mjs [days]

import { readFileSync } from 'node:fs';

globalThis.fetch = async (url) => {
  const body = readFileSync(new URL(`../public${url}`, import.meta.url));
  return { json: async () => JSON.parse(body) };
};

const { loadWorld } = await import('../src/world/geo.js');
const { Game } = await import('../src/game/game.js');
const { Units } = await import('../src/game/units.js');

const days = +(process.argv[2] ?? 30);
const t0 = performance.now();
const world = await loadWorld();
const game = new Game(world);
const units = new Units(game, world);
const t1 = performance.now();

const iso = (i) => game.nations[i].iso3;
const report = (label) => {
  const rus = world.byIso.get('RUS'), ukr = world.byIso.get('UKR');
  let occ = 0;
  for (let i = 0; i < world.owner.length; i++) if (world.owner[i] === ukr.index && world.control[i] === rus.index) occ++;
  const armies = units.armies.list.map((a) => {
    const m = units.armies.members(a);
    const sup = m.reduce((t, s) => t + s.supply, 0) / Math.max(1, m.length);
    const avg = (k) => (m.reduce((t, s) => t + s[k], 0) / Math.max(1, m.length) * 100).toFixed(0);
    const states = {};
    for (const s of m) states[s.state] = (states[s.state] ?? 0) + 1;
    return `${iso(a.owner)} ${a.name}: mp ${Math.round(game.nations[a.owner].manpower)}k pp ${Math.round(game.nations[a.owner].pp)} hubs+${units.armies.hubs.filter((h) => h.owner === a.owner && h.kind === "built").length}, ${m.length} div, front ${a.front?.segs.length ?? 0} seg, plan ${(a.plan * 100).toFixed(0)}%, ${a.executing ? 'ATTACKING' : 'holding'}, supply ${(sup * 100).toFixed(0)}%, str ${avg('str')}% org ${avg('org')}% dig ${avg('dig')}% ${JSON.stringify(states)}`;
  });
  console.log(`\n${label}: ${new Date(game.time).toISOString().slice(0, 10)}  occupied UKR px ${occ}  battles ${units.battles.length}  queue ${units.armies.queue.length}`);
  for (const l of armies) console.log('  ' + l);
};

console.log(`world + units in ${(t1 - t0).toFixed(0)} ms; ${units.stacks.length} formations; ${units.armies.hubs.length} supply hubs`);
report('start');
game.paused = false;
game.speed = 5;
const t2 = performance.now();
for (let d = 1; d <= days; d++) {
  for (let h = 0; h < 24; h++) { game.time += 3600000; game.emit('hour'); if (new Date(game.time).getUTCHours() === 0) game.dailyTick(); }
  if (d % 10 === 0) report(`day ${d}`);
}
console.log(`\n${days} days simulated in ${(performance.now() - t2).toFixed(0)} ms`);
