import { SPEEDS } from '../game/game.js';
import { money, day, hour, flagHTML, esc, signed, compact } from './format.js';
import { formatCoord } from '../util/geo.js';

export const MAP_MODES = [
  { id: 0, label: 'Terrain' },
  { id: 1, label: 'Political' },
  { id: 2, label: 'Alliances' },
  { id: 3, label: 'Stability' },
  { id: 4, label: 'War support' },
  { id: 5, label: 'GDP per capita' },
];

export class Hud {
  constructor(root, ctx) {
    this.ctx = ctx;
    const { game } = ctx;
    root.insertAdjacentHTML('beforeend', `
      <header class="topbar" hidden>
        <button class="nation-chip" data-act="own"></button>
        <div class="res"></div>
        <div class="spacer"></div>
        <button class="tb-btn" data-act="focus">National trajectory <kbd class="num">T</kbd></button>
        <button class="tb-btn" data-act="dossier">Overview <kbd class="num">O</kbd></button>
        <div class="clock">
          <div class="date num"></div>
          <div class="speeds">
            <button class="pause" aria-label="Pause or resume">❚❚</button>
            ${[1, 2, 3, 4, 5].map((s) => `<button data-speed="${s}" aria-label="Speed ${s}"></button>`).join('')}
          </div>
        </div>
      </header>
      <div class="bottom" hidden>
        <div class="modes" role="group" aria-label="Map mode">${MAP_MODES.map((m) => `<button data-mode="${m.id}">${m.label}</button>`).join('')}</div>
        <div class="coords"><div class="c1 num"></div><div class="c2"></div></div>
        <div class="timeline"><canvas></canvas><div class="lbl">World tension <span>120 days</span></div><div class="read"></div></div>
      </div>
      <div class="news" hidden></div>
      <div class="wordmark" hidden>UNDERLORD</div>
      <div class="toast" style="opacity:0"></div>`);
    this.top = root.querySelector('.topbar');
    this.bottom = root.querySelector('.bottom');
    this.newsEl = root.querySelector('.news');
    this.wordmark = root.querySelector('.wordmark');
    this.toastEl = root.querySelector('.toast');
    this.canvas = root.querySelector('.timeline canvas');
    this.read = root.querySelector('.timeline .read');
    this.c1 = root.querySelector('.coords .c1');
    this.c2 = root.querySelector('.coords .c2');
    this.chipEl = this.top.querySelector('.nation-chip');
    this.resEl = this.top.querySelector('.res');
    this.dateEl = this.top.querySelector('.date');
    this.pauseEl = this.top.querySelector('.pause');
    this.speedEls = [...this.top.querySelectorAll('[data-speed]')];
    // Last HTML written to each region, so unchanged re-renders skip the DOM entirely.
    this._html = { chip: '', res: '', date: '', pause: '', read: '' };
    this._tlQueued = false;
    this._newsQ = [];
    this._tlW = 0;
    this._tlH = 0;
    this._monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
    // Track the timeline's size without reading layout on every redraw.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver((entries) => {
        const r = entries[entries.length - 1].contentRect;
        const w = Math.round(r.width), h = Math.round(r.height);
        if (w !== this._tlW || h !== this._tlH) { this._tlW = w; this._tlH = h; this.drawTimeline(); }
      }).observe(this.canvas);
    }

    this.pauseEl.addEventListener('click', () => this.togglePause());
    this.top.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { game.speed = +b.dataset.speed; game.paused = false; this.renderClock(); }));
    this.top.querySelector('[data-act="own"]').addEventListener('click', () => ctx.selectNation(game.player, true));
    this.top.querySelector('[data-act="focus"]').addEventListener('click', () => ctx.openFocus());
    this.top.querySelector('[data-act="dossier"]').addEventListener('click', () => ctx.openDossier(ctx.selectedNation() ?? game.player));
    this.bottom.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => ctx.setMode(+b.dataset.mode)));

    window.addEventListener('keydown', (e) => {
      if (e.target.closest('input,textarea') || this.top.hidden) return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePause(); }
      else if (/^[1-5]$/.test(e.key)) { game.speed = +e.key; this.renderClock(); }
      else if (e.key === 't' || e.key === 'T') ctx.openFocus();
      else if (e.key === 'o' || e.key === 'O') ctx.openDossier(ctx.selectedNation() ?? game.player);
      else if (e.key === 'Escape') ctx.escape();
    });
    game.on('news', (item) => this.pushNews(item));
    window.addEventListener('resize', () => this.drawTimeline());
  }

  show() {
    for (const el of [this.top, this.bottom, this.newsEl, this.wordmark]) el.hidden = false;
    this._tlW = this.canvas.clientWidth;
    this._tlH = this.canvas.clientHeight;
    this.renderTop();
    this.renderClock();
    this.drawTimeline();
  }

  togglePause() { this.ctx.game.paused = !this.ctx.game.paused; this.renderClock(); }

  setMode(m) { this.bottom.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', +b.dataset.mode === m)); }

  renderTop() {
    const { game } = this.ctx;
    const n = game.nations[game.player];
    if (!n) return;
    this._set('chip', this.chipEl, `${flagHTML(n)}<div><div class="nm">${esc(n.name)}</div><div class="ld">${esc(n.leader)}</div></div>`);
    const gain = game.ppGain(n);
    const divs = this.ctx.units.of(n.index).reduce((a, s) => a + (s.type === 'air' || s.type === 'fleet' || s.type === 'sub' || s.type === 'carrier' ? 0 : s.divs), 0);
    const meter = (v) => `<div class="meter"><i style="width:${v.toFixed(0)}%"></i></div>`;
    this._set('res', this.resEl, `
      <div class="r" title="Political power, spent on decisions, focuses and diplomacy"><span class="k">Political power</span><span class="v ${gain >= 0 ? 'up' : 'down'}">${Math.floor(n.pp)}<small>${signed(gain, 2)}</small></span></div>
      <div class="r"><span class="k">Stability</span><span class="v">${n.stability.toFixed(0)}%</span>${meter(n.stability)}</div>
      <div class="r"><span class="k">War support</span><span class="v">${n.warSupport.toFixed(0)}%</span>${meter(n.warSupport)}</div>
      <div class="r"><span class="k">GDP</span><span class="v ${n.growth >= 0 ? 'up' : 'down'}">${money(n.gdp)}<small>${signed(n.growth)}%</small></span></div>
      <div class="r"><span class="k">Manpower</span><span class="v">${compact(n.manpower * 1000)}</span></div>
      <div class="r"><span class="k">Divisions</span><span class="v">${divs}</span></div>`);
  }

  _set(slot, el, html) { if (this._html[slot] !== html) { this._html[slot] = html; el.innerHTML = html; } }

  renderClock() {
    const { game } = this.ctx;
    this._set('date', this.dateEl, `${day(game.time)}<small>${hour(game.time)}</small>`);
    this.pauseEl.classList.toggle('paused', game.paused);
    const label = game.paused ? 'Paused' : '❚❚';
    if (this._html.pause !== label) { this._html.pause = label; this.pauseEl.textContent = label; }
    for (const b of this.speedEls) b.classList.toggle('on', +b.dataset.speed <= game.speed);
    void SPEEDS;
  }

  coords(ll, label) {
    if (!ll) return;
    const t1 = formatCoord(ll.lat, ll.lon), t2 = label ?? '';
    if (this.c1.textContent !== t1) this.c1.textContent = t1;
    if (this.c2.textContent !== t2) this.c2.textContent = t2;
  }

  pushNews(item) {
    const { game } = this.ctx;
    const relevant = item.major || item.nation === game.player || item.kind === 'war';
    if (!relevant) return;
    // News arrives mid-frame from the simulation; insert it at the end of the task so the frame's
    // layout reads (hover picking) never see a dirty DOM.
    this._newsQ.push(item);
    if (this._newsQ.length === 1) queueMicrotask(() => this._flushNews());
  }

  _flushNews() {
    const q = this._newsQ;
    this._newsQ = [];
    for (const item of q) {
      const el = document.createElement('div');
      el.className = `item ${item.kind}`;
      el.innerHTML = `<time>${day(item.time)}</time>${esc(item.text)}`;
      this.newsEl.prepend(el);
      while (this.newsEl.children.length > 6) this.newsEl.lastChild.remove();
      setTimeout(() => el.remove(), 20000);
    }
    this.drawTimeline();
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = 1;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => (this.toastEl.style.opacity = 0), 2600);
  }

  // Coalesces every request made during one task (a day tick, war changes and several news items
  // can all land in the same frame) into a single redraw at the end of that task, before paint.
  drawTimeline() {
    if (this._tlQueued) return;
    this._tlQueued = true;
    queueMicrotask(() => { this._tlQueued = false; this._drawTimeline(); });
  }

  // Daily world-tension histogram, after the timeline strip in the Cape Town reference.
  _drawTimeline() {
    const { game } = this.ctx;
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this._tlW, h = this._tlH;
    if (!w || this.bottom.hidden) return;
    const cw = (w * dpr) >>> 0, ch = (h * dpr) >>> 0;
    if (c.width !== cw) c.width = cw;
    if (c.height !== ch) c.height = ch;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const hist = game.history.slice(-120);
    const n = hist.length;
    const top = 26, base = h - 16;
    const bw = w / 120;
    g.font = '400 9px JetBrains Mono, monospace';
    hist.forEach((d, i) => {
      const x = (120 - n + i) * bw;
      const bh = Math.max(0.04, (d.tension - 30) / 50) * (base - top);
      const today = i === n - 1;
      g.fillStyle = today ? '#ffb547' : i % 2 ? 'rgba(232,232,232,0.85)' : 'rgba(232,232,232,0.55)';
      g.fillRect(x + 0.5, base - Math.max(1, bh), Math.max(1, bw - 1.5), Math.max(1, bh));
      if (d.battles > 0) {
        g.fillStyle = 'rgba(255,68,51,0.85)';
        g.fillRect(x + 0.5, base - Math.max(1, bh) - Math.min(10, d.battles * 0.4) - 2, Math.max(1, bw - 1.5), Math.min(10, d.battles * 0.4));
      }
      const dt = new Date(d.time);
      if (dt.getUTCDate() === 1) {
        g.fillStyle = 'rgba(141,145,149,0.9)';
        g.fillText(this._monthFmt.format(dt) + (dt.getUTCMonth() === 0 ? ` ${dt.getUTCFullYear()}` : ''), x + 2, h - 4);
        g.fillRect(x, base, 1, 4);
      }
      if (d.events?.length) {
        g.strokeStyle = '#e8e8e8';
        g.beginPath(); g.moveTo(x + bw / 2 - 4, top - 8); g.lineTo(x + bw / 2 + 4, top - 8); g.lineTo(x + bw / 2, top - 1); g.closePath(); g.stroke();
      }
    });
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, base, w, 1);
    const last = hist[n - 1];
    if (last) this._set('read', this.read, `<span>Active wars ${game.wars.length}</span><b>${last.tension.toFixed(0)}</b>`);
  }
}
