const test = require('node:test');
const assert = require('node:assert/strict');
require('./register.cjs');
const { validCalendarDate, validProfileValue, passportExpiryStatus } = require('../src/lib/profile-fields.ts');
const { grantPermissionSchema, vaultBatchWriteSchema } = require('../src/lib/validation.ts');

test('expiry checks validate calendar dates and distinguish expired, today, and future', () => {
  assert.equal(validCalendarDate('2028-02-29'), true);
  assert.equal(validCalendarDate('2027-02-29'), false);
  assert.equal(validCalendarDate('2027-04-31'), false);
  assert.equal(passportExpiryStatus('2026-10-13', '2026-10-14'), 'Expired');
  assert.equal(passportExpiryStatus('2026-10-14', '2026-10-14'), 'Expires today');
  assert.equal(passportExpiryStatus('2026-10-15', '2026-10-14'), 'Not expired · 1 day remaining');
});
test('vault rejects arbitrary strings, zero budgets, unsupported currencies, and duplicate scopes', () => {
  assert.equal(validProfileValue('profile:dietary-preference', 'vegetarian'), true);
  assert.equal(validProfileValue('profile:dietary-preference', 'anything'), false);
  assert.equal(validProfileValue('profile:travel-budget', 'USD 500.00'), true);
  for (const value of ['USD 0', 'USD -1', 'XYZ 500', 'USD 1.001', 'USD 1e6']) assert.equal(validProfileValue('profile:travel-budget', value), false);
  const entry = { scope: 'profile:passport-validity', value: '2028-02-29' };
  assert.equal(vaultBatchWriteSchema.safeParse({ entries: [entry] }).success, true);
  assert.equal(vaultBatchWriteSchema.safeParse({ entries: [entry, entry] }).success, false);
});
test('booking policies require narrow valid services and positive supported monetary limits', () => {
  const input = { agentId: 'agent', dataScopes: [], actionRules: [{ action: 'travel:book', maxAmountMinor: '50000', currency: 'USD', allowedServices: ['specified-airline'], requireApprovalAboveMinor: '30000' }], expiresInSeconds: 3600 };
  assert.equal(grantPermissionSchema.safeParse(input).success, true);
  for (const change of [{ maxAmountMinor: '0' }, { currency: 'XYZ' }, { allowedServices: [] }, { allowedServices: ['anything with spaces'] }, { allowedServices: ['airline','airline'] }, { requireApprovalAboveMinor: '50001' }]) {
    assert.equal(grantPermissionSchema.safeParse({ ...input, actionRules: [{ ...input.actionRules[0], ...change }] }).success, false);
  }
});
