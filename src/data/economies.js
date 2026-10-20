// Starting economic structure for each country, 20 January 2025.
//
// Curated rows are rounded game estimates informed by World Bank WDI sector value added
// (NV.AGR / NV.IND.MANF / NV.IND), IMF WEO October 2024 fiscal balances and reserve data, and
// national debt-management offices for average maturity. They are gameplay baselines, not
// verified statistics. Every other country is estimated from income, exports and spirits.
//
// sec: agriculture, mining, energy & utilities, manufacturing, construction, technology (% of GDP;
//      services take the remainder, defence industry is carved out of it at run time)
// self: domestic production ÷ domestic demand for energy, metals and food
// res: foreign-exchange reserves $bn · mat: average public-debt maturity, months
// fx: share of public debt in foreign currency · def: general-government deficit % of GDP
// inv: gross investment % of GDP · exp/imp: exports and imports % of GDP · tgt: inflation target
// tariff: average applied import tariff % · laws: starting economic laws (see LAWS in economy.js)

const C = (sec, self, res, mat, fx, def, inv, exp, imp, tgt, tariff, laws = {}) => ({ sec, self, res, mat, fx, def, inv, exp, imp, tgt, tariff, laws });

export const ECONOMIES = {
  USA: C([0.9, 1.3, 2.4, 10.2, 4.4, 8.5], [1.08, 0.7, 1.15], 245, 70, 0, 6.3, 21.5, 11, 14, 2, 2.5, { model: 'liberal' }),
  CHN: C([6.8, 3, 3.5, 26.2, 6.8, 7.5], [0.8, 0.55, 0.88], 3300, 80, 0.01, 7, 41, 20, 17, 3, 7.5, { model: 'state', currency: 'managed', monetary: 'directed', exports: 'controls' }),
  RUS: C([3.5, 6, 11, 13, 5, 3], [2.6, 1.6, 1.25], 320, 60, 0.12, 1.7, 22, 25, 18, 4, 6.5, { model: 'war', currency: 'controls' }),
  IND: C([16, 2, 3, 13, 9, 6], [0.58, 0.85, 1.08], 650, 140, 0.04, 7.5, 31, 21, 24, 4, 12, { model: 'mixed', currency: 'managed' }),
  GBR: C([0.6, 0.6, 2.4, 8.5, 6, 7], [0.65, 0.3, 0.6], 180, 170, 0, 4.8, 17.5, 30, 33, 2, 3.5, { model: 'liberal', labor: 'flexible' }),
  FRA: C([1.6, 0.2, 2.2, 9.5, 5.5, 5], [0.55, 0.3, 1.25], 250, 100, 0, 5.8, 24, 33, 35, 2, 3, { labor: 'protected' }),
  DEU: C([0.8, 0.2, 2.4, 18.5, 5.5, 5.5], [0.33, 0.25, 0.9], 300, 85, 0, 2.6, 21, 43, 38, 2, 3, { fiscal: 'brake' }),
  JPN: C([1, 0.1, 2.5, 19.5, 5.5, 5.5], [0.13, 0.1, 0.38], 1230, 110, 0, 3, 26, 22, 23, 2, 2.5, { monetary: 'directed' }),
  ITA: C([1.9, 0.3, 2.2, 15, 5.5, 4], [0.25, 0.2, 0.8], 230, 85, 0, 3.4, 22, 33, 30, 2, 3),
  CAN: C([1.8, 5.5, 3.5, 9.5, 7.5, 5], [1.9, 1.8, 1.6], 120, 80, 0, 2, 23, 33, 34, 2, 2.5, { model: 'liberal' }),
  BRA: C([6.5, 3.5, 3, 10, 4, 4], [1.1, 2.2, 1.9], 330, 50, 0.04, 7.8, 17, 18, 17, 3, 11.5),
  KOR: C([1.6, 0.1, 2.6, 25.5, 5.5, 9], [0.18, 0.1, 0.45], 410, 120, 0, 2.5, 31, 44, 41, 2, 8.5),
  AUS: C([2.5, 11, 2.5, 5.5, 7.5, 4], [2.4, 6, 2.1], 60, 100, 0, 1.6, 23, 25, 21, 2.5, 2.5, { model: 'liberal' }),
  ESP: C([2.5, 0.2, 2.5, 11, 6, 3.5], [0.3, 0.3, 1.3], 90, 95, 0, 3.1, 20, 36, 33, 2, 3),
  MEX: C([3.5, 4, 3, 19, 6.5, 2.5], [0.85, 1.3, 0.8], 230, 95, 0.15, 5, 23, 39, 41, 3, 4),
  IDN: C([12.5, 7, 3, 18.5, 10, 4.5], [1.6, 2.2, 0.95], 155, 100, 0.25, 2.3, 29, 22, 20, 3, 6, { currency: 'managed' }),
  NLD: C([1.6, 0.5, 2.5, 11, 5, 5.5], [0.45, 0.2, 1.4], 60, 80, 0, 2, 21, 90, 80, 2, 3),
  TUR: C([6, 1, 3, 20, 5.5, 3], [0.3, 0.6, 1.05], 150, 50, 0.4, 4.9, 31, 32, 34, 5, 9, { monetary: 'directed' }),
  SAU: C([2.5, 1.5, 32, 14, 6, 2], [4.2, 0.6, 0.35], 455, 100, 0.35, 2.5, 26, 32, 27, 2.5, 5.5, { model: 'state', currency: 'managed' }),
  CHE: C([0.6, 0.1, 1.8, 18.5, 5, 5], [0.3, 0.1, 0.55], 900, 100, 0, -0.3, 25, 70, 60, 1, 0, { model: 'liberal', fiscal: 'brake' }),
  POL: C([2.5, 1.5, 3, 18.5, 7, 4], [0.55, 0.9, 1.25], 205, 60, 0.25, 6.6, 18, 55, 52, 2.5, 3),
  TWN: C([1.5, 0.1, 2, 32, 3, 13], [0.07, 0.05, 0.33], 575, 100, 0, -0.5, 26, 65, 55, 2, 4.5, { currency: 'managed' }),
  SWE: C([1.2, 0.8, 3, 14, 6, 6], [0.75, 2, 0.95], 60, 70, 0.2, 1.5, 24, 54, 49, 2, 3, { fiscal: 'rule' }),
  ARG: C([7, 3.5, 4, 16, 3.5, 2.5], [1.3, 1.3, 3.5], 30, 40, 0.7, -0.5, 16, 15, 13, 5, 13, { currency: 'controls', fiscal: 'rule', model: 'liberal' }),
  ISR: C([1.2, 0.5, 2, 11, 6, 18], [0.85, 0.3, 0.55], 215, 95, 0.12, 6.8, 24, 30, 28, 2, 2),
  ARE: C([0.8, 0.5, 26, 9, 9, 4], [3.2, 0.4, 0.2], 200, 90, 0.5, -4, 22, 98, 75, 2, 4.5, { model: 'state', currency: 'managed' }),
  NOR: C([1.5, 0.5, 21, 6, 6, 4], [5.5, 1.1, 0.5], 80, 60, 0, -9, 22, 45, 30, 2, 1.5, { fiscal: 'rule' }),
  IRN: C([10, 3, 18, 15, 5, 2], [1.6, 1.3, 0.85], 30, 40, 0.1, 5, 27, 23, 22, 10, 18, { model: 'state', currency: 'controls', monetary: 'financing' }),
  THA: C([8.5, 2, 3.5, 25, 3, 3], [0.55, 0.5, 1.6], 230, 100, 0.05, 4.4, 23, 65, 62, 2, 9),
  VNM: C([12, 3, 4, 24.5, 6.5, 3], [0.8, 1.1, 1.35], 85, 95, 0.4, 3.5, 32, 87, 82, 4, 9.5, { model: 'state', currency: 'managed' }),
  PHL: C([9, 1, 3, 17, 7, 4], [0.5, 1.6, 0.85], 105, 95, 0.3, 5.7, 25, 27, 38, 3, 6),
  EGY: C([11, 3, 5, 15, 7, 3], [0.9, 0.8, 0.5], 46, 40, 0.3, 7, 15, 17, 25, 7, 17, { model: 'state', currency: 'managed' }),
  PAK: C([23, 2.5, 3, 12.5, 2.5, 2], [0.5, 0.5, 1.0], 11, 40, 0.4, 6.8, 13, 10, 17, 6, 10),
  ZAF: C([2.5, 7.5, 3.5, 13, 3, 3], [0.85, 4.5, 1.15], 62, 140, 0.1, 6, 15, 33, 31, 4.5, 7.5, { labor: 'protected' }),
  NGA: C([24, 5.5, 8, 9, 3.5, 9], [2.2, 0.6, 0.8], 40, 120, 0.35, 4.2, 18, 15, 13, 9, 12),
  QAT: C([0.3, 0.5, 38, 8, 9, 2], [9, 0.2, 0.1], 50, 80, 0.4, -4, 33, 60, 30, 2, 5, { model: 'state', currency: 'managed' }),
  KWT: C([0.4, 0.2, 42, 6, 3, 2], [7, 0.2, 0.1], 50, 90, 0.2, 3, 20, 55, 35, 2.5, 5, { model: 'state', currency: 'managed' }),
  VEN: C([5, 2, 22, 10, 2, 1], [2.8, 0.8, 0.6], 10, 30, 0.9, 6, 8, 25, 18, 20, 13, { model: 'state', currency: 'controls', monetary: 'financing' }),
  // Ukraine's deficit is after foreign budget support (aid, % of GDP), which lasts while the
  // western_aid spirit does.
  UKR: { ...C([9, 3, 4, 9.5, 2.5, 5], [0.65, 1.4, 2.6], 43, 50, 0.6, 18, 15, 25, 50, 5, 4, { model: 'war', currency: 'controls' }), aid: 14 },
  PRK: C([22, 9, 4, 20, 8, 1], [0.6, 1.4, 0.8], 1, 30, 0.8, 3, 20, 6, 9, 5, 15, { model: 'war', currency: 'controls', monetary: 'financing' }),
  CUB: C([4, 1.5, 3, 11, 5, 1], [0.35, 1.3, 0.4], 2, 30, 0.8, 10, 8, 12, 20, 10, 10, { model: 'state', currency: 'controls', monetary: 'financing' }),
};

