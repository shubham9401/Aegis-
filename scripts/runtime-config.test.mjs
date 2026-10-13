import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runtimeConfig } from './runtime-config.mjs';
test('doctor matches CLI env-file order and inherited/Next environment precedence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-config-'));
  try {
    fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
    fs.writeFileSync(path.join(root, '.env.local'), 'AEGIS_AGENT_ID=root\nAEGIS_PERMISSION_ID=7');
    fs.writeFileSync(path.join(root, 'apps/web/.env.local'), 'AEGIS_AGENT_ID=web\nKIMI_API_KEY=private-example');
    fs.writeFileSync(path.join(root, 'apps/web/.env.development.local'), 'KIMI_API_KEY=next-local');
    const { web, agent } = runtimeConfig(root, { AEGIS_AGENT_ID: 'inherited' });
    assert.equal(web.AEGIS_AGENT_ID, 'inherited'); assert.equal(agent.AEGIS_AGENT_ID, 'inherited');
    assert.equal(agent.AEGIS_PERMISSION_ID, '7'); assert.equal(agent.KIMI_API_KEY, 'private-example');
    assert.equal(web.KIMI_API_KEY, 'next-local'); assert.equal(web.AEGIS_PERMISSION_ID, undefined);
  } finally { fs.rmSync(root, { recursive: true }); }
});
