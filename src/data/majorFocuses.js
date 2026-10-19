// Original 2025 campaign branches informed by The Fire Rises and Millennium Dawn.
// These adapt themes and trade-offs to Factions' existing effects rather than copying mod scripts.
export const MAJOR_FOCUS_EXPANSIONS = {
  USA: [
    { id: 'usa_industrial_base', name: 'Rebuild the arsenal', days: 70, x: 2, y: 5, req: ['usa_hemisphere'], fx: { growth: 0.3, debt: 3, defPct: 0.3, loyalty: { military: 8, labor: 6 } }, desc: 'Restore shipyards, munitions lines and the supply chains that sustain a great power.' },
    { id: 'usa_pacific_network', name: 'Pacific security network', days: 70, x: 3, y: 6, req: ['usa_industrial_base', 'usa_golden_dome'], fx: { fleets: 1, airWings: 1, ws: 4, loyalty: { military: 8 } }, desc: 'Coordinate deterrence with Japan and other Pacific partners as competition with China sharpens.' },
    { id: 'usa_chip_supply', name: 'Secure the chip supply', days: 70, x: 4, y: 5, req: ['usa_golden_dome', 'usa_abundance_pact'], fx: { growth: 0.4, debt: 2, loyalty: { business: 8 } }, desc: 'Expand domestic semiconductor capacity and protect access to advanced fabrication.' },
    { id: 'usa_restore_alliances', name: 'Restore the alliances', days: 70, x: 6, y: 5, req: ['usa_newsom'], fx: { pp: 45, stab: 3, ws: 3 }, desc: 'Reaffirm NATO commitments and rebuild confidence with European and Asian allies.' },
    { id: 'usa_social_contract', name: 'A new social contract', days: 70, x: 8, y: 5, req: ['usa_aoc'], fx: { debt: 4, stab: 4, growth: 0.2, loyalty: { labor: 10, business: -8 } }, desc: 'Turn electoral victory into a durable programme for health care, housing and wages.' },
  ],
  DEU: [
    { id: 'deu_strategic_review', name: 'Germany in Europe', days: 35, x: 11, y: 1, req: ['crossroads'], fx: { pp: 30 }, desc: 'Choose how Berlin should handle energy dependence, Russia and European defence.' },
    { id: 'deu_eastern_bulwark', name: 'Eastern bulwark', days: 70, x: 10, y: 2, req: ['deu_strategic_review'], mutex: ['deu_ostpolitik'], fx: { ws: 5, defPct: 0.3, loyalty: { military: 8 } }, desc: 'Strengthen the eastern flank and deepen joint planning with European partners.' },
    { id: 'deu_ostpolitik', name: 'Renew Ostpolitik', days: 70, x: 12, y: 2, req: ['deu_strategic_review'], mutex: ['deu_eastern_bulwark'], fx: { growth: 0.3, ws: -3, loyalty: { business: 8, military: -6 } }, desc: 'Test whether diplomacy and limited trade can lower tension with Moscow.' },
    { id: 'deu_european_army', name: 'European defence command', days: 105, x: 10, y: 3, req: ['deu_eastern_bulwark'], fx: { divisions: 2, airWings: 1, defPct: 0.4, loyalty: { military: 9 } }, desc: 'Build shared procurement and a command structure for a stronger European pillar.' },
    { id: 'deu_energy_transition', name: 'Energy resilience', days: 70, x: 12, y: 3, req: ['deu_ostpolitik'], fx: { growth: 0.4, debt: 3, loyalty: { business: 8, regions: 4 } }, desc: 'Expand grids, storage and alternative supply to reduce exposure to the next price shock.' },
  ],
  FRA: [
    { id: 'fra_strategic_review', name: 'France beyond Europe', days: 35, x: 11, y: 1, req: ['fra_root'], fx: { pp: 30 }, desc: 'Set the role of the independent deterrent, Mediterranean security and France’s overseas commitments.' },
    { id: 'fra_mediterranean_pact', name: 'Mediterranean security pact', days: 70, x: 10, y: 2, req: ['fra_strategic_review'], mutex: ['fra_independent_force'], fx: { fleets: 1, ws: 3, loyalty: { military: 8 } }, desc: 'Work with European and NATO partners on maritime patrols and crisis response.' },
    { id: 'fra_independent_force', name: 'Independent strategic force', days: 70, x: 12, y: 2, req: ['fra_strategic_review'], mutex: ['fra_mediterranean_pact'], fx: { defPct: 0.4, pp: 35, loyalty: { military: 10 } }, desc: 'Keep French forces ready for operations under national command.' },
    { id: 'fra_sahel_reset', name: 'Reset the Sahel policy', days: 70, x: 10, y: 3, req: ['fra_mediterranean_pact'], fx: { pp: 40, stab: 2, loyalty: { military: -3 } }, desc: 'Replace costly deployments with narrower training and diplomatic partnerships.' },
    { id: 'fra_oceanic_deterrent', name: 'Modernise the deterrent', days: 105, x: 12, y: 3, req: ['fra_independent_force'], fx: { fleets: 1, defPct: 0.3, ws: 4, debt: 2 }, desc: 'Renew the submarine fleet and preserve an independent second-strike capability.' },
  ],
  RUS: [
    { id: 'rus_world_order', name: 'A multipolar order', days: 35, x: 11, y: 1, req: ['rus_root'], fx: { pp: 40 }, desc: 'Moscow looks for leverage outside the Western financial and security system.' },
    { id: 'rus_eurasian_trade', name: 'Eurasian trade corridors', days: 70, x: 10, y: 2, req: ['rus_world_order'], mutex: ['rus_security_perimeter'], fx: { growth: 0.4, debt: 2, loyalty: { business: 10, regions: 5 } }, desc: 'Put rail, ports and payment systems behind a larger eastward trade strategy.' },
    { id: 'rus_security_perimeter', name: 'The security perimeter', days: 70, x: 12, y: 2, req: ['rus_world_order'], mutex: ['rus_eurasian_trade'], fx: { ws: 5, defPct: 0.3, loyalty: { security: 8, military: 8 } }, desc: 'Prioritise bases, border forces and military ties across the near abroad.' },
    { id: 'rus_energy_pivot', name: 'Pivot the energy market', days: 70, x: 10, y: 3, req: ['rus_eurasian_trade'], fx: { growth: 0.4, debt: 2, loyalty: { business: 8 } }, desc: 'Redirect oil and gas sales while building the infrastructure for new buyers.' },
    { id: 'rus_defence_industry', name: 'Rebuild the defence industry', days: 70, x: 12, y: 3, req: ['rus_security_perimeter'], fx: { divisions: 2, airWings: 1, growth: -0.2, loyalty: { military: 9, labor: 5 } }, desc: 'Turn battlefield production into a sustained modernisation effort.' },
  ],
  CHN: [
    { id: 'chn_regional_order', name: 'The Asian balance', days: 35, x: 11, y: 1, req: ['chn_root'], fx: { pp: 35 }, desc: 'China’s economic weight and growing navy force choices about its regional role.' },
    { id: 'chn_maritime_pressure', name: 'Maritime pressure', days: 70, x: 10, y: 2, req: ['chn_regional_order'], mutex: ['chn_connectivity'], fx: { fleets: 1, ws: 5, loyalty: { military: 8, business: -5 } }, desc: 'Expand patrols and exercises around the first island chain without opening a war.' },
    { id: 'chn_connectivity', name: 'Continental connectivity', days: 70, x: 12, y: 2, req: ['chn_regional_order'], mutex: ['chn_maritime_pressure'], fx: { growth: 0.3, debt: 3, loyalty: { business: 8, regions: 5 } }, desc: 'Use rail, ports and credit to deepen economic ties across Eurasia.' },
    { id: 'chn_joint_command', name: 'Joint theatre command', days: 105, x: 10, y: 3, req: ['chn_maritime_pressure'], fx: { airWings: 1, defPct: 0.4, ws: 4, loyalty: { military: 10 } }, desc: 'Integrate air, naval and missile planning for a crisis in the western Pacific.' },
    { id: 'chn_digital_silk_road', name: 'Digital Silk Road', days: 70, x: 12, y: 3, req: ['chn_connectivity'], fx: { growth: 0.5, loyalty: { business: 8, security: 4 } }, desc: 'Export networks, standards and cloud infrastructure with Chinese financing.' },
  ],
  GBR: [
    { id: 'gbr_global_role', name: 'Britain’s global role', days: 35, x: 11, y: 1, req: ['gbr_root'], fx: { pp: 35 }, desc: 'Choose where to spend limited diplomatic and military capacity after Brexit.' },
    { id: 'gbr_european_reset', name: 'European reset', days: 70, x: 10, y: 2, req: ['gbr_global_role'], mutex: ['gbr_commonwealth'], fx: { growth: 0.3, stab: 2, loyalty: { business: 7 } }, desc: 'Improve trade and security coordination with European neighbours.' },
    { id: 'gbr_commonwealth', name: 'Commonwealth network', days: 70, x: 12, y: 2, req: ['gbr_global_role'], mutex: ['gbr_european_reset'], fx: { pp: 45, growth: 0.2, loyalty: { business: 5 } }, desc: 'Use trade, education and defence ties across the wider Commonwealth.' },
    { id: 'gbr_north_atlantic', name: 'North Atlantic commitment', days: 70, x: 10, y: 3, req: ['gbr_european_reset'], fx: { fleets: 1, defPct: 0.3, ws: 4 }, desc: 'Protect sea lanes and reinforce allied security in the North Atlantic.' },
    { id: 'gbr_indopacific', name: 'Indo-Pacific deployment', days: 70, x: 12, y: 3, req: ['gbr_commonwealth'], fx: { fleets: 1, airWings: 1, debt: 2, loyalty: { military: 7 } }, desc: 'Sustain a modest carrier presence and deepen security links with Asian partners.' },
  ],
};

