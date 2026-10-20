import './style.css';
import './ui/immigration.css';
import './ui/demographicDoctrine.css';
import * as THREE from 'three';
import { loadWorld, pixelOf, meshNation } from './world/geo.js';
import { Globe, sunDirection } from './world/globe.js';
import { GlobeCamera } from './world/camera.js';
import { CityLayer } from './world/cityLayer.js';
import { OsmCity } from './world/osmCity.js';
import { Civilians } from './world/civilians.js';
import { StreetTraffic } from './world/streetTraffic.js';
import { SupplyTraffic } from './world/supplyTraffic.js';
import { ArmyLayer } from './world/armyLayer.js';
import { Effects } from './world/effects.js';
import { Game } from './game/game.js';
import { Units, TYPES } from './game/units.js';
import { IDEOLOGIES } from './data/nations.js';
import { Overlay } from './ui/overlay.js';
import { Hud } from './ui/hud.js';
import { CountryPanel, UnitPanel } from './ui/panels.js';
import { DiplomacyMenu } from './ui/diplomacyMenu.js';
import { DossierScreen, FocusScreen, EventModal, StartScreen } from './ui/screens.js';
import { DemographicsScreen } from './ui/demographicsScreen.js';
import { EconomyScreen } from './ui/economyScreen.js';
import { ArmyBar } from './ui/armyBar.js';
import { SupplyScreen } from './ui/supplyScreen.js';
import { DesignerScreen } from './ui/designerScreen.js';
import { ProductionScreen } from './ui/productionScreen.js';
import { ResearchScreen } from './ui/researchScreen.js';
import { CommandScreen } from './ui/commandScreen.js';
import { ConstructionMap } from './ui/constructionMap.js';
import { TECH } from './game/research.js';
import { ll2v, interpolate, haversine, destination } from './util/geo.js';

const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = '<div><b>UNDERLORD</b><span id="lmsg">Loading the world</span></div>';
document.body.appendChild(loading);
const say = (m) => { const el = document.getElementById('lmsg'); if (el) el.textContent = m; };

const world = await loadWorld(say);
say('Raising armies');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x000000);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.001, 20);
scene.add(camera);
scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const headlight = new THREE.DirectionalLight(0xffffff, 1.6);
headlight.position.set(-0.6, 1, 0.5);
camera.add(headlight);

const globe = new Globe(scene, world, renderer);
const game = new Game(world);
const units = new Units(game, world);
const cityLayer = new CityLayer(scene, world, game);
const osm = new OsmCity(scene);
const civilians = new Civilians(scene, osm, cityLayer);
const streetTraffic = new StreetTraffic(scene, osm, cityLayer);
const supplyTraffic = new SupplyTraffic(scene, game, units);
const army = new ArmyLayer(scene, game, units, osm);
const effects = new Effects(scene, game, units, osm);
const cam = new GlobeCamera(camera, canvas);

const pathLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.9, depthWrite: false }));
pathLine.frustumCulled = false;
pathLine.visible = false;
scene.add(pathLine);

// Viewport size, cached so the frame loop never reads window.inner* (which can force layout).
let vw = window.innerWidth, vh = window.innerHeight;

let mode = 0;
let selectedNation = null;
let selectedUnits = [];
// Battle-plan tools: { kind: 'front' | 'fallback' | 'offensive' | 'hub', army, pts }.
let tool = null;
let toolHover = null;
let activeArmy = null;

