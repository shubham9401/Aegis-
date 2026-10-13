import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

const fileEnv = (file) => fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
export function runtimeConfig(root, inherited = process.env) {
  const webRoot = path.join(root, 'apps/web');
  const mode = inherited.NODE_ENV || 'development';
  const rootLocal = fileEnv(path.join(root, '.env.local'));
  const webLocal = fileEnv(path.join(webRoot, '.env.local'));
  // Next prefers inherited values. The CLI's two --env-file arguments load in this order.
  const web = { ...fileEnv(path.join(webRoot, '.env')), ...fileEnv(path.join(webRoot, `.env.${mode}`)),
    ...webLocal, ...fileEnv(path.join(webRoot, `.env.${mode}.local`)), ...inherited };
  const agent = { ...rootLocal, ...webLocal, ...inherited };
  return { web, agent };
}
