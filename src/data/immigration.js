// Fictional 2025 scenario choices, not a record of enacted policy.
// All modifiers operate on the shared migration state; no origin-based safety traits.
export const DOCTRINES = {
  restriction: 'Restriction and sovereignty',
  integration: 'Integration and civic cohesion',
  multicultural: 'Multicultural settlement',
};
export const IMMIGRATION_LANES = ['National settlement', 'Restriction', 'Integration', 'Multiculturalism', 'Institutions and capacity', 'South Asia', 'Sub-Saharan Africa'];

// key | country | national chain | additional national dilemmas
const NATIONAL = `
GBR|United Kingdom|Post-Brexit Migration Review;Reform Skilled Worker Visas;Reform Care-Sector Recruitment;Immigration Election|NHS Recruitment Covenant;University Dependency Audit;Devolved Settlement Grants
FRA|France|Republican Integration;Secularism Debate;Reform Residency Requirements;National Cohesion|Municipal Language Houses;Overseas Reception Compact;Republican Service Year
DEU|Germany|Skilled Labor Shortage;Accelerate Qualification Recognition;Citizenship Reform;Integration or Restriction|Apprenticeship Bridge;Municipal Fiscal Equalization;Industry Recruitment Pact
NLD|Netherlands|Housing and Asylum Crisis;Reform Reception Capacity;Coalition Immigration Deal|Reception Distribution Law;University Language Compromise
BEL|Belgium|Brussels Multiculturalism;Regional Integration Authority;Federal Migration Compromise|Brussels Credential Passport;Language Community Funding Pact
SWE|Sweden|Reassess Integration Policy;Language and Employment Requirements;Community Safety Strategy|Municipal School Renewal;Youth Employment Guarantee
DNK|Denmark|Parallel Societies Debate;Neighborhood Investment or Restrictive Residency Rules;Danish Integration Model|Housing Association Compact;Employer Language Responsibility
NOR|Norway|Welfare and Migration Balance;Refugee Settlement Reform;Nordic Integration Model|Northern Municipality Settlement;Offshore Skills Recognition
FIN|Finland|Labor Migration Reform;Language Requirements;Workforce Renewal|Bilingual Workplace Grants;Graduate Retention Guarantee
ISL|Iceland|Population and Labor Needs;Housing Capacity Expansion;Immigration Settlement Strategy|Seasonal Tourism Housing;Icelandic in the Workplace
IRL|Ireland|Accommodation Crisis;International Protection Reform;Community Integration|Vacant Buildings Settlement Fund;Local Reception Consultation
LUX|Luxembourg|Cross-Border Workforce;Multilingual Integration;Residency Reform|Commuter Rail Compact;Multilingual School Places
CHE|Switzerland|Referendum on Migration;Labor Market Safeguards;Swiss Immigration Settlement|Cantonal Settlement Bargain;Cross-Border Credential Accord
AUT|Austria|Coalition Migration Debate;Integration Agreements;Asylum Reform|Vienna Municipal Compact;Alpine Seasonal Worker Charter
ITA|Italy|Mediterranean Arrivals;Reception Reform;Regularization or Deportation Expansion|Revive Depopulating Towns;Agricultural Labor Inspectorate;Municipal Reception Contracts
ESP|Spain|Atlantic and Mediterranean Migration;Work Permit Reform;Regional Integration|Canary Islands Reception Compact;Rural Repopulation Visas;Seasonal Harvest Guarantee
PRT|Portugal|Lusophone Migration Networks;Residency Backlogs;Migration Administration Reform|One-Stop Residency Offices;Interior Settlement Grants
GRC|Greece|Aegean Migration Routes;EU Border Cooperation;Reception Reform|Island Municipality Relief;Mainland Housing Transfer
MLT|Malta|Mediterranean Reception Capacity;EU Relocation Negotiations;Small-State Migration Model|Port Reception Partnership;Employer Accommodation Levy
CYP|Cyprus|Eastern Mediterranean Asylum Pressures;Processing Reform;EU Burden Sharing|Island Processing Courts;Municipal Housing Compact
AND|Andorra|Foreign Workforce Dependence;Residency Quotas;Housing and Labor Balance|Seasonal Worker Accommodation;Pyrenean Mobility Accord
MCO|Monaco|Cross-Border Workforce;Residence Restrictions;Labor Mobility Agreement|Commuter Transit Investment;Domestic Staff Protections
SMR|San Marino|Small-State Labor Mobility;Residence Reform;Italian Cooperation|Frontier Worker Registry;Portable Pension Agreement
VAT|Vatican City|Humanitarian Diplomacy;Refugee Advocacy;International Solidarity|Parish Sponsorship Network;Humanitarian Mediation Service
LIE|Liechtenstein|Daily Commuter Dependence;Residence Permit Ballot;Alpine Labor Settlement|Rhine Valley Transport Pact;Small-State Skills Compact
POL|Poland|Ukrainian Refugee Integration;Labor Shortages;Eastern Border Strategy|Polish-Ukrainian Credential Bridge;Municipal School Expansion;Return or Settlement Guarantees
CZE|Czechia|Industrial Workforce Shortage;Foreign Worker Recruitment;Integration Policy|Industrial Town Housing;Employer Recruitment Bonds
SVK|Slovakia|Industrial Labor Demand;Regional Worker Programs;Migration Policy Reform|Automotive Skills Bridge;Regional Language Centers
HUN|Hungary|Sovereignty and Border Control;Guest Worker Quotas;National Migration Doctrine|Guest Worker Employer Bonds;Diaspora Skills Return
ROU|Romania|Workforce Emigration;Return Migration Incentives;Foreign Labor Recruitment|Diaspora Business Grants;Portable Pension Return
BGR|Bulgaria|Population Decline;Return Migration;Workforce Stabilization|Village Renewal Grants;Diaspora Credential Window
HRV|Croatia|Tourism Labor Shortage;Seasonal Migration;Long-Term Residency|Adriatic Worker Housing;Tourism Skills Ladder
SVN|Slovenia|Balkan Transit Routes;Asylum Administration;Integration Reform|Transit Municipality Support;Regional Credential Exchange
SRB|Serbia|Balkan Migration Corridor;Border Coordination;Labor Mobility Agreements|Open Balkan Worker Charter;Diaspora Enterprise Window
BIH|Bosnia and Herzegovina|Transit Route Management;Reception Capacity;Institutional Coordination|Entity Reception Compact;Joint Residency Registry
MNE|Montenegro|Tourism and Seasonal Workers;Residency Oversight;Migration Reform|Coastal Worker Housing;Seasonal Permit Portability
ALB|Albania|Emigration and Brain Drain;Diaspora Return;Skilled Worker Recruitment|Diaspora Investment Bonds;Returning Graduate Fellowship
MKD|North Macedonia|Youth Emigration;Diaspora Investment;Labor Mobility|Returnee Startup Window;Regional Pension Portability
XKX|Kosovo|Diaspora Remittances;Return Migration;Employment Reform|Diaspora Apprenticeships;Remittance Investment Match
EST|Estonia|Digital Talent Recruitment;Residency and Integration;Population Strategy|Digital Nomad Settlement Bridge;Estonian Workplace Tuition
LVA|Latvia|Population Decline;Labor Migration;Language Integration|Diaspora Homecoming Grants;Regional School Renewal
LTU|Lithuania|Return Migration;Skilled Worker Programs;Demographic Stabilization|Returning Families Housing;Technology Talent Compact
MDA|Moldova|Emigration and Remittances;Diaspora Return;Workforce Renewal|Village Enterprise Revival;Portable Social Insurance
UKR|Ukraine|Wartime Displacement;Refugee Return;Reconstruction Labor Strategy|Safe Return Housing Guarantee;Reconstruction Skills Corps;Displaced Qualifications Recovery
BLR|Belarus|Emigration and Political Isolation;Labor Retention;Migration Policy|Returnee Legal Guarantees;Industrial Skills Retention
RUS|Russia|Central Asian Labor Migration;Work Permit Reform;Assimilation or Labor Market Integration|Portable Work Patents;Regional Recruitment Bargain;Migrant Worker Wage Inspectorate
GEO|Georgia|Emigration and Transit;Diaspora Return;Residency Reform|Diaspora Enterprise Funds;Transit City Housing Compact
ARM|Armenia|Diaspora Repatriation;Skilled Returnees;Population Renewal|Diaspora Credential Recognition;Returnee Housing Cooperatives
AZE|Azerbaijan|Regional Labor Mobility;Work Permit Reform;Economic Diversification|Non-Oil Talent Visas;Caspian Skills Exchange
TUR|Türkiye|Syrian Refugee Policy;Voluntary Return Programs or Long-Term Integration;National Migration Settlement|Municipal Refugee Funding;Safe Return Verification;Formal Employment Transition
CAN|Canada|Immigration Levels Review;International Student Reform;Housing Capacity or Economic Immigration Expansion|Provincial Nominee Bargain;Rural Health Recruitment;College Recruitment Accountability
USA|United States|Border and Asylum Reform;Employment Visas or Enforcement Expansion;Immigration Settlement|Immigration Court Staffing;State-Federal Reception Compact;Farmworker Status Bargain
CHN|China|Foreign Talent Recruitment;Residence Permit Reform;Selective Internationalization|Research Talent Residence;Pilot City Settlement Zones;Returnee Innovation Grants
JPN|Japan|Aging Society;Specified Skilled Worker Expansion;Permanent Settlement or Temporary Labor Model|Rural Care Workforce;Employer Language Obligation;Family Settlement School Places
KOR|South Korea|Demographic Decline;Employment Permit Reform;Multicultural Family Integration|Provincial Settlement Visas;Multilingual School Support;Employer Transfer Rights
AUS|Australia|Migration Program Review;International Education Reform;Housing and Skilled Migration Balance|Regional Skills Guarantee;University Housing Levy;Pacific Worker Protections
NZL|New Zealand|Accredited Employer Reform;Pacific Labor Mobility;Long-Term Settlement|Employer Accreditation Audit;Pacific Pension Portability;Regional Health Recruitment
KAZ|Kazakhstan|Regional Labor Crossroads;Returnee Settlement Reform;Eurasian Migration Compact|Skills Beyond Extractive Industries;Regional Housing Guarantees
`.trim();
export const NATIONAL_IMMIGRATION = Object.fromEntries(NATIONAL.split('\n').map((line) => {
  const [iso, name, chain, extra] = line.split('|');
  return [iso, { name, chain: chain.split(';'), extra: extra.split(';') }];
}));

