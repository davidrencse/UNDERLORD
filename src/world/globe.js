import * as THREE from 'three';
import { ll2v } from '../util/geo.js';
import { MAP_W, MAP_H } from './geo.js';

// Front-line mask: one flag per FM×FM block of the id rasters, dilated by one block. With taps
// fewer than FM_REACH texels away, nearest-texel rounding (±1 texel, also between the two
// textures' grids) keeps every tap inside the dilated block, so a clear flag is exact.
const FM = 16, FM_REACH = 12;
const FM_W = MAP_W / FM, FM_H = MAP_H / FM;

const vert = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
precision highp float;
uniform sampler2D uColor, uTopo, uWater, uNight, uOwner, uCtrl, uLUT, uFrontMask;
uniform vec3 uSun, uCam;
uniform float uAlt, uSel, uHover, uPlayer, uMode, uNightOn, uTime;
uniform mat4 uProjView;
varying vec3 vPos;
const float PI = 3.14159265359;

float idAt(sampler2D t, vec2 uv) { return floor(texture2D(t, uv).r * 255.0 + 0.5); }
// Same texel as idAt (the id rasters have no mipmaps and nearest filtering), safe inside branches.
float idAtL(sampler2D t, vec2 uv) { return floor(textureLod(t, uv, 0.0).r * 255.0 + 0.5); }
vec4 lut(float id) { return texture2D(uLUT, vec2((id + 0.5) / 256.0, 0.5)); }

