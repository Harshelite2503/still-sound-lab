// Offline app: every pre-stored file exists, the manifest is valid, every page installs and registers.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('../dist/', import.meta.url);
const read = f => fs.readFileSync(new URL(f, dir), 'utf8');
const sw = read('sw.js');
const list = JSON.parse(sw.match(/PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
for (const path of list.filter(p => p !== './')) assert.ok(fs.existsSync(new URL(path, dir)), `precached file missing: ${path}`);
assert.ok(list.includes('quiet.html') && list.includes('quiet.js'), 'the quiet room works offline');

// Every module the quiet room and journal import must also be pre-stored.
for (const page of ['quiet.js', 'journal.js', 'profile.js', 'app.js']) {
  for (const [, dep] of read(page).matchAll(/from '\.\/([^']+)'/g)) assert.ok(list.includes(dep), `${page} imports ${dep}, which is not precached`);
}

const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.start_url, './quiet.html');
assert.ok(manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap(s => s.icons)]) assert.ok(fs.existsSync(new URL(icon.src, dir)), `icon missing: ${icon.src}`);

for (const page of fs.readdirSync(dir).filter(f => f.endsWith('.html'))) {
  const html = read(page);
  assert.ok(html.includes('rel="manifest"'), `${page} links the manifest`);
  assert.ok(html.includes('src="pwa.js"'), `${page} registers the offline worker`);
}
console.log(`pwa ok · ${list.length} precached files`);
