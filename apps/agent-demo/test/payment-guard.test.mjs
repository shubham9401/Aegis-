import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paymentIntent, checkReleasedContext } from '../dist/payment-guard.js';
import { paymentFingerprint, openPaymentJournal } from '../dist/payment-journal.js';
const merchant = '0x1111111111111111111111111111111111111111';
test('connected payment requires one positive explicit instruction, preserving cents exactly', () => {
  assert.deepEqual(paymentIntent(`Plan a trip. Payment: USD 120.01 to ${merchant}`), { amountMinor: '12001', recipient: merchant });
  for (const text of ['Book under $500', `Payment: USD 0 to ${merchant}`, `Payment: USD 1.001 to ${merchant}`, `Payment: USD 10 to ${merchant}; Payment: USD 20 to ${merchant}`, 'Payment: USD 1 to 0x' + '0'.repeat(40)]) assert.throws(() => paymentIntent(text));
});
test('released budgets and calendar expiry constrain payment without model disclosure', () => {
  const facts = [{ scope: 'profile:travel-budget', value: 'USD 120.01' }, { scope: 'profile:passport-validity', value: '2028-02-29' }];
  assert.equal(checkReleasedContext(facts, '12001', 'USD', '2026-10-14').length, 2);
  assert.throws(() => checkReleasedContext(facts, '12002', 'USD', '2026-10-14'), /budget/);
  assert.throws(() => checkReleasedContext(facts, '12001', 'EUR', '2026-10-14'), /currency/);
  for (const value of ['2027-02-29', '2026-10-14', '2026-10-13']) assert.throws(() => checkReleasedContext([{ scope: 'profile:passport-validity', value }], '1', 'USD', '2026-10-14'));
  assert.throws(() => checkReleasedContext([{ scope: 'profile:travel-budget', value: 'USD 0' }], '1', 'USD'));
});
test('payment journal survives restart, binds instructions, locks concurrent runs, and refuses corruption', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-journal-'));
  const previousStore = process.env.AEGIS_AGENT_STATE_DIR, previousKey = process.env.AEGIS_AGENT_KEYSTORE_PATH;
  process.env.AEGIS_AGENT_STATE_DIR = directory;
  process.env.AEGIS_AGENT_KEYSTORE_PATH = path.join(directory, 'external.keystore.json');
  let open;
  try {
    const fingerprint = paymentFingerprint(merchant, '1', merchant, 'private instruction');
    open = openPaymentJournal(fingerprint);
    assert.notEqual(open.requestId, '0x' + fingerprint);
    assert.throws(() => openPaymentJournal(fingerprint), /locked/);
    const entry = { version: 1, fingerprint, requestId: open.requestId, amountMinor: '12001', recipient: merchant, requestedDataScopes: ['profile:travel-budget'], deadline: 12345, transactionHash: '0x' + '2'.repeat(64) };
    open.save(entry); open.close();
    open = openPaymentJournal(fingerprint);
    assert.deepEqual(open.record, entry);
    open.close();
    const explicit = openPaymentJournal(fingerprint, entry.requestId);
    explicit.save(entry); explicit.close();
    assert.throws(() => openPaymentJournal('a'.repeat(64), entry.requestId), /different instruction/);
    assert.equal(fs.readFileSync(open.filename, 'utf8').includes('private instruction'), false);
    fs.writeFileSync(open.filename, '{broken');
    assert.throws(() => openPaymentJournal(fingerprint));
    assert.equal(fs.existsSync(open.filename + '.lock'), false);
  } finally {
    open?.close();
    if (previousStore === undefined) delete process.env.AEGIS_AGENT_STATE_DIR; else process.env.AEGIS_AGENT_STATE_DIR = previousStore;
    if (previousKey === undefined) delete process.env.AEGIS_AGENT_KEYSTORE_PATH; else process.env.AEGIS_AGENT_KEYSTORE_PATH = previousKey;
    // Test-owned temporary directory only.
    fs.rmSync(directory, { recursive: true });
  }
});
