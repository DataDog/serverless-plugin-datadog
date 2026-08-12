import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Local convenience: load e2e/.env.local (gitignored) into process.env without a
// dependency. Real environment variables always win, so this is a no-op in CI.
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env.local');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
