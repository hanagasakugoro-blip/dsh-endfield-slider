import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile, lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {installProfile} from '../scripts/install-profile.mjs';

test('installation and uninstall preserve unrelated skins, settings and source files', async () => {
  const root = new URL(`../artifacts/installer-${Date.now()}/`, import.meta.url);
  await mkdir(root, {recursive: true});
  const baseline = {name: 'dsh-profile-test', private: true, dependencies: {'open-sea-skin': '1.2.3', '@smalltailqwq/dsh-client-ui-skin-maid-atelier': '0.1.7'}, dsh: {profile: {bundles: ['@deepseek-ai/dsh-base','open-sea-skin','@smalltailqwq/dsh-client-ui-skin-maid-atelier'], patchReload: 'live'}}};
  await writeFile(new URL('package.json', root), JSON.stringify(baseline, null, 2));
  await writeFile(new URL('cordis.patch.yml', root), '# preserve this exact file\n');
  await installProfile({profile: fileURLToPath(root), backupRoot: fileURLToPath(new URL('backups/', root))});
  const installed = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(installed.dsh.profile.bundles.length, baseline.dsh.profile.bundles.length + 1);
  assert.equal(installed.dependencies['open-sea-skin'], '1.2.3');
  assert.equal((await lstat(new URL('node_modules/dsh-endfield-reasoning-slider', root))).isSymbolicLink(), true);
  await installProfile({profile: fileURLToPath(root), uninstall: true, backupRoot: fileURLToPath(new URL('backups/', root))});
  assert.deepEqual(JSON.parse(await readFile(new URL('package.json', root), 'utf8')), baseline);
  assert.equal(await readFile(new URL('cordis.patch.yml', root), 'utf8'), '# preserve this exact file\n');
  assert.ok((await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')).includes('__ModuleLoader__'));
});
