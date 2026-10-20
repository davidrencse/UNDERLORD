// The 2025 equipment catalog: real systems in service or production, grouped into the equipment
// classes that divisions are built from. A model being listed does not mean every country fields
// it. `makers` are the countries that build it (ISO3; '*' is a generic pattern anyone can make).
// Others in the same alliance can build it under licence at a 30% premium.
//
// `q` is a game rating of the system relative to its class (1.0 = a sound modern design); `cost`
// is factory-days per item. Both are game estimates informed by open sources (IISS Military Balance
// 2025, RUSI, manufacturer data) for relative standing only, not measured performance.

export const CLASSES = {
  rifles: { name: 'Infantry equipment', unit: 'sets', per: 'set' },
  atgm: { name: 'Anti-tank missiles', unit: 'launchers', per: 'launcher' },
  mbt: { name: 'Main battle tanks', unit: 'tanks', per: 'tank' },
  ifv: { name: 'Fighting vehicles', unit: 'vehicles', per: 'vehicle' },
  spg: { name: 'Tube artillery', unit: 'guns', per: 'gun' },
  mlrs: { name: 'Rocket artillery', unit: 'launchers', per: 'launcher' },
  ammo: { name: 'Artillery ammunition', unit: 'rounds', per: 'round' },
  trucks: { name: 'Logistics vehicles', unit: 'trucks', per: 'truck' },
  uav: { name: 'Reconnaissance UAVs', unit: 'aircraft', per: 'aircraft' },
  fpv: { name: 'FPV & loitering munitions', unit: 'munitions', per: 'munition' },
  sam: { name: 'Air defence', unit: 'launchers', per: 'launcher' },
  ew: { name: 'Electronic warfare', unit: 'systems', per: 'system' },
};
export const CLASS_IDS = Object.keys(CLASSES);

