// The 2025 equipment catalog: real systems in service or production, grouped into the equipment
// classes that divisions are built from. A model being listed does not mean every country fields
// it. `makers` are the countries that build it (ISO3; '*' is a generic pattern anyone can make).
// Others in the same alliance can build it under licence at a 30% premium.
//
// `q` is a game rating of the system relative to its class (1.0 = a sound modern design); `cost`
// is factory-days per item. Both are game estimates informed by open sources (IISS Military Balance
// 2025, RUSI, manufacturer data) for relative standing only, not measured performance.
//
// `tech` (set in NEEDS below) is the technology a model needs (game/research.js); a nation builds it
// once it has that technology, or under licence once the partner making it does.

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
  ['k2', 'mbt', 'K2 Black Panther', 'Main battle tank', ['KOR'], 1.25, 9],
  ['leclerc', 'mbt', 'Leclerc XLR', 'Main battle tank', ['FRA'], 1.15, 10],
  ['merkava4', 'mbt', 'Merkava Mk 4', 'Main battle tank', ['ISR'], 1.2, 9],
  ['m1e3', 'mbt', 'M1E3 Abrams', 'Main battle tank (next generation)', ['USA'], 1.4, 12],
  ['kf51', 'mbt', 'KF51 Panther', 'Main battle tank (next generation)', ['DEU'], 1.4, 12],
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

  // National and legacy systems, for the starting inventories in data/inventories.js. Models with
  // no makers are out of production: nations hold them in their stockpile but cannot build more.
  // Main battle tanks
  ['m1a1', 'mbt', 'M1A1 Abrams (FEP / AIM)', 'Main battle tank, earlier variant', ['USA'], 1.1, 8],
  ['leo2a6', 'mbt', 'Leopard 2A5 / 2A6', 'Main battle tank, earlier variant', [], 1.15, 9],
  ['leo2a4', 'mbt', 'Leopard 2A4', 'Main battle tank, Cold War variant', [], 0.95, 8],
  ['leo2pl', 'mbt', 'Leopard 2PL', 'Leopard 2A4 rebuilt in Poland', ['POL'], 1.05, 6],
  ['leo1a5', 'mbt', 'Leopard 1A5', 'Cold War main battle tank', [], 0.65, 5],
  ['chally2', 'mbt', 'Challenger 2', 'Main battle tank', [], 1.1, 10],
  ['t90s', 'mbt', 'T-90A / T-90S Bhishma', 'Main battle tank', ['RUS'], 1.0, 5],
  ['t80bvm', 'mbt', 'T-80BVM', 'Main battle tank, modernised', ['RUS'], 1.0, 5],
  ['t80', 'mbt', 'T-80B / BV / U', 'Cold War main battle tank', [], 0.85, 5],
  ['t72', 'mbt', 'T-72A / AV / B / M1', 'Soviet-era main battle tank', [], 0.75, 4],
  ['t64bv', 'mbt', 'T-64BV / BM Bulat', 'Main battle tank, modernised', ['UKR'], 0.8, 4],
  ['t62', 'mbt', 'T-62M / MV', 'Cold War main battle tank', [], 0.55, 3],
  ['t55', 'mbt', 'T-54/55 / Type 59 family', 'Early Cold War tank', [], 0.45, 2.5],
  ['pt91', 'mbt', 'PT-91 Twardy', 'T-72 rebuilt in Poland', ['POL'], 0.85, 4],
  ['arjun', 'mbt', 'Arjun Mk 1A', 'Main battle tank', ['IND'], 1.0, 8],
  ['type96b', 'mbt', 'Type 96A / 96B', 'Main battle tank', ['CHN'], 0.9, 4],
  ['type99', 'mbt', 'Type 99', 'Main battle tank, earlier variant', [], 1.0, 6],
  ['type15', 'mbt', 'Type 15', 'Light tank', ['CHN'], 0.8, 4],
  ['type10', 'mbt', 'Type 10', 'Main battle tank', ['JPN'], 1.2, 9],
  ['type90', 'mbt', 'Type 90', 'Main battle tank', [], 1.05, 9],
  ['k1a2', 'mbt', 'K1A1 / K1A2', 'Main battle tank', [], 1.0, 6],
  ['altay', 'mbt', 'Altay', 'Main battle tank', ['TUR'], 1.15, 10],
  ['m60t', 'mbt', 'M60T Sabra / M60TM', 'Modernised Patton tank', ['TUR'], 0.8, 4],
  ['m60', 'mbt', 'M60A3 / M48 Patton', 'Cold War tank', [], 0.55, 4],
  ['merkava3', 'mbt', 'Merkava Mk 3', 'Main battle tank, earlier variant', [], 1.0, 8],
  ['karrar', 'mbt', 'Karrar', 'Main battle tank (T-72 derivative)', ['IRN'], 0.85, 4],
  ['zulfiqar', 'mbt', 'Zulfiqar-3', 'Main battle tank', ['IRN'], 0.7, 4],
  ['chieftain', 'mbt', 'Chieftain Mk 5', 'Cold War tank', [], 0.55, 4],
  // Fighting vehicles
  ['bmp2', 'ifv', 'BMP-2 / BMP-2M / Sarath', 'Infantry fighting vehicle', ['RUS'], 0.75, 2],
  ['bmp1', 'ifv', 'BMP-1 / BWP-1', 'Cold War infantry fighting vehicle', [], 0.55, 1.5],
  ['btr', 'ifv', 'BTR-70 / BTR-80 / MT-LB', 'Soviet-era armoured carrier', [], 0.55, 1.2],
  ['m113', 'ifv', 'M113 family', 'Tracked armoured carrier', [], 0.5, 1.2],
  ['stryker', 'ifv', 'Stryker', 'Wheeled infantry carrier', ['USA'], 1.0, 3],
  ['marder', 'ifv', 'Marder 1A3 / 1A5', 'Cold War infantry fighting vehicle', [], 0.8, 3],
  ['warrior', 'ifv', 'Warrior', 'Infantry fighting vehicle', [], 0.85, 3.5],
  ['ajax', 'ifv', 'Ajax', 'Tracked reconnaissance vehicle', ['GBR'], 1.0, 5],
  ['vbci', 'ifv', 'VBCI', 'Wheeled infantry fighting vehicle', ['FRA'], 1.05, 3.5],
  ['griffon', 'ifv', 'VBMR Griffon', 'Wheeled armoured carrier', ['FRA'], 0.95, 2.2],
  ['vab', 'ifv', 'VAB', 'Wheeled armoured carrier', [], 0.6, 1.2],
  ['rosomak', 'ifv', 'KTO Rosomak', 'Wheeled armoured vehicle (Patria AMV)', ['POL'], 0.95, 2.5],
  ['borsuk', 'ifv', 'Borsuk', 'Infantry fighting vehicle', ['POL'], 1.1, 4, '2025-06-01'],
  ['btr4', 'ifv', 'BTR-4E Bucephalus', 'Wheeled armoured carrier', ['UKR'], 0.8, 2],
  ['zbl08', 'ifv', 'ZBL-08', 'Wheeled infantry fighting vehicle', ['CHN'], 0.95, 2.5],
  ['zbd86', 'ifv', 'ZBD-86 / ZSL-92 family', 'Older fighting vehicle', [], 0.6, 1.5],
  ['type89', 'ifv', 'Type 89', 'Infantry fighting vehicle', [], 0.85, 4],
  ['type96w', 'ifv', 'Type 96 WAPC / Type 16 MCV', 'Wheeled armoured vehicles', ['JPN'], 0.85, 2.5],
  ['k200', 'ifv', 'K200 KIFV', 'Tracked armoured carrier', [], 0.6, 1.5],
  ['acv15', 'ifv', 'ACV-15', 'Tracked infantry vehicle', ['TUR'], 0.7, 2],
  ['kirpi', 'ifv', 'Kirpi / Vuran MRAP', 'Mine-protected vehicle', ['TUR'], 0.7, 1.2],
  ['namer', 'ifv', 'Namer', 'Heavy infantry carrier', ['ISR'], 1.15, 5],
  ['eitan', 'ifv', 'Eitan', 'Wheeled armoured carrier', ['ISR'], 1.05, 3.5],
  ['boragh', 'ifv', 'Boragh', 'Infantry fighting vehicle (BMP-1 derivative)', ['IRN'], 0.6, 1.5],
  // Tube artillery
  ['m777', 'spg', 'M777A2', 'Lightweight towed 155 mm howitzer', ['USA', 'GBR'], 1.0, 1.5],
  ['d30', 'spg', 'Soviet-pattern towed guns (D-30, D-20, 2A65, M-46)', 'Towed howitzer', [], 0.65, 0.8],
  ['2s1', 'spg', '2S1 Gvozdika', '122 mm self-propelled howitzer', [], 0.65, 1.5],
  ['2s3', 'spg', '2S3 Akatsiya / 2S5 Giatsint', '152 mm self-propelled gun', [], 0.75, 2],
  ['2s7', 'spg', '2S7M Malka', '203 mm self-propelled gun', ['RUS'], 0.85, 3],
  ['bohdana', 'spg', '2S22 Bohdana', 'Truck-mounted 155 mm howitzer', ['UKR'], 1.0, 1.5],
  ['krab', 'spg', 'AHS Krab', 'Self-propelled 155 mm howitzer', ['POL'], 1.15, 3],
  ['m109', 'spg', 'M109A5 / A6 / L', 'Self-propelled 155 mm howitzer, earlier variant', [], 0.85, 2.5],
  ['as90', 'spg', 'AS-90', 'Self-propelled 155 mm howitzer', [], 0.9, 3],
  ['archer', 'spg', 'Archer', 'Truck-mounted 155 mm howitzer', ['SWE'], 1.15, 2.5],
  ['dana', 'spg', 'Dana / Zuzana 2', 'Truck-mounted howitzer', ['CZE', 'SVK'], 0.9, 2],
  ['t155', 'spg', 'T-155 Fırtına', 'Self-propelled 155 mm howitzer', ['TUR'], 1.1, 2.5],
  ['plz05', 'spg', 'PLZ-05', 'Self-propelled 155 mm howitzer', ['CHN'], 1.1, 2.5],
  ['plz07', 'spg', 'PLZ-07 / PLL-09', 'Self-propelled 122 mm howitzer', ['CHN'], 0.85, 1.5],
  ['dhanush', 'spg', 'Dhanush', 'Towed 155 mm howitzer', ['IND'], 0.85, 1.2],
  ['type99sph', 'spg', 'Type 99 SPH', 'Self-propelled 155 mm howitzer', [], 1.1, 3.5],
  ['type19', 'spg', 'Type 19', 'Truck-mounted 155 mm howitzer', ['JPN'], 1.05, 2.5],
  ['k55', 'spg', 'K55A1', 'Self-propelled 155 mm howitzer, earlier variant', [], 0.8, 2],
  ['hoveyzeh', 'spg', 'Raad-2 / Hoveyzeh', 'Self-propelled howitzer', ['IRN'], 0.65, 1.5],
  // Rocket artillery
  ['m270', 'mlrs', 'M270A1 / A2 MLRS', 'Tracked precision rocket artillery', ['USA'], 1.25, 5],
  ['uragan', 'mlrs', 'BM-27 Uragan', '220 mm rocket artillery', [], 0.8, 2.5],
  ['tos1', 'mlrs', 'TOS-1A / TOS-2', 'Thermobaric rocket artillery', ['RUS'], 1.0, 3],
  ['vilkha', 'mlrs', 'Vilkha', 'Guided heavy rocket artillery', ['UKR'], 1.0, 3],
  ['pinaka', 'mlrs', 'Pinaka', 'Rocket artillery', ['IND'], 1.05, 2.5],
  ['t122', 'mlrs', 'T-122 Sakarya / T-300 Kasırga', 'Rocket artillery', ['TUR'], 0.85, 1.8],
  ['phl03', 'mlrs', 'PHL-03', 'Heavy rocket artillery', ['CHN'], 1.0, 3],
  ['puls', 'mlrs', 'PULS', 'Modular precision rocket artillery', ['ISR'], 1.2, 3.5],
  ['fajr', 'mlrs', 'Fajr-5 / Hadid', 'Rocket artillery', ['IRN'], 0.75, 1.5],
  // Reconnaissance UAVs
  ['akinci', 'uav', 'Bayraktar Akıncı', 'High-altitude strike UAV', ['TUR'], 1.35, 15],
  ['anka', 'uav', 'TAI Anka-S', 'Medium-altitude strike UAV', ['TUR'], 1.05, 8],
  ['grayeagle', 'uav', 'MQ-1C Gray Eagle', 'Army strike and reconnaissance UAV', ['USA'], 1.35, 15],
  ['heron', 'uav', 'Heron TP / Hermes 900', 'Medium-altitude long-endurance UAV', ['ISR'], 1.35, 14],
  ['wingloong', 'uav', 'Wing Loong II / CH-4', 'Medium-altitude strike UAV', ['CHN'], 1.15, 7],
  ['mohajer6', 'uav', 'Mohajer-6 / Shahed-129', 'Tactical strike UAV', ['IRN'], 0.85, 3],
  ['leleka', 'uav', 'Leleka-100 / Furia / Shark', 'Tactical reconnaissance UAV', ['UKR'], 0.85, 0.12],
  ['flyeye', 'uav', 'FlyEye', 'Tactical reconnaissance UAV', ['POL'], 0.8, 0.08],
  ['patroller', 'uav', 'Patroller', 'Tactical reconnaissance UAV', ['FRA'], 1.0, 6],
  // FPV and loitering munitions
  ['liutyi', 'fpv', 'Liutyi / UJ-26 Bober', 'Long-range one-way attack drone', ['UKR'], 1.1, 0.05],
  ['warmate', 'fpv', 'Warmate', 'Loitering munition', ['POL'], 1.15, 0.03],
  ['harop', 'fpv', 'IAI Harop / Harpy', 'Loitering munition', ['ISR'], 1.35, 0.1],
  ['kargu', 'fpv', 'STM Kargu-2', 'Loitering munition', ['TUR'], 1.15, 0.03],
  ['ch901', 'fpv', 'CH-901 / Feihong loitering munitions', 'Loitering munition', ['CHN'], 1.1, 0.03],
  // Air defence
  ['s300', 'sam', 'S-300PS / PT / V', 'Long-range air defence, Soviet era', [], 1.0, 8],
  ['buk', 'sam', 'Buk-M2 / M3', 'Medium-range air defence', ['RUS'], 1.15, 5],
  ['tor', 'sam', 'Tor-M2', 'Short-range air defence', ['RUS'], 1.15, 4],
  ['osa', 'sam', 'Osa / Strela-10 / Kub / Buk-M1', 'Soviet-era tactical air defence', [], 0.7, 3],
  ['gepard', 'sam', 'Flakpanzer Gepard', 'Self-propelled anti-aircraft gun', [], 0.9, 4],
  ['hawk', 'sam', 'MIM-23 Hawk', 'Medium-range air defence, Cold War', [], 0.8, 4],
  ['mshorad', 'sam', 'M-SHORAD / Avenger', 'Short-range air defence', ['USA'], 1.1, 4],
  ['hq9', 'sam', 'HQ-9B', 'Long-range air defence', ['CHN'], 1.35, 8],
  ['hq16', 'sam', 'HQ-16 / HQ-17', 'Medium and short-range air defence', ['CHN'], 1.1, 4],
  ['samp', 'sam', 'SAMP/T (Aster 30)', 'Long-range air and missile defence', ['FRA'], 1.4, 10],
  ['mica', 'sam', 'VL MICA / Crotale', 'Short-range air defence', ['FRA'], 1.15, 4],
  ['camm', 'sam', 'Sky Sabre / Narew (CAMM)', 'Medium-range air defence', ['GBR'], 1.3, 5],
  ['starstreak', 'sam', 'Stormer HVM / Starstreak', 'Short-range air defence', ['GBR'], 0.9, 1],
  ['skyranger', 'sam', 'Skyranger 30', 'Self-propelled counter-drone air defence', ['DEU'], 1.25, 4],
  ['akash', 'sam', 'Akash', 'Medium-range air defence', ['IND'], 1.0, 4],
  ['mrsam', 'sam', 'Barak 8 / MRSAM', 'Medium-range air defence', ['ISR', 'IND'], 1.3, 6],
  ['davidsling', 'sam', "David's Sling", 'Medium to long-range air and missile defence', ['ISR'], 1.45, 12],
  ['hisar', 'sam', 'Hisar-A / O', 'Short and medium-range air defence', ['TUR'], 1.1, 3],
  ['korkut', 'sam', 'Korkut', 'Self-propelled anti-aircraft gun', ['TUR'], 1.0, 3],
  ['cheongung', 'sam', 'KM-SAM Cheongung II', 'Medium-range air defence', ['KOR'], 1.3, 6],
  ['biho', 'sam', 'K30 Biho / K31 Chunma', 'Short-range air defence', ['KOR'], 0.9, 2.5],
  ['type03', 'sam', 'Type 03 Chu-SAM', 'Medium-range air defence', ['JPN'], 1.25, 6],
  ['bavar', 'sam', 'Bavar-373', 'Long-range air defence', ['IRN'], 1.1, 7],
  ['khordad', 'sam', 'Khordad-3 / Khordad-15', 'Medium-range air defence', ['IRN'], 0.95, 4],
  // Electronic warfare
  ['bukovel', 'ew', 'Bukovel-AD / Nota', 'Counter-drone and satellite-navigation jamming', ['UKR'], 1.0, 0.6],
  // Infantry
  ['grot', 'rifles', 'MSBS Grot infantry kit', 'Rifles, optics, radios, body armour', ['POL'], 1.05, 0.022],
  // Anti-tank
  ['stugna', 'atgm', 'Stugna-P', 'Anti-tank guided missile', ['UKR'], 1.05, 0.1],
  ['tow', 'atgm', 'BGM-71 TOW-2', 'Anti-tank guided missile', ['USA'], 1.0, 0.15],
  ['mmp', 'atgm', 'MMP / MILAN', 'Anti-tank guided missile', ['FRA'], 1.15, 0.2],
  ['konkurs', 'atgm', '9K111 Fagot / 9K113 Konkurs', 'Soviet-era anti-tank missile', ['RUS'], 0.7, 0.05],
  ['hj8', 'atgm', 'HJ-8 / HJ-73', 'Older anti-tank missile', [], 0.7, 0.06],
  ['nag', 'atgm', 'Nag / NAMICA', 'Anti-tank guided missile', ['IND'], 0.95, 0.15],
  ['omtas', 'atgm', 'OMTAS / Karaok', 'Anti-tank guided missile', ['TUR'], 1.1, 0.15],
  ['raybolt', 'atgm', 'Hyungung (Raybolt)', 'Anti-tank guided missile', ['KOR'], 1.15, 0.2],
  ['lmat', 'atgm', 'Type 01 LMAT', 'Anti-tank guided missile', ['JPN'], 1.05, 0.18],
  ['dehlavieh', 'atgm', 'Dehlavieh / Toophan', 'Anti-tank guided missile (Kornet and TOW copies)', ['IRN'], 0.85, 0.07],
];

