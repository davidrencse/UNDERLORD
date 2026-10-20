import { IDEOLOGIES, BLOCS } from '../data/nations.js';
import { SPIRITS, POWER_CENTRE_TYPES } from '../data/politics.js';
import { signed, esc, flagHTML } from './format.js';
import { IMMIGRATION_TREES, DOCTRINES } from '../data/immigration.js';
import { DEMOGRAPHIC_DOCTRINES, DEMOGRAPHIC_PROPOSALS } from '../data/demographicDoctrine.js';
import { immigrationProjection } from '../game/immigration.js';

const LANES = {
  USA: ['National populism', 'Tech right', 'Institutions'],
  DEU: ['Coalition', 'Nationalism', 'Breakdown', 'Europe & security'],
  FRA: ['Central bloc', 'National bloc', 'Republic in crisis', 'Strategic force'],
  RUS: ['Total war', 'Negotiated peace', 'Succession', 'Multipolar order'],
  CHN: ['Security state', 'Economic reform', 'Succession', 'Asian balance'],
  GBR: ['Labour', 'Reform', 'The union', 'Global role'],
  JPN: ['The Diet', 'Economic renewal', 'Article 9'],
  IND: ['Hindutva', 'Development', 'Coalition'],
  TUR: ['Peace process', 'Opposition', 'Succession'],
  generic: ['Economy', 'Government', 'Defence'],
};
const laneFor = (x, count, iso) => count === 3 ? (x < 3 ? 0 : x < (iso === 'generic' ? 5 : 6) ? 1 : 2) : (x < 3 ? 0 : x < 6 ? 1 : x < 10 ? 2 : 3);

function effects(fx = {}) {
  const out = [];
  if (fx.pp) out.push(`${signed(fx.pp, 0)} political power`);
  if (fx.stab) out.push(`${signed(fx.stab, 0)} stability`);
  if (fx.ws) out.push(`${signed(fx.ws, 0)} war support`);
  if (fx.growth) out.push(`${signed(fx.growth)} pts GDP growth`);
  if (fx.infl) out.push(`${signed(fx.infl)} pts inflation`);
  if (fx.debt) out.push(`${signed(fx.debt, 0)} pts debt`);
  if (fx.defPct) out.push(`${signed(fx.defPct)}% of GDP to defence`);
  if (fx.divisions) out.push(`${fx.divisions} new division${fx.divisions > 1 ? 's' : ''}`);
  if (fx.airWings) out.push(`${fx.airWings} new air wing${fx.airWings > 1 ? 's' : ''}`);
  if (fx.fleets) out.push(`${fx.fleets} new squadron${fx.fleets > 1 ? 's' : ''}`);
  if (fx.spirit) out.push(`Gain “${SPIRITS[fx.spirit]?.name ?? fx.spirit}”`);
  if (fx.remove) out.push(`Remove “${SPIRITS[fx.remove]?.name ?? fx.remove}”`);
  if (fx.leader) out.push(`${fx.leader[0]} becomes ${fx.leader[1]}`);
  if (fx.ruling) out.push(`Government: ${fx.ruling.join(' + ')}`);
  if (fx.ideo) out.push(`Government becomes ${IDEOLOGIES[fx.ideo]?.name.toLowerCase() ?? fx.ideo}`);
  if (fx.gov) out.push(`System: ${fx.gov}`);
  if (fx.blocLeave) out.push(`Leave the ${BLOCS[fx.blocLeave] ?? fx.blocLeave}`);
  if (fx.demographic?.unlockStats) out.push('Unlock modeled marriage and relationship statistics');
  if (fx.demographic?.researchSpeed) out.push('+5% demographic-policy research speed');
  if (fx.demographic?.legislation) out.push('Unlock demographic legislation');
  if (fx.demographic?.doctrine) out.push(`Adopt ${DEMOGRAPHIC_DOCTRINES[fx.demographic.doctrine]}`);
  if (fx.demographic?.proposal) out.push(`Unlock decision: Introduce ${DEMOGRAPHIC_PROPOSALS[fx.demographic.proposal].name}`);
  for (const [k, v] of Object.entries(fx.loyalty ?? {})) out.push(`${signed(v, 0)} loyalty: ${(POWER_CENTRE_TYPES[k] ?? k).toLowerCase()}`);
  for (const [k, v] of Object.entries(fx.party ?? {})) out.push(`${signed(v, 0)} pts ${k}`);
  return out;
}

