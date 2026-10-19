const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESC_RE = /[&<>"']/g;
const escChar = (c) => ESC[c];
export const esc = (s) => String(s ?? '').replace(ESC_RE, escChar);

export function money(bn) {
  if (bn == null || Number.isNaN(bn)) return '—';
  if (bn >= 1000) return `$${(bn / 1000).toFixed(bn >= 10000 ? 1 : 2)}T`;
  if (bn >= 1) return `$${bn.toFixed(bn >= 100 ? 0 : 1)}B`;
  return `$${Math.round(bn * 1000)}M`;
}
export const usd = (v) => (v == null ? null : money(v / 1e9));
export const pct = (v, d = 0) => (v == null ? '—' : `${v.toFixed(d)}%`);
export const signed = (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
export const int = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
export function compact(v) {
  if (v == null) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}bn`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}m`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(v));
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const day = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const hour = (t) => { const d = new Date(t); return `${String(d.getUTCHours()).padStart(2, '0')}:00`; };

export function flagHTML(n, cls = 'flag') {
  if (!n) return `<span class="${cls}"></span>`;
  return n.flag ? `<span class="${cls}"><img src="${n.flag}" alt="" loading="lazy"></span>` : `<span class="${cls}">${esc(n.iso3)}</span>`;
}

export function fxText(fx = {}) {
  const parts = [];
  const add = (v, label, d = 1, suffix = '') => { if (v) parts.push(`<span class="${v > 0 ? 'pos' : 'neg'}">${signed(v, d)}${suffix} ${label}</span>`); };
  add(fx.pp, 'political power/day', 2);
  add(fx.stab, 'stability', 0, '%');
  add(fx.ws, 'war support', 0, '%');
  add(fx.growth, 'GDP growth', 1, ' pts');
  if (fx.infl) parts.push(`<span class="${fx.infl < 0 ? 'pos' : 'neg'}">${signed(fx.infl, 0)} pts inflation</span>`);
  return parts.join(', ');
}
