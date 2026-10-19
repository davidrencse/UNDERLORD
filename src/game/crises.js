// The crisis engine. Crises emerge from each nation's state rather than a script, and each one
// pushes on at least two other systems (economy, politics, power centres, diplomacy).
import { haversine } from '../util/geo.js';

const DAY = 86400000;
const AUTOMATION_FROM = Date.UTC(2026, 0, 1);
// Capitals never move, so each capital-to-capital distance is computed once (keyed by the capital objects).
const capDist = new WeakMap();
function capitalKm(a, b) {
  let row = capDist.get(a);
  if (!row) capDist.set(a, (row = new WeakMap()));
  let d = row.get(b);
  if (d === undefined) row.set(b, (d = haversine(a, b)));
  return d;
}

// Each crisis: when(game, n) → daily probability; options are offered to the player, the AI takes ai().
const DEFS = [
  {
    id: 'protests',
    title: 'Cost-of-living protests',
    when: (g, n) => (n.inflation > 7 || n.unemployment > 11) && n.stability < 55 && !g.hasSpirit(n, 'mass_protests') ? 0.0025 : 0,
    text: (n) => `Prices and joblessness have brought crowds onto the streets of ${n.capitalName ?? 'the capital'}. Unions are calling a general strike; opposition parties smell blood.`,
    start: (g, n) => { g.addTimed(n, 'mass_protests', 90); },
    options: [
      { label: 'Negotiate with the unions', desc: 'Wage concessions buy calm at a fiscal cost.', fx: { pp: -40, debt: 1.5, loyalty: { labor: 14, business: -6 }, stabNow: 3 } },
      { label: 'Deploy riot police', desc: 'Order is restored. Not everyone will forget how.', fx: { stabNow: 2, loyalty: { security: 10, media: -10, labor: -12 }, opposition: 3 } },
      { label: 'Call early elections', desc: 'Let the voters settle it.', fx: { election: true, stabNow: 4, pp: -20 }, democratic: true },
    ],
  },
  {
    id: 'recession',
    title: 'Recession',
    when: (g, n) => n.growth < -0.2 && !g.hasSpirit(n, 'recession') ? 0.01 : 0,
    text: (n) => `Two quarters of contraction. ${n.name}'s factories are cutting shifts and the central bank is under pressure. Trading partners will feel it.`,
    start: (g, n) => {
      g.addTimed(n, 'recession', 180);
      // Contagion through trade and bloc ties.
      for (const m of g.live()) {
        if (m === n) continue;
        const tied = m.blocs.some((b) => n.blocs.includes(b) && ['EU', 'GCC', 'ASEAN'].includes(b)) || (n.gdp > 2000 && m.gdp > 200);
        if (tied) g.addTimed(m, `contagion_${n.iso3}`, 150, { growth: -Math.min(0.6, n.gdp / 20000 * 2) });
      }
    },
    options: [
      { label: 'Stimulus package', desc: 'Borrow and spend to restart demand.', fx: { timed: ['stimulus', 270], debt: 4, loyalty: { labor: 8 } } },
      { label: 'Austerity budget', desc: 'Cut spending to reassure bond markets.', fx: { timed: ['austerity', 270], debt: -4, loyalty: { business: 8, labor: -10 }, opposition: 2 } },
      { label: 'Let the market correct', desc: 'Do nothing and absorb the pain.', fx: { pp: 25, stabNow: -3 } },
    ],
  },
  {
    id: 'refugees',
    title: 'Refugee wave',
    when: (g, n) => (n._nearWar && !g.hasSpirit(n, 'refugee_pressure') ? 0.004 : 0),
    text: (n) => `Tens of thousands fleeing ${n._nearWar} are arriving at ${n.name}'s border. Reception centres are full; the issue now dominates the news.`,
    start: (g, n) => { g.addTimed(n, 'refugee_pressure', 150); },
    options: [
      { label: 'Open the border', desc: 'Humanitarian intake. Long-run labour gains, short-run strain.', fx: { stabNow: -3, growth: 0.15, party: {}, nationalist: 3, loyalty: { clergy: 6 } } },
      { label: 'Tighten border controls', desc: 'Fences and pushbacks. Neighbours and courts object.', fx: { stabNow: 2, loyalty: { security: 6, media: -6 }, nationalist: -1 } },
      { label: 'Seek burden-sharing abroad', desc: 'Spend political capital to resettle arrivals across the bloc.', fx: { pp: -45, stabNow: 1 } },
    ],
  },
  {
    id: 'debt',
    title: 'Sovereign debt crisis',
    when: (g, n) => n.debt > 110 && (n.interest > 7 || n.growth < -0.5) && !g.hasSpirit(n, 'imf_bailout') ? 0.0025 : 0,
    text: (n) => `Bond yields have spiked. ${n.name} cannot roll over its debt at these rates. The IMF has a team on standby.`,
    options: [
      { label: 'Accept an IMF programme', desc: 'Cheap money, strict conditions.', fx: { timed: ['imf_bailout', 540], debt: -10, loyalty: { labor: -10, business: 6 } } },
      { label: 'Default and restructure', desc: 'Stop paying. Markets will remember.', fx: { debt: -35, stabNow: -8, timed: ['recession', 240], loyalty: { business: -18 } } },
    ],
  },
  {
    id: 'disaster',
    title: 'Natural disaster',
    when: (g, n) => (n.inert ? 0 : 0.00035 * (Math.abs(n.capital.lat) < 35 ? 1.6 : 1)),
    text: (n) => {
      const kind = Math.abs(n.capital.lat) < 25 ? 'A cyclone has made landfall' : Math.abs(n.capital.lat) < 40 ? 'Drought and wildfire have hit' : 'Catastrophic flooding has struck';
      return `${kind} in ${n.name}. Thousands are displaced, harvests are lost and infrastructure needs rebuilding.`;
    },
    start: (g, n) => { g.addTimed(n, 'natural_disaster', 160); },
    options: [
      { label: 'Emergency relief fund', desc: 'Rebuild fast, borrow for it.', fx: { debt: 2, stabNow: 3, loyalty: { regions: 8 } } },
      { label: 'Request international aid', desc: 'Partners help. It costs some standing.', fx: { pp: -30, stabNow: 2 } },
    ],
  },
  {
    id: 'automation',
    title: 'Automation wave',
    when: (g, n) => (g.time > AUTOMATION_FROM &&n.gdp / n.pop > 30 && !g.hasSpirit(n, 'automation_wave') && !n._automated ? 0.0006 : 0),
    text: (n) => `AI agents are replacing call centres, paralegals and junior analysts across ${n.name}. Productivity is up; so is anxiety.`,
    start: (g, n) => { n._automated = true; g.addTimed(n, 'automation_wave', 720); },
    options: [
      { label: 'Fund retraining programmes', desc: 'Cushion the transition.', fx: { debt: 1.5, stabNow: 3, loyalty: { labor: 10 } } },
      { label: 'Embrace automation', desc: 'Let productivity rip.', fx: { growth: 0.4, loyalty: { business: 12, labor: -14 }, opposition: 2 } },
    ],
  },
  {
    id: 'scandal',
    title: 'Government scandal',
    when: (g, n) => (n.politics.next ? 0.0005 : 0),
    text: (n) => `Leaked messages implicate senior ministers in ${n.name} in a procurement kickback scheme. The press is relentless.`,
    options: [
      { label: 'Sack the ministers', desc: 'Cut them loose quickly.', fx: { pp: -35, stabNow: 1 } },
      { label: 'Ride it out', desc: 'Deny everything and wait for the next news cycle.', fx: { rulingShare: -3, loyalty: { media: -10 } } },
    ],
  },
  {
    id: 'coup',
    title: 'Coup attempt',
    when: (g, n) => {
      const mil = n.powerCentres.find((p) => p.type === 'military');
      if (!mil || mil.loyalty > 28 || mil.influence < 12) return 0;
      return n.stability < 30 ? 0.0012 : 0.0002;
    },
    text: (n) => `Armoured vehicles are moving on ${n.name}'s government quarter. Senior officers have declared the government illegitimate.`,
    options: [
      { label: 'Rally loyal units', desc: 'Fight it out. Success is not guaranteed.', fx: { coupFight: true } },
      { label: 'Negotiate with the officers', desc: 'Share power with the generals.', fx: { pp: -60, loyalty: { military: 25 }, stabNow: -4 } },
    ],
    ai: (g, n) => (g.r() < 0.45 ? 'succeed' : 'fail'),
  },
];

