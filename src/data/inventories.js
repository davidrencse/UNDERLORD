// National starting inventories, January 2025: the systems each nation operates in each equipment
// class (data/equipment.js), what it holds of them, what it keeps in store, and what its industry
// builds. production.js seeds each nation's stockpile and lines from these; nations not listed
// keep the generic defaults (best model they can build, stock at half of what their army fields).
//
// Per class:
//   have    { model: number in service }  holdings, which weight the class's starting rating
//   store   number in reserve storage     usable reserves; the stockpile is the army's fielded
//                                         equipment times store / have (at most 1.5×)
//   reserve multiplier                    a direct stockpile multiplier where there are no counts
//                                         (ammunition and drones: months of fire held)
//   build   [model | [model, weight]]     the models its lines build, the first preferred; a
//                                         class's factories are split between them by weight
//
// All figures are ESTIMATES, rounded, for the game's relative standing only. Baseline: IISS
// The Military Balance 2025 (equipment tables, as summarised in open reporting), with Ukrainian
// and Russian holdings adjusted for losses recorded by Oryx (visually confirmed) and IISS loss
// estimates to January 2025, and deliveries from the SIPRI Arms Transfers Database and national
// announcements. Systems are grouped into the nearest catalog model (a T-72AV and a T-72B both
// count as `t72`; hand-launched quadcopters and MANPADS are left out of the counts). Reserves are
// what is thought usable, not every hull in a depot. Sources and caveats: docs/inventory-research.md.

