// Fuel: the one resource an army burns rather than consumes once.
//
// After Hearts of Iron IV's fuel layer, fitted to this game's economy rather than to its
// resource tiles. A country refines fuel out of its own energy sector, buys the rest on the world
// market or under a standing deal, and stores what it does not burn. Armour, aircraft and fleets
// burn a great deal; infantry hardly any; everything burns more when it is moving or fighting.
//
// When the tanks are dry they do not stop dead — they move and fight at a fraction of their pace,
// which is what `fuelFactor` returns for a formation.

import { COMMODITIES } from './economy.js';

const DAY = 86400000;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Kilotonnes a day a full division, wing or flotilla burns at rest. Movement and battle multiply it.
export const BURN = {
  armor: 2.0, mech: 1.2, inf: 0.2, airborne: 0.3, marine: 0.5,
  air: 1.5, fleet: 2.5, carrier: 4, sub: 0.8,
};
// How much of a formation's fighting power depends on fuel. Infantry can walk; armour cannot.
export const MOTORISATION = {
  armor: 0.85, mech: 0.7, inf: 0.15, airborne: 0.3, marine: 0.4,
  air: 0.95, fleet: 0.9, carrier: 0.95, sub: 0.85,
};
const IDLE = 0.3, MOVING = 1.5, FIGHTING = 2.2;

export const FUEL = {
  refinePerBn: 0.02, // kilotonnes a day per billion of GDP, at full energy self-sufficiency
  perRefinery: 40, // kilotonnes a day from a built oil refinery
  perSynth: 25, // and from a synthetic plant, which needs no crude of its own
  siloDays: 8, // days of storage a fuel depot adds
  storageDays: 45, // days of peacetime burn a country can hold
  dealDays: 540, // a standing import deal runs about eighteen months
  dealPP: 35,
  dealCostPct: 0.0006, // share of GDP a deal costs a year
};

export function createFuel(n) {
  // Prime the reserve so a country starts with fuel in its tanks rather than at zero on day one.
  const prod = refining(n);
  const cap = Math.max(1, prod * storageDays(n));
  return { stock: cap * 0.6, cap, prod, imports: 0, use: 0, ratio: 1, deals: [], drought: 0 };
}

// What a country refines for itself. Its energy sector's self-sufficiency does the work.
export function refining(n) {
  const self = n.econ?.comm?.energy?.self ?? 0.5;
  const f = n.econ?.facilities;
  // Refineries need crude, so they scale with what the country can draw on; synthetic plants do
  // not, which is the whole reason an oil-poor state builds them.
  const built = (f?.refineries ?? 0) * FUEL.perRefinery * clamp(0.4 + self, 0.4, 1.4)
    + (f?.synth ?? 0) * FUEL.perSynth;
  return Math.max(0, n.gdp * FUEL.refinePerBn * clamp(self, 0, 1.4) + built);
}

// Days of burn a country can hold: its base reserve plus every fuel depot it has built.
export const storageDays = (n) => FUEL.storageDays + (n.econ?.facilities?.silos ?? 0) * FUEL.siloDays;

// What it can bring in: ordinary trade, plus standing deals, less blockade and sanctions.
export function importCapacity(g, n) {
  const F = n.fuel;
  const open = clamp(1 - (n.econ?.restr ?? 0), 0.1, 1);
  const base = n.gdp * FUEL.refinePerBn * 0.6 * open;
  let deals = 0;
  for (const d of F?.deals ?? []) {
    const partner = g.nations[d.with];
    if (!partner || partner.inert) continue;
    if (g.atWar(d.with, n.index)) continue;
    deals += d.kt;
  }
  return { market: base, deals };
}

// Daily burn across a nation's formations.
export function fuelDemand(g, n, stacks) {
  let use = 0;
  for (const s of stacks) {
    if (s.owner !== n.index) continue;
    const rate = BURN[s.type] ?? 0.3;
    const tempo = s.battle ? FIGHTING : s.state === 'moving' || s.state === 'retreat' ? MOVING : IDLE;
    use += rate * tempo * (s.divs ?? 1) * (s.str ?? 1);
  }
  return use;
}

