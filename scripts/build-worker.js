// Builds dist/ for Cloudflare Workers: copies src modules and embeds public/ as assets.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const out = path.join(root, 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

fs.mkdirSync(out, { recursive: true });
const assets = {};
for (const f of walk(pub)) {
  const ext = path.extname(f);
  if (!MIME[ext]) throw new Error('Unsupported asset type (text only): ' + f);
  assets['/' + path.relative(pub, f).split(path.sep).join('/')] = { type: MIME[ext], body: fs.readFileSync(f, 'utf8') };
}
fs.writeFileSync(path.join(out, 'assets.js'), `export const ASSETS = ${JSON.stringify(assets)};\n`);
fs.copyFileSync(path.join(root, 'src/core.js'), path.join(out, 'core.js'));
fs.copyFileSync(path.join(root, 'src/worker.js'), path.join(out, 'worker.js'));
console.log(`Built dist/ with ${Object.keys(assets).length} assets (${(fs.statSync(path.join(out, 'assets.js')).size / 1024).toFixed(0)} KB)`);