// Modifier units: admission/family/asylum multipliers; capacity additions in 0..1;
// spending is percentage points of GDP per year, population additions are never direct.
const policy = (id, name, lane, effects, desc, options = {}) => ({ id, name, lane, effects, desc, days: 70, ...options });
export const SHARED_IMMIGRATION = [
  policy('question', 'The Immigration Question', 0, { administration: .03, spending: .01 }, 'Open the national debate over labor demand, identity, housing and humanitarian obligations.', { days: 35 }),
  policy('restriction', DOCTRINES.restriction, 1, { admissions: -.3, enforcement: .15, polarization: .08, spending: .08 }, 'Commit to fewer admissions and stronger enforcement. Employers face a tighter recruitment market.', { doctrine: 'restriction' }),
  policy('integration', DOCTRINES.integration, 2, { language: .18, credentials: .12, inclusion: .08, spending: .16 }, 'Fund access to language, employment and civic institutions. Delivery takes time and public money.', { doctrine: 'integration' }),
  policy('multicultural', DOCTRINES.multicultural, 3, { admissions: .3, family: .15, inclusion: .1, polarization: .06, spending: .1 }, 'Expand legal settlement and pluralism. Housing and service capacity must keep pace.', { doctrine: 'multicultural' }),
  policy('borders', 'Secure the Borders', 1, { enforcement: .2, spending: .08 }, 'Reduce unauthorized arrivals through funded border administration. Legal admissions remain a separate decision.'),
  policy('caps', 'End Mass Immigration', 1, { admissions: -.35, family: -.15, polarization: .06 }, 'Lower legal admission caps. Slower workforce renewal can leave vacancies unfilled.'),
  policy('removals', 'Expand Deportation Authority', 1, { removals: .3, legal: -.08, diplomacy: -.1, spending: .1 }, 'Authorize more removals, limited by court capacity and the pool of residents without status.'),
  policy('assimilation', 'Mandatory Civic Assimilation', 1, { language: .12, coercion: .2, inclusion: -.1, spending: .1 }, 'Impose civic and language obligations. Compliance burdens and legal challenges can undermine trust.'),
  policy('identity', 'National Identity Campaign', 1, { nationalist: .15, polarization: .15, spending: .03 }, 'Mobilize sovereignty-minded voters while widening the political divide.'),
  policy('domestic', 'Prioritize Domestic Workers', 1, { domesticTraining: .15, admissions: -.12, spending: .12 }, 'Subsidize domestic skills. Training takes time, so employers may initially struggle to recruit.'),
  policy('strategy', 'National Integration Strategy', 2, { language: .12, credentials: .1, administration: .08, spending: .12 }, 'Coordinate language classes, qualification recognition and municipal delivery.'),
  policy('diversity', 'Expand Diversity Training', 4, { inclusion: .12, spending: .06 }, 'Train public institutions to remove practical barriers to service access.', { opposite: 'abolish_diversity' }),
  policy('safety', 'Public Safety and Anti-Sexual-Violence Campaigns', 4, { prevention: .18, services: .12, spending: .12 }, 'Fund prevention, survivor support and accessible reporting for the entire population.'),
  policy('civic', 'Mandatory Civic Education', 2, { civic: .18, coercion: .03, spending: .06 }, 'Provide civic education with attendance obligations and accessible instruction.'),
  policy('employment', 'Integration Through Employment', 2, { credentials: .2, workerProtection: .08, spending: .08 }, 'Make qualifications portable and open pathways into formal employment.'),
  policy('community', 'Community Policing Initiatives', 4, { trust: .12, prevention: .08, spending: .08 }, 'Build local reporting and prevention partnerships. Results depend on public trust.', { opposite: 'central_policing' }),
  policy('culture', 'Celebrate Cultural Diversity', 3, { inclusion: .12, polarization: .08, spending: .03 }, 'Recognize cultural participation while accepting the political contest over national identity.'),
  policy('family', 'Expand Family Reunification', 4, { family: .35, inclusion: .05, spending: .03 }, 'Increase family settlement and demand for homes, schools and services.', { opposite: 'restrict_family' }),
  policy('discrimination', 'Anti-Discrimination Legislation', 3, { workerProtection: .15, inclusion: .12, legal: .05, spending: .08 }, 'Create enforceable protections and fund the institutions needed to hear complaints.'),
  policy('corridors', 'Open Humanitarian Corridors', 3, { asylum: .45, diplomacy: .15, spending: .1 }, 'Expand protected entry routes and refugee reception commitments.'),
  policy('education', 'Multicultural Education Reform', 4, { inclusion: .15, civic: .06, polarization: .08, spending: .08 }, 'Expand intercultural teaching. Curriculum disputes require political negotiation.', { opposite: 'standard_civic' }),
  policy('growth', 'Immigration-Led Growth', 3, { admissions: .3, credentials: .1, spending: .04 }, 'Recruit workers and grow consumer demand; extra residents also need homes.'),
  policy('abolish_diversity', 'Abolish Mandatory Diversity Training', 4, { inclusion: -.08, spending: -.02, nationalist: .06 }, 'Reduce mandatory training and its expense, at the cost of institutional inclusion.', { opposite: 'diversity' }),
  policy('asylum_rights', 'Expand Asylum Protections', 4, { asylum: .25, legal: .12, spending: .08 }, 'Broaden access to protection and legal review.', { opposite: 'asylum_tight' }),
  policy('asylum_tight', 'Tighten Asylum Eligibility', 4, { asylum: -.3, legal: -.06, diplomacy: -.08 }, 'Narrow eligibility. Rejected claims still require lawful processing.', { opposite: 'asylum_rights' }),
  policy('naturalization', 'Accelerate Naturalization', 4, { naturalization: .3, civic: .08, spending: .05 }, 'Speed citizenship processing for eligible long-term residents.', { opposite: 'residency' }),
  policy('residency', 'Extend Residency Requirements', 4, { naturalization: -.3, inclusion: -.06, nationalist: .06 }, 'Delay citizenship eligibility and political participation.', { opposite: 'naturalization' }),
  policy('standard_civic', 'Standardized Civic Curriculum', 4, { civic: .16, inclusion: -.04, spending: .04 }, 'Set a common civic syllabus with less room for local curriculum choices.', { opposite: 'education' }),
  policy('restrict_family', 'Restrict Family Sponsorship', 4, { family: -.35, inclusion: -.08, nationalist: .05 }, 'Reduce family admissions; isolation may increase onward migration.', { opposite: 'family' }),
  policy('regularize', 'Regularize Undocumented Workers', 4, { regularization: .3, credentials: .06, polarization: .1, spending: .05 }, 'Move eligible residents into lawful work through a funded status review.', { opposite: 'enforcement' }),
  policy('enforcement', 'Expand Immigration Enforcement', 4, { enforcement: .15, removals: .15, spending: .1 }, 'Expand inspections and lawful removals; administrative and court limits still apply.', { opposite: 'regularize' }),
  policy('national_prevention', 'National Anti-Sexual-Violence Initiative', 4, { prevention: .2, services: .15, justice: .1, spending: .18 }, 'Coordinate prevention, survivor services and judicial capacity across the whole population.', { opposite: 'local_prevention', req: ['safety'] }),
  policy('local_prevention', 'Decentralize Prevention to Local Governments', 4, { prevention: .12, services: .16, administration: -.04, spending: .1 }, 'Let local services tailor prevention; uneven administrative capacity limits delivery.', { opposite: 'national_prevention', req: ['safety'] }),
  policy('central_policing', 'Expand Centralized Enforcement', 4, { justice: .15, trust: -.05, spending: .1 }, 'Strengthen national investigative capacity with a potential cost to local trust.', { opposite: 'community' }),
  policy('mandatory_language', 'Mandatory Language Education', 4, { language: .2, coercion: .08, spending: .1 }, 'Require attendance while paying for teaching capacity and compliance administration.', { opposite: 'voluntary_language' }),
  policy('voluntary_language', 'Voluntary Language Incentives', 4, { language: .12, trust: .06, spending: .07 }, 'Offer flexible tuition and participation incentives.', { opposite: 'mandatory_language' }),
  policy('protections', 'Expand Migrant Worker Protections', 4, { workerProtection: .2, credentials: .04, spending: .08 }, 'Inspect workplaces and provide portable complaint mechanisms.', { opposite: 'deregulate' }),
  policy('deregulate', 'Deregulate Temporary Labor Programs', 4, { admissions: .15, workerProtection: -.12, spending: -.02 }, 'Speed recruitment while weakening protections against exploitation.', { opposite: 'protections' }),
  policy('housing', 'Build Homes Before Raising Caps', 4, { housing: .25, admissions: -.1, spending: .2 }, 'Expand housing supply while temporarily restraining recruitment.', { opposite: 'demand_led' }),
  policy('demand_led', 'Let Demand Lead Construction', 4, { admissions: .2, housing: .08, polarization: .05, spending: .04 }, 'Recruit first and rely on a slower housing response.', { opposite: 'housing' }),
  policy('municipal', 'Municipal Reception Dividend', 4, { administration: .15, housing: .12, spending: .15 }, 'Pay receiving municipalities to expand services and accommodation.'),
  policy('courts', 'Clear the Asylum Court Backlog', 4, { justice: .25, administration: .1, spending: .12 }, 'Fund judges, caseworkers and interpreters so claims receive timely decisions.'),
  policy('ombudsman', 'Independent Migration Ombudsman', 4, { legal: .18, trust: .1, spending: .04 }, 'Investigate abuses and give residents an accessible route to redress.'),
  policy('ethical', 'Ethical Health-Worker Recruitment', 4, { credentials: .15, diplomacy: .12, admissions: -.04, spending: .05 }, 'Pair overseas recruitment with training partnerships in source countries.'),
  policy('brain_drain', 'Compete for Global Talent', 4, { admissions: .2, credentials: .16, diplomacy: -.08, spending: .08 }, 'Attract scarce skills; source countries may object to losing trained workers.'),
  policy('diaspora', 'Diaspora Return Guarantee', 4, { returnMigration: .25, credentials: .1, spending: .1 }, 'Offer returnees recognition and settlement support, with a continuing fiscal commitment.'),
  policy('pensions', 'Portable Pension Agreements', 4, { returnMigration: .12, trust: .06, diplomacy: .1, spending: .04 }, 'Make cross-border retirement contributions portable.'),
  policy('sponsor', 'Community Sponsorship Compact', 4, { services: .15, inclusion: .1, asylum: .12, spending: .05 }, 'Partner with community sponsors while retaining public oversight.'),
  policy('childcare', 'Childcare for Workforce Entry', 4, { participation: .16, inclusion: .04, spending: .15 }, 'Remove care barriers to employment for residents who need support.'),
  policy('student', 'Student-to-Work Transition', 4, { credentials: .15, admissions: .1, spending: .04 }, 'Retain graduates through transparent work and residency pathways.'),
  policy('rural', 'Revive Shrinking Towns', 4, { housing: .15, administration: .08, spending: .12 }, 'Rehabilitate vacant homes and fund local settlement capacity.'),
  policy('recruitment_bonds', 'Employer Recruitment Bonds', 4, { workerProtection: .18, admissions: -.06, spending: .03 }, 'Require recruiters to guarantee wages and accommodation.'),
  policy('digital', 'One-Stop Migration Service', 4, { administration: .2, credentials: .08, spending: .07 }, 'Unify appointments and records while preserving independent appeals.'),
  policy('data', 'Publish the Capacity Ledger', 4, { trust: .12, administration: .06, spending: .02 }, 'Publish housing, admissions and processing figures to inform public debate.'),
  policy('language_jobs', 'Paid Workplace Language Hours', 4, { language: .18, participation: .08, spending: .1 }, 'Bring language tuition into the working day.'),
  policy('visa_portability', 'Untie Visas from Employers', 4, { workerProtection: .2, participation: .08, spending: .05 }, 'Let temporary workers change jobs without losing lawful status.'),
  policy('circular', 'Circular Migration Agreements', 4, { admissions: .1, circular: .25, diplomacy: .1, spending: .04 }, 'Expand lawful seasonal mobility with more departures as contracts end.'),
  policy('climate', 'Climate Displacement Protocol', 4, { asylum: .2, diplomacy: .15, spending: .08 }, 'Prepare protected pathways and reception commitments before displacement grows.'),
  policy('children', 'No Lost School Years', 4, { language: .1, civic: .12, services: .1, spending: .12 }, 'Fund language bridging and school places for children with interrupted education.'),
  policy('reunite', 'Family Tracing Service', 4, { trust: .1, services: .1, spending: .05 }, 'Help separated families navigate tracing and existing reunification rules.'),
  policy('inspections', 'End Recruitment Debt', 4, { workerProtection: .2, justice: .05, spending: .08 }, 'Inspect recruitment fees and give indebted workers access to remedies.'),
  policy('citizens_panel', 'Citizens Assembly on Settlement', 4, { polarization: -.15, civic: .1, spending: .04 }, 'Create a deliberative forum for residents to negotiate practical compromises.'),
  policy('sunset', 'Sunset Emergency Border Powers', 4, { legal: .15, enforcement: -.08, trust: .07 }, 'Return emergency powers to ordinary legislative and judicial scrutiny.'),
  policy('appeals', 'Independent Residency Appeals', 4, { legal: .18, justice: .12, spending: .08 }, 'Fund timely appeals rather than letting unresolved cases accumulate.'),
];