void main() {
  // Ray-trace the true sphere under this pixel: the tessellated mesh sags up to ~80 m between
  // vertices, which would leave street-level buildings floating above the ground.
  vec3 rd = normalize(vPos - uCam);
  float b = dot(uCam, rd), disc = b * b - (dot(uCam, uCam) - 1.0);
  vec3 P = disc > 0.0 ? uCam + rd * (-b - sqrt(disc)) : vPos;
  vec4 clip = uProjView * vec4(P, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  vec3 n = normalize(P);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  // Two parameterisations with seams on opposite meridians; use whichever is continuous here.
  float uA = lon / (2.0 * PI) + 0.5;
  float uB = uA < 0.5 ? uA + 1.0 : uA;
  float u = fwidth(uA) <= fwidth(uB) + 1e-6 ? uA : uB;
  vec2 uv = vec2(u, lat / PI + 0.5);
  vec2 uvD = vec2(u, 0.5 - lat / PI);

  vec3 bm = texture2D(uColor, uv).rgb;
  float lum = dot(bm, vec3(0.299, 0.587, 0.114));
  float waterRaw = texture2D(uWater, uv).r;
  float water = smoothstep(0.35, 0.65, waterRaw);

  // Hillshade from the elevation map, lit from the north-west like a printed relief map.
  vec2 tx = vec2(1.0 / 2048.0, 1.0 / 1024.0);
  float h = texture2D(uTopo, uv).r;
  float hE = texture2D(uTopo, uv + vec2(tx.x, 0.0)).r, hW = texture2D(uTopo, uv - vec2(tx.x, 0.0)).r;
  float hN = texture2D(uTopo, uv + vec2(0.0, tx.y)).r, hS = texture2D(uTopo, uv - vec2(0.0, tx.y)).r;
  float coslat = max(cos(lat), 0.08);
  vec3 tn = normalize(vec3((hW - hE) * 9.0 / coslat, (hS - hN) * 9.0, 1.0));
  vec3 L = normalize(vec3(-0.65, 0.6, 0.6));
  float shade = clamp(dot(tn, L) / L.z, 0.15, 1.9);

  float landTone = 0.16 + 0.55 * pow(lum, 0.85);
  vec3 land = vec3(landTone) * mix(1.0, shade, 0.9);
  vec3 sea = vec3(0.022, 0.025, 0.03) + vec3(lum * 0.09);

  float own = idAt(uOwner, uvD);
  float ctl = idAt(uCtrl, uvD);
  vec4 lo = lut(own);
  vec4 lc = lut(ctl);

  // The sovereignty raster is ~10 km per texel, so its tints fade out at city altitude.
  float near = 1.0 - smoothstep(0.012, 0.09, uAlt);
  float rasterFade = smoothstep(0.012, 0.035, uAlt);

  // Map modes tint land by a per-nation value (lut.r) while keeping the relief legible.
  if (uMode > 0.5 && own > 0.5 && rasterFade > 0.0) {
    vec3 tint = vec3(lo.r);
    if (lo.g > 0.9) tint = vec3(1.0, 0.71, 0.28) * (0.55 + lo.r * 0.45);
    else if (lo.g > 0.2 && lo.g < 0.45) tint = vec3(0.85, 0.22, 0.17) * (0.6 + lo.r * 0.4);
    land = mix(land, tint * mix(0.75, shade, 0.45), 0.72 * rasterFade);
  }
  vec3 col = mix(land, sea, water);

  if (own > 0.5 && water < 0.5) {
    if (abs(own - uSel) < 0.5) col += vec3(0.11, 0.1, 0.08) * rasterFade;
    else if (abs(own - uHover) < 0.5) col += vec3(0.05) * rasterFade;
  }

  // Occupation: hatching in the occupier's tone.
  if (ctl > 0.5 && abs(ctl - own) > 0.5 && water < 0.6) {
    float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 7.0));
    vec3 occ = lc.g > 0.9 ? vec3(1.0, 0.71, 0.28) : (lc.g > 0.2 && lc.g < 0.45 ? vec3(0.9, 0.25, 0.2) : vec3(0.75, 0.2, 0.16));
    col = mix(col, occ * 0.85, stripe * 0.42 * rasterFade);
  }

  // Front lines: edges of occupied zones, traced on the control raster.
  float px = max(fwidth(uvD.x), 1.0 / ${MAP_W}.0) * 1.2;
  float py = max(fwidth(uvD.y), 1.0 / ${MAP_H}.0) * 1.2;
  float front = 0.0;
  // A front needs a controlled centre and an occupied texel (control != owner) at the centre or a tap.
  // uFrontMask flags ${FM}-texel cells with an occupied texel in them or their 8 neighbours, so when
  // every tap is under ${FM_REACH} texels away a clear cell proves the loop below would find nothing.
  bool maskCovers = px * ${MAP_W}.0 < ${FM_REACH}.0 && py * ${MAP_H}.0 < ${FM_REACH}.0;
  if (ctl > 0.5 && (!maskCovers || textureLod(uFrontMask, uvD, 0.0).r > 0.0)) {
    for (int k = 0; k < 4; k++) {
      vec2 o = k == 0 ? vec2(px, 0.0) : k == 1 ? vec2(-px, 0.0) : k == 2 ? vec2(0.0, py) : vec2(0.0, -py);
      float c2 = idAtL(uCtrl, uvD + o), o2 = idAtL(uOwner, uvD + o);
      if (c2 > 0.5 && ctl > 0.5 && abs(c2 - ctl) > 0.5 && (abs(c2 - o2) > 0.5 || abs(ctl - own) > 0.5)) front = 1.0;
    }
  }
  col = mix(col, vec3(1.0, 0.27, 0.2), front * 0.95 * rasterFade);

  // Graticule; finer as the camera descends.
  float gstep = uAlt > 0.9 ? 15.0 : (uAlt > 0.12 ? 5.0 : 1.0);
  vec2 g = vec2(lon, lat) / (gstep * PI / 180.0);
  vec2 gd = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), 1e-6);
  float grid = 1.0 - min(min(gd.x, gd.y), 1.0);
  col += grid * (0.035 + 0.03 * water);

  // City level: darken the ground and draw contour lines, like a survey plate.
  // The 25 km water mask is too coarse up close (OSM water takes over), so blend it softly.
  float softWater = waterRaw;
  vec3 survey = vec3(mix(0.085, 0.045, softWater)) * mix(1.0, shade, 0.35);
  col = mix(col, survey, near);
  float cf = h * 85.0;
  float cd = abs(fract(cf - 0.5) - 0.5) / max(fwidth(cf), 1e-5);
  float contour = (1.0 - min(cd, 1.0)) * (1.0 - water);
  col += contour * 0.16 * (1.0 - smoothstep(0.02, 0.12, uAlt));

  // Day and night.
  float sunD = dot(n, uSun);
  float day = smoothstep(-0.12, 0.2, sunD);
  col *= mix(mix(1.0, 0.36, uNightOn), 1.0, day);
  vec3 lights = texture2D(uNight, uv).rgb;
  float li = pow(dot(lights, vec3(0.333)), 1.7);
  col += vec3(1.0, 0.62, 0.26) * li * (0.22 + 1.15 * (1.0 - day) * uNightOn) * (1.0 - near);

  vec3 V = normalize(uCam - P);
  float spec = pow(max(dot(reflect(-uSun, n), V), 0.0), 70.0) * water * day;
  col += vec3(spec * 0.22);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col += vec3(0.62, 0.68, 0.75) * rim * 0.22 * (1.0 - near);

  gl_FragColor = vec4(col, 1.0);
}`;

const atmoVert = /* glsl */ `
varying vec3 vN; varying vec3 vP;
void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const atmoFrag = /* glsl */ `
varying vec3 vN; varying vec3 vP; uniform float uFade;
void main() {
  float i = pow(clamp(0.66 - dot(normalize(vN), normalize(-vP)), 0.0, 1.0), 4.0);
  gl_FragColor = vec4(vec3(0.7, 0.77, 0.85) * i * 1.1 * uFade, 1.0);
}`;