// Inflation, policy rate and unemployment around January 2025 (rounded, national statistics
// and central banks), used where the WatchTower import has none.
export const MACRO = {
  CHN: [0.2, 3.1, 5.1], IND: [5.2, 6.5, 4.9], JPN: [3.6, 0.5, 2.5], BRA: [4.6, 12.25, 6.2], KOR: [2.2, 3, 2.8],
  MEX: [3.6, 10, 2.7], IDN: [1.6, 5.75, 4.9], TUR: [42, 45, 8.6], SAU: [1.9, 5, 3.5], TWN: [2.1, 2, 3.4],
  ARG: [60, 32, 6.9], ISR: [3.8, 4.5, 3], ARE: [1.7, 4.4, 2.1], IRN: [35, 23, 7.6], THA: [1, 2.25, 0.9],
  VNM: [3.6, 4.5, 2.2], PHL: [2.9, 5.75, 3.8], EGY: [24, 27.25, 6.4], PAK: [2.4, 12, 7], NGA: [24.5, 27.5, 5],
  QAT: [1.2, 5, 0.1], KWT: [2.5, 4, 2.1], VEN: [48, 59, 5.5], PRK: [5, 5, 3], CUB: [25, 9, 1.6],
};

// Euro-area members share one exchange rate and the European Central Bank's policy rate.
export const EURO = new Set(['DEU', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'AUT', 'IRL', 'FIN', 'PRT', 'GRC', 'SVK', 'SVN', 'EST', 'LVA', 'LTU', 'LUX', 'MLT', 'CYP', 'HRV']);
// Currencies held at a fixed rate (Gulf dollar pegs, Hong Kong, Denmark's ERM II band, CFA franc).
export const PEGGED = new Set(['SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN', 'JOR', 'HKG', 'DNK', 'PAN', 'SEN', 'CIV', 'CMR', 'MLI', 'BFA', 'NER', 'TCD', 'GAB', 'COG', 'BEN', 'TGO']);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pctOf = (s) => { const m = /(-?\d+(?:\.\d+)?)/.exec(s ?? ''); return m ? Number(m[1]) : null; };

