import { diplomacy, takeDiplomaticAction } from '../game/actions.js';
import { esc, flagHTML, signed } from './format.js';

export class DiplomacyMenu {
  constructor(root, ctx) {
    this.ctx = ctx;
    this.target = null;
    this.el = document.createElement('aside');
    this.el.className = 'diplomacy-menu';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Country decisions');
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button || this.target == null) return;
      const { game } = this.ctx;
      const action = diplomacy(game, game.player, this.target).find((a) => a.id === button.dataset.action);
      const why = takeDiplomaticAction(game, game.player, this.target, button.dataset.action);
      this.ctx.toast(why || `${action.name}: ${game.nations[this.target].name}`);
      this.ctx.refreshTop();
      this.ctx.countryPanel.render();
      this.close();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.el.hidden && !this.el.contains(e.target)) this.close();
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden) { e.stopImmediatePropagation(); this.close(); }
    }, true);
  }

  open(target, x, y) {
    const { game } = this.ctx;
    if (!game.player || target === game.player || game.nations[target]?.inert) return;
    this.target = target;
    const n = game.nations[target];
    const actions = diplomacy(game, game.player, target);
    const rows = (list) => list.map((a) => `<button class="dm-action${a.danger ? ' danger' : ''}" data-action="${a.id}" ${a.ok ? '' : 'disabled'} title="${esc(a.ok ? a.desc : a.why || a.desc)}"><span class="dm-action-head"><b>${esc(a.name)}</b><span>${a.cost ? `${a.cost} PP` : 'FREE'}</span></span><small>${esc(a.ok ? a.desc : a.why || a.desc)}</small></button>`).join('');
    this.el.innerHTML = `<div class="dm-head">${flagHTML(n)}<div><h2>${esc(n.name)}</h2><p>${game.atWar(game.player, target) ? 'At war' : game.allied(game.player, target) ? 'Allied' : game.nations[game.player].guarantees.has(target) ? 'Guaranteed' : 'Diplomatic decisions'} <span>${signed(game.opinion(game.player, target), 0)} opinion</span></p></div></div>
      <div class="dm-meta"><span>${Math.floor(game.nations[game.player].pp)} PP available</span><span>${game.nations[game.player].influence.get(target) ?? 0} influence</span></div>
      <div class="dm-list">${rows(actions.filter((a) => !a.danger))}${actions.some((a) => a.danger) ? `<div class="dm-divider">Conflict</div>${rows(actions.filter((a) => a.danger))}` : ''}</div>`;
    this.el.hidden = false;
    this.el.style.left = `${Math.max(8, Math.min(x + 8, window.innerWidth - this.el.offsetWidth - 8))}px`;
    this.el.style.top = `${Math.max(8, Math.min(y + 8, window.innerHeight - this.el.offsetHeight - 8))}px`;
  }

  close() { this.el.hidden = true; this.target = null; }
}