// Real licence agreements: these nations build the model under licence (at the licence premium)
// whatever their alliances.
const LICENCES = {
  k2: ['POL'], k9: ['POL', 'IND'], chunmoo: ['POL'], camm: ['POL'], t90s: ['IND'], bmp2: ['IND'],
  konkurs: ['IND'], ak12: ['IND'], boxer: ['GBR'], patriot: ['JPN'],
};

// Models that need research: in service with some nations in 2025, not yet with others, or still to come.
const NEEDS = {
  leo2a8: 'mbt_aps', chally3: 'mbt_aps', m1e3: 'mbt_next', kf51: 'mbt_next',
  excalibur: 'art_guided', switchblade: 'uav_loiter', lancet: 'uav_loiter',
  iristslm: 'ad_medium', tlsbct: 'ew_brigade', krasukha: 'ew_strategic',
};

export const MODELS = ROWS.map(([id, cls, name, role, makers, q, cost, from]) => ({ id, cls, name, role, makers, q, cost, from: from ? Date.parse(from) : 0, tech: NEEDS[id] ?? null }));
export const MODEL = Object.fromEntries(MODELS.map((m) => [m.id, m]));
for (const m of MODELS) m.lic = LICENCES[m.id] ?? [];
export const LICENCE = 1.3; // cost multiplier for a partner's design built under licence
