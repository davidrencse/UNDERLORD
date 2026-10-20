// Conscription laws, after Hearts of Iron IV's ladder: each rung draws a larger share of the
// military-age population and costs more in industry, training quality and public patience.
//
// The shares are a share of the *recruitable pool* (ages 18-45, weighted by sex and by how much
// of the country is willing to serve), not of the whole population, so a country with an old
// population raises fewer soldiers off the same law than a young one.

export const CONSCRIPTION = [
  {
    key: 'disarmed', name: 'Disarmed nation', short: 'Disarmed',
    desc: 'The state keeps no army worth the name. A treaty, an occupier or a constitution says so.',
    share: 0.005, female: 0.05, training: 0.35, factories: 0, stab: 2, ws: -10, growth: 0.2,
    needWs: 0, peacetimeDemocracy: true,
  },
  {
    key: 'volunteer', name: 'Volunteer only', short: 'Volunteer',
    desc: 'A professional force. Nobody serves who did not choose to.',
    share: 0.015, female: 0.14, training: 0, factories: 0, stab: 0, ws: 0, growth: 0,
    needWs: 0, peacetimeDemocracy: true,
  },
  {
    key: 'limited', name: 'Limited conscription', short: 'Limited',
    desc: 'A draft with wide exemptions: students, only sons, essential industries.',
    share: 0.025, female: 0.1, training: 0.05, factories: -0.01, stab: -1, ws: 2, growth: -0.05,
    needWs: 10, peacetimeDemocracy: true,
  },
  {
    key: 'extensive', name: 'Extensive conscription', short: 'Extensive',
    desc: 'Most fit men of age are called. Exemptions shrink to the critical trades.',
    share: 0.05, female: 0.08, training: 0.1, factories: -0.03, stab: -3, ws: 4, growth: -0.3,
    needWs: 20, peacetimeDemocracy: false,
  },
  {
    key: 'required', name: 'Service by requirement', short: 'Required',
    desc: 'Service is a duty of citizenship. Industry starts to feel the men it has lost.',
    share: 0.1, female: 0.08, training: 0.15, factories: -0.08, stab: -6, ws: 6, growth: -0.8,
    needWs: 40, peacetimeDemocracy: false,
  },
  {
    key: 'all_adults', name: 'All adults serve', short: 'All adults',
    desc: 'Every adult body the state can find. Factories run on whoever is left.',
    share: 0.2, female: 0.3, training: 0.25, factories: -0.15, stab: -10, ws: 8, growth: -1.8,
    needWs: 70, peacetimeDemocracy: false,
  },
  {
    key: 'scraping', name: 'Scraping the barrel', short: 'Barrel',
    desc: 'The boys and the old men. A country that enacts this is spending its future.',
    share: 0.25, female: 0.4, training: 0.4, factories: -0.25, stab: -15, ws: 10, growth: -3.2,
    needWs: 90, peacetimeDemocracy: false,
  },
];

export const LAW_INDEX = new Map(CONSCRIPTION.map((l, i) => [l.key, i]));
export const lawOf = (key) => CONSCRIPTION[LAW_INDEX.get(key) ?? 1];
export const CONSCRIPTION_PP = 150; // political power to move one rung, as in HOI4