function loadTex(loader, url, srgb = true) {
  const t = loader.load(url);
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.NoColorSpace;
  return t;
}

function dataTex(data) {
  const t = new THREE.DataTexture(data, MAP_W, MAP_H, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export class Globe {
  constructor(scene, world, renderer) {
    this.world = world;
    this.renderer = renderer;
    const loader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const tex = (u) => { const t = loadTex(loader, u); t.anisotropy = maxAniso; return t; };
    this.lutData = new Uint8Array(256 * 4);
    this.lut = new THREE.DataTexture(this.lutData, 256, 1, THREE.RGBAFormat);
    this.lut.minFilter = this.lut.magFilter = THREE.NearestFilter;
    this.lut.needsUpdate = true;
    this.ownerTex = dataTex(world.owner);
    this.ctrlTex = dataTex(world.control);
    // What the GPU holds of the control raster, so a refresh uploads only the rows that changed.
    this.ctrlShadow = new Uint8Array(world.control.length);
    this.ctrlDirty = false;
    this.maskRaw = new Uint8Array(FM_W * FM_H);
    this.maskData = new Uint8Array(FM_W * FM_H);
    this.maskTex = new THREE.DataTexture(this.maskData, FM_W, FM_H, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.minFilter = this.maskTex.magFilter = THREE.NearestFilter;
    this.maskTex.wrapS = THREE.RepeatWrapping;
    this.maskTex.generateMipmaps = false;
    this.maskTex.unpackAlignment = 1;

    this.uniforms = {
      uColor: { value: tex('/textures/earth-blue-marble.jpg') },
      uTopo: { value: tex('/textures/earth-topology.png') },
      uWater: { value: tex('/textures/earth-water.png') },
      uNight: { value: tex('/textures/earth-night.jpg') },
      uOwner: { value: this.ownerTex },
      uCtrl: { value: this.ctrlTex },
      uLUT: { value: this.lut },
      uFrontMask: { value: this.maskTex },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uCam: { value: new THREE.Vector3() },
      uAlt: { value: 2 },
      uSel: { value: -1 },
      uHover: { value: -1 },
      uPlayer: { value: -1 },
      uMode: { value: 0 },
      uNightOn: { value: 1 },
      uTime: { value: 0 },
      uProjView: { value: new THREE.Matrix4() },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, extensions: { derivatives: true } });
    this.mesh = new THREE.Mesh(sphereGeometry(640, 320), mat);
    // Raster uploads are settled here, just before the globe draws, so the front-line mask always
    // matches exactly what the GPU holds of the owner and control rasters.
    this.mesh.onBeforeRender = () => this.syncRasters();
    scene.add(this.mesh);

    this.atmoUniforms = { uFade: { value: 1 } };
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 128, 64),
      new THREE.ShaderMaterial({ uniforms: this.atmoUniforms, vertexShader: atmoVert, fragmentShader: atmoFrag, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    scene.add(this.atmo);

    const sky = loadTex(loader, '/textures/night-sky.png');
    this.stars = new THREE.Mesh(new THREE.SphereGeometry(5, 48, 24), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, color: 0x4a4d52, depthWrite: false, depthTest: false }));
    this.stars.renderOrder = -10;
    scene.add(this.stars);

    this.lines = new THREE.Group();
    this.borderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false });
    this.coastMat = new THREE.LineBasicMaterial({ color: 0xd8dde2, transparent: true, opacity: 0.3, depthWrite: false });
    this.lines.add(new THREE.LineSegments(meshToGeometry(world.borders), this.borderMat));
    this.lines.add(new THREE.LineSegments(meshToGeometry(world.coast), this.coastMat));
    scene.add(this.lines);

    this.selLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.95, depthWrite: false }));
    this.lines.add(this.selLine);
  }

  setSelectionOutline(meshGeo) {
    this.selLine.geometry.dispose();
    this.selLine.geometry = meshGeo ? meshToGeometry(meshGeo) : new THREE.BufferGeometry();
  }

  update(camera, alt, sunDir) {
    this.uniforms.uCam.value.copy(camera.position);
    camera.updateMatrixWorld();
    this.uniforms.uProjView.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.uniforms.uAlt.value = alt;
    this.uniforms.uSun.value.copy(sunDir);
    this.stars.position.copy(camera.position);
    this.atmoUniforms.uFade.value = THREE.MathUtils.smoothstep(alt, 0.04, 0.35);
    // Lift line work just above the surface; less at low altitude so it doesn't float.
    this.lines.scale.setScalar(1 + THREE.MathUtils.clamp(alt * 0.0012, 0.000015, 0.0012));
    this.borderMat.opacity = THREE.MathUtils.lerp(0.55, 0.32, THREE.MathUtils.smoothstep(alt, 0.05, 2.5));
  }

  refreshControl() { this.ctrlDirty = true; }
  refreshOwner() { this.ownerTex.needsUpdate = true; }
  refreshLUT() { this.lut.needsUpdate = true; }

  // True when a texture's next use will (re)upload it whole.
  pendingUpload(tex) { return this.renderer.properties.get(tex).__version !== tex.version; }

  syncRasters() {
    const { control } = this.world;
    const ctrlFull = this.pendingUpload(this.ctrlTex), ownerFull = this.pendingUpload(this.ownerTex);
    let rows = null;
    if (ctrlFull) {
      this.ctrlShadow.set(control);
      this.ctrlDirty = false;
    } else if (this.ctrlDirty) {
      this.ctrlDirty = false;
      rows = changedRows(control, this.ctrlShadow);
      for (let i = 0; i < rows.length; i += 2) {
        const r0 = rows[i], r1 = rows[i + 1];
        this.ctrlShadow.set(control.subarray(r0 * MAP_W, r1 * MAP_W), r0 * MAP_W);
        _box.min.set(0, r0); _box.max.set(MAP_W, r1); _at.set(0, r0);
        this.renderer.copyTextureToTexture(this.ctrlTex, this.ctrlTex, _box, _at);
      }
    }
    if (ctrlFull || ownerFull) this.rebuildMask(0, FM_H);
    else if (rows) for (let i = 0; i < rows.length; i += 2) this.rebuildMask(Math.floor(rows[i] / FM), Math.ceil(rows[i + 1] / FM));
  }

  // Recomputes the raw flags of block rows [b0, b1), then the dilated mask, and queues its upload.
  rebuildMask(b0, b1) {
    const { owner, control } = this.world, raw = this.maskRaw, out = this.maskData;
    const aligned = owner.byteOffset % 4 === 0 && control.byteOffset % 4 === 0;
    const o32 = aligned ? new Uint32Array(owner.buffer, owner.byteOffset, owner.length >> 2) : null;
    const c32 = aligned ? new Uint32Array(control.buffer, control.byteOffset, control.length >> 2) : null;
    const rowWords = MAP_W >> 2;
    raw.fill(0, b0 * FM_W, b1 * FM_W);
    for (let y = b0 * FM, ye = b1 * FM; y < ye; y++) {
      const rb = (y / FM | 0) * FM_W;
      if (aligned) {
        for (let w = y * rowWords, we = w + rowWords, x = 0; w < we; w++, x += 4) if (o32[w] !== c32[w]) raw[rb + (x / FM | 0)] = 1;
      } else {
        for (let i = y * MAP_W, x = 0; x < MAP_W; i++, x++) if (owner[i] !== control[i]) raw[rb + (x / FM | 0)] = 1;
      }
    }
    // Dilate: x wraps like the RepeatWrapping rasters, y clamps like their edge clamp.
    for (let by = Math.max(0, b0 - 1), be = Math.min(FM_H, b1 + 1); by < be; by++) {
      const ya = Math.max(0, by - 1), yb = Math.min(FM_H - 1, by + 1);
      for (let bx = 0; bx < FM_W; bx++) {
        let v = 0;
        for (let yy = ya; yy <= yb && !v; yy++) {
          const r = yy * FM_W;
          v = raw[r + (bx + FM_W - 1) % FM_W] | raw[r + bx] | raw[r + (bx + 1) % FM_W];
        }
        out[by * FM_W + bx] = v ? 255 : 0;
      }
    }
    this.maskTex.needsUpdate = true;
  }
}