// An estimated profile for a country with no curated row, from what the game knows about it.
export function estimateEconomy(n) {
  const wt = n.wt ?? {};
  const perCap = wt.gdpPerCapita ?? (n.pop > 0 ? (n.gdp * 1000) / n.pop : 3000);
  const rich = clamp(Math.log10(Math.max(300, perCap) / 1000) / Math.log10(60), 0, 1); // 0 at $1k, 1 at $60k
  const exportsText = `${wt.trade?.leadingExports ?? ''}`;
  const spirits = (n.spirits ?? []).join(' ');
  const oil = /oil_economy/.test(spirits) || (n.blocs ?? []).includes('OPEC') || /crude|oil|petroleum|natural gas|lng/i.test(exportsText);
  const ores = /copper|iron ore|gold|metal|coal|mineral|lithium|diamond|bauxite|nickel|uranium|aluminium|aluminum/i.test(exportsText);
  const farm = /wheat|coffee|cocoa|rice|soy|beef|agricultur|fish|fruit|cotton|tea|sugar/i.test(exportsText);
  const kit = /machinery|vehicle|car|electronic|semiconductor|chip|equipment/i.test(exportsText);

  const agri = clamp(28 - 26 * rich + (farm ? 3 : 0), 0.6, 35);
  const mining = clamp(1 + (ores ? 7 : 0) + (oil ? 1 : 0), 0.2, 15);
  const energy = clamp(2.5 + (oil ? 14 : 0), 1.5, 40);
  const manuf = clamp(11 + (kit ? 6 : 0) + rich * 3 - (oil ? 3 : 0), 4, 28);
  const constr = clamp(6 - rich, 3, 10);
  const tech = clamp(1.5 + 6 * rich, 1, 12);

  const exp = pctOf(wt.trade?.exportsPctGdp) ?? clamp(55 - 9 * Math.log10(Math.max(1, n.gdp)), 12, 70);
  const self = [
    clamp(energy / 3 * 0.75 + (oil ? 1.5 : 0), 0.05, 6),
    clamp(0.35 + mining / 2.5, 0.1, 6),
    clamp(0.55 + agri / 25 + (farm ? 0.35 : 0), 0.25, 2.5),
  ];
  const emerging = perCap < 25000;
  const laws = {};
  if (n.ideology !== 'dem' && n.ideology !== 'nat') laws.model = 'state';
  if (PEGGED.has(n.iso3)) laws.currency = 'managed';
  if (/civil_war|sanctioned_economy|special_period/.test(spirits)) { laws.currency = 'controls'; laws.monetary = 'financing'; }
  return {
    sec: [agri, mining, energy, manuf, constr, tech],
    self,
    res: null, // four months of imports, set once imports are known
    mat: emerging ? 50 : 75,
    fx: emerging ? clamp(0.55 - rich * 0.5, 0.05, 0.7) : 0,
    def: clamp(2.5 + ((n.debt ?? 50) - 50) * 0.02, 0, 8),
    inv: emerging ? 24 : 21,
    exp,
    imp: null,
    tgt: emerging ? 4 : 2,
    tariff: clamp(12 - 10 * rich, 1.5, 15),
    laws,
  };
}