const NATIONAL_PACKAGES = [
  { administration: .1, spending: .04 },
  { credentials: .12, language: .06, spending: .08 },
  { housing: .12, services: .08, spending: .12 },
  { civic: .1, polarization: -.05, spending: .04 },
];
const extraEffects = (name) => /Housing|Accommodation|School|Reception|Settlement|Municipal/.test(name)
  ? { housing: .15, services: .08, spending: .12 }
  : /Return|Diaspora|Pension|Remittance/.test(name)
    ? { returnMigration: .15, credentials: .08, diplomacy: .04, spending: .08 }
    : /Audit|Inspector|Protection|Accountability|Bonds|Rights|Guarantee/.test(name)
      ? { workerProtection: .15, administration: .08, spending: .07 }
      : { credentials: .15, language: .08, spending: .08 };

export function buildImmigrationTree(iso) {
  const country = NATIONAL_IMMIGRATION[iso];
  if (!country) return null;
  const id = (key) => `${iso}_IMM_${key}`;
  const rows = Array(7).fill(0);
  const focuses = [];
  const add = (f) => {
    const row = rows[f.lane]++;
    focuses.push({
      ...f, id: id(f.id), category: 'immigration', x: f.lane * 2, y: row + (f.lane ? 2 : 0),
      req: (f.req ?? ['question']).map(id), reqAll: true,
      mutex: (f.mutex ?? (f.opposite ? [f.opposite] : [])).map(id),
      fx: { immigration: { id: id(f.id), effects: f.effects, doctrine: f.doctrine, targets: f.targets, regionalDoctrine: f.regionalDoctrine, settlement: f.settlement } },
    });
  };
  for (const f of SHARED_IMMIGRATION) {
    const req = f.id === 'question' ? [] : f.doctrine ? ['national_0'] : f.req ?? (f.lane > 0 && f.lane < 4 ? [Object.keys(DOCTRINES)[f.lane - 1]] : ['national_0']);
    add({ ...f, req, mutex: f.doctrine ? Object.keys(DOCTRINES).filter((key) => key !== f.doctrine) : undefined });
  }
  country.chain.forEach((name, i) => {
    // "or" entries are real forks, not a single button granting both outcomes.
    const choices = name.split(' or ');
    choices.forEach((choice, j) => add(policy(`national_${i}${j ? '_alternative' : ''}`, choice, 0,
      choices.length > 1 ? (j ? { admissions: -.18, enforcement: .15, spending: .08 } : { inclusion: .1, credentials: .15, spending: .12 }) : NATIONAL_PACKAGES[i % 4],
      `${country.name} negotiates ${choice.toLowerCase()}. Implementation draws on the same courts, services and housing as the rest of migration policy.`,
      { req: i ? [`national_${i - 1}`] : ['question'], ...(i && country.chain[i - 1].includes(' or ') ? { previousAlternative: id(`national_${i - 1}_alternative`) } : {}),
        mutex: choices.length > 1 ? [`national_${i}${j ? '' : '_alternative'}`] : [], days: i === 0 ? 35 : 70 })));
  });
  // A split national prerequisite accepts either preceding branch.
  for (const f of focuses) if (f.previousAlternative) { f.req.push(f.previousAlternative); f.reqAll = false; }
  country.extra.forEach((name, i) => add(policy(`local_${i}`, name, 0, extraEffects(name),
    `${name} addresses ${country.name}'s settlement bargain. Benefits depend on delivery capacity; the annual program must remain funded.`,
    { req: country.chain[1].includes(' or ') ? ['national_0'] : ['national_1'],
      ...(country.chain[1].includes(' or ') ? { requiresAny: [id('national_1'), id('national_1_alternative')] } : {}) })));
  // Additional country-specific institutional bargains keep major trees substantial.
  const major = country.extra.length >= 3;
  const bargains = major ? ['Regional Delivery Compact', 'Employer Settlement Contribution', 'Five-Year Capacity Plan', 'Migration Accountability Hearings', 'National Settlement Referendum'] : ['Local Capacity Agreement'];
  bargains.forEach((name, i) => add(policy(`bargain_${i}`, `${country.name}: ${name}`, 0,
    NATIONAL_PACKAGES[i % 4], 'Trade administrative and fiscal commitments for a durable settlement. Programs deliver gradually and remain exposed to local capacity limits.',
    { req: [`local_${i % country.extra.length}`] })));
  Object.entries(DOCTRINES).forEach(([doctrine, name]) => add(policy(`settlement_${doctrine}`, `${country.name}: ${name}`, 0,
    { administration: .1, polarization: -.06, spending: .04 }, 'Entrench the chosen doctrine in a national settlement. The opposing settlements become unavailable.',
    { req: [doctrine], settlement: doctrine, nationalEnd: true, mutex: Object.keys(DOCTRINES).filter((key) => key !== doctrine).map((key) => `settlement_${key}`) })));
  const endKeys = country.chain.at(-1).includes(' or ') ? [`national_${country.chain.length - 1}`, `national_${country.chain.length - 1}_alternative`] : [`national_${country.chain.length - 1}`];
  for (const f of focuses) if (f.nationalEnd) f.requiresAny = endKeys.map(id);

  for (const [region, lane, label] of [['south_asia', 5, 'South Asian'], ['sub_saharan_africa', 6, 'Sub-Saharan African']]) {
    for (const [key, name, effects] of [
      ['restrict', 'Restrictive admission policy', { admissions: -.4, language: .04, spending: .03 }],
      ['integrate', 'Integration-first policy', { language: .2, credentials: .15, spending: .09 }],
      ['expand', 'Expanded legal migration', { admissions: .4, family: .15, spending: .05 }],
    ]) add(policy(`${region}_${key}`, `${label}: ${name}`, lane, effects,
      'Apply this regional program to actual migration pathways and eligible residents. Country of origin never determines safety or political preferences.',
      { req: ['national_0'], targets: { origin_regions: [region], migration_status: ['permanent_resident', 'temporary_resident', 'asylum_pending', 'undocumented'] },
        regionalDoctrine: { region, doctrine: key }, mutex: ['restrict', 'integrate', 'expand'].filter((d) => d !== key).map((d) => `${region}_${d}`) }));
    [
      ['qualifications', `Recognize ${label} Qualifications`, { credentials: .2, spending: .06 }],
      ['graduates', 'Reform Student-to-Work Pathways', { credentials: .12, admissions: .1, spending: .04 }],
      ['language', 'Expand Language and Civic Programs', { language: .2, civic: .1, spending: .08 }],
      ['bilateral', 'Negotiate Bilateral Labor Agreements', { workerProtection: .1, admissions: .1, diplomacy: .08, spending: .04 }],
      ['ethical', 'Fund Skills Partnerships in Origin Countries', { credentials: .1, diplomacy: .15, spending: .09 }],
      ['portable', 'Portable Qualifications and Pensions', { credentials: .1, circular: .1, spending: .04 }],
    ].forEach(([key, name, effects]) => add(policy(`${region}_${key}`, name, lane, effects,
      'Eligibility follows residency status and unmet needs. The region filter contains distinct origin countries, not a single homogeneous population.',
      { req: ['national_0'], targets: { origin_regions: [region], migration_status: ['permanent_resident', 'temporary_resident'] } })));
  }
  return { title: `${country.name} — The Immigration Question`, lanes: IMMIGRATION_LANES, focuses };
}