const ui = document.getElementById('ui');
const ctx = {
  game, world, units, cam, camera, cityLayer,
  selectedNation: () => selectedNation,
  selectNation, selectUnits, setMode,
  openDossier: (i) => { if (i != null) { demographics.close(); focus.close(); economy.close(); closeMilitary(); dossier.open(i); } },
  openDemographics: (i) => { if (i != null) { dossier.close(); focus.close(); economy.close(); closeMilitary(); demographics.open(i); } },
  openFocus: (category, selected) => { if (game.player != null) { dossier.close(); demographics.close(); economy.close(); closeMilitary(); focus.open(category, selected); } },
  openLedger: () => openEconomy('budget'),
  openEconomy: (tab, toggle) => openEconomy(tab, toggle),
  openConstruction: (kind) => { construction.kind = kind; setMode(7); },
  openMilitary,
  toast: (t) => hud.toast(t),
  refreshTop: () => hud.renderTop(),
  refreshScreens: () => flushDayUI(),
  refreshClock: () => hud.renderClock(),
  escape,
  onUnitClick: (s, add, members) => {
    if (start.active) return;
    const group = members?.length ? members : [s];
    selectUnits(add ? [...new Set([...selectedUnits, ...group])] : group);
  },
  onUnitRightClick: (target) => orderSelected({ lat: target.lat, lon: target.lon }),
  begin, preview,
  tool: () => tool,
  toolHover: () => toolHover,
  setTool,
  activeArmy: () => activeArmy,
  setActiveArmy,
  selectedUnits: () => selectedUnits,
  onPanelClose: () => { selectedNation = null; overlay.selectedNation = null; globe.uniforms.uSel.value = -1; globe.setSelectionOutline(null); },
};

const overlay = new Overlay(document.getElementById('overlay'), ctx);
const construction = new ConstructionMap(ui, document.getElementById('overlay'), ctx);
const selectionBox = document.createElement('div');
selectionBox.className = 'selection-box';
selectionBox.hidden = true;
document.getElementById('overlay').appendChild(selectionBox);
const selectPos = new THREE.Vector3();
cam.onSelectDrag = (x0, y0, x1, y1) => {
  if (x0 == null || start.active || mode === 7) { selectionBox.hidden = true; return; }
  selectionBox.hidden = false;
  selectionBox.style.left = `${Math.min(x0, x1)}px`;
  selectionBox.style.top = `${Math.min(y0, y1)}px`;
  selectionBox.style.width = `${Math.abs(x1 - x0)}px`;
  selectionBox.style.height = `${Math.abs(y1 - y0)}px`;
};
cam.onSelectEnd = (x0, y0, x1, y1, add) => {
  selectionBox.hidden = true;
  if (start.active || game.player == null || mode === 7) return;
  const left = Math.min(x0, x1), right = Math.max(x0, x1);
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
  const picked = [];
  for (const s of units.stacks) {
    if (s.owner !== game.player) continue;
    ll2v(s.lat, s.lon, 1.0004, selectPos);
    if (selectPos.dot(camera.position) <= selectPos.lengthSq() * 1.0002) continue;
    selectPos.project(camera);
    if (selectPos.z >= 1) continue;
    const x = (selectPos.x + 1) * 0.5 * vw;
    const y = (1 - selectPos.y) * 0.5 * vh;
    if (x >= left && x <= right && y >= top && y <= bottom) picked.push(s);
  }
  selectUnits(add ? [...new Set([...selectedUnits, ...picked])] : picked);
};
const hud = new Hud(ui, ctx);
const countryPanel = new CountryPanel(ui, ctx);
const diplomacyMenu = new DiplomacyMenu(ui, { ...ctx, countryPanel });
const unitPanel = new UnitPanel(ui, ctx);
const dossier = new DossierScreen(ui, ctx);
const demographics = new DemographicsScreen(ui, ctx);
const focus = new FocusScreen(ui, ctx);
const economy = new EconomyScreen(ui, ctx);
const events = new EventModal(ui, ctx);
const armyBar = new ArmyBar(ui, ctx);
const supply = new SupplyScreen(ui, ctx);
const designer = new DesignerScreen(ui, ctx);
const production = new ProductionScreen(ui, ctx);
const research = new ResearchScreen(ui, ctx);
const command = new CommandScreen(ui, ctx);
const military = { supply, designer, production, research, command };
let milTab = 'supply';