export const INVENTORIES = {
  USA: {
    mbt: { have: { abrams: 2640 }, store: 2000, build: ['abrams'] },
    ifv: { have: { bradley: 2500, stryker: 3000, m113: 1500 }, store: 3000, build: ['bradley', 'stryker'] },
    spg: { have: { paladin: 670, m777: 600 }, store: 500, build: ['paladin', 'm777'] },
    mlrs: { have: { himars: 450, m270: 225 }, store: 100, build: ['himars'] },
    uav: { have: { grayeagle: 200, mq9: 220 }, build: ['grayeagle', 'mq9'] },
    fpv: { reserve: 0.5, build: ['switchblade', 'fpv'] },
    sam: { have: { patriot: 480, mshorad: 160, nasams: 12 }, build: ['patriot', 'mshorad'] },
    atgm: { have: { javelin: 6000, tow: 2500 }, build: ['javelin', 'tow'] },
    ammo: { reserve: 1.2, build: [['nato155', 4], ['excalibur', 1]] },
    rifles: { build: ['m7'] },
    trucks: { build: ['fmtv'] },
    ew: { build: ['tlsbct'] },
  },
  CHN: {
    mbt: { have: { type99a: 700, type99: 500, type96b: 2500, type15: 600, t55: 300 }, build: ['type99a', 'type15'] },
    ifv: { have: { zbd04: 2100, zbl08: 1800, zbd86: 1500 }, build: ['zbd04', 'zbl08'] },
    spg: { have: { pcl181: 1100, plz05: 450, plz07: 1000, d30: 1200 }, build: ['pcl181', 'plz05'] },
    mlrs: { have: { phl16: 250, phl03: 175, grad: 900 }, build: ['phl16'] },
    uav: { have: { wingloong: 150 }, build: ['wingloong'] },
    fpv: { reserve: 1, build: ['fpv', 'ch901'] },
    sam: { have: { hq9: 260, hq16: 300, s400: 32 }, build: ['hq9', 'hq16'] },
    atgm: { have: { hj12: 1000, hj8: 3000 }, build: ['hj12'] },
    ammo: { reserve: 1.5, build: ['shell_lic'] },
    rifles: { build: ['qbz191'] },
  },
  RUS: {
    // After ~1,400 tanks lost in 2024 (IISS) and roughly as many returned from store; open-storage
    // counts fell to ~3,500 hulls by end-2024, many unserviceable.
    mbt: { have: { t90m: 400, t90s: 200, t72b3: 1000, t80bvm: 300, t80: 200, t72: 300, t62: 250, t55: 50 }, store: 2000, build: ['t90m', 't72b3', ['t80bvm', 0.5]] },
    ifv: { have: { bmp3: 500, bmp2: 1500, bmp1: 800, btr82: 1200, btr: 2000 }, store: 3500, build: ['bmp3', 'btr82'] },
    spg: { have: { msta: 450, '2s3': 600, '2s1': 400, '2s7': 100, d30: 1500 }, store: 4000, build: ['msta', ['2s7', 0.3]] },
    mlrs: { have: { tornado: 150, uragan: 200, grad: 600, tos1: 50 }, store: 1000, build: ['tornado', 'grad', ['tos1', 0.5]] },
    uav: { have: { orlan10: 1500 }, build: ['orlan10'] },
    fpv: { reserve: 1.5, build: [['fpv', 2], 'lancet', 'shahed'] },
    sam: { have: { s400: 450, s300: 300, buk: 350, tor: 250, pantsir: 300, osa: 400 }, build: ['s400', 'pantsir', 'buk', 'tor'] },
    atgm: { have: { kornet: 3000, konkurs: 5000 }, build: ['kornet'] },
    ew: { have: { pole21: 300, krasukha: 40 }, build: ['pole21', ['krasukha', 0.3]] },
    ammo: { reserve: 1.5, build: ['ru152'] }, // including North Korean deliveries
    rifles: { build: ['ak12'] },
    trucks: { build: ['kamaz'] },
  },
  DEU: {
    mbt: { have: { leo2a7: 120, leo2a6: 180 }, store: 20, build: ['leo2a8', 'leo2a7'] },
    ifv: { have: { puma: 350, marder: 300, boxer: 400 }, build: ['puma', 'boxer'] },
    spg: { have: { pzh2000: 105 }, build: ['pzh2000'] },
    mlrs: { have: { m270: 35 } },
    sam: { have: { patriot: 40, iristslm: 3 }, build: ['iristslm', 'skyranger'] },
    atgm: { have: { spike: 1200 }, build: ['spike'] },
    fpv: { reserve: 0.3 },
    ammo: { reserve: 0.5, build: ['nato155'] },
    rifles: { build: ['hk416'] },
  },
  FRA: {
    mbt: { have: { leclerc: 200 }, store: 20, build: ['leclerc'] },
    ifv: { have: { vbci: 630, griffon: 700, vab: 1800 }, build: ['griffon'] },
    spg: { have: { caesar: 76 }, build: ['caesar'] },
    mlrs: { have: { m270: 9 } },
    uav: { have: { mq9: 12, patroller: 14 }, build: ['patroller'] },
    sam: { have: { samp: 32, mica: 12 }, build: ['samp', 'mica'] },
    atgm: { have: { mmp: 400, javelin: 260 }, build: ['mmp'] },
    fpv: { reserve: 0.3 },
    ammo: { reserve: 0.5, build: ['nato155'] },
    rifles: { build: ['hk416'] },
  },
  GBR: {
    // Challenger 3 conversions deliver from 2027; until then no tank line is open.
    mbt: { have: { chally2: 213 }, store: 20 },
    ifv: { have: { warrior: 380, boxer: 100, ajax: 150 }, build: ['boxer', 'ajax'] },
    spg: { have: { archer: 14 } },
    mlrs: { have: { m270: 41 } },
    sam: { have: { camm: 30, starstreak: 60 }, build: ['camm', 'starstreak'] },
    atgm: { have: { javelin: 400, nlaw: 2000 }, build: ['nlaw'] },
    fpv: { reserve: 0.3 },
    ammo: { reserve: 0.4, build: ['nato155'] },
  },
  IND: {
    mbt: { have: { t90s: 1200, t72: 2400, arjun: 120 }, store: 500, build: ['t90s', ['arjun', 0.3]] },
    ifv: { have: { bmp2: 2500, bmp1: 350 }, build: ['bmp2'] },
    spg: { have: { k9: 100, dhanush: 20, d30: 3000 }, build: ['k9', 'dhanush'] },
    mlrs: { have: { pinaka: 110, tornado: 62, grad: 150 }, build: ['pinaka'] },
    uav: { have: { heron: 90 } },
    sam: { have: { akash: 150, mrsam: 30, s400: 15, osa: 200 }, build: ['akash', 'mrsam'] },
    atgm: { have: { konkurs: 3000, nag: 20 }, build: ['konkurs', 'nag'] },
    fpv: { reserve: 0.5 },
    rifles: { build: ['ak12'] }, // AK-203, licence-built at Korwa
  },
  TUR: {
    mbt: { have: { leo2a4: 316, leo1a5: 390, m60t: 170, m60: 750 }, store: 750, build: ['altay', 'm60t'] },
    ifv: { have: { acv15: 2200, kirpi: 1500, m113: 600 }, build: ['kirpi', 'acv15'] },
    spg: { have: { t155: 280, m109: 150, towed: 400 }, build: ['t155'] },
    mlrs: { have: { t122: 120 }, build: ['t122'] },
    uav: { have: { tb2: 130, akinci: 25, anka: 60 }, build: ['tb2', 'akinci'] },
    fpv: { reserve: 0.8, build: ['kargu'] },
    sam: { have: { hisar: 30, korkut: 40 }, build: ['hisar', 'korkut'] },
    atgm: { have: { tow: 1300, omtas: 250, kornet: 80, konkurs: 400 }, build: ['omtas'] },
  },
  UKR: {
    // Net of Oryx-recorded losses and donor deliveries to January 2025. `store` stands for the
    // refurbishment and donor pipeline (Leopard 1A5s, Australian M1A1s, Czech T-72EAs).
    mbt: { have: { t64bv: 500, t72: 350, t80: 120, leo2a4: 40, leo2a6: 15, leo1a5: 100, m1a1: 20, pt91: 50, chally2: 10 }, store: 250, build: ['t64bv'] },
    ifv: { have: { bradley: 200, marder: 100, cv90: 45, stryker: 180, bmp1: 500, bmp2: 400, btr: 600, m113: 600, btr4: 150 }, store: 300, build: ['btr4'] },
    spg: { have: { m109: 150, pzh2000: 25, caesar: 50, krab: 70, archer: 8, as90: 20, bohdana: 60, '2s1': 150, '2s3': 100, m777: 120, d30: 500, dana: 30 }, store: 150, build: ['bohdana'] },
    mlrs: { have: { himars: 40, m270: 20, grad: 200, uragan: 40, tornado: 25 }, store: 30, build: ['grad', ['vilkha', 0.5]] },
    uav: { have: { leleka: 1500, tb2: 15 }, build: ['leleka'] },
    fpv: { reserve: 2, build: [['fpv', 3], 'liutyi'] }, // ~1.5m FPVs made in 2024
    sam: { have: { patriot: 30, nasams: 20, iristslm: 18, samp: 4, hawk: 30, s300: 80, osa: 150, gepard: 60, mshorad: 20 } },
    atgm: { have: { stugna: 1500, javelin: 1000, nlaw: 2000, konkurs: 2000, tow: 500 }, build: ['stugna'] },
    ew: { have: { bukovel: 300 }, build: ['bukovel'] },
    ammo: { reserve: 0.5 },
  },
  POL: {
    mbt: { have: { k2: 110, m1a1: 116, leo2pl: 120, leo2a4: 20, leo2a6: 105, pt91: 170, t72: 60 }, store: 50, build: ['k2', ['leo2pl', 0.5]] },
    ifv: { have: { rosomak: 900, bmp1: 1000 }, build: ['borsuk', 'rosomak'] },
    spg: { have: { krab: 120, k9: 100, '2s1': 200, dana: 100 }, build: ['krab', 'k9'] },
    mlrs: { have: { chunmoo: 70, grad: 75 }, build: ['chunmoo'] },
    uav: { have: { tb2: 24, flyeye: 100 }, build: ['flyeye'] },
    fpv: { reserve: 0.5, build: ['warmate'] },
    sam: { have: { patriot: 16, camm: 22, osa: 100 }, build: ['camm'] },
    atgm: { have: { spike: 270, javelin: 80, konkurs: 300 }, build: ['spike'] },
    ammo: { reserve: 0.7, build: ['nato155'] },
    rifles: { build: ['grot'] },
  },
  ISR: {
    mbt: { have: { merkava4: 400, merkava3: 100 }, store: 700, build: ['merkava4'] },
    ifv: { have: { namer: 300, eitan: 60, m113: 1000 }, store: 2500, build: ['namer', 'eitan'] },
    spg: { have: { m109: 250 }, store: 400 },
    mlrs: { have: { puls: 10 }, store: 30, build: ['puls'] },
    uav: { have: { heron: 60 }, build: ['heron'] },
    fpv: { reserve: 0.6, build: ['harop'] },
    sam: { have: { irondome: 40, davidsling: 12 }, build: ['irondome', 'davidsling'] },
    atgm: { have: { spike: 1500 }, build: ['spike'] },
    ammo: { reserve: 0.6 }, // drawn down in Gaza and Lebanon
  },
  KOR: {
    mbt: { have: { k2: 260, k1a2: 1500, m60: 400 }, build: ['k2'] },
    ifv: { have: { k21: 470, k200: 2200, bmp3: 70 }, build: ['k21'] },
    spg: { have: { k9: 1100, k55: 1000, towed: 2000 }, build: ['k9'] },
    mlrs: { have: { chunmoo: 220, m270: 58, grad: 150 }, build: ['chunmoo'] },
    sam: { have: { cheongung: 50, biho: 300, patriot: 48 }, build: ['cheongung', 'biho'] },
    atgm: { have: { raybolt: 300, tow: 900 }, build: ['raybolt'] },
    fpv: { reserve: 0.3 },
    ammo: { reserve: 2, build: ['nato155'] },
    rifles: { build: ['k2c1'] },
  },
  JPN: {
    mbt: { have: { type10: 120, type90: 280 }, build: ['type10'] },
    ifv: { have: { type89: 68, type96w: 650 }, build: ['type96w'] },
    spg: { have: { type99sph: 140, type19: 40, towed: 250 }, build: ['type19'] },
    mlrs: { have: { m270: 50 } },
    sam: { have: { type03: 50, patriot: 120 }, build: ['type03', 'patriot'] },
    atgm: { have: { lmat: 700 }, build: ['lmat'] },
    fpv: { reserve: 0.3 },
    ammo: { reserve: 0.6 },
  },
  IRN: {
    mbt: { have: { t72: 480, karrar: 50, zulfiqar: 100, chieftain: 100, m60: 300, t55: 500 }, build: ['karrar'] },
    ifv: { have: { boragh: 140, bmp2: 400, bmp1: 210, btr: 300 }, build: ['boragh'] },
    spg: { have: { hoveyzeh: 60, m109: 150, '2s1': 60, d30: 2000 }, build: ['hoveyzeh'] },
    mlrs: { have: { fajr: 300, grad: 700 }, build: ['fajr', 'grad'] },
    uav: { have: { mohajer6: 100 }, build: ['mohajer6'] },
    fpv: { reserve: 1, build: ['shahed'] },
    sam: { have: { bavar: 12, khordad: 40, s300: 16, tor: 29, hawk: 100 }, build: ['khordad', 'bavar'] },
    atgm: { have: { dehlavieh: 2000, konkurs: 1000 }, build: ['dehlavieh'] },
  },
};