export class FocusScreen {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.category = 'national';
    this.el = document.createElement('div');
    this.el.className = 'screen focus-screen';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'National focus tree');
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) { this.close(); return; }
      const category = e.target.closest('[data-focus-category]');
      if (category) { this.category = category.dataset.focusCategory; this.detail = null; this.lane = null; this._html = null; this.render(); return; }
      if (e.target.closest('[data-demographics]')) { this.ctx.openDemographics(this.ctx.game.player); return; }
      const lane = e.target.closest('[data-lane]');
      if (lane) { this._jumpLane(+lane.dataset.lane); return; }
      if (e.target.closest('[data-current-focus]')) {
        const current = this.ctx.game.nations[this.ctx.game.player].focus.current;
        if (current) { this.category = current.id.startsWith('UDL_DEM_') ? 'demographic' : current.id.includes('_IMM_') ? 'immigration' : 'national'; this.detail = current.id; this.render(); this._scrollToFocus(current.id); }
        return;
      }
      const node = e.target.closest('[data-focus]');
      if (node) { this.detail = node.dataset.focus; this._detail(); return; }
      if (!e.target.closest('[data-start-focus]')) return;
      const { game } = this.ctx;
      const n = game.nations[game.player];
      const f = game.tree(n).focuses.find((x) => x.id === this.detail);
      if (f && game.startFocus(n, f.id)) {
        game.log(`${n.name} begins “${f.name}”.`, { nation: n.index, kind: 'focus' });
        this.render();
      }
    });
  }

  close() { this.el.hidden = true; }
  open(category, selected) {
    const { game } = this.ctx;
    const n = game.nations[game.player];
    if (category) this.category = category;
    if (this.category === 'immigration' && !IMMIGRATION_TREES[n.iso3]) this.category = 'national';
    if (this.iso !== n.iso3) {
      this.iso = n.iso3;
      this.detail = game.tree(n, this.category).focuses.find((f) => game.focusState(n, f) === 'available')?.id;
      this.lane = null;
    }
    if (selected) this.detail = selected;
    this.el.hidden = false;
    this._html = null;
    this.render();
    if (this.detail) this._scrollToFocus(this.detail);
  }

  render() {
    if (this.el.hidden) return;
    const { game } = this.ctx;
    const n = game.nations[game.player];
    const tree = game.tree(n, this.category);
    const lanes = tree.lanes ?? LANES[n.iso3] ?? LANES.generic;
    const focusLane = (f) => tree.lanes ? f.lane : laneFor(f.x, lanes.length, n.iso3 in LANES ? n.iso3 : 'generic');
    const X = 190, Y = 116, W = 164, H = 78;
    const maxX = Math.max(...tree.focuses.map((f) => f.x));
    const maxY = Math.max(...tree.focuses.map((f) => f.y));
    const width = maxX * X + W + 60, height = maxY * Y + H + 80;
    const byId = new Map(tree.focuses.map((f) => [f.id, f]));
    const links = [];
    for (const f of tree.focuses) for (const r of [...(f.req ?? []), ...(f.requiresAny ?? [])]) {
      const p = byId.get(r);
      if (!p) continue;
      const x1 = p.x * X + 16 + W / 2, y1 = p.y * Y + 30 + H;
      const x2 = f.x * X + 16 + W / 2, y2 = f.y * Y + 30;
      links.push(`<path d="M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}" class="${n.focus.done.has(r) ? 'met' : ''} ${f.reqAll && !f.requiresAny?.includes(r) ? '' : 'either'}"/>`);
    }
    const cur = n.focus.current;
    const active = cur ? game.tree(n).focuses.find((f) => f.id === cur.id) : null;
    const html = `<div class="focus-shell">
      <header class="focus-shell-head">
        <div class="focus-identity">${flagHTML(n)}<div><span>${esc(n.name)} · National trajectory</span><h1>${esc(tree.title)}</h1></div></div>
        <div class="focus-summary"><div><strong class="num">${tree.focuses.filter((f) => n.focus.done.has(f.id)).length}<small> / ${tree.focuses.length}</small></strong><span>completed</span></div><div><strong class="num">${active ? `${Math.round(cur.progress / active.days * 100)}%` : '—'}</strong><span>${active ? esc(active.name) : 'No focus active'}</span></div></div>
        ${active ? '<button class="focus-current" data-current-focus>Current focus</button>' : ''}
        <button class="focus-close" data-x aria-label="Close focus tree">Close <span>Esc</span></button>
      </header>
      <nav class="imm-tabs" aria-label="Focus tree">
        <button data-focus-category="national" aria-pressed="${this.category === 'national'}">National trajectory</button>
        ${IMMIGRATION_TREES[n.iso3] ? `<button data-focus-category="immigration" aria-pressed="${this.category === 'immigration'}">Immigration and settlement</button>` : ''}
        <button data-focus-category="demographic" aria-pressed="${this.category === 'demographic'}">Demographic engineering</button>
        <button data-demographics>Population ledger</button>
        <span>${esc(this.category === 'demographic' ? DEMOGRAPHIC_DOCTRINES[n.demographicPolicy?.doctrine] ?? 'No demographic doctrine selected' : DOCTRINES[n.immigration?.doctrine] ?? 'No immigration doctrine selected')}</span>
      </nav>
      <nav class="focus-lanes" aria-label="Focus branches">${lanes.map((name, i) => {
        const items = tree.focuses.filter((f) => focusLane(f) === i);
        const done = items.filter((f) => n.focus.done.has(f.id)).length;
        return `<button data-lane="${i}" class="${this.lane === i ? 'is-active' : ''}"><b>${esc(name)}</b><small class="num">${done}/${items.length}</small></button>`;
      }).join('')}</nav>
      <div class="focus-workspace">
        <div class="focus-viewport" tabindex="0" aria-label="Scrollable focus tree"><div class="tree" style="width:${width}px;height:${height}px">
          <svg class="links" width="${width}" height="${height}" aria-hidden="true">${links.join('')}</svg>
          ${tree.focuses.map((f) => {
            const st = game.focusState(n, f);
            const selected = f.id === this.detail;
            const prog = cur?.id === f.id ? `<span class="prog" style="width:${Math.min(100, cur.progress / f.days * 100)}%"></span>` : '';
            return `<button class="focus-node ${st}${selected ? ' selected' : ''}" data-focus="${esc(f.id)}" style="left:${f.x * X + 16}px;top:${f.y * Y + 30}px" aria-pressed="${selected}"><b>${esc(f.name)}</b><small><span>${st === 'done' ? 'Complete' : st === 'active' ? 'In progress' : st === 'blocked' ? 'Excluded' : st === 'locked' ? 'Locked' : 'Available'}</span><span class="num">${f.days}d</span></small>${prog}</button>`;
          }).join('')}
        </div></div>
        <aside class="focus-inspector" aria-label="Selected focus details"><div class="focus-detail"></div></aside>
      </div>
    </div>`;
    if (html !== this._html) {
      const view = this.el.querySelector('.focus-viewport');
      const inspector = this.el.querySelector('.focus-inspector');
      const left = view?.scrollLeft ?? 0, top = view?.scrollTop ?? 0, detailTop = inspector?.scrollTop ?? 0;
      this._html = html;
      this._detailHtml = null;
      this.el.innerHTML = html;
      this.el.querySelector('.focus-viewport').scrollTo(left, top);
      this.el.querySelector('.focus-inspector').scrollTop = detailTop;
    }
    this._detail();
  }

  _detail() {
    const { game } = this.ctx;
    const n = game.nations[game.player];
    const tree = game.tree(n, this.category);
    const f = tree.focuses.find((x) => x.id === this.detail) ?? tree.focuses[0];
    this.detail = f.id;
    const box = this.el.querySelector('.focus-detail');
    if (!box) return;
    const st = game.focusState(n, f);
    const byId = new Map(tree.focuses.map((x) => [x.id, x]));
    const req = (f.req ?? []).map((id) => `<li class="${n.focus.done.has(id) ? 'met' : ''}">${n.focus.done.has(id) ? '✓' : '○'} ${esc(byId.get(id)?.name ?? id)}</li>`).join('');
    const rewards = effects(f.fx);
    const projection = immigrationProjection(n, f);
    if (projection) for (const effect of projection.effects) rewards.push(`${signed(effect.value * (effect.key === 'spending' ? 1 : 100), effect.key === 'spending' ? 2 : 0)}${effect.key === 'spending' ? '% of GDP / year' : ' pts'} ${effect.label.toLowerCase()}`);
    const canStart = st === 'available' && !n.focus.current;
    const action = canStart ? 'Begin focus' : st === 'active' ? 'In progress' : st === 'done' ? 'Completed' : st === 'blocked' ? 'Path excluded' : n.focus.current ? 'Finish current focus' : 'Requirements unmet';
    const html = `<div class="focus-detail-status ${st}">${st}</div><h2>${esc(f.name)}</h2><div class="focus-detail-time num">${f.days} days</div>
      <p>${esc(f.desc)}</p>
      ${req ? `<section><h3>Requires ${f.reqAll ? 'all' : 'one of'}</h3><ul class="focus-requirements">${req}</ul></section>` : ''}
      ${f.requiresAny ? `<section><h3>Also requires one of</h3><ul>${f.requiresAny.map((id) => `<li>${esc(byId.get(id)?.name ?? id)}</li>`).join('')}</ul></section>` : ''}
      ${f.mutex?.length ? `<section><h3>Exclusive with</h3><div class="focus-excludes">${f.mutex.map((id) => esc(byId.get(id)?.name ?? id)).join(' · ')}</div></section>` : ''}
      <section><h3>On completion</h3><ul class="focus-effects">${rewards.length ? rewards.map((reward) => `<li>${esc(reward)}</li>`).join('') : '<li>No direct effects</li>'}</ul></section>
      ${projection ? `<section class="imm-projection"><h3>Implementation</h3><p>${Math.round(projection.eligible).toLocaleString('en-US')} residents in the eligible population. Programs reach residents according to needs and status.</p><p>Annual funding change at the current allocation: <b>${signed(projection.cost, 2)}% of GDP</b>. Outcomes settle monthly and depend on capacity.</p></section>` : ''}
      ${f.fx?.demographic?.proposal ? '<section class="imm-projection"><h3>Legislation</h3><p>Completion unlocks a country decision. A policy takes effect only after introduction, legal review where required, funding and delivery. Private relationships never change on focus completion.</p></section>' : ''}
      <div class="focus-detail-action"><button data-start-focus ${canStart ? '' : 'disabled'}>${action}</button>${st === 'active' ? `<small class="num">${Math.max(0, f.days - n.focus.current.progress)} days remaining</small>` : ''}</div>`;
    if (html !== this._detailHtml) { this._detailHtml = html; box.innerHTML = html; }
    this.el.querySelectorAll('.focus-node.selected').forEach((node) => { node.classList.remove('selected'); node.setAttribute('aria-pressed', 'false'); });
    const selected = [...this.el.querySelectorAll('.focus-node')].find((node) => node.dataset.focus === f.id);
    selected?.classList.add('selected');
    selected?.setAttribute('aria-pressed', 'true');
  }

  _jumpLane(index) {
    this.lane = index;
    const tree = this.ctx.game.tree(this.ctx.game.nations[this.ctx.game.player], this.category);
    const lanes = tree.lanes ?? LANES[this.iso] ?? LANES.generic;
    const first = tree.focuses.find((f) => (tree.lanes ? f.lane : laneFor(f.x, lanes.length, this.iso in LANES ? this.iso : 'generic')) === index);
    if (first) this._scrollToFocus(first.id);
    this.el.querySelectorAll('[data-lane]').forEach((button) => button.classList.toggle('is-active', +button.dataset.lane === index));
  }

  _scrollToFocus(id) {
    const view = this.el.querySelector('.focus-viewport');
    const node = [...this.el.querySelectorAll('.focus-node')].find((item) => item.dataset.focus === id);
    if (view && node) view.scrollTo({ left: Math.max(0, node.offsetLeft - 32), top: Math.max(0, node.offsetTop - 32), behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}
