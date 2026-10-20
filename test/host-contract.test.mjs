import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createAccess} from '../src/core.mjs';

test('actual installed DSH 0.2.1 ModelDirectory forwards the full selection to session.selectModel', async () => {
  const base = process.env.DSH_EF_HOST_MODULES;
  if (!base) throw new Error('Set DSH_EF_HOST_MODULES to the installed DSH node_modules/@deepseek-ai directory.');
  let code;
  try { code = await readFile(`${base}/dsh-client-ui-model-selection/lib/client.js`, 'utf8'); }
  catch { throw new Error('Set DSH_EF_HOST_MODULES to run the installed-host contract check.'); }
  function createSnapshotStore(initial) {
    let value = initial;const listeners = new Set();
    return {getSnapshot: () => value, subscribe(fn) { listeners.add(fn);return () => listeners.delete(fn); }, set(next) { value = next;for (const fn of listeners) fn(); }, update(fn) { value = structuredClone(value);fn(value);for (const listener of listeners) listener(); }};
  }
  let exported;
  const sandbox = {window: {__ModuleLoader__: {load(module) {
    exported = module.factory(name => {
      if (name === '@deepseek-ai/cordis') return {Service: class {}};
      if (name === '@deepseek-ai/dsh-client-store') return {createSnapshotStore};
      return {};
    });
  }}}, console};
  vm.runInNewContext(code, sandbox, {filename: 'installed-dsh-model-selection.js'});
  assert.equal(typeof exported.ModelDirectory, 'function');
  const initial = {provider: 'p', model: 'm', reasoningEffort: 'low'};
  const projected = createSnapshotStore({next: initial});
  const groups = [{id: 'p', name: 'P', models: [{id: 'm', name: 'M', reasoning: {defaultEffort: 'low', efforts: [{id: 'low'}, {id: 'high'}]}}]}];
  const catalog = {store: createSnapshotStore({status: 'ready', value: {groups, failures: [], default: initial}, error: null}), reasoningFor: () => groups[0].models[0].reasoning, async load() { return this.store.getSnapshot().value; }};
  const wire = [];
  const sessions = {async selectModel(request) {
    wire.push(structuredClone(request));
    projected.set({next: {provider: request.provider, model: request.model, ...(request.reasoningEffort ? {reasoningEffort: request.reasoningEffort} : {})}});
    return {ok: true};
  }};
  const hostDirectory = new exported.ModelDirectory(sessions, 'actual-session', () => true, catalog, projected, () => false);
  const adapter = createAccess({sessions: {}, modelDirectories: {directoryFor: () => hostDirectory}}, ['actual-session']);
  const stop = adapter.start();await adapter.load();
  await adapter.select({provider: 'p', model: 'm', reasoningEffort: 'high'});
  assert.deepEqual(wire, [{sessionId: 'actual-session', provider: 'p', model: 'm', reasoningEffort: 'high'}]);
  assert.equal(adapter.getSnapshot().current.reasoningEffort, 'high');
  await adapter.select({provider: 'p', model: 'm'});
  assert.equal(Object.hasOwn(wire.at(-1), 'reasoningEffort'), false);
  stop();hostDirectory.dispose();
});