function resolveCoup(g, n, success) {
  if (success) {
    n.leader = `General council`;
    n.title = 'Military council';
    n.gov = 'Military junta';
    n.ideology = 'aut';
    n.politics.ruling = [n.politics.list[0].id];
    n.politics.next = null;
    g.addTimed(n, 'martial_rule', 365);
    for (const p of n.powerCentres) if (p.type === 'military') p.loyalty = 85;
    g.log(`Coup in ${n.name}: the military has seized power.`, { nation: n.index, kind: 'politics', major: true });
  } else {
    for (const p of n.powerCentres) if (p.type === 'military') p.loyalty = 55;
    n.stability = Math.max(0, n.stability - 6);
    g.log(`A coup attempt in ${n.name} has failed.`, { nation: n.index, kind: 'politics', major: n.gdp > 100 });
  }
  g.emit('politics', n);
}

export const CRISES = {
  defs: DEFS,
  daily(g) {
    // Precompute which nations border a war, for the refugee crisis.
    const warring = g.live().filter((n) => g.warsOf(n.index).length && n.stability < 55);
    for (const n of g.live()) {
      n._nearWar = null;
      if (g.warsOf(n.index).length) continue;
      for (const w of warring) {
        if (capitalKm(n.capital, w.capital) < 1300){ n._nearWar = w.name; break; }
      }
    }

    for (const n of g.live()) {
      for (const def of DEFS) {
        const p = def.when(g, n);
        if (!p || g.r() > p) continue;
        def.start?.(g, n);
        if (n.index === g.player) {
          g.pendingEvents.push({ def, nation: n.index });
          g.emit('event');
        } else {
          this.aiResolve(g, n, def);
        }
        g.log(`${def.title}: ${n.name}.`, { nation: n.index, kind: 'crisis', major: n.gdp > 800 });
        break;
      }
    }

    // A recession among several large economies becomes a global financial crisis.
    const big = g.live().filter((n) => n.gdp > 800);
    const inRecession = big.filter((n) => n.growth < 0).length;
    if (inRecession >= 5 && !g.globalMods.some((m) => m.id === 'gfc')) {
      g.globalMods.push({ id: 'gfc', name: 'Global financial crisis', until: g.time + 365 * DAY, mod: { growth: -0.9, stab: -3 } });
      g.log('Global financial crisis: credit markets freeze as recession spreads across major economies.', { kind: 'crisis', major: true });
    }
  },

  aiResolve(g, n, def) {
    if (def.id === 'coup') { resolveCoup(g, n, def.ai(g, n) === 'succeed'); return; }
    const opts = def.options.filter((o) => !o.democratic || n.politics.next);
    const o = opts[Math.floor(g.r() * opts.length)];
    this.apply(g, n, o);
  },

  apply(g, n, option) {
    const fx = { ...option.fx };
    if (fx.coupFight) { resolveCoup(g, n, g.r() < 0.3); return; }
    if (fx.nationalist) {
      const nat = n.politics.list.filter((p) => p.ideo === 'nat').sort((a, b) => b.share - a.share)[0];
      if (nat) nat.share += fx.nationalist;
      delete fx.nationalist;
    }
    g.applyFx(n, fx);
  },
};
