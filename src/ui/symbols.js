// Unit symbols in the spirit of NATO APP-6 frames, drawn on a 24×16 box.
const FRAME = '<rect x="1.5" y="1.5" width="21" height="13"/>';
const X = '<path d="M1.5 1.5 22.5 14.5M22.5 1.5 1.5 14.5"/>';
const TRACK = '<rect x="5.5" y="4.5" width="13" height="7" rx="3.5"/>';

export const SYMBOLS = {
  inf: FRAME + X,
  armor: FRAME + TRACK,
  mech: FRAME + X + TRACK,
  airborne: FRAME + X + '<path d="M8 13c1.3-2 2.7-2 4 0 1.3-2 2.7-2 4 0"/>',
  marine: FRAME + X + '<path d="M12 4v6M9.5 8.5c.5 2 4.5 2 5 0"/>',
  air: FRAME + '<path d="M5 8c2-3.5 5-3.5 7 0 2 3.5 5 3.5 7 0-2-3.5-5-3.5-7 0-2 3.5-5 3.5-7 0Z"/>',
  fleet: '<path d="M2 7h20l-3 6H5Z"/><path d="M9 7V4h5v3M12 4V2"/>',
  carrier: '<path d="M1.5 7.5h21l-2.5 5H4Z"/><path d="M15 7.5V5h3v2.5"/>',
  sub: '<path d="M3 10c0-2 3-3 9-3s9 1 9 3-3 3-9 3-9-1-9-3Z"/><path d="M10 7V4.5h3V7"/>',
};

// Land formations are round counters, as on a campaign map: the size mark (XX for a division)
// on the dark upper half, the unit number on the lower half in the side's colour, and an outer
// ring drawn as far round as the formation's strength. Armour is a dark counter with a coloured
// number; mechanised carries a track bar over the size mark; airborne has a broken ring and
// marines a wave under the number. `routed` strikes the counter through.
export function counter({ type, ech, num, str, routed }) {
  const pct = Math.max(0, Math.min(100, Math.round(str * 100)));
  const lower = type === 'armor' ? '' : '<path class="fill" d="M3.5 16a12.5 12.5 0 0 0 25 0Z"/>';
  return `<svg class="ctr t-${type}" viewBox="0 0 32 32" aria-hidden="true">`
    + '<circle class="halo" cx="16" cy="16" r="15.3"/>'
    + '<circle class="bg" cx="16" cy="16" r="12.5"/>'
    + lower
    + `<circle class="trk${type === 'airborne' ? ' dash' : ''}" cx="16" cy="16" r="13.6"/>`
    + `<circle class="str" cx="16" cy="16" r="13.6" pathLength="100" stroke-dasharray="${pct} 100" transform="rotate(-90 16 16)"/>`
    + (type === 'mech' ? '<rect class="mk" x="10.5" y="5" width="11" height="3.2" rx="1.6"/>' : '')
    + (type === 'marine' ? '<path class="mk-l" d="M10 27c2-1.4 4-1.4 6 0s4 1.4 6 0"/>' : '')
    + `<text class="e" x="16" y="${type === 'mech' ? 14.2 : 13.2}">${ech}</text>`
    + `<text class="k" x="16" y="25.2">${num}</text>`
    + (routed ? '<path class="x" d="M7.5 7.5 24.5 24.5"/>' : '')
    + '</svg>';
}

const SVG_CACHE = new Map();
export const svg = (type) => {
  let out = SVG_CACHE.get(type);
  if (out === undefined) SVG_CACHE.set(type, (out = `<svg viewBox="0 0 24 16" aria-hidden="true">${SYMBOLS[type] ?? FRAME}</svg>`));
  return out;
};
