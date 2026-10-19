// Headless benchmark: world loading and simulation throughput, no browser needed.
//
//   node scripts/bench.mjs [days=90]
//
// Serves fetch() from ./public so the game's own loaders run unchanged.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const days = Number(process.argv[2] ?? 90);
const root = resolve('public');
globalThis.fetch = async (url) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, '');
  const buf = await readFile(resolve(root, '.' + path));
  return { ok: true, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf.buffer };
};

const t0 = performance.now();
const { loadWorld } = await import('../src/world/geo.js');
const { Game } = await import('../src/game/game.js');
const { Units } = await import('../src/game/units.js');
const world = await loadWorld();
const tLoad = performance.now();
const game = new Game(world);
const units = new Units(game, world);
const tInit = performance.now();

game.player = world.byIso.get('UKR').index;
game.paused = false;
game.speed = 5;
const hourTimes = [], dayTimes = [];
let hourStart = 0;
game.on('hour', () => { hourStart = performance.now(); });
const origHour = units.hourTick.bind(units);
units.hourTick = () => { const s = performance.now(); origHour(); hourTimes.push(performance.now() - s); };
const origDay = game.dailyTick.bind(game);
game.dailyTick = () => { const s = performance.now(); origDay(); dayTimes.push(performance.now() - s); };

const tSim = performance.now();
const d0 = game.day;
while (game.day - d0 < days) game.advance(1.6);
const tEnd = performance.now();

const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const p95 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)] ?? 0;
const res = {
  loadWorldMs: Math.round(tLoad - t0),
  initGameAndUnitsMs: Math.round(tInit - tLoad),
  simulatedDays: game.day - d0,
  msPerGameDay: +((tEnd - tSim) / (game.day - d0)).toFixed(2),
  hourTickAvgMs: +avg(hourTimes).toFixed(3),
  hourTickP95Ms: +p95(hourTimes).toFixed(3),
  dailyTickAvgMs: +avg(dayTimes).toFixed(3),
  stacks: units.stacks.length,
  battles: units.battles.length,
  impacts: units.impacts.length,
  wrecks: units.wrecks.length,
  wars: game.wars.length,
  ukraineHeld: +(world.byIso.get('UKR').held / world.byIso.get('UKR').pixels).toFixed(3),
  date: new Date(game.time).toISOString().slice(0, 10),
};
console.log(JSON.stringify(res, null, 2));
void hourStart;