// The supply, army designer and production screens share one tab strip. A hotkey toggles its
// own tab; the top-bar button reopens whichever tab was last used.
function openMilitary(tab = milTab, toggle = false) {
  if (game.player == null) return;
  const screen = military[tab];
  if (toggle && !screen.el.hidden) { screen.close(); return; }
  dossier.close(); demographics.close(); focus.close(); economy.close();
  for (const [k, s] of Object.entries(military)) if (k !== tab) s.close();
  milTab = tab;
  screen.open();
}
// The economy screen's tabs: Overview (E), Budget (L), Construction, Industry, Trade, Finance, Laws.
function openEconomy(tab, toggle = false) {
  if (game.player == null) return;
  dossier.close(); demographics.close(); focus.close(); closeMilitary();
  economy.open(tab, toggle);
}
function closeMilitary() { for (const s of Object.values(military)) s.close(); }
const start = new StartScreen(ui, ctx);
loading.remove();

// ------------------------------------------------------------------ map modes
function hash01(i) { return ((Math.imul(i, 2654435761) >>> 0) % 1000) / 1000; }
function rebuildLUT() {
  const d = globe.lutData;
  const enemies = game.player != null ? game.enemiesOf(game.player) : new Set();
  for (const n of game.nations.slice(1)) {
    let v = 0.5;
    if (mode === 6) v = 0.5;
    else if (mode === 1) v = IDEOLOGIES[n.ideology].shade * 0.7 + hash01(n.index) * 0.28;
    else if (mode === 2) v = n.faction === 'NATO' ? 0.88 : n.faction === 'CSTO' ? 0.42 : n.faction === 'AES' ? 0.6 : 0.16;
    else if (mode === 3) v = n.stability / 100;
    else if (mode === 4) v = n.warSupport / 100;
    else if (mode === 5) v = Math.max(0, Math.min(1, (Math.log10((n.gdp * 1e3) / Math.max(0.01, n.pop)) - 2.6) / 2.3));
    if (n.inert) v = 0.08;
    let flag = 0;
    if (game.player != null && mode > 0 && mode !== 6) {
      if (n.index === game.player) flag = 255;
      else if (enemies.has(n.index)) flag = 90;
      else if (game.allied(n.index, game.player)) flag = 170;
    }
    d[n.index * 4] = Math.round(v * 255);
    d[n.index * 4 + 1] = flag;
  }
  globe.refreshLUT();
}
// Supply (6) keeps the terrain globe and draws hub reach and supply routes over it.
function setMode(m) {
  diplomacyMenu.close();
  if (m === 7) { setTool(null); dossier.close(); demographics.close(); focus.close(); economy.close(); closeMilitary(); countryPanel.close(); construction.open(); }
  else construction.close();
  mode = m;
  globe.uniforms.uMode.value = m === 6 ? 0 : m;
  overlay.mode = m;
  hud.setMode(m);
  document.body.classList.toggle('construction-mode', m === 7);
  rebuildLUT();
}

// ------------------------------------------------------------------ selection
function selectNation(i, fly = false) {
  if (i == null || !game.nations[i]) return;
  diplomacyMenu.close();
  selectedNation = i;
  overlay.selectedNation = i;
  globe.uniforms.uSel.value = i;
  globe.setSelectionOutline(meshNation(world, i));
  countryPanel.open(i);
  if (fly) {
    const n = game.nations[i];
    cam.flyTo(n.label.lat, n.label.lon, Math.max(0.35, Math.min(2.2, Math.sqrt(n.mainArea) * 3.4)));
  }
}

function selectUnits(list) {
  selectedUnits = list;
  overlay.selected = new Set(list.map((s) => s.id));
  // Picking out one army's divisions makes it the army the plan tools act on.
  const armyIds = new Set(list.filter((s) => s.owner === game.player && s.army).map((s) => s.army));
  if (armyIds.size === 1 && list.every((s) => s.army)) setActiveArmy([...armyIds][0]);
  unitPanel.show(list);
  armyBar.render();
}

function setActiveArmy(id) {
  activeArmy = id;
  overlay.activeArmy = id;
  if (tool && tool.kind !== 'hub' && tool.army !== id) setTool(null);
  armyBar.render();
  unitPanel.render();
}

function setTool(t) {
  tool = t;
  toolHover = null;
  armyBar.render();
}

