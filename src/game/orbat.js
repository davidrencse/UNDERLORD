// Real-world tables of organisation and movement rates that size and pace every formation.
//
// Sources (open literature):
// - US Armored Brigade Combat Team: 87 M1 Abrams, ~144 M2 Bradleys, 18 M109 Paladins, ~4,400–4,700
//   soldiers (CRS via USNI, Dec 2025; Defense Daily on 3/4 ABCT's 2017 rotation). A US armoured
//   division fields three ABCTs plus division artillery and sustainment.
// - Russian battalion tactical group, 2022 template: ~600 soldiers, one tank company (~10 T-72/T-90),
//   ~30–40 BMP/BTR, six 2S3/2S19 and six BM-21 (RUSI; Defence24 citing OSW). Russian and Chinese
//   divisions are smaller than Western ones, hence DOCTRINE_SCALE.
// - US mechanised division area defence: a band roughly 20–30 km wide and 30 km deep (FM 3-90, 2001).
//   UNDERLORD compresses this to ~4.5 km a division so a corps occupies about one city.
// - Road march: close column 25–50 m between vehicles, open column 50–200 m (FM 3-21.21 app. G).
// - M1A2: 67 km/h on road, 40–48 km/h cross-country, 426 km range (Janes). T-90: 65 / 45 km/h.
// - Opposed advance rates (Dupuy Institute): 1.8 km/day average in Western Europe 1943–45, 4.5 on
//   the Eastern Front 1943, 4–11 km/day after a penetration, ~26 km/day in 1973.

// Equipment of one full-strength division, by formation type (Western pattern).
export const DIVISION = {
  armor: { men: 14000, mbt: 261, ifv: 300, apc: 60, spg: 54, mlrs: 18, truck: 1100, heli: 0 },
  mech: { men: 15000, mbt: 90, ifv: 420, apc: 120, spg: 54, mlrs: 18, truck: 1200, heli: 0 },
  inf: { men: 14000, mbt: 30, ifv: 0, apc: 180, spg: 36, mlrs: 12, truck: 1400, heli: 0 },
  airborne: { men: 11000, mbt: 0, ifv: 40, apc: 40, spg: 18, mlrs: 0, truck: 500, heli: 48 },
  marine: { men: 13000, mbt: 0, ifv: 0, apc: 180, spg: 18, mlrs: 6, truck: 800, heli: 24 },
};
export const DOCTRINE_SCALE = { west: 1, east: 0.7, china: 0.85 };

// Average km covered per day, including halts. March = friendly territory on roads;
// contested = advancing through enemy-held ground (Dupuy's penetration rates, 1973 at the top).
export const MOVE = {
  armor: { march: 220, contested: 16 },
  mech: { march: 240, contested: 13 },
  inf: { march: 200, contested: 7 },
  airborne: { march: 160, contested: 9 },
  marine: { march: 180, contested: 9 },
};
export const URBAN_SLOW = 0.45; // street fighting and rubble
export const URBAN_DEFENCE = 1.5; // defenders in a city

// Physical footprint of a deployed division, in metres (frontage × depth).
export const DIV_FRONT = 4500;
export const DIV_DEPTH = 5000;
export const COLUMN_GAP = 45; // metres between vehicles in a close column

export function kitOf(s, doctrine) {
  const base = DIVISION[s.type];
  if (!base) return null;
  const k = DOCTRINE_SCALE[doctrine] ?? 1;
  const out = {};
  for (const [key, v] of Object.entries(base)) out[key] = Math.round(v * k * s.divs);
  return out;
}

// Km/h for a land formation given where it is.
export function landSpeed(type, { contested, urban, org }) {
  const m = MOVE[type];
  if (!m) return 0;
  let perDay = contested ? m.contested : m.march;
  if (urban) perDay *= URBAN_SLOW;
  return (perDay / 24) * (0.6 + 0.4 * org);
}