export const JAPAN_FOCUS_TREE = {
  title: 'The archipelago at a turning point',
  focuses: [
    { id: 'jpn_root', name: 'A fragile mandate', days: 35, x: 4, y: 0, fx: { pp: 50 }, desc: 'A minority cabinet faces stagnant wages, an ageing society and a deteriorating security environment.' },
    { id: 'jpn_politics', name: 'The Diet decides', days: 35, x: 1, y: 1, req: ['jpn_root'], fx: { pp: 30 }, desc: 'The ruling coalition must bargain with opposition parties over the budget and constitutional policy.' },
    { id: 'jpn_economy', name: 'Economic renewal', days: 35, x: 4, y: 1, req: ['jpn_root'], fx: { growth: 0.2 }, desc: 'Raise productivity and household incomes in a shrinking workforce.' },
    { id: 'jpn_defence', name: 'The security debate', days: 35, x: 7, y: 1, req: ['jpn_root'], fx: { ws: 2 }, desc: 'Article 9, the alliance with Washington and pressure around the islands define the debate.' },
    { id: 'jpn_ldp', name: 'Repair the LDP coalition', days: 49, x: 0, y: 2, req: ['jpn_politics'], mutex: ['jpn_opposition'], fx: { party: { LDP: 3, KOM: 1 }, stab: 3, loyalty: { business: 6 } }, desc: 'Restore public trust and keep Komeito inside a working majority.' },
    { id: 'jpn_opposition', name: 'An opposition bargain', days: 49, x: 2, y: 2, req: ['jpn_politics'], mutex: ['jpn_ldp'], fx: { party: { CDP: 3, DPP: 2 }, loyalty: { labor: 7, business: -4 } }, desc: 'The CDP and DPP agree on a programme broad enough to challenge the incumbents.' },
    { id: 'jpn_reform_cabinet', name: 'A reform cabinet', days: 70, x: 2, y: 3, req: ['jpn_opposition'], fx: { leader: ['Reform coalition', 'Prime Minister'], ruling: ['CDP', 'DPP'], stab: 3, loyalty: { labor: 6 } }, desc: 'A change of government puts wages, clean administration and careful diplomacy first.' },
    { id: 'jpn_coalition_budget', name: 'Pass the coalition budget', days: 70, x: 0, y: 3, req: ['jpn_ldp'], fx: { debt: 2, growth: 0.3, stab: 2 }, desc: 'Tax concessions and targeted spending hold together a divided Diet.' },
    { id: 'jpn_wage_cycle', name: 'A lasting wage cycle', days: 70, x: 3, y: 2, req: ['jpn_economy'], mutex: ['jpn_industry'], fx: { growth: 0.4, infl: 1, loyalty: { labor: 10, business: -3 } }, desc: 'Back wage negotiations and household demand to end the low pay equilibrium.' },
    { id: 'jpn_industry', name: 'Strategic industries', days: 70, x: 5, y: 2, req: ['jpn_economy'], mutex: ['jpn_wage_cycle'], fx: { growth: 0.4, debt: 3, loyalty: { business: 10 } }, desc: 'Fund chips, batteries and advanced manufacturing at home.' },
    { id: 'jpn_demography', name: 'The demographic compact', days: 105, x: 3, y: 3, req: ['jpn_wage_cycle'], fx: { remove: 'aging_society', growth: 0.2, debt: 4, loyalty: { labor: 6 } }, desc: 'Combine childcare, later retirement and selective immigration to ease labour shortages.' },
    { id: 'jpn_semiconductors', name: 'Rebuild chip capacity', days: 105, x: 5, y: 3, req: ['jpn_industry'], fx: { growth: 0.5, debt: 3, loyalty: { business: 8 } }, desc: 'Anchor a new semiconductor supply chain in Japanese factories and research labs.' },
    { id: 'jpn_article9', name: 'Interpret Article 9', days: 70, x: 6, y: 2, req: ['jpn_defence'], mutex: ['jpn_pacifism'], fx: { ws: 4, loyalty: { military: 8, movement: 5 } }, desc: 'Expand the legal scope of collective self-defence while retaining parliamentary checks.' },
    { id: 'jpn_pacifism', name: 'Defensive pacifism', days: 70, x: 8, y: 2, req: ['jpn_defence'], mutex: ['jpn_article9'], fx: { stab: 4, ws: -2, loyalty: { military: -4, media: 6 } }, desc: 'Preserve the constitutional constraint and focus on civil defence and diplomacy.' },
    { id: 'jpn_counterstrike', name: 'Counterstrike capability', days: 105, x: 6, y: 3, req: ['jpn_article9'], fx: { remove: 'article_9', defPct: 0.5, airWings: 1, ws: 5, loyalty: { military: 10 } }, desc: 'Invest in long-range defensive strike systems and the doctrine to control them.' },
    { id: 'jpn_resilient_islands', name: 'Resilient islands', days: 70, x: 8, y: 3, req: ['jpn_pacifism'], fx: { fleets: 1, stab: 3, loyalty: { regions: 8 } }, desc: 'Harden ports, communications and evacuation plans without abandoning restraint.' },
    { id: 'jpn_pacific_partners', name: 'Pacific defence partners', days: 70, x: 6, y: 4, req: ['jpn_counterstrike'], fx: { fleets: 1, airWings: 1, ws: 3 }, desc: 'Deepen interoperability with the United States and regional partners.' },
    { id: 'jpn_diplomatic_balance', name: 'Diplomatic balance', days: 70, x: 8, y: 4, req: ['jpn_resilient_islands'], fx: { pp: 50, growth: 0.2, stab: 2 }, desc: 'Keep trade routes open while lowering the risk of confrontation.' },
  ],
};