// A click while a plan tool is active: pick the front's enemy, add a line point, or site a hub.
function toolClick(ll) {
  if (!ll) return;
  const A = units.armies, a = A.byId.get(tool.army);
  if (tool.kind === 'hub') {
    const why = A.buildHub(game.player, ll);
    if (why) { hud.toast(why); return; }
    setTool(null);
    hud.toast('Supply hub under construction.');
    hud.renderTop();
  } else if (tool.kind === 'front') {
    if (!a) { setTool(null); return; }
    const pixel = pixelOf(ll.lat, ll.lon);
    const controller = world.control[pixel], owner = world.owner[pixel];
    const target = controller === a.owner ? owner : controller || owner;
    const why = A.setFront(a, target, ll);
    if (why) { hud.toast(why); return; }
    setTool(null);
    hud.toast(`${a.name} is deploying along the front.`);
  } else {
    tool.pts.push({ lat: ll.lat, lon: ll.lon });
    armyBar.render();
  }
}

function finishTool() {
  if (!tool) return;
  if (!tool.pts) { setTool(null); return; }
  const A = units.armies, a = A.byId.get(tool.army);
  if (!a) { setTool(null); return; }
  if (tool.pts.length < 2) { hud.toast('Click at least two points, then finish the line.'); return; }
  const why = tool.kind === 'fallback' ? A.setFallback(a, tool.pts) : A.setOffensive(a, tool.pts);
  if (why) { hud.toast(why); return; }
  setTool(null);
}

function orderSelected(dest) {
  const mine = selectedUnits.filter((s) => s.owner === game.player);
  if (!mine.length) return;
  let first = null;
  mine.forEach((s, k) => {
    const d = mine.length > 1 && TYPES[s.type].domain === 'land' ? destination(dest, (k * 360) / mine.length, Math.min(25, 6 * k)) : dest;
    const why = units.order(s, d);
    if (why && !first) first = why;
    // A hand-moved division finishes the move, then its army's plan takes it back.
    else if (!why && s.army) s.manual = true;
  });
  if (first) hud.toast(first);
  unitPanel.render();
}

function escape() {
  if (mode === 7) setMode(0);
  else if (tool) setTool(null);
  else if (!diplomacyMenu.el.hidden) diplomacyMenu.close();
  else if (!dossier.el.hidden) dossier.close();
  else if (!demographics.el.hidden) demographics.close();
  else if (!focus.el.hidden) focus.close();
  else if (!economy.el.hidden) economy.close();
  else if (Object.values(military).some((s) => !s.el.hidden)) closeMilitary();
  else if (selectedUnits.length) selectUnits([]);
  else if (selectedNation != null) countryPanel.close();
}

// ------------------------------------------------------------------ input
const nationAt = (ll) => (ll ? world.owner[pixelOf(ll.lat, ll.lon)] : 0);
cam.onClick = (e) => {
  const ll = cam.pick(e.clientX, e.clientY);
  const i = nationAt(ll);
  if (start.active) { if (i) start.choose(i); return; }
  if (mode === 7) { construction.place(ll); return; }
  if (tool) { toolClick(ll); return; }
  if (!e.shiftKey) selectUnits([]);
  if (i && !game.nations[i].inert) selectNation(i);
};
cam.onRightClick = (e) => {
  const ll = cam.pick(e.clientX, e.clientY);
  if (!ll || start.active) return;
  if (mode === 7) { setMode(0); return; }
  if (tool) { if (tool.pts?.length) finishTool(); else setTool(null); return; }
  if (selectedUnits.some((s) => s.owner === game.player) && !e.shiftKey) { diplomacyMenu.close(); orderSelected(ll); return; }
  const i = nationAt(ll);
  if (i && i !== game.player && !game.nations[i].inert) {
    selectNation(i);
    diplomacyMenu.open(i, e.clientX, e.clientY);
  } else diplomacyMenu.close();
};
let hoverPending = null;
cam.onHover = (e) => { hoverPending = e; };
function processHover() {
  const e = hoverPending;
  if (!e) return;
  hoverPending = null;
  const ll = cam.pick(e.clientX, e.clientY);
  if (mode === 7) construction.setHover(ll, e.clientX, e.clientY);
  const i = nationAt(ll);
  if (tool) toolHover = ll;
  globe.uniforms.uHover.value = i || -1;
  if (ll && !hud.top.hidden) {
    const c = world.control[pixelOf(ll.lat, ll.lon)];
    const n = game.nations[i];
    const label = n ? (c && c !== i ? `${n.name}, occupied by ${game.nations[c].name}` : n.name) : 'International waters';
    const city = cam.dist < 0.4 ? cityLayer.nearest(ll.lat, ll.lon, 60) : null;
    hud.coords(ll, city ? `${label}. ${city.name}` : label);
  }
}

