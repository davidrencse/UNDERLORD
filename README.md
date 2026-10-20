# UNDERLORD

*The world doesn't collapse all at once.*

A modern geopolitical grand strategy game that starts on 20 January 2025, inspired by Hearts of Iron IV, Millennium Dawn and The Fire Rises.

```bash
npm install
npm run dev        # http://localhost:5199
```

## Controls

| Input | Action |
|---|---|
| Left-drag | Select your formations in a box; Shift adds to selection |
| Middle-drag, Space + left-drag, WASD | Pan |
| Wheel, R / F | Zoom (towards the cursor) |
| Right-drag, Q / E | Rotate and tilt |
| Click a nation | Open its panel |
| Demographics in a nation panel or overview | Open that country's population and migration page |
| Construction map mode (bottom bar) | Choose a building, then click owned, controlled land to queue it. Offices and office complexes must be placed in a marked city. Right-click or Esc exits. |
| Click a counter, shift-click | Select formations |
| Right-click a country | Open diplomatic decisions for that country |
| Right-click with formations selected | Move them; on an enemy counter, attack it. Shift + right-click opens country decisions |
| Army bar (bottom left) | Select an army; click its card again to fly to it. Front line, Fallback line, Offensive line, Execute |
| While drawing a line | Click to add points; Enter or right-click finishes; Esc cancels |
| Space, 1–5 | Pause, game speed |
| O / T / L | Country overview / national trajectory / your country ledger |
| U / B / P / I | Military screens: supply / army designer / production / research (the top bar's Military button reopens the last one) |
| N | Toggle the day/night terminator |
| Esc | Close the current screen |

## Layout

- `src/data/`: starting conditions (nations, leaders, parties, power centres, spirits, focus trees, cities, naval bases). The seven major campaign trees continue in `majorFocuses.js` and `majorFocusesMore.js`.
- `docs/focus-tree-research.md`: sources and adaptation notes for the seven major-country focus trees
- `src/world/`: globe shader, sovereignty raster, camera, city-level layer
- `src/game/`: simulation (economy, politics, elections, crisis engine, diplomacy, units, combat, occupation, armies, fronts, supply, production, research)
- `src/ui/`: HUD, panels, overview, focus tree, events, start screen

## Real cities

Below about 190 km altitude, the globe streams real buildings, roads, street lights and water for wherever the camera is: any city on Earth. The source is [OpenFreeMap](https://openfreemap.org)'s free planet vector tiles (OpenStreetMap data, OpenMapTiles schema, no API key), the same source WatchTower, recon-app and crimtracker use. `src/world/tileWorker.js` decodes and extrudes each zoom-14 tile in a Web Worker, and `src/world/osmCity.js` decides which tiles to load and caches them. Building heights come from OSM `render_height`, or 3 m per level. If the tiles can't be reached, the procedural city in `cityLayer.js` takes over.

## Armies and battle plans

The land war works like Hearts of Iron IV (`src/game/armies.js`, `fronts.js`, `supply.js`).

- **Divisions are counters.** Each land formation is a round counter: its NATO size mark (II battalion, X brigade, XX division, XXX corps) over its number, the lower half in your side's colour (amber yours, red enemy, white allied). Armour is a dark counter, mechanised carries a track bar, airborne has a broken ring. The outer ring shows strength, the bar under it organisation, a dot supply trouble (amber low, red cut off), and a strike-through a division in retreat.
- **Armies** group divisions. Select divisions and press **＋ Army** (or **New army** on the unit card). Nations at war start with their armies already on the line.
- **Front line:** pick the tool and click the enemy country. The front is traced along the border near where you clicked, the army spreads evenly along it 6 km back, and the line follows the border as it moves.
- **Fallback line:** draw it on your own ground. With a front as well, **Fall back** / **Return to front** switches between them. Divisions dig in half again as fast on a fallback line.
- **Offensive line:** draw it across enemy ground. **Execute** sends the divisions nearest it, about one per 15 km of objective, while the rest of the army holds. Executing a front with no offensive line pushes the whole front forward in 15 km bounds. Divisions below 45% organisation stop and hold until they recover.
- **Planning and entrenchment:** an army with a plan gains up to +30% attack over 14 days, spent while it attacks. A division standing still entrenches over 8 days, up to +50% defence; moving loses it.
- **Supply hubs.** Every city is a natural hub, levelled 1–5 by population (under 0.5m → 1, 0.5m → 2, 1.5m → 3, 4m → 4, 10m+ → 5), the capital one level higher; naval bases are level-2 ports. A hub's level sets its throughput (4, 8, 13, 19, 26 divisions) and full-supply radius (200–400 km), fading to nothing 500 km further out. Divisions draw from the best hub they can reach over friendly ground; a route through enemy ground is cut. Low supply slows recovery, stops replacements and weakens a division in battle; a division cut off at war wastes away. Captured hubs work at half capacity for 30 days. Anywhere else you have to **build** a hub (20 political power, opens at level 2 after 20 days), and any hub can be **upgraded** a level (10 political power × its level, 15 days). The **Supply** screen (U) lists armies' supply, divisions short of it, and every hub's level, load and status; the **Supply** map mode draws each hub's reach and every division's supply route.
- **Reinforcements:** divisions refill from manpower and the equipment stockpile while in supply. **Training** queues a division of any template, limited by training lines from defence spending ($10bn a line); it takes its recruits at once and its equipment when it deploys (short of equipment, it deploys under strength) at the hub nearest the active army, which it then joins.
- **Combat triangle:** piercing beats armour, armour beats soft attack, soft attack beats piercing. Soft attack lands on soft targets; against armoured (hard) divisions only piercing counts. Armour the attacker cannot penetrate turns most blows aside (and halves the losses); piercing that gets through hits armour all the harder. Piercing-heavy formations are soft-skinned, so infantry and guns grind them down. Battles drain organisation slowly: an even fight lasts about a week.
- **Combined arms** (after RUSI's work on drones, EW, artillery, air defence and logistics as one system): artillery needs spotting from recon units and drones, and shells from the stockpile (out of shells, it falls quiet); enemy EW blinds the spotting. Strike drones attack from above, through tank armour, and are used up as they fly; counter-drone teams, EW and air defence bring them down. Air defence also cancels enemy air support.
- **Army designer (B):** Hearts of Iron IV's grid: five combat columns of up to five battalions (infantry, motorised, mechanised, tanks, recon, self-propelled and rocket artillery, anti-tank, short-range air defence, drone operators, electronic warfare, airborne, marines; width limit 40) and a support column (engineers, logistics, maintenance, medical, military police, signals, recon drones, counter-drone, EW). It shows soft and piercing attack, armour, spotting, EW, counter-drone and air-defence coverage, ammunition and drone use, support effects, the edge against standard infantry, mechanised and armoured divisions, and the equipment and its cost. Editing a template refits every division on it.
- **Production (P):** military factories (one per $3bn of defence spending) on up to 16 lines, each building one real 2025 system from `src/data/equipment.js`: Abrams, Leopard 2A7/2A8, T-90M, K2, Bradley, CV90, Puma, BMP-3, Paladin, PzH 2000, CAESAR, HIMARS, Tornado-S, 155/152 mm shells, Excalibur, MQ-9, TB2, Orlan-10, FPV drones, Switchblade, Shahed/Geran, Lancet, Patriot, S-400, IRIS-T SLM, NASAMS, Iron Dome, Krasukha-4 and more. A nation builds its own designs and generic patterns, and its allies' designs under licence (+30% cost); Challenger 3 is not in production until 2027. Up to 25 factories per line; lines ramp from 30% to full efficiency over 60 days; switching a line to another model of the same class keeps 60% of it; lines are in priority order and the bottom ones lose factories first when the budget falls. Each class's stock has a rating that moves toward what is being built, and division stats scale with it. Automatic planning (the AI, and the player until they change a line) rebalances lines toward shortages monthly. Ratings and costs are game estimates informed by IISS *Military Balance 2025*, RUSI and manufacturer data, for relative standing only. Fourteen nations (USA, China, Russia, Germany, France, Britain, India, Turkey, Ukraine, Poland, Israel, South Korea, Japan and Iran) start with their real 2025 equipment from `src/data/inventories.js`: each class is rated by the systems they hold (Ukraine's T-64BVs and T-72s, Poland's K2s, Abrams and PT-91s), reserves follow their real stores, and their lines build what their industry builds (Ukraine: Bohdana, Stugna-P, FPVs; Poland: Krab, K2 under licence). Other nations use the generic defaults. Sources and estimates: `docs/inventory-research.md`.
- **Research (I):** Hearts of Iron IV's research slots and technology tree (`src/game/research.js`), 43 technologies in six categories (armour; infantry and anti-tank; artillery and rockets; drones; air defence; electronic warfare). Each slot works on one technology; each has a cost in days, prerequisites and a historical year, and researching ahead of that year costs one extra year's worth per year early. Slots come from research spending: education plus a quarter of the defence budget as military R&D (one slot under ~$5bn a year, up to six); speed comes from education's share of GDP and income per head. Stopping a project keeps its progress. Technologies do three things:
  - **Unlock models.** A model's `tech` field in `equipment.js` names what it needs: Leopard 2A8 and Challenger 3 (active protection systems; Challenger 3 still waits for 2027), M1E3 Abrams and KF51 Panther (next-generation tanks, a 2028 technology), Excalibur, Switchblade and Lancet, IRIS-T SLM, TLS-BCT and Krasukha-4. A nation builds an unlocked model if it is its own design, and an ally's under licence once the maker has the technology. Locked own designs show greyed out in the production picker.
  - **Improve a class** (Top-attack ATGMs +12% anti-tank missiles, Counter-drone EW +10% EW, Rocket artillery precision +12% rocket artillery and so on). The bonus multiplies the stockpile's rating in the quality map division stats are built from.
  - **Change how divisions fight:** Fibre-optic FPV and AI terminal guidance let strike drones ignore part of the enemy's EW; spectrum-agile radios do the same for artillery spotting; counter-battery radars, drone relays and digital kill chains add spotting for divisions with guns; interceptor drones, airburst guns, counter-UAS interceptors and lasers add counter-drone cover; precision rockets cut ammunition use.
  The USA, China, Russia, Germany, France, Britain, India, Turkey and Ukraine start with what they field in 2025; everyone else starts from nothing. AI nations keep every slot busy, choosing by value per day of work: improvements to the classes their army uses, models they can build, and what a technology leads to.
- **AI** nations at war build an army, put it on the front with their nearest enemy, attack when planned and stronger, train replacements, build railheads behind poorly supplied stretches of the line and upgrade overloaded hubs.

`npm run sim [days]` runs the war headless on the real start and prints how the fronts move; `npm test` covers the front tracer, hub levels and supply, the combat triangle and combined arms, templates, the equipment catalog, production lines, the opening deployment, and research (the tree, slots, unlocks reaching the production lines, class improvements and modifiers in combat, and the AI's choices).

## Armies in 3D

Below about 80 km altitude, every nearby formation appears as its full table of organisation, drawn at 3× real vehicle size (an Abrams is ~30 m on screen). The camera goes down to ~400 m.

- **Sizes come from real units** (`src/game/orbat.js`). One armoured division is three US ABCTs (87 Abrams, ~144 Bradleys and 18 Paladins each) plus artillery and ~1,100 trucks. Russian and Chinese divisions are scaled down after battalion-tactical-group templates.
- **Layout:** brigades stand abreast, companies of ~14 vehicles sit about 400 m apart, gun batteries are 1.5 km back and truck parks behind those. A division covers about 4.5 × 5 km, so a corps fills a city.
- **Units fit the real city** (`src/world/ground.js`). Vehicles are kept out of buildings and water, park along nearby streets, and dismounted infantry stand beside their IFVs. Moving formations form close columns that follow the OSM road network from tile to tile.
- **Battles change the city** (`src/world/effects.js`):
  - Shell impacts leave craters and reduce buildings within ~40 m to charred rubble, and that damage persists even if the area is loaded later.
  - Fires burn with smoke columns drifting downwind.
  - Destroyed vehicles stay on the ground as burnt-out wrecks.
- **Movement follows real rates:**
  - Road march: ~220 km/day for armour.
  - Advance through enemy-held ground: 7–16 km/day, after Dupuy's historical data.
  - Cities halve speed and give defenders +50%.
- **Level of detail:** full models within 1.8 km of the camera, 24-triangle stand-ins beyond, and anything outside the view is skipped.

Models are built in code (`src/world/unitModels.js`) in Western, Russian/Soviet and Chinese variants. Unit cards list real equipment counts and names (M1A2 Abrams, T-90M, Type 99A, Leopard 2A7V and so on).

Eight major countries (USA, China, Russia, India, Britain, France, Germany and Japan) also start with 108 additional battalion-sized formations each. Their broad garrison regions are in `src/data/garrisons.js`. Public army station and unit maps anchor the US, UK, France, Germany and Japan; other regions are estimates. Every generated position is dispersed and checked against the game's control map. These are game formations, not claims about the precise location of real units.

## WatchTower data

`public/data/watchtower.json` and `public/flags/` come from the WatchTower project:

```bash
node scripts/import-watchtower.mjs C:/Users/david/Desktop/WatchTower
```

That data is the World Bank economy and society baseline, Trading Economics rates, Global Firepower inventories, party estimates, and the DeepState-derived control map of occupied Ukraine. Some of it dates from 2026, so it is newer than the January 2025 start.

The player's ledger adds editable annual funding lines and bond decisions. Its compact country baselines live in `public/data/budget-baselines.json`; `node scripts/import-budget-baselines.mjs` refreshes the published World Bank observations. Sources, date limits, and estimated categories are documented in `docs/budget-research.md`.
"# UNDERLORD" 
