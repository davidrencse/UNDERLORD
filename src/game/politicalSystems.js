// Political pressure is recalculated from the institutions already simulated by the game.
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function politicalSystem(n) {
  if (n.iso3 === 'CHN' && n.gov.includes('One-party')) return 'party';
  if (n.iso3 === 'RUS' && !/junta/i.test(n.gov)) return 'managed';
  return n.politics.next ? 'democracy' : 'other';
}

export function politicalPressure(n) {
  const system = politicalSystem(n);
  const centres = (types) => {
    const group = n.powerCentres.filter((p) => types.includes(p.type));
    const weight = group.reduce((sum, p) => sum + p.influence, 0);
    return weight ? group.reduce((sum, p) => sum + p.influence * p.loyalty, 0) / weight : 50;
  };
  if (system === 'party') {
    const value = clamp(centres(['military', 'security', 'regions', 'movement']) * 0.65 + n.stability * 0.25 + clamp(50 + (n.growth - 3) * 5) * 0.1);
    return { system, name: 'Party cohesion', value, desc: 'PLA, security, provincial and party-elder loyalty sustain central authority.', stab: (value - 50) * 0.12, pp: (value - 50) * 0.008 };
  }
  if (system === 'managed') {
    const value = clamp(centres(['security', 'military', 'business', 'regions']) * 0.65 + n.stability * 0.2 + clamp(50 - n.exhaustion * 2) * 0.15);
    return { system, name: 'Elite cohesion', value, desc: 'Security, army, business and regional elites determine regime durability.', stab: (value - 50) * 0.1, pp: (value - 50) * 0.007 };
  }
  if (system === 'democracy') {
    const total = n.politics.list.reduce((sum, p) => sum + p.share, 0) || 1;
    const coalition = n.politics.list.filter((p) => n.politics.ruling.includes(p.id));
    const vote = coalition.reduce((sum, p) => sum + p.share, 0) / total * 100;
    const value = clamp(vote * 0.7 + n.stability * 0.3 - (coalition.length > 2 ? 5 : 0));
    return { system, name: 'Governing mandate', value, desc: 'Ruling-party support and stability determine how freely the government can act.', stab: (value - 45) * 0.045, pp: (value - 45) * 0.012 };
  }
  return { system, name: 'Political authority', value: n.stability, desc: '', stab: 0, pp: 0 };
}

export const POLITICAL_DECISIONS = {
  democracy: [
    { id: 'campaign', name: 'Campaign for the government', cost: 55, cd: 120, desc: 'Build support for governing parties at a political cost.', fx: { rulingShare: 3, loyalty: { media: 3 } } },
    { id: 'cross_party', name: 'Seek a cross-party deal', cost: 45, cd: 120, desc: 'Trade concessions for a steadier parliament.', fx: { stabNow: 3, opposition: 1.5 } },
  ],
  party: [
    { id: 'cadres', name: 'Convene party cadres', cost: 55, cd: 120, desc: 'Build consensus with provincial officials and party elders.', fx: { loyalty: { regions: 10, movement: 8 }, stabNow: 1 } },
    { id: 'pla_review', name: 'Review PLA leadership', cost: 70, cd: 180, desc: 'Strengthen military and security loyalty; unsettle provincial cadres.', fx: { loyalty: { military: 12, security: 7, regions: -5 } } },
  ],
  managed: [
    { id: 'elite_pact', name: 'Broker an elite pact', cost: 60, cd: 150, desc: 'Balance security, business and regional interests.', fx: { loyalty: { security: 6, business: 9, regions: 8 } } },
    { id: 'veteran_bargain', name: 'Settle with veterans', cost: 50, cd: 120, desc: 'Fund veterans and placate the army; add to the debt.', fx: { loyalty: { military: 10, movement: 8 }, debt: 1 } },
  ],
};