// ------------------------------------------------------------------ game flow
function preview(i) {
  const n = game.nations[i];
  selectedNation = i;
  overlay.selectedNation = i;
  globe.uniforms.uSel.value = i;
  globe.setSelectionOutline(meshNation(world, i));
  cam.flyTo(n.label.lat, n.label.lon, Math.max(0.6, Math.min(2.4, Math.sqrt(n.mainArea) * 4)));
}

function begin(i) {
  game.player = i;
  cam.selectionEnabled = true;
  globe.uniforms.uPlayer.value = i;
  hud.show();
  armyBar.show();
  units.armies.traceWarFront();
  const first = units.armies.of(i)[0];
  if (first) setActiveArmy(first.id);
  setMode(0);
  selectNation(i, true);
  hud.toast('Time is paused. Press Space to start, 1–5 to change speed.');
}

// Simulation-driven UI refreshes are coalesced into one pass at the end of the frame's task
// (several days can tick in one frame at top speed), so they also never dirty layout before the
// frame's hover pick reads it.
let dayUIQueued = false;
function flushDayUI() {
  dayUIQueued = false;
  if (game.player == null) return;
  hud.renderTop(); countryPanel.render(); focus.render(); economy.render(); supply.render(); production.render(); research.render(); command.render();
  construction.render();
  demographics.render();
}
function queueUI() {
  if (game.player != null && !dayUIQueued) { dayUIQueued = true; queueMicrotask(flushDayUI); }
}
game.on('day', () => {
  if (mode) rebuildLUT();
  queueUI();
});
// Anything a decision changes on the spot: political power spent, a focus finished, a division
// deployed. With time paused no day ever ticks, so without these the top bar would hold the
// figures the player had before they acted.
game.on('nation', queueUI);
game.on('focus', queueUI);
game.on('units', queueUI);
game.on('wars', () => rebuildLUT());
game.on('event', () => events.next());
game.on('raise', () => setTimeout(() => hud.renderTop(), 0));
game.on('politics', () => countryPanel.schedule());
// A finished technology: say what it opens up, and refresh the production picker.
game.on('research', (n, done) => {
  for (const id of done) {
    const t = TECH[id];
    hud.toast(`Research complete: ${t.name}${t.unlocks.length ? '. New models can be put on the production lines.' : '.'}`);
  }
  production._html = '';
});
let ctrlDirty = false, ownerDirty = false;
game.on('control', (annexed) => { ctrlDirty = true; if (annexed) ownerDirty = true; });

window.addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') globe.uniforms.uNightOn.value = globe.uniforms.uNightOn.value ? 0 : 1;
  if (e.key === 'Enter' && tool && !e.target.closest('input,textarea,button')) { e.preventDefault(); finishTool(); }
});
window.addEventListener('resize', () => {
  vw = window.innerWidth; vh = window.innerHeight;
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();
});

