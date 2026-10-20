import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('../', import.meta.url);
const {version} = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const runtime = ['package.json','cordis.patch.yml','lib/index.js','lib/client.js','LICENSE','THIRD_PARTY_NOTICES.md','assets/Saira-OFL.txt','README.md','VALIDATION.md','CHANGELOG.md','docs/screenshots/desktop-panel.png','docs/release-preparation.md','scripts/install-profile.mjs','install.cmd','uninstall.cmd'];
const source = new Set([...runtime,'package-lock.json','.gitignore','AGENTS.md']);
async function collect(directory) {
  for (const item of await readdir(new URL(directory + '/', root), {withFileTypes: true})) {
    const path = directory + '/' + item.name;
    if (item.isDirectory()) await collect(path);
    else if (path !== 'preview/runtime.js') source.add(path);
  }
}
for (const path of ['src','scripts','test','preview','assets','docs']) await collect(path);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte;for (let n = 0;n < 8;n++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
async function zip(paths) {
  const locals = [], central = [];let offset = 0;
  for (const path of paths) {
    const name = Buffer.from(path), data = await readFile(new URL(path, root)), crc = crc32(data);
    const header = Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
    locals.push(header,name,data);
    const entry = Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);
    central.push(entry,name);offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);const end = Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(paths.length,8);end.writeUInt16LE(paths.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
await mkdir(new URL('dist/', root), {recursive: true});
const sums = [];
for (const [suffix, files] of [['',runtime],['-source',[...source].sort()]]) {
  const name = `dsh-endfield-reasoning-slider-${version}${suffix}.zip`;
  const bytes = await zip(files);await writeFile(new URL('dist/' + name, root), bytes);
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);console.log(`${name}: ${files.length} files, ${bytes.length} bytes`);
}
await writeFile(new URL('dist/SHA256SUMS.txt', root), sums.join('\n') + '\n');