// [id, class, name, role, makers, q, cost, in production from (optional)]
const ROWS = [
  // Main battle tanks
  ['abrams', 'mbt', 'M1A2 SEP v3 Abrams', 'Main battle tank', ['USA'], 1.25, 10],
  ['leo2a7', 'mbt', 'Leopard 2A7', 'Main battle tank', ['DEU'], 1.25, 10],
  ['leo2a8', 'mbt', 'Leopard 2A8', 'Main battle tank', ['DEU'], 1.3, 11],
  ['chally3', 'mbt', 'Challenger 3', 'Main battle tank (in development)', ['GBR'], 1.3, 11, '2027-01-01'],
  ['t90m', 'mbt', 'T-90M Proryv', 'Main battle tank', ['RUS'], 1.1, 6],
  ['t72b3', 'mbt', 'T-72B3M', 'Main battle tank, modernised', ['RUS', 'BLR'], 0.95, 4],
  ['type99a', 'mbt', 'Type 99A', 'Main battle tank', ['CHN'], 1.15, 7],
  ['k2', 'mbt', 'K2 Black Panther', 'Main battle tank', ['KOR', 'POL'], 1.25, 9],
  ['leclerc', 'mbt', 'Leclerc XLR', 'Main battle tank', ['FRA'], 1.15, 10],
  ['merkava4', 'mbt', 'Merkava Mk 4', 'Main battle tank', ['ISR'], 1.2, 9],
  ['mbt_lic', 'mbt', 'Upgraded T-72 pattern', 'Main battle tank, licensed pattern', ['*'], 0.8, 4],
  // Fighting vehicles
  ['bradley', 'ifv', 'M2A4 Bradley', 'Infantry fighting vehicle', ['USA'], 1.15, 4],
  ['cv90', 'ifv', 'CV90 Mk IV', 'Infantry fighting vehicle', ['SWE'], 1.2, 4.5],
  ['puma', 'ifv', 'Puma', 'Infantry fighting vehicle', ['DEU'], 1.25, 5.5],
  ['boxer', 'ifv', 'Boxer', 'Wheeled armoured vehicle', ['DEU', 'NLD'], 1.15, 4.5],
  ['bmp3', 'ifv', 'BMP-3', 'Infantry fighting vehicle', ['RUS'], 1.0, 3],
  ['btr82', 'ifv', 'BTR-82A', 'Armoured personnel carrier', ['RUS'], 0.85, 1.8],
  ['k21', 'ifv', 'K21', 'Infantry fighting vehicle', ['KOR'], 1.1, 3.5],
  ['zbd04', 'ifv', 'ZBD-04A', 'Infantry fighting vehicle', ['CHN'], 1.05, 3],
  ['apc_lic', 'ifv', 'Wheeled APC (licensed)', 'Armoured personnel carrier', ['*'], 0.75, 2],
  // Tube artillery
  ['paladin', 'spg', 'M109A7 Paladin', 'Self-propelled howitzer', ['USA'], 1.1, 3],
  ['pzh2000', 'spg', 'PzH 2000', 'Self-propelled howitzer', ['DEU'], 1.25, 4],
  ['caesar', 'spg', 'CAESAR', 'Truck-mounted howitzer', ['FRA'], 1.15, 2.2],
  ['k9', 'spg', 'K9 Thunder', 'Self-propelled howitzer', ['KOR'], 1.15, 2.5],
  ['msta', 'spg', '2S19M2 Msta-S', 'Self-propelled howitzer', ['RUS'], 1.0, 2.2],
  ['pcl181', 'spg', 'PCL-181', 'Truck-mounted howitzer', ['CHN'], 1.05, 2],
  ['towed', 'spg', 'Towed 155/152 mm howitzer', 'Towed howitzer', ['*'], 0.75, 0.8],
  // Rocket artillery
  ['himars', 'mlrs', 'M142 HIMARS', 'Precision rocket artillery', ['USA'], 1.3, 4],
  ['tornado', 'mlrs', 'BM-30 Smerch / Tornado-S', 'Heavy rocket artillery', ['RUS'], 1.1, 3.5],
  ['phl16', 'mlrs', 'PHL-16', 'Modular rocket artillery', ['CHN'], 1.15, 3.5],
  ['chunmoo', 'mlrs', 'K239 Chunmoo', 'Modular rocket artillery', ['KOR'], 1.15, 3.5],
  ['grad', 'mlrs', 'BM-21 Grad pattern', 'Rocket artillery', ['*'], 0.7, 1],
  // Artillery ammunition
  ['nato155', 'ammo', '155 mm NATO shell (M795)', 'Artillery ammunition', ['USA', 'DEU', 'FRA', 'GBR', 'KOR', 'POL'], 1.0, 0.012],
  ['excalibur', 'ammo', 'M982 Excalibur', 'Guided artillery shell', ['USA'], 1.6, 0.4],
  ['ru152', 'ammo', '152 mm shell (OF-540)', 'Artillery ammunition', ['RUS', 'BLR', 'PRK'], 0.95, 0.009],
  ['shell_lic', 'ammo', 'Artillery shells (licensed)', 'Artillery ammunition', ['*'], 0.9, 0.014],
  // Logistics
  ['fmtv', 'trucks', 'FMTV', 'Tactical truck', ['USA'], 1.1, 0.45],
  ['kamaz', 'trucks', 'KamAZ-5350 / Ural-4320', 'Tactical truck', ['RUS'], 0.95, 0.3],
  ['truck_gen', 'trucks', 'Military truck', 'Tactical truck', ['*'], 0.9, 0.35],
  // Reconnaissance UAVs
  ['mq9', 'uav', 'MQ-9 Reaper', 'Medium-altitude strike and reconnaissance UAV', ['USA'], 1.5, 30],
  ['tb2', 'uav', 'Bayraktar TB2', 'Tactical strike and reconnaissance UAV', ['TUR'], 1.15, 5],
  ['orlan10', 'uav', 'Orlan-10', 'Artillery-spotting UAV', ['RUS'], 0.85, 0.15],
  ['quad', 'uav', 'Commercial quadcopter (recon)', 'Small reconnaissance drone', ['*'], 0.6, 0.006],
  // FPV and loitering munitions
  ['fpv', 'fpv', 'FPV drone systems', 'First-person-view strike drone', ['*'], 1.0, 0.0015],
  ['switchblade', 'fpv', 'Switchblade 300', 'Loitering munition', ['USA'], 1.3, 0.06],
  ['shahed', 'fpv', 'Shahed-136 / Geran-2', 'Long-range one-way attack drone', ['IRN', 'RUS'], 1.2, 0.04],
  ['lancet', 'fpv', 'ZALA Lancet-3', 'Loitering munition', ['RUS'], 1.3, 0.04],
  // Air defence
  ['patriot', 'sam', 'Patriot PAC-3', 'Long-range air and missile defence', ['USA'], 1.5, 12],
  ['s400', 'sam', 'S-400', 'Long-range air defence', ['RUS'], 1.4, 9],
  ['iristslm', 'sam', 'IRIS-T SLM', 'Medium-range air defence', ['DEU'], 1.35, 5],
  ['nasams', 'sam', 'NASAMS', 'Medium-range air defence', ['NOR', 'USA'], 1.3, 4],
  ['irondome', 'sam', 'Iron Dome', 'Short-range rocket and drone defence', ['ISR'], 1.3, 4],
  ['pantsir', 'sam', 'Pantsir-S1', 'Short-range air defence', ['RUS'], 1.05, 5],
  ['manpads', 'sam', 'MANPADS team kit', 'Shoulder-launched air defence', ['*'], 0.6, 0.15],
  // Electronic warfare
  ['krasukha', 'ew', 'Krasukha-4', 'Radar and satellite jamming', ['RUS'], 1.3, 8],
  ['pole21', 'ew', 'Pole-21', 'Satellite-navigation jamming', ['RUS'], 0.9, 1.5],
  ['tlsbct', 'ew', 'TLS-BCT', 'Brigade electronic warfare system', ['USA'], 1.3, 6],
  ['jammer', 'ew', 'Tactical drone jammer', 'Counter-drone jamming', ['*'], 0.8, 0.1],
  // Infantry
  ['m7', 'rifles', 'M4A1 / M7 infantry kit', 'Rifles, optics, radios, body armour', ['USA'], 1.2, 0.025],
  ['hk416', 'rifles', 'HK416 / G95 infantry kit', 'Rifles, optics, radios, body armour', ['DEU', 'FRA'], 1.15, 0.025],
  ['ak12', 'rifles', 'AK-12 infantry kit', 'Rifles, optics, radios, body armour', ['RUS'], 1.0, 0.02],
  ['qbz191', 'rifles', 'QBZ-191 infantry kit', 'Rifles, optics, radios, body armour', ['CHN'], 1.05, 0.02],
  ['k2c1', 'rifles', 'K2C1 infantry kit', 'Rifles, optics, radios, body armour', ['KOR'], 1.05, 0.022],
  ['rifle_gen', 'rifles', 'Infantry kit (AK pattern)', 'Rifles and basic kit', ['*'], 0.8, 0.015],
  // Anti-tank
  ['javelin', 'atgm', 'FGM-148 Javelin', 'Anti-tank guided missile', ['USA'], 1.3, 0.25],
  ['spike', 'atgm', 'Spike LR2', 'Anti-tank guided missile', ['ISR', 'DEU', 'POL'], 1.25, 0.22],
  ['nlaw', 'atgm', 'NLAW', 'Short-range anti-tank weapon', ['GBR', 'SWE'], 1.0, 0.04],
  ['kornet', 'atgm', '9M133 Kornet', 'Anti-tank guided missile', ['RUS'], 1.0, 0.08],
  ['hj12', 'atgm', 'HJ-12', 'Anti-tank guided missile', ['CHN'], 1.1, 0.1],
  ['rpg', 'atgm', 'RPG-7 pattern', 'Rocket-propelled grenade', ['*'], 0.5, 0.01],
];

export const MODELS = ROWS.map(([id, cls, name, role, makers, q, cost, from]) => ({ id, cls, name, role, makers, q, cost, from: from ? Date.parse(from) : 0 }));
export const MODEL = Object.fromEntries(MODELS.map((m) => [m.id, m]));
export const LICENCE = 1.3; // cost multiplier for a partner's design built under licence
