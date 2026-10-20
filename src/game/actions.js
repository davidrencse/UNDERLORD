import { FACTIONS } from '../data/nations.js';
import { pairKey, DAY } from './game.js';
import { POLITICAL_DECISIONS, politicalSystem } from './politicalSystems.js';
import { transferAid } from './economy.js';
import { demographicDecisions } from './demographicPolicy.js';
import { conscriptionDecisions } from './population.js';
import { fuelDecisions } from './fuel.js';

// Domestic decisions available to the player's own government.
export const DECISIONS = [
  { id: 'media', name: 'State media campaign', cost: 50, cd: 60, desc: 'Flood the airwaves with the government\'s message.', fx: { stabNow: 4, loyalty: { media: 6 } } },
  { id: 'mobilize', name: 'Patriotic mobilisation', cost: 50, cd: 60, desc: 'Rallies, parades and recruitment drives.', fx: { wsNow: 7, stabNow: -2 } },
  { id: 'defence', name: 'Raise defence spending', cost: 75, cd: 90, desc: '+0.5% of GDP to the armed forces.', fx: { defPct: 0.5, growth: -0.1, ws: 2, loyalty: { military: 8 } } },
  { id: 'stimulus', name: 'Economic stimulus', cost: 75, cd: 180, desc: 'Six months of deficit spending.', fx: { timed: ['stimulus', 180], debt: 3, loyalty: { labor: 5 } } },
  { id: 'austerity', name: 'Austerity package', cost: 60, cd: 180, desc: 'Cut spending to reduce debt.', fx: { timed: ['austerity', 180], debt: -4, loyalty: { labor: -8, business: 6 } } },
  { id: 'recruit', name: 'Raise a division', cost: 25, cd: 7, desc: 'Train a new division from 15,000 recruits.', fx: { divisions: 1, manpower: -15 }, needs: (g, n) => n.manpower >= 15 || 'Not enough manpower.' },
  { id: 'partial_mob', name: 'Partial mobilisation', cost: 100, cd: 365, desc: 'Call up reservists into four new divisions.', fx: { divisions: 4, manpower: -60, stabNow: -6 }, needs: (g, n) => (n.manpower >= 60 && (n.warSupport >= 40 || g.warsOf(n.index).length > 0)) || 'Needs 60k manpower and 40% war support or an active war.' },
  { id: 'generals', name: 'Court the generals', cost: 40, cd: 90, desc: 'Promotions, budgets and medals.', fx: { loyalty: { military: 12, security: 6 } } },
  { id: 'labour', name: 'Deal with organised labour', cost: 40, cd: 90, desc: 'A wage and pensions settlement.', fx: { loyalty: { labor: 12 }, growth: -0.05 } },
  { id: 'business', name: 'Reassure business elites', cost: 40, cd: 90, desc: 'Tax breaks and regulatory relief.', fx: { loyalty: { business: 12 }, stabNow: -1 } },
];

export function domesticDecisions(n) {
  return [...(POLITICAL_DECISIONS[politicalSystem(n)] ?? []), ...DECISIONS, ...conscriptionDecisions(n), ...fuelDecisions(n), ...demographicDecisions(n)];
}

export function decisionState(g, n, d) {
  const until = n.cooldowns[d.id] ?? 0;
  if (until > g.time) return { ok: false, why: `Available again in ${Math.ceil((until - g.time) / DAY)} days.` };
  if (n.pp < d.cost) return { ok: false, why: 'Not enough political power.' };
  const need = d.needs?.(g, n);
  if (need !== undefined && need !== true) return { ok: false, why: need };
  return { ok: true };
}

export function takeDecision(g, n, d) {
  if (!d || !domesticDecisions(n).some((available) => available.id === d.id)) return 'Decision unavailable.';
  const st = decisionState(g, n, d);
  if (!st.ok) return st.why;
  n.pp -= d.cost;
  n.cooldowns[d.id] = g.time + d.cd * DAY;
  if (d.run) d.run(g, n);
  else g.applyFx(n, d.fx);
  g.log(`${n.name}: ${d.name.toLowerCase()}.`, { nation: n.index, kind: 'politics' });
  return null;
}

