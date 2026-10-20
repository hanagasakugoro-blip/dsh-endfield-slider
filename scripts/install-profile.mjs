import {readFile, writeFile, copyFile, mkdir, lstat, realpath, symlink, rmdir, rename, unlink, open} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const packageName = 'dsh-endfield-reasoning-slider';
const hash = value => createHash('sha256').update(value).digest('hex');
const exists = async path => { try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null;throw error; } };
async function atomic(path, value) {
  const temp = `${path}.endfield-${process.pid}.tmp`;
  try { await writeFile(temp, value, {flag: 'wx'});await rename(temp, path); }
  finally { if (await exists(temp)) await unlink(temp); }
}

export async function installProfile({profile = join(homedir(), '.dsh/profiles/web'), uninstall = false, backupRoot = join(project, 'backups')} = {}) {
  profile = resolve(profile);
  const manifestPath = join(profile, 'package.json');
  const link = join(profile, 'node_modules', packageName);
  const lockPath = `${manifestPath}.lock`;
  const original = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(original);
  if (!manifest.private || manifest.dsh?.profile === undefined) throw Error('Target is not a private DSH profile.');
  const linkInfo = await exists(link);
  if (linkInfo && (!linkInfo.isSymbolicLink() || resolve(await realpath(link)).toLowerCase() !== project.toLowerCase())) throw Error('Existing plugin path belongs to another installation; nothing was changed.');
  if (!uninstall && manifest.dependencies?.[packageName] && !linkInfo) throw Error('Manifest already declares another plugin installation; nothing was changed.');
  const lock = await open(lockPath, 'wx');
  let linked = false;
  let changed = false;
  let backup;
  try {
    // Recheck under lock so a simultaneous package-manager update is never lost.
    if (await readFile(manifestPath, 'utf8') !== original) throw Error('Profile changed during preflight. Retry after package management finishes.');
    backup = join(resolve(backupRoot), `${new Date().toISOString().replaceAll(':', '-')}-${uninstall ? 'uninstall' : 'install'}-${process.pid}`);
    await mkdir(backup, {recursive: true});
    for (const name of ['package.json', 'cordis.patch.yml', 'cordis.yml']) {
      if (await exists(join(profile, name))) await copyFile(join(profile, name), join(backup, name));
    }
    const beforeBundles = [...(manifest.dsh.profile.bundles ?? [])];
    if (uninstall) {
      delete manifest.dependencies?.[packageName];
      manifest.dsh.profile.bundles = beforeBundles.filter(name => name !== packageName);
    } else {
      manifest.dependencies ??= {};
      manifest.dependencies[packageName] = `link:${project.replaceAll('\\', '/')}`;
      manifest.dsh.profile.bundles = [...new Set([...beforeBundles, packageName])];
      if (!linkInfo) { await mkdir(dirname(link), {recursive: true});await symlink(project, link, process.platform === 'win32' ? 'junction' : 'dir');linked = true; }
    }
    const after = JSON.stringify(manifest, null, 2) + '\n';
    await atomic(manifestPath, after);changed = true;
    if (uninstall && linkInfo) {
      // Only remove the verified junction itself, with no recursive filesystem operation.
      if (process.platform === 'win32') await rmdir(link); else await unlink(link);
    }
    const verified = JSON.parse(await readFile(manifestPath, 'utf8'));
    const expected = uninstall ? beforeBundles.filter(name => name !== packageName) : [...new Set([...beforeBundles, packageName])];
    if (JSON.stringify(verified.dsh.profile.bundles) !== JSON.stringify(expected)) throw Error('Bundle verification failed.');
    const receipt = {action: uninstall ? 'uninstall' : 'install', profile, plugin: project, beforeSha256: hash(original), afterSha256: hash(after), backup, bundles: verified.dsh.profile.bundles};
    await writeFile(join(backup, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
  } catch (error) {
    if (changed) await atomic(manifestPath, original);
    if (linked && await exists(link)) { if (process.platform === 'win32') await rmdir(link);else await unlink(link); }
    throw error;
  } finally { await lock.close();await unlink(lockPath); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--profile-path');
  const result = await installProfile({...(index >= 0 ? {profile: process.argv[index + 1]} : {}), uninstall: process.argv.includes('--uninstall')});
  console.log(JSON.stringify(result, null, 2));
  console.log('DSH live profile can load the updated bundle. Refresh the browser; restart DSH only if needed. Existing skin entries were preserved.');
}
