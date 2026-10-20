// Bakes Kenney's CC0 "Animated Characters Survivors" model into a compact walk cycle for the
// instanced city pedestrians: node scripts/bake-civilian.mjs
//
// The pack only ships a run clip, so the walk is derived from it: each bone keeps the run's
// timing but swings around a calmer base pose (knees, elbows and spine pulled toward the
// straight rest pose) with the swing amplitude damped. Every frame is skinned on the CPU,
// welded into one indexed mesh, rescaled to 1.75 m and rotated into the game's local tile
// frame (x forward, y left, z up). The result is a small JS module so the game and the Node
// tests can build the meshes synchronously.
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const SRC = 'assets/kenney-civilians';
const OUT = 'src/data/civilianModel.js';
const FRAMES = 12;
const HEIGHT_M = 1.75;
const SWING = 0.55; // fraction of the run's per-bone deviation from its mean pose kept
// How far each bone's mean pose is pulled back to rest (rest is straight-limbed and upright).
const TO_REST = { LeftLeg: 0.75, RightLeg: 0.75, LeftForeArm: 0.6, RightForeArm: 0.6,
  Spine: 0.7, Chest: 0.7, UpperChest: 0.7, Neck: 0.5, Head: 0.5, Hips: 0.5 };
// Kenney's characters are stylised with a head a quarter of their height; scaling bones brings
// them to roughly adult proportions (about seven heads tall) at city distances.
const BONE_SCALE = { Head: 0.6, LeftUpLeg: 1.12, RightUpLeg: 1.12 };

const read = (p) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const loader = new FBXLoader();
const model = loader.parse(read(`${SRC}/characterMedium.fbx`), '');
const clip = loader.parse(read(`${SRC}/run.fbx`), '').animations.find((a) => /Run/.test(a.name));
let mesh;
model.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
const bones = mesh.skeleton.bones;
const rest = bones.map((b) => b.quaternion.clone());

// Sample the run clip and work out each bone's mean local rotation over the cycle.
const mixer = new THREE.AnimationMixer(model);
mixer.clipAction(clip).play();
const samples = [];
for (let f = 0; f < FRAMES; f++) {
  mixer.setTime((f / FRAMES) * clip.duration);
  samples.push({ q: bones.map((b) => b.quaternion.clone()), p: bones.map((b) => b.position.clone()) });
}
const mean = bones.map((_, i) => {
  const m = new THREE.Vector4();
  const ref = samples[0].q[i];
  for (const s of samples) {
    const q = s.q[i], sign = q.dot(ref) < 0 ? -1 : 1;
    m.x += q.x * sign; m.y += q.y * sign; m.z += q.z * sign; m.w += q.w * sign;
  }
  return new THREE.Quaternion(m.x, m.y, m.z, m.w).normalize();
});

// Weld the triangle soup: Kenney's FBX is unindexed, but neighbouring corners share positions.
const pos = mesh.geometry.attributes.position;
const key = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
const unique = new Map(), source = [], index = [];
for (let i = 0; i < pos.count; i++) {
  const k = key(i);
  let v = unique.get(k);
  if (v === undefined) { v = source.length; unique.set(k, v); source.push(i); }
  index.push(v);
}

mixer.stopAllAction();
for (const b of bones) if (BONE_SCALE[b.name]) b.scale.setScalar(BONE_SCALE[b.name]);
const v = new THREE.Vector3();
const frames = [];
let maxAbs = 0;
for (let f = 0; f < FRAMES; f++) {
  bones.forEach((b, i) => {
    const base = mean[i].clone().slerp(rest[i], TO_REST[b.name] ?? 0);
    const swing = mean[i].clone().invert().multiply(samples[f].q[i]);
    b.quaternion.copy(base).multiply(new THREE.Quaternion().slerp(swing, SWING));
    b.position.copy(samples[f].p[i]);
  });
  model.updateMatrixWorld(true);
  const out = new Float32Array(source.length * 3);
  let minUp = Infinity;
  source.forEach((s, j) => {
    v.fromBufferAttribute(pos, s);
    mesh.applyBoneTransform(s, v);
    v.applyMatrix4(mesh.matrixWorld);
    // FBX: y up, character faces +z, its left is +x  ->  game: x forward, y left, z up.
    out[j * 3] = v.z; out[j * 3 + 1] = v.x; out[j * 3 + 2] = v.y;
    minUp = Math.min(minUp, out[j * 3 + 2]);
  });
  // Root motion differs once the legs straighten, so plant the lowest foot on the pavement.
  for (let j = 0; j < source.length; j++) out[j * 3 + 2] -= minUp;
  frames.push(out);
}
// Normalise the average standing height across the cycle to HEIGHT_M.
let top = 0;
for (const fr of frames) { let m = 0; for (let j = 2; j < fr.length; j += 3) m = Math.max(m, fr[j]); top += m / FRAMES; }
for (const fr of frames) for (let j = 0; j < fr.length; j++) { fr[j] *= HEIGHT_M / top; maxAbs = Math.max(maxAbs, Math.abs(fr[j])); }

// Quantise to int16 against one shared range and ship as base64.
const q = maxAbs / 32767;
const packed = new Int16Array(FRAMES * source.length * 3);
frames.forEach((fr, f) => fr.forEach((x, j) => { packed[f * source.length * 3 + j] = Math.round(x / q); }));
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const idx = source.length < 65536 ? new Uint16Array(index) : new Uint32Array(index);
fs.writeFileSync(OUT, `// Generated by scripts/bake-civilian.mjs from Kenney's CC0 "Animated Characters Survivors"
// (www.kenney.nl). Walk cycle frames in metres, local frame x forward, y left, z up.
export const CIVILIAN_MODEL = {
  frames: ${FRAMES},
  vertices: ${source.length},
  quantum: ${q},
  positions: '${b64(packed)}',
  index: '${b64(idx)}',
};
`);
console.log(`${source.length} vertices, ${index.length / 3} triangles, ${FRAMES} frames, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
