import * as THREE from 'three';
import { DEG, ll2v, v2ll, wrapLon } from '../util/geo.js';

const MIN_DIST = 0.000006; // ~40 m: street level, close enough to see true-scale pedestrians
const MAX_DIST = 4.2;

// Scratch objects reused every frame and every pick.
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
const _P = new THREE.Vector3(), _east = new THREE.Vector3(), _north = new THREE.Vector3(), _fwd = new THREE.Vector3(), _off = new THREE.Vector3();

// Orbit/pan camera for a unit globe. The camera looks at a target point on the surface from
// `dist` Earth radii away; it tilts toward the horizon as it descends, like a flight over terrain.
export class GlobeCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.lat = 30; this.lon = 15; this.dist = 2.9; this.heading = 0; this.tiltUser = 0;
    this.goal = { lat: 30, lon: 15, dist: 2.9, heading: 0, tiltUser: 0 };
    this.vel = { lat: 0, lon: 0 };
    this.drag = null;
    this.selectionEnabled = false;
    this.onClick = () => {};
    this.onRightClick = () => {};
    this.onHover = () => {};
    this.onSelectDrag = () => {};
    this.onSelectEnd = () => {};
    this.keys = new Set();
    this._rect = null; // cached canvas rect: reading it per pointer move would force a layout
    this._proj = { near: NaN, far: NaN, fov: NaN, aspect: NaN, zoom: NaN };
    this._bind();
  }

  get tilt() {
    const t = 1 - THREE.MathUtils.smoothstep(Math.log(this.dist), Math.log(0.004), Math.log(0.35));
    return THREE.MathUtils.clamp(t * 58 + this.tiltUser, 0, 72) * DEG;
  }

  flyTo(lat, lon, dist = this.goal.dist) {
    this.goal.lat = THREE.MathUtils.clamp(lat, -84, 84);
    this.goal.lon = lon;
    this.goal.dist = THREE.MathUtils.clamp(dist, MIN_DIST, MAX_DIST);
    this.vel.lat = this.vel.lon = 0;
  }

  // Ray from the camera through a screen point, intersected with the unit sphere.
  pick(clientX, clientY) {
    const r = this._rect ?? (this._rect = this.dom.getBoundingClientRect());
    _ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.camera);
    const o = _ray.ray.origin, d = _ray.ray.direction;
    const b = o.dot(d), c = o.lengthSq() - 1, disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    return v2ll(_hit.copy(o).addScaledVector(d, t));
  }

  _radPerPx() {
    const h = this.dom.clientHeight || 800;
    const k = (2 * Math.tan((this.camera.fov * DEG) / 2)) / h;
    return k * Math.min(this.dist, 1.6) * 0.95;
  }

  _pan(dx, dy) {
    const a = this._radPerPx();
    const h = this.heading * DEG;
    const right = -dx * a, fwd = dy * a * (1 + Math.sin(this.tilt) * 1.5);
    const dE = right * Math.cos(h) + fwd * Math.sin(h);
    const dN = -right * Math.sin(h) + fwd * Math.cos(h);
    const dLat = dN / DEG, dLon = dE / (Math.max(0.15, Math.cos(this.goal.lat * DEG)) * DEG);
    this.goal.lat = THREE.MathUtils.clamp(this.goal.lat + dLat, -84, 84);
    this.goal.lon += dLon;
    return { dLat, dLon };
  }

  _bind() {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    const dropRect = () => { this._rect = null; };
    window.addEventListener('resize', dropRect);
    window.addEventListener('scroll', dropRect, true);
    if (typeof ResizeObserver === 'function') new ResizeObserver(dropRect).observe(el);
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      el.setPointerCapture(e.pointerId);
      // Right-drag pans; a right click that never moved still falls through to onRightClick
      // (move orders) on pointerup. Heading and tilt live on the middle button.
      const mode = e.button === 1 ? 'rotate' : e.button === 2 || e.button === 0 && (e.shiftKey && !this.selectionEnabled || this.keys.has(' ')) ? 'pan' : this.selectionEnabled ? 'select' : 'pan';
      this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, mode, moved: false, shift: e.shiftKey, pointerId: e.pointerId };
      this.vel.lat = this.vel.lon = 0;
    });
    el.addEventListener('pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      const d = this.drag;
      if (!d) { this.onHover(e); return; }
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX; d.y = e.clientY;
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
      if (!d.moved) return;
      if (d.mode === 'select') {
        this.onSelectDrag(d.sx, d.sy, e.clientX, e.clientY);
      } else if (d.mode === 'pan') {
        const { dLat, dLon } = this._pan(dx, dy);
        this.vel.lat = dLat; this.vel.lon = dLon;
      } else {
        this.goal.heading -= dx * 0.25;
        this.goal.tiltUser = THREE.MathUtils.clamp(this.goal.tiltUser - dy * 0.2, -40, 40);
      }
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if (d?.pointerId !== e.pointerId) return;
      this.drag = null;
      if (!d) return;
      if (d.moved && d.mode === 'select') this.onSelectEnd(d.sx, d.sy, e.clientX, e.clientY, d.shift);
      else if (!d.moved) {
        this.vel.lat = this.vel.lon = 0;
        if (d.button === 0) this.onClick(e);
        else if (d.button === 2) this.onRightClick(e);
      }
    });
    el.addEventListener('pointercancel', (e) => {
      if (this.drag?.pointerId !== e.pointerId) return;
      this.drag = null;
      this.vel.lat = this.vel.lon = 0;
      this.onSelectDrag();
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0022);
      const old = this.goal.dist;
      this.goal.dist = THREE.MathUtils.clamp(old * f, MIN_DIST, MAX_DIST);
      if (f < 1) {
        const p = this.pick(e.clientX, e.clientY);
        if (p) {
          const k = 1 - this.goal.dist / old;
          let dLon = wrapLon(p.lon - this.goal.lon);
          this.goal.lat += (p.lat - this.goal.lat) * k;
          this.goal.lon += dLon * k;
        }
      }
    }, { passive: false });
    window.addEventListener('keydown', (e) => { if (!e.target.closest('input,textarea')) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  update(dt) {
    const k = this.keys;
    const step = 9 * dt;
    if (k.has('w') || k.has('arrowup')) this._pan(0, step * 60);
    if (k.has('s') || k.has('arrowdown')) this._pan(0, -step * 60);
    if (k.has('a') || k.has('arrowleft')) this._pan(step * 60, 0);
    if (k.has('d') || k.has('arrowright')) this._pan(-step * 60, 0);
    if (k.has('q')) this.goal.heading += 70 * dt;
    if (k.has('e')) this.goal.heading -= 70 * dt;
    if (k.has('r')) this.goal.dist = Math.max(MIN_DIST, this.goal.dist * Math.exp(-1.6 * dt));
    if (k.has('f')) this.goal.dist = Math.min(MAX_DIST, this.goal.dist * Math.exp(1.6 * dt));

    if (!this.drag && (this.vel.lat || this.vel.lon)) {
      this.goal.lat = THREE.MathUtils.clamp(this.goal.lat + this.vel.lat, -84, 84);
      this.goal.lon += this.vel.lon;
      const damp = Math.exp(-dt * 5);
      this.vel.lat *= damp; this.vel.lon *= damp;
      if (Math.abs(this.vel.lat) + Math.abs(this.vel.lon) < 1e-5) this.vel.lat = this.vel.lon = 0;
    }

    const s = 1 - Math.exp(-dt * 9);
    const z = 1 - Math.exp(-dt * 6);
    this.lat += (this.goal.lat - this.lat) * s;
    this.lon += wrapLon(this.goal.lon - this.lon) * s;
    this.lon = wrapLon(this.lon); this.goal.lon = this.lon + wrapLon(this.goal.lon - this.lon);
    this.dist = Math.exp(Math.log(this.dist) + (Math.log(this.goal.dist) - Math.log(this.dist)) * z);
    this.heading += (this.goal.heading - this.heading) * s;
    this.tiltUser += (this.goal.tiltUser - this.tiltUser) * s;

    const P = ll2v(this.lat, this.lon, 1, _P);
    const lo = this.lon * DEG, h = this.heading * DEG, t = this.tilt;
    const east = _east.set(Math.cos(lo), 0, -Math.sin(lo));
    const north = _north.crossVectors(P, east).normalize();
    const fwd = _fwd.copy(north).multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h));
    const off = _off.copy(P).multiplyScalar(Math.cos(t)).addScaledVector(fwd, -Math.sin(t)).multiplyScalar(this.dist);
    const cam = this.camera;
    cam.position.copy(P).add(off);
    cam.up.copy(fwd).multiplyScalar(Math.cos(t)).addScaledVector(P, Math.sin(t));
    cam.lookAt(P);
    cam.near = Math.max(0.0000002, this.dist * 0.04);
    cam.far = this.dist + 8;
    // The projection only depends on these (view offsets update it themselves when set), so it is
    // rebuilt only when one of them moved; once the zoom settles that is most frames.
    const pr = this._proj;
    if (pr.near !== cam.near || pr.far !== cam.far || pr.fov !== cam.fov || pr.aspect !== cam.aspect || pr.zoom !== cam.zoom) {
      pr.near = cam.near; pr.far = cam.far; pr.fov = cam.fov; pr.aspect = cam.aspect; pr.zoom = cam.zoom;
      cam.updateProjectionMatrix();
    }
  }

  // Altitude of the camera above the ground, in Earth radii.
  get altitude() { return this.camera.position.length() - 1; }
}
