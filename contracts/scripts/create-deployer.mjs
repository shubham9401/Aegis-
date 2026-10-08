import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Wallet } from 'ethers';

const packageRoot = path.resolve(import.meta.dirname, '..');
const defaultOutput = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Aegis-Secrets', 'testnet-deployer.keystore.json');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function readHidden(prompt) {
  if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal so the password stays hidden.');
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let secret = '';
    const finish = () => {
      process.stdin.off('keypress', handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const handler = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        finish();
        reject(new Error('Wallet creation cancelled.'));
      } else if (key.name === 'return' || key.name === 'enter') {
        finish();
        resolve(secret);
      } else if (key.name === 'backspace') {
        secret = secret.slice(0, -1);
      } else if (str && !key.ctrl && !key.meta) {
        secret += str;
      }
    };
    process.stdin.on('keypress', handler);
  });
}

async function main() {
  const outputPath = path.resolve(argument('--out') || defaultOutput);
  if (outputPath === packageRoot || outputPath.startsWith(packageRoot + path.sep)) {
    throw new Error('The deployment keystore must be stored outside the Git repository.');
  }
  if (fs.existsSync(outputPath)) throw new Error(`Refusing to overwrite existing keystore: ${outputPath}`);

  let password = await readHidden('New keystore password (hidden, at least 12 characters): ');
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  let confirmation = await readHidden('Repeat keystore password (hidden): ');
  if (password !== confirmation) throw new Error('Passwords did not match. No wallet was created.');

  const wallet = Wallet.createRandom();
  const encrypted = await wallet.encrypt(password);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encrypted, { encoding: 'utf8', mode: 0o600, flag: 'wx' });

  console.log(`Deployment wallet address: ${wallet.address}`);
  console.log(`Encrypted keystore: ${outputPath}`);
  console.log('Back up the keystore and password separately. Never commit or share either one.');

  password = null;
  confirmation = null;
}

try {
  await main();
} catch (error) {
  console.error(error.message || 'Wallet creation failed.');
  process.exitCode = 1;
}
