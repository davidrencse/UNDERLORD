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
| Left-drag, WASD | Pan |
| Wheel, R / F | Zoom (towards the cursor) |
| Right-drag, Q / E | Rotate and tilt |
| Click a nation | Open its panel |
| Click a counter, shift-click | Select formations |
| Right-click | Move the selected formations; on an enemy counter, attack it |
| Space, 1–5 | Pause, game speed |
| O / T | Country overview / national trajectory |
| N | Toggle the day/night terminator |
| Esc | Close the current screen |

## Layout

- `src/data/`: starting conditions (nations, leaders, parties, power centres, spirits, focus trees, cities, naval bases)
- `src/world/`: globe shader, sovereignty raster, camera, city-level layer
- `src/game/`: simulation (economy, politics, elections, crisis engine, diplomacy, units, combat, occupation)
- `src/ui/`: HUD, panels, overview, focus tree, events, start screen

## Real cities

Below about 190 km altitude, the globe streams real buildings, roads, street lights and water for wherever the camera is: any city on Earth. The source is [OpenFreeMap](https://openfreemap.org)'s free planet vector tiles (OpenStreetMap data, OpenMapTiles schema, no API key), the same source WatchTower, recon-app and crimtracker use. `src/world/tileWorker.js` decodes and extrudes each zoom-14 tile in a Web Worker, and `src/world/osmCity.js` decides which tiles to load and caches them. Building heights come from OSM `render_height`, or 3 m per level. If the tiles can't be reached, the procedural city in `cityLayer.js` takes over.

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

## WatchTower data

`public/data/watchtower.json` and `public/flags/` come from the WatchTower project:

```bash
node scripts/import-watchtower.mjs C:/Users/david/Desktop/WatchTower
```

That data is the World Bank economy and society baseline, Trading Economics rates, Global Firepower inventories, party estimates, and the DeepState-derived control map of occupied Ukraine. Some of it dates from 2026, so it is newer than the January 2025 start.
"# UNDERLORD" 
