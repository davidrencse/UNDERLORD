// Fictional policy proposals. Values are game balance modifiers, not empirical claims.
export const DEMOGRAPHIC_DOCTRINES = {
  voluntary: 'Voluntary Integration',
  pronatalist: 'Pronatalist State',
  coercive: 'Coercive Social Control',
};

export const DEMOGRAPHIC_PROPOSALS = {
  dating: { name: 'Promote Interracial Dating', doctrine: 'voluntary', cost: 35, modifiers: { socialContact: .10, integrationCosts: .03 }, desc: 'Fund optional cross-cultural social spaces. Partner choice remains voluntary.' },
  marriage: { name: 'Promote Interracial Marriage', doctrine: 'voluntary', cost: 40, modifiers: { voluntaryMarriageSupport: .15, integrationCosts: .05 }, desc: 'Support voluntary intercultural marriage programs without directing private relationships.' },
  grants: { name: 'Intercultural Community Grants', doctrine: 'voluntary', cost: 25, modifiers: { communityParticipation: .10, integrationCosts: .03 }, desc: 'Fund local groups that bring residents together.' },
  social: { name: 'Expand Intercultural Social Programs', doctrine: 'voluntary', cost: 30, modifiers: { communityParticipation: .10, cohesionPotential: .05 }, desc: 'Extend voluntary programs with local delivery and evaluation.' },
  equality: { name: 'Protect Marriage Equality', doctrine: 'voluntary', cost: 25, modifiers: { civilLiberties: .06, legalStability: .08 }, desc: 'Defend equal access to marriage registration.' },
  freedom: { name: 'Guarantee Freedom of Marriage', doctrine: 'voluntary', cost: 25, modifiers: { civilLiberties: .10, legalStability: .12 }, desc: 'Protect partner choice and reduce instability from discriminatory marriage rules.' },
  family: { name: 'National Family Formation Campaign', doctrine: 'pronatalist', cost: 45, modifiers: { familySpending: .10, familyAccess: .05 }, desc: 'Expand family services and voluntary support. Fertility does not change on enactment.' },
  services: { name: 'Family Services Access', doctrine: 'pronatalist', cost: 30, modifiers: { familyAccess: .10, familySpending: .05 }, desc: 'Expand childcare and family-service availability without coercion.' },
  propaganda: { name: 'Crack Down on Anti-Natalist Propaganda', doctrine: 'coercive', cost: 50, legalSeverity: .55, modifiers: { expressionProtections: -.10, censorshipCosts: .08, protestPressure: .10 }, desc: 'Propose speech restrictions. Courts, civil society and enforcement agencies may resist.' },
  pornography: { name: 'Ban Interracial Pornography', doctrine: 'coercive', cost: 55, legalSeverity: .75, modifiers: { mediaEnforcementCosts: .15, civilLiberties: -.10, challengePressure: .12 }, desc: 'Propose a discriminatory media ban. Legal challenges and enforcement limits are severe.' },
  sameRace: { name: 'Ban Same-Race Marriages', doctrine: 'coercive', cost: 65, legalSeverity: 1, modifiers: { constitutionalPressure: .30, unrestPressure: .25, registrationDisruption: .35 }, desc: 'Propose a discriminatory marriage ban. Registration may be disrupted; private relationships do not change by decree.' },
};

const focus = (id, name, days, x, y, req = [], extra = {}) => ({
  id: `UDL_DEM_${id}`, name, days, x, y, req: req.map((r) => `UDL_DEM_${r}`), reqAll: true,
  category: 'demographic', fx: { demographic: extra.effect ?? {} },
  desc: extra.desc ?? DEMOGRAPHIC_PROPOSALS[extra.proposal]?.desc ?? '',
  ...(extra.mutex ? { mutex: extra.mutex.map((m) => `UDL_DEM_${m}`) } : {}),
  ...(extra.ai ? { ai: extra.ai } : {}),
});
const proposal = (id, days, x, y, req) => focus(id, DEMOGRAPHIC_PROPOSALS[id].name, days, x, y, req, {
  proposal: id, effect: { proposal: id },
});

export const DEMOGRAPHIC_TREE = {
  title: 'The Demographic Question',
  lanes: ['Voluntary integration', 'National debate', 'Pronatalist state', 'Coercive social control'],
  focuses: [
    focus('question', 'The Demographic Question', 35, 3, 0, [], { effect: { unlockStats: true }, desc: 'Open a national debate on fertility, marriage and relationships. Unlock modeled relationship statistics.' }),
    focus('commission', 'National Identity Commission', 35, 3, 1, ['question'], { effect: { researchSpeed: .05, legislation: true }, desc: 'Study demographic legislation and improve demographic-policy research speed by 5%.' }),
    focus('future', 'The Future of National Identity', 70, 3, 2, ['commission'], { desc: 'Set the national doctrine for family formation, cultural inclusion or state control.' }),
    focus('voluntary', DEMOGRAPHIC_DOCTRINES.voluntary, 35, 0, 3, ['future'], { effect: { doctrine: 'voluntary' }, mutex: ['pronatalist', 'coercive'], desc: 'Encourage cultural exchange and civic inclusion while protecting partner choice.' }),
    focus('pronatalist', DEMOGRAPHIC_DOCTRINES.pronatalist, 35, 4, 3, ['future'], { effect: { doctrine: 'pronatalist' }, mutex: ['voluntary', 'coercive'], desc: 'Fund family services and voluntary family formation support.' }),
    focus('coercive', DEMOGRAPHIC_DOCTRINES.coercive, 35, 8, 3, ['future'], { effect: { doctrine: 'coercive' }, mutex: ['voluntary', 'pronatalist'], ai: (n) => n.ideology !== 'dem', desc: 'Authoritarian factions propose restrictions on speech and marriage. Legislation remains contested.' }),
    proposal('dating', 70, 0, 4, ['voluntary']),
    proposal('marriage', 70, 0, 5, ['dating']),
    proposal('grants', 35, 0, 6, ['marriage']),
    proposal('social', 35, 1, 7, ['grants']),
    proposal('equality', 35, 0, 7, ['grants']),
    proposal('freedom', 35, 0, 8, ['equality']),
    proposal('family', 70, 4, 4, ['pronatalist']),
    proposal('services', 35, 4, 5, ['family']),
    proposal('propaganda', 70, 8, 4, ['coercive']),
    proposal('pornography', 70, 8, 5, ['propaganda']),
    proposal('sameRace', 70, 8, 6, ['pornography']),
  ],
};

for (const f of DEMOGRAPHIC_TREE.focuses) {
  if (f.id.endsWith('_question') || f.id.endsWith('_commission') || f.id.endsWith('_future')) f.lane = 1;
  else if (f.x <= 1) f.lane = 0;
  else if (f.x === 4) f.lane = 2;
  else f.lane = 3;
}
