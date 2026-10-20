import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMOGRAPHIC_TREE, DEMOGRAPHIC_PROPOSALS } from '../src/data/demographicDoctrine.js';
import { createDemographicPolicy, applyDemographicEffect, demographicDecisions, introduceDemographicPolicy, demographicMonth, interculturalMarriageModel } from '../src/game/demographicPolicy.js';
import { Game } from '../src/game/game.js';

const byId = (suffix) => DEMOGRAPHIC_TREE.focuses.find((f) => f.id === `UDL_DEM_${suffix}`);
const country = (democratic = true) => ({
  index: 1, iso3: 'USA', pop: 10, debt: 50, stability: 60, ideology: democratic ? 'dem' : 'aut',
  gov: democratic ? 'Federal presidential republic' : 'Authoritarian republic',
  spirits: democratic ? ['constitutional_checks'] : [], blocs: democratic ? ['EU'] : [],
  politics: { next: democratic ? '2028-01-01' : null },
  demographicPolicy: createDemographicPolicy(), immigration: null,
});
const game = () => ({ time: 0, player: 9, pendingEvents: [], logs: [], log(message) { this.logs.push(message); }, emit() {} });

test('all requested focuses exist and the three doctrines exclude one another', () => {
  for (const name of [
    'The Demographic Question', 'National Identity Commission', 'The Future of National Identity',
    'Promote Interracial Dating', 'Promote Interracial Marriage', 'Expand Intercultural Social Programs',
    'National Family Formation Campaign', 'Crack Down on Anti-Natalist Propaganda',
    'Ban Interracial Pornography', 'Ban Same-Race Marriages', 'Guarantee Freedom of Marriage',
    'Intercultural Community Grants', 'Protect Marriage Equality',
  ]) assert.ok(DEMOGRAPHIC_TREE.focuses.some((f) => f.name === name), name);
  for (const doctrine of ['voluntary', 'pronatalist', 'coercive']) {
    const f = byId(doctrine);
    assert.equal(f.mutex.length, 2);
    assert.deepEqual(f.req, [byId('future').id]);
  }
  const n = country();
  n.focus = { done: new Set([byId('future').id, byId('voluntary').id]), current: null };
  const context = { tree: () => DEMOGRAPHIC_TREE };
  assert.equal(Game.prototype.focusState.call(context, n, byId('pronatalist')), 'blocked');
  assert.equal(Game.prototype.focusState.call(context, n, byId('dating')), 'available');
});

test('completion unlocks a proposal and a decision, without changing population or fertility', () => {
  const n = country();
  const before = { pop: n.pop, fertility: n.demographics?.fertility };
  applyDemographicEffect(game(), n, { legislation: true, doctrine: 'voluntary', proposal: 'dating' });
  assert.equal(demographicDecisions(n).length, 1);
  assert.equal(introduceDemographicPolicy(game(), n, 'dating'), true);
  assert.deepEqual(n.demographicPolicy.active, ['dating']);
  assert.equal(n.pop, before.pop);
  assert.equal(n.demographics?.fertility, before.fertility);
  demographicMonth(game(), n);
  assert.ok(n.demographicPolicy.socialContact > 0);
});

test('coercive laws face constitutional review before any enforcement effect', () => {
  const n = country();
  const g = game();
  applyDemographicEffect(g, n, { legislation: true, doctrine: 'coercive', proposal: 'sameRace' });
  assert.equal(introduceDemographicPolicy(g, n, 'sameRace'), true);
  assert.equal(n.demographicPolicy.active.length, 0);
  assert.equal(n.demographicPolicy.pending.length, 1);
  assert.equal(n.demographicPolicy.registrationDisruption, 0);
  g.time = 61 * 86400000;
  demographicMonth(g, n);
  assert.ok(n.demographicPolicy.rejected.includes('sameRace'));
  assert.equal(n.demographicPolicy.registrationDisruption, 0);
  assert.equal(n.pop, 10);
});

test('contact policy changes opportunity but never the model preference assumption', () => {
  const n = country();
  n.immigration = { cohorts: [
    { origin: 'USA', population: 900, age: { working: .6 } },
    { origin: 'IND', population: 100, age: { working: .8 } },
  ] };
  const baseline = interculturalMarriageModel(n);
  n.demographicPolicy.socialContact = DEMOGRAPHIC_PROPOSALS.dating.modifiers.socialContact;
  const changed = interculturalMarriageModel(n);
  assert.ok(changed.rate > baseline.rate);
  assert.equal(changed.assumptions.mutualPreference, baseline.assumptions.mutualPreference);
});

test('AI democracies never adopt the coercive doctrine; autocracies may', () => {
  const coercive = byId('coercive');
  assert.equal(coercive.ai(country(true)), false);
  assert.equal(coercive.ai(country(false)), true);
});

test('AI governments introduce unlocked proposals, but democracies skip coercive ones', () => {
  const g = { ...game(), r: () => 0 };
  const dem = country(true);
  dem.index = 2; dem.pp = 100;
  applyDemographicEffect(g, dem, { legislation: true, doctrine: 'coercive', proposal: 'propaganda' });
  demographicMonth(g, dem);
  assert.equal(dem.demographicPolicy.pending.length, 0);
  assert.equal(dem.pp, 100);
  const aut = country(false);
  aut.index = 3; aut.pp = 100;
  applyDemographicEffect(g, aut, { legislation: true, doctrine: 'coercive', proposal: 'propaganda' });
  demographicMonth(g, aut);
  assert.equal(aut.demographicPolicy.pending.length, 1);
  assert.equal(aut.pp, 100 - DEMOGRAPHIC_PROPOSALS.propaganda.cost);
});

test('the marriage program opens a debate whose choice adjusts program support', () => {
  const g = game();
  const n = country();
  g.player = n.index;
  applyDemographicEffect(g, n, { legislation: true, doctrine: 'voluntary', proposal: 'marriage' });
  introduceDemographicPolicy(g, n, 'marriage');
  assert.equal(g.pendingEvents.length, 1);
  const { def } = g.pendingEvents[0];
  assert.equal(def.id, 'UDL.intercultural_marriage_debate');
  applyDemographicEffect(g, n, def.options[0].fx.demographic);
  for (let i = 0; i < 24; i++) demographicMonth(g, n);
  const target = DEMOGRAPHIC_PROPOSALS.marriage.modifiers.voluntaryMarriageSupport;
  assert.ok(n.demographicPolicy.supportCapacity > target);
});
