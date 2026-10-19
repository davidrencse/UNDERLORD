import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const EARTH_KM = 6371;

// Globe convention: y is north, lon 0 faces +z, lon 90E faces +x.
export function ll2v(lat, lon, r = 1, out = new THREE.Vector3()) {
  const la = lat * DEG, lo = lon * DEG, c = Math.cos(la);
  return out.set(c * Math.sin(lo) * r, Math.sin(la) * r, c * Math.cos(lo) * r);
}

export function v2ll(v) {
  const r = v.length();
  return { lat: Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) / DEG, lon: Math.atan2(v.x, v.z) / DEG };
}

export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function haversine(a, b) {
  const dLat = (b.lat - a.lat) * DEG, dLon = (b.lon - a.lon) * DEG;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a, b) {
  const φ1 = a.lat * DEG, φ2 = b.lat * DEG, Δ = (b.lon - a.lon) * DEG;
  const y = Math.sin(Δ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δ);
  return Math.atan2(y, x) / DEG;
}

export function destination(p, bearingDeg, km) {
  const δ = km / EARTH_KM, θ = bearingDeg * DEG, φ1 = p.lat * DEG, λ1 = p.lon * DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / DEG, lon: wrapLon(λ2 / DEG) };
}

// Point a fraction t of the way along the great circle from a to b.
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
export function interpolate(a, b, t) {
  ll2v(a.lat, a.lon, 1, _a); ll2v(b.lat, b.lon, 1, _b);
  const d = Math.acos(THREE.MathUtils.clamp(_a.dot(_b), -1, 1));
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const s = Math.sin(d), ka = Math.sin((1 - t) * d) / s, kb = Math.sin(t * d) / s;
  _a.multiplyScalar(ka).addScaledVector(_b, kb);
  return v2ll(_a);
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function formatCoord(lat, lon) {
  const part = (v, pos, neg) => {
    const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
    return `${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}′ ${s.toFixed(1).padStart(4, '0')}″ ${v >= 0 ? pos : neg}`;
  };
  return `${part(lat, 'N', 'S')} / ${part(lon, 'E', 'W')}`;
}