const _box = new THREE.Box2(), _at = new THREE.Vector2();

// Row ranges [r0, r1) where a and b differ, as a flat list; ranges closer than 8 rows are merged.
function changedRows(a, b) {
  const out = [];
  const aligned = a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0;
  const a32 = aligned ? new Uint32Array(a.buffer, a.byteOffset, a.length >> 2) : null;
  const b32 = aligned ? new Uint32Array(b.buffer, b.byteOffset, b.length >> 2) : null;
  const rowWords = MAP_W >> 2;
  for (let y = 0; y < MAP_H; y++) {
    let diff = false;
    if (aligned) {
      for (let w = y * rowWords, we = w + rowWords; w < we; w++) if (a32[w] !== b32[w]) { diff = true; break; }
    } else {
      for (let i = y * MAP_W, ie = i + MAP_W; i < ie; i++) if (a[i] !== b[i]) { diff = true; break; }
    }
    if (!diff) continue;
    if (out.length && y - out[out.length - 1] < 8) out[out.length - 1] = y + 1;
    else out.push(y, y + 1);
  }
  return out;
}

// THREE.SphereGeometry(1, w, h) reduced to what the globe shader reads: the same positions (same
// trig on the same arguments, evaluated once per row and column) and the same index order, without
// the normal and uv attributes.
function sphereGeometry(widthSegments, heightSegments) {
  const phiLength = Math.PI * 2, thetaLength = Math.PI;
  const cosPhi = new Float64Array(widthSegments + 1), sinPhi = new Float64Array(widthSegments + 1);
  for (let ix = 0; ix <= widthSegments; ix++) {
    const phi = 0 + (ix / widthSegments) * phiLength;
    cosPhi[ix] = Math.cos(phi); sinPhi[ix] = Math.sin(phi);
  }
  const row = widthSegments + 1;
  const pos = new Float32Array(row * (heightSegments + 1) * 3);
  for (let iy = 0, p = 0; iy <= heightSegments; iy++) {
    const theta = 0 + (iy / heightSegments) * thetaLength;
    const ct = Math.cos(theta), st = Math.sin(theta);
    for (let ix = 0; ix <= widthSegments; ix++) {
      pos[p++] = -1 * cosPhi[ix] * st;
      pos[p++] = 1 * ct;
      pos[p++] = 1 * sinPhi[ix] * st;
    }
  }
  const idx = new Uint32Array(widthSegments * (heightSegments - 1) * 6);
  for (let iy = 0, q = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = iy * row + ix + 1, b = iy * row + ix, c = (iy + 1) * row + ix, d = (iy + 1) * row + ix + 1;
      if (iy !== 0) { idx[q++] = a; idx[q++] = b; idx[q++] = d; }
      if (iy !== heightSegments - 1) { idx[q++] = b; idx[q++] = c; idx[q++] = d; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

function meshToGeometry(ml) {
  // Two passes: count the subdivided segments, then write them straight into a Float32Array.
  let n = 0;
  for (const line of ml.coordinates) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [a0, a1] = line[i], [b0, b1] = line[i + 1];
      if (Math.abs(b0 - a0) > 180) continue;
      n += Math.max(1, Math.ceil(Math.max(Math.abs(b0 - a0), Math.abs(b1 - a1)) / 1.5));
    }
  }
  const pos = new Float32Array(n * 6);
  const v = new THREE.Vector3();
  let p = 0;
  for (const line of ml.coordinates) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [a0, a1] = line[i], [b0, b1] = line[i + 1];
      if (Math.abs(b0 - a0) > 180) continue;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b0 - a0), Math.abs(b1 - a1)) / 1.5));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        ll2v(a1 + (b1 - a1) * t0, a0 + (b0 - a0) * t0, 1, v); pos[p++] = v.x; pos[p++] = v.y; pos[p++] = v.z;
        ll2v(a1 + (b1 - a1) * t1, a0 + (b0 - a0) * t1, 1, v); pos[p++] = v.x; pos[p++] = v.y; pos[p++] = v.z;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

export function sunDirection(date, out = new THREE.Vector3()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date - start) / 86400000;
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (doy - 81));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const lon = -15 * (hours - 12);
  return ll2v(decl, lon, 1, out);
}
