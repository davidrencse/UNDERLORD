import * as THREE from 'three';
import { bearing, destination, haversine, ll2v, DEG, EARTH_KM } from '../util/geo.js';

const R_M = EARTH_KM * 1000;
const SHOW_BELOW = 0.008;
const MAX_ROUTES = 120;
const VIEW_KM = 7;

// Visual traffic uses the supply assignment from the simulation. Vehicles cycle over the last
// few kilometres of each route; their movement does not alter the supply calculation.
export class SupplyTraffic {
  constructor(scene, game, units) {
    this.game = game;
    this.units = units;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const box = (w, h, l, y, z = 0) => {
      const g = new THREE.BoxGeometry(w, h, l);
      g.translate(0, y, z);
      return g;
    };
    this.truck = this._mesh(box(2.5, 2.1, 6.5, 1.1), new THREE.MeshLambertMaterial({ color: 0x9b8f6f }));
    this.cab = this._mesh(box(2.5, 1.5, 1.8, 1.35, 2.4), new THREE.MeshLambertMaterial({ color: 0x596c60 }));
    this.train = this._mesh(box(3.2, 3.0, 11, 1.55), new THREE.MeshLambertMaterial({ color: 0x757c77 }));
    this.engine = this._mesh(box(3.1, 1.2, 3, 2.65, 3.5), new THREE.MeshLambertMaterial({ color: 0x9b8f6f }));
    this._m = new THREE.Matrix4();
    this._basis = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._east = new THREE.Vector3();
    this._north = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._scale = new THREE.Vector3(2 / R_M, 2 / R_M, 2 / R_M);
    this._quat = new THREE.Quaternion();
    this.last = -Infinity;
    this.hubs = new Map();
    this.hubCount = -1;
  }

  _mesh(geometry, material) {
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_ROUTES);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    return mesh;
  }

  _place(point, heading, index, body, detail) {
    ll2v(point.lat, point.lon, 1 + 0.1 / R_M, this._pos);
    this._up.copy(this._pos).normalize();
    this._east.set(Math.cos(point.lon * DEG), 0, -Math.sin(point.lon * DEG));
    this._north.crossVectors(this._up, this._east);
    const h = heading * DEG;
    this._forward.copy(this._north).multiplyScalar(Math.cos(h)).addScaledVector(this._east, Math.sin(h));
    this._right.crossVectors(this._forward, this._up);
    this._basis.makeBasis(this._right, this._up, this._forward);
    this._quat.setFromRotationMatrix(this._basis);
    this._m.compose(this._pos, this._quat, this._scale);
    body.setMatrixAt(index, this._m);
    detail.setMatrixAt(index, this._m);
  }

  update(cam, now) {
    const show = this.game.player != null && cam.dist < SHOW_BELOW;
    this.group.visible = show;
    if (!show || now - this.last < 1 / 20) return;
    this.last = now;
    const hubs = this.units.armies.hubs;
    if (this.hubCount !== hubs.length) {
      this.hubs = new Map(hubs.map((h) => [h.id, h]));
      this.hubCount = hubs.length;
    }
    let trucks = 0, trains = 0;
    for (const s of this.units.stacks) {
      if (!s.kit || !s.hub || s.supply <= 0.08) continue;
      const hub = this.hubs.get(s.hub);
      if (!hub) continue;
      const nearUnit = Math.abs(cam.lat - s.lat) < 0.09 && haversine(cam, s) < VIEW_KM;
      const nearHub = Math.abs(cam.lat - hub.lat) < 0.09 && haversine(cam, hub) < VIEW_KM;
      if (!nearUnit && !nearHub) continue;
      const km = haversine(hub, s);
      if (km < 0.2) continue;
      if (nearUnit && trucks < MAX_ROUTES) {
        const progress = ((now * 0.012 + s.id * 7.3) % Math.min(km, 4)) / Math.min(km, 4);
        const point = destination(s, bearing(s, hub), Math.min(km, 4) * (1 - progress));
        this._place(point, bearing(hub, s), trucks++, this.truck, this.cab);
      }
      if (nearHub && km > 35 && trains < MAX_ROUTES) {
        const progress = ((now * 0.02 + s.id * 11.7) % Math.min(km, 10)) / Math.min(km, 10);
        const point = destination(hub, bearing(hub, s), Math.min(km, 10) * progress);
        this._place(point, bearing(hub, s), trains++, this.train, this.engine);
      }
      if (trucks === MAX_ROUTES && trains === MAX_ROUTES) break;
    }
    for (const mesh of [this.truck, this.cab]) { mesh.count = trucks; mesh.instanceMatrix.needsUpdate = trucks > 0; }
    for (const mesh of [this.train, this.engine]) { mesh.count = trains; mesh.instanceMatrix.needsUpdate = trains > 0; }
  }
}
