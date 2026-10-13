import test from 'node:test';
import assert from 'node:assert/strict';
import { kimiDiagnostic } from './kimi-diagnostic.mjs';
test('Kimi diagnostics distinguish account quota from rate limits without exposing provider content', () => {
  const quota = kimiDiagnostic(429, { error: { type: 'exceeded_current_quota_error', message: 'private-key private-prompt org-private' } });
  assert.match(quota, /billing/); assert.doesNotMatch(quota, /private/);
  assert.match(kimiDiagnostic(429, { error: { type: 'rate_limit_reached_error' } }), /concurrency/);
  assert.match(kimiDiagnostic(429, { error: { type: 'unrecognized-private-identifier' } }), /alone does not distinguish/);
  assert.match(kimiDiagnostic(401, null), /authentication/);
  assert.match(kimiDiagnostic(429, { error: { type: 'engine_overloaded_error' } }), /topping up does not resolve/);
});