export const IMMIGRATION_TREES = Object.fromEntries(Object.keys(NATIONAL_IMMIGRATION).map((iso) => [iso, buildImmigrationTree(iso)]));

// Country membership is a scenario taxonomy. Afghanistan can be moved independently.
export const ORIGIN_REGIONS = { domestic: 'Native-born', south_asia: 'South Asia', sub_saharan_africa: 'Sub-Saharan Africa', other: 'Other origins' };
const countries = (region, subregion, text) => text.split(';').map((s) => {
  const [iso, name] = s.split(':');
  return { iso, name, region, subregion };
});
export const ORIGINS = [
  ...countries('south_asia', 'south_asia', 'IND:India;PAK:Pakistan;BGD:Bangladesh;LKA:Sri Lanka;NPL:Nepal;BTN:Bhutan;MDV:Maldives'),
  ...countries('other', 'central_south_asia', 'AFG:Afghanistan'),
  ...countries('sub_saharan_africa', 'west_africa', 'NGA:Nigeria;GHA:Ghana;SEN:Senegal;CIV:Côte d’Ivoire;MLI:Mali'),
  ...countries('sub_saharan_africa', 'east_africa', 'KEN:Kenya;ETH:Ethiopia;SOM:Somalia;UGA:Uganda;TZA:Tanzania'),
  ...countries('sub_saharan_africa', 'central_africa', 'COD:Democratic Republic of the Congo;CMR:Cameroon;COG:Republic of the Congo'),
  ...countries('sub_saharan_africa', 'southern_africa', 'ZAF:South Africa;ZWE:Zimbabwe;NAM:Namibia'),
  ...countries('other', 'europe', 'UKR:Ukraine;POL:Poland;ROU:Romania;GBR:United Kingdom;DEU:Germany;ITA:Italy'),
  ...countries('other', 'middle_east', 'SYR:Syria;TUR:Türkiye'),
  ...countries('other', 'central_asia', 'UZB:Uzbekistan;TJK:Tajikistan'),
  ...countries('other', 'east_asia', 'CHN:China;PHL:Philippines'),
  ...countries('other', 'americas', 'MEX:Mexico;USA:United States'),
  ...countries('other', 'pacific', 'FJI:Fiji;WSM:Samoa'),
];