// One day of fuel for one nation. `stacks` is the formation list; tests pass their own.
export function fuelDay(g, n, stacks) {
  const F = n.fuel;
  if (!F) return;
  const use = fuelDemand(g, n, stacks);
  const prod = refining(n);
  const cap = importCapacity(g, n);
  const storage = Math.max(1, (prod + cap.deals + cap.market * 0.5) * storageDays(n));

  // Buy what the day's burn is short of, and top the reserve up a little at a time.
  const want = Math.max(0, use - prod) + Math.max(0, (storage - F.stock) * 0.02);
  const bought = Math.min(want, cap.market + cap.deals);

  F.prod = prod;
  F.imports = bought;
  F.use = use;
  F.cap = storage;
  F.stock = clamp(F.stock + prod + bought - use, 0, F.cap);

  // What the army actually gets: everything it asked for while there is fuel in the tanks, and
  // only the day's inflow once they run dry.
  const supplied = F.stock > 0 ? use : Math.min(use, prod + bought);
  F.ratio = use > 0 ? clamp(supplied / use, 0, 1) : 1;
  F.drought = F.ratio < 0.95 ? F.drought + 1 : 0;

  // A standing deal costs money every year it runs, and lapses when its term is up.
  F.deals = F.deals.filter((d) => d.until > g.time);
}

// How well a formation moves and fights on the fuel it is getting.
export function fuelFactor(n, type) {
  const r = n?.fuel?.ratio;
  if (r == null || r >= 1) return 1;
  return clamp(1 - (1 - r) * (MOTORISATION[type] ?? 0.4), 0.25, 1);
}

// ------------------------------------------------------------------ deals
// The best partner to buy from: a big energy exporter that is not at war with us and not a
// sanctioning state.
export function bestSupplier(g, n) {
  let best = null, bestScore = 0;
  for (const m of g.live()) {
    if (m.index === n.index || g.atWar(m.index, n.index)) continue;
    if (n.sanctionedBy?.has(m.index)) continue;
    const k = m.econ?.comm?.energy;
    if (!k) continue;
    const surplus = (k.self - 1) * k.val * (m.econ.Y0 ?? m.gdp);
    if (surplus <= 0) continue;
    const warmth = g.allied(m.index, n.index) ? 1.4 : 1;
    const score = surplus * warmth;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

export function signFuelDeal(g, n) {
  const supplier = bestSupplier(g, n);
  if (!supplier) return false;
  const kt = Math.max(1, refining(supplier) * 0.08);
  n.fuel.deals.push({ with: supplier.index, kt, until: g.time + FUEL.dealDays * DAY });
  n.timed?.push({ id: `fuel_deal_${supplier.iso3}`, until: g.time + FUEL.dealDays * DAY, mod: { growth: -0.05 } });
  g.log(`${n.name} signs an oil import deal with ${supplier.name}.`, { nation: n.index, kind: 'economy' });
  return true;
}

export function fuelDecisions(n) {
  return [{
    id: 'fuel_deal',
    name: 'Sign an oil import deal',
    cost: FUEL.dealPP,
    cd: 120,
    desc: 'Lock in a standing fuel import at a price above the market, for about eighteen months. A country whose tanks run dry fights at a fraction of its strength.',
    needs: (g, country) => {
      if ((country.fuel?.deals?.length ?? 0) >= 3) return 'Three standing deals is as many as the refineries can take.';
      return bestSupplier(g, country) ? true : 'No exporter will sell to us.';
    },
    run: (g, country) => signFuelDeal(g, country),
  }];
}

export const fuelDays = (n) => (n.fuel?.use > 0 ? n.fuel.stock / n.fuel.use : Infinity);
void COMMODITIES;
