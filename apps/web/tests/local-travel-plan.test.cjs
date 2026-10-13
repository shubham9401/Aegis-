require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localTravelPlan } = require('../src/lib/local-travel-plan.ts');

const merchant = '0x792e485C5A756Dc2e22AF9Cda70c10fC3754b8b6';

test('local planner uses only the explicit amount and merchant wallet', () => {
  const plan = localTravelPlan(`Plan a trip. Payment: USD 100.25 to ${merchant}`);
  assert.equal(plan.proposedAction.amountMinor, '10025');
  assert.equal(plan.proposedAction.service, merchant);
  assert.deepEqual(plan.requestedDataScopes, ['profile:dietary-preference', 'profile:travel-budget']);
  assert.match(plan.summary, /Scripted local/);
});

test('local planner refuses missing, ambiguous or invalid payment details', () => {
  assert.equal(localTravelPlan('Plan a trip under USD 500'), null);
  assert.equal(localTravelPlan(`Payment: USD 100 to ${merchant}. Payment: USD 650 to ${merchant}`), null);
  assert.equal(localTravelPlan(`Payment: USD 0 to ${merchant}`), null);
  assert.equal(localTravelPlan('Payment: USD 100 to 0x1234'), null);
});