// Diplomatic actions from the player (p) toward a target (t).
export function diplomacy(g, p, t) {
  if (!p || !t || p === t || !g.nations[p] || !g.nations[t]) return [];
  const P = g.nations[p], T = g.nations[t];
  const op = g.opinion(p, t);
  const atWar = g.atWar(p, t);
  const allied = g.allied(p, t);
  const cd = (id) => (P.cooldowns[`${id}:${t}`] ?? 0) > g.time;
  const list = [];
  const add = (id, name, cost, desc, ok, run, danger = false) => list.push({ id, name, cost, desc, ok: ok === true && P.pp >= cost, why: ok === true ? (P.pp < cost ? 'Not enough political power.' : '') : ok, run, danger });

  add('improve', 'Improve relations', 25, 'Diplomatic visits and trade missions. +15 opinion.', cd('improve') ? 'Recently done.' : !atWar || 'Not while at war.', () => {
    g.addOpinion(p, t, 15); P.cooldowns[`improve:${t}`] = g.time + 30 * DAY;
  });
  add('influence', 'Influence country', 35, 'Build diplomatic influence. +15 influence and +8 opinion.', cd('influence') ? 'Recently done.' : !atWar || 'Not while at war.', () => {
    P.influence.set(t, Math.min(100, (P.influence.get(t) ?? 0) + 15));
    g.addOpinion(p, t, 8);
    P.cooldowns[`influence:${t}`] = g.time + 45 * DAY;
    g.log(`${P.name} expands its influence in ${T.name}.`, { nation: p, kind: 'diplo' });
  });
  const aid = Math.min(20, P.gdp * 0.005);
  add('aid', 'Give aid', 40, `Transfer $${aid >= 1 ? aid.toFixed(1) + 'B' : Math.round(aid * 1000) + 'M'} in economic aid. +15 opinion and +3 stability.`, cd('aid') ? 'Recently done.' : atWar ? 'Not while at war.' : P.gdp > aid * 2 || 'Economy too small.', () => {
    transferAid(P, T, aid);
    g.addOpinion(p, t, 15);
    g.applyFx(T, { stabNow: 3 });
    P.cooldowns[`aid:${t}`] = g.time + 90 * DAY;
    g.log(`${P.name} sends economic aid to ${T.name}.`, { nation: p, kind: 'diplo' });
  });
  add('alliance', 'Request alliance', 60, 'Propose a mutual defence pact.', allied ? 'Already allied.' : atWar ? 'At war.' : op >= 65 || (op >= 40 && (P.influence.get(t) ?? 0) >= 15) || 'Needs 65 opinion, or 40 opinion and 15 influence.', () => {
    g.pacts.add(pairKey(p, t));
    g.addOpinion(p, t, 20);
    g.log(`${P.name} and ${T.name} sign a mutual defence pact.`, { nation: p, kind: 'diplo', major: true });
  });
  add('sanction', 'Impose sanctions', 50, 'Restrict their trade and finance: their imports, exports and investment shrink. You lose exports to them too.', T.sanctionedBy.has(p) ? 'Already sanctioned.' : (op < 10 && !allied) || 'Only against nations you are on poor terms with.', () => {
    T.sanctionedBy.add(p); g.addOpinion(p, t, -30);
    g.log(`${P.name} imposes sanctions on ${T.name}.`, { nation: p, kind: 'diplo', major: P.gdp > 1000 });
  });
  if (T.sanctionedBy.has(p)) add('lift', 'Lift sanctions', 10, 'Restore normal trade.', true, () => { T.sanctionedBy.delete(p); g.addOpinion(p, t, 15); });
  add('guarantee', 'Guarantee independence', 50, 'Promise to defend them if attacked.', P.guarantees.has(t) ? 'Already guaranteed.' : atWar ? 'At war.' : op >= 0 || 'They distrust you.', () => {
    P.guarantees.add(t); g.addOpinion(p, t, 20);
    g.log(`${P.name} guarantees the independence of ${T.name}.`, { nation: p, kind: 'diplo', major: true });
  });
  const leads = P.faction && FACTIONS[P.faction]?.leader === P.key;
  if (leads && T.faction !== P.faction) add('invite', `Invite to ${P.faction}`, 75, 'Offer full membership in your alliance.', T.faction ? `Already in ${T.faction}.` : atWar ? 'At war.' : op >= 40 || 'Needs opinion of 40.', () => {
    if (op + (g.r() * 30) > 55) { T.faction = P.faction; g.log(`${T.name} joins ${P.faction}.`, { nation: t, kind: 'diplo', major: true }); }
    else g.log(`${T.name} declines to join ${P.faction}.`, { nation: t, kind: 'diplo' });
  });
  const tLeads = T.faction && FACTIONS[T.faction]?.leader === T.key;
  if (tLeads && P.faction !== T.faction) add('join', `Apply to join ${T.faction}`, 75, 'Seek membership of their alliance.', P.faction ? `Already in ${P.faction}.` : op >= 50 || 'Needs opinion of 50.', () => {
    P.faction = T.faction; g.log(`${P.name} joins ${T.faction}.`, { nation: p, kind: 'diplo', major: true });
  });
  if (!atWar) {
    const justifying = P.justifying?.target === t;
    add('justify', justifying ? 'Justifying war goal…' : 'Justify war goal', 100, 'Prepare the case for war. Takes 45 days.', P.wargoals.has(t) ? 'War goal ready.' : justifying ? `Ready ${new Date(P.justifying.until).toISOString().slice(0, 10)}.` : P.justifying ? 'Already justifying another war goal.' : allied ? 'Cannot target allies.' : P.warSupport >= 20 || 'Needs 20% war support.', () => {
      P.justifying = { target: t, until: g.time + 45 * DAY }; g.addOpinion(p, t, -20);
      g.log(`${P.name} begins justifying a war goal against ${T.name}.`, { nation: p, kind: 'diplo', major: true });
    }, true);
    add('declare', 'Declare war', 0, 'Their allies will join them. Low war support costs stability.', P.wargoals.has(t) || 'Justify a war goal first.', () => {
      if (P.warSupport < 50) g.applyFx(P, { stabNow: -(50 - P.warSupport) * 0.2 });
      P.wargoals.delete(t);
      g.startWar(p, t, {});
    }, true);
  } else {
    const war = g.wars.find((w) => (w.a.has(p) && w.d.has(t)) || (w.d.has(p) && w.a.has(t)));
    const lead = war && (war.leadA === t || war.leadD === t);
    add('peace', 'Offer white peace', 50, 'Both sides return to pre-war control.', lead || 'Negotiate with the war leader.', () => {
      const held = T.held / Math.max(1, T.pixels);
      const accept = held < 0.85 || T.warSupport < 35 || T.stability < 30 || g.r() < 0.2;
      if (accept) { g.log(`${T.name} accepts white peace with ${P.name}.`, { nation: t, kind: 'war', major: true }); g.makePeace(war); }
      else g.log(`${T.name} rejects peace terms from ${P.name}.`, { nation: t, kind: 'war' });
    });
  }
  return list;
}

export function takeDiplomaticAction(g, p, t, id) {
  const act = diplomacy(g, p, t).find((a) => a.id === id);
  if (!act) return 'Action unavailable.';
  if (!act.ok) return act.why || 'Action unavailable.';
  g.nations[p].pp -= act.cost;
  act.run();
  g.emit('nation', g.nations[p]);
  g.emit('nation', g.nations[t]);
  return null;
}