// ------------------------------------------------------------------ paths of selected units
// Rebuilt only when the selection, a selected unit's position or its path changes (paths are
// replaced or shifted, never edited in place), into a reused GPU buffer.
const pathSig = [];
const pathPts = [];
const pa = new THREE.Vector3(), pb = new THREE.Vector3();
function pathsChanged() {
  let changed = pathSig.length !== selectedUnits.length * 4, i = 0;
  for (const s of selectedUnits) {
    if (!changed && (pathSig[i] !== s.lat || pathSig[i + 1] !== s.lon || pathSig[i + 2] !== s.path || pathSig[i + 3] !== s.path.length)) changed = true;
    pathSig[i] = s.lat; pathSig[i + 1] = s.lon; pathSig[i + 2] = s.path; pathSig[i + 3] = s.path.length;
    i += 4;
  }
  pathSig.length = i;
  return changed;
}
function updatePaths() {
  if (!pathsChanged()) return;
  const pts = pathPts;
  pts.length = 0;
  for (const s of selectedUnits) {
    let from = { lat: s.lat, lon: s.lon };
    for (const wp of s.path) {
      const steps = Math.max(2, Math.ceil(haversine(from, wp) / 40));
      for (let k = 0; k < steps; k++) {
        const p0 = interpolate(from, wp, k / steps), p1 = interpolate(from, wp, (k + 1) / steps);
        ll2v(p0.lat, p0.lon, 1.0006, pa); ll2v(p1.lat, p1.lon, 1.0006, pb);
        pts.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      }
      from = wp;
    }
  }
  pathLine.visible = pts.length > 0;
  if (!pts.length) return;
  let attr = pathLine.geometry.getAttribute('position');
  if (!attr || attr.array.length < pts.length) {
    // Grow geometrically; a replaced attribute's GPU buffer is only freed by disposing its geometry.
    pathLine.geometry.dispose();
    pathLine.geometry = new THREE.BufferGeometry();
    attr = new THREE.BufferAttribute(new Float32Array(6 * Math.max(256, 2 ** Math.ceil(Math.log2(pts.length / 6)))), 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    pathLine.geometry.setAttribute('position', attr);
  }
  attr.array.set(pts);
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, pts.length);
  attr.needsUpdate = true;
  pathLine.geometry.setDrawRange(0, pts.length / 3);
}

// OpenStreetMap credit, shown while real city geometry is on screen.
const attrib = document.createElement('div');
attrib.className = 'attrib';
attrib.hidden = true;
attrib.innerHTML = 'Buildings and roads: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
ui.appendChild(attrib);

// ------------------------------------------------------------------ main loop
const sun = new THREE.Vector3();
let last = performance.now();
let uiTimer = 0, texTimer = 0, lastHour = game.time;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (start.active) {
    if (start.choice == null) cam.goal.lon += dt * 3;
    const W = vw, H = vh;
    if (W > 900) camera.setViewOffset(W, H, 230, 0, W, H); else camera.clearViewOffset();
  } else {
    if (camera.view?.enabled) camera.clearViewOffset();
    game.advance(dt);
  }
  cam.update(dt);
  processHover();
  globe.update(camera, cam.dist, sunDirection(game.date, sun));
  osm.update(cam, vh);
  cityLayer.update(cam, vh, osm.active && osm.visibleBuildings() > 0);
  civilians.update(cam, now / 1000);
  streetTraffic.update(cam, now / 1000);
  supplyTraffic.update(cam, now / 1000);
  army.update(cam, now / 1000);
  effects.update(cam, camera, now / 1000);
  if (attrib.hidden !== !osm.active) attrib.hidden = !osm.active;
  overlay.update();
  construction.update();
  updatePaths();

  texTimer += dt;
  if (texTimer > 0.4 && (ctrlDirty || ownerDirty)) {
    texTimer = 0;
    if (ctrlDirty) globe.refreshControl();
    if (ownerDirty) globe.refreshOwner();
    ctrlDirty = ownerDirty = false;
  }
  uiTimer += dt;
  if (uiTimer > 0.25 && game.player != null) {
    uiTimer = 0;
    if (game.time !== lastHour) { lastHour = game.time; hud.renderClock(); unitPanel.render(); armyBar.render(); }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for the browser console.
window.underlord = { game, units, world, cam, globe, osm, civilians, streetTraffic, supplyTraffic, army, effects, play: (iso) => { start.el.hidden = true; begin(world.byIso.get(iso).index); } };
