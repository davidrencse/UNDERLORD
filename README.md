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
| Click a counter, shift-click | Select formations |
| Right-click a country | Open diplomatic decisions for that country |
| Right-click with formations selected | Move them; on an enemy counter, attack it. Shift + right-click opens country decisions |
| Army bar (bottom left) | Select an army; click its card again to fly to it. Front line, Fallback line, Offensive line, Execute |
| While drawing a line | Click to add points; Enter or right-click finishes; Esc cancels |
| Space, 1–5 | Pause, game speed |
| O / T / L | Country overview / national trajectory / your country ledger |
| N | Toggle the day/night terminator |
| Esc | Close the current screen |

## Layout

- `src/data/`: starting conditions (nations, leaders, parties, power centres, spirits, focus trees, cities, naval bases). The seven major campaign trees continue in `majorFocuses.js` and `majorFocusesMore.js`.
- `docs/focus-tree-research.md`: sources and adaptation notes for the seven major-country focus trees
- `src/world/`: globe shader, sovereignty raster, camera, city-level layer
- `src/game/`: simulation (economy, politics, elections, crisis engine, diplomacy, units, combat, occupation, armies, fronts, supply)
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
- **Supply hubs** are railheads in every capital and larger city, plus naval bases. Divisions draw from the best hub they can reach over friendly ground: full supply within 300 km, nothing beyond 1,000 km, and a hub's throughput (in divisions) is shared by everyone using it. A route through enemy ground is cut. Low supply slows recovery, stops replacements and weakens a division in battle; a division cut off wastes away. Captured hubs work at half capacity for 30 days. **Supply hub** builds a new one on your ground: 25 political power, open after 20 days. Select divisions to see their supply routes.
- **Reinforcements:** divisions refill from manpower while in supply. **Training** queues new divisions (infantry 45 days, mechanised 60, armoured 75), limited by training lines from defence spending ($10bn a line). They deploy at the hub nearest the active army and join it.
- **AI** nations at war build an army, put it on the front with their nearest enemy, attack when planned and stronger, and train replacements.

`npm run sim [days]` runs the war headless on the real start and prints how the fronts move; `npm test` covers the front tracer, supply and the opening deployment.

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
