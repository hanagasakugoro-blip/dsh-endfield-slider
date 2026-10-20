import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function devRuntime() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const candidates = [process.env.DSH_EF_DEV_MODULES, resolve(root, 'node_modules')].filter(Boolean);
  let reactPath;
  for (const candidate of candidates) {
    try { await access(join(candidate, 'react/package.json'));reactPath = candidate;break; } catch {}
  }
  if (!reactPath) throw new Error('Run npm ci to install the preview development dependencies, or set DSH_EF_DEV_MODULES.');
  const modules = [];
  const known = new Map();
  async function include(path) {
    if (known.has(path)) return known.get(path);
    const id = modules.length;
    known.set(path, id);modules.push(null);
    const code = await readFile(path, 'utf8');
    const local = createRequire(path);
    const deps = {};
    for (const [, name] of code.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (deps[name] === undefined) deps[name] = await include(local.resolve(name));
    }
    modules[id] = `[function(require,module,exports,process){\n${code}\n},${JSON.stringify(deps)}]`;
    return id;
  }
  const req = createRequire(join(reactPath, '_preview.cjs'));
  const react = await include(req.resolve('react'));
  const dom = await include(req.resolve('react-dom'));
  const client = await include(req.resolve('react-dom/client'));
  const output = `(function(){const modules=[${modules.join(',\n')}],cache={};function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;const [fn,map]=modules[id];fn(name=>load(map[name]),m,m.exports,{env:{NODE_ENV:'production'}});return m.exports;}window.__efReact=load(${react});window.__efDOM=load(${dom});window.__efRoot=load(${client});window.__efModules={};window.__ModuleLoader__={load(spec){window.__efModules[spec.id]=spec.factory(name=>{if(name==='react')return window.__efReact;if(name==='react-dom')return window.__efDOM;throw Error('Unexpected preview dependency: '+name)})}};})();`;
  await mkdir(join(root, 'preview'), {recursive: true});
  await writeFile(join(root, 'preview/runtime.js'), output);
  return {root, reactPath, modules: modules.length};
}

export async function playwrightRuntime() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const candidates = [process.env.DSH_EF_TEST_MODULES, resolve(root, 'node_modules')].filter(Boolean);
  for (const candidate of candidates) {
    try { return createRequire(join(candidate, '_tests.cjs'))('playwright'); } catch {}
  }
  throw new Error('Browser verification needs Playwright. Set DSH_EF_TEST_MODULES.');
}
