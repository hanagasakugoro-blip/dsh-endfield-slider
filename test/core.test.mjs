import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMemory, levelsOf, effectiveEffort, selectionFor, createAccess, MEMORY_KEY, cleanError} from '../src/core.mjs';

const model = {id: 'm', reasoning: {defaultEffort: 'high', efforts: [{id: 'low', name: '低'}, {id: 'high', name: '高'}]}};
const storage = () => { const values = new Map();return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)}; };
test('uses only adapter levels; never fabricates budgets or levels for non-reasoning models', () => {
  assert.deepEqual(levelsOf({id: 'plain'}), []);
  assert.deepEqual(levelsOf(model).map(x => x.id), ['low', 'high']);
  assert.deepEqual(levelsOf({reasoning: {efforts: [{id: 'on', name: '开启'}]}}).map(x => x.id), [null, 'on']);
});
test('preserves host current; invalid values fall back to the declared default', () => {
  assert.equal(effectiveEffort(model, {reasoningEffort: 'low'}), 'low');
  assert.equal(effectiveEffort(model, {}), 'high');
  assert.equal(effectiveEffort(model, {reasoningEffort: 'removed'}), 'high');
});
test('provider + model identity persists independently across reloads', () => {
  const local = storage();const memory = createMemory(local);
  memory.set('provider-a', 'm', 'low');memory.set('provider-b', 'm', 'high');
  const reloaded = createMemory(local);
  assert.equal(reloaded.get('provider-a', 'm'), 'low');
  assert.equal(reloaded.get('provider-b', 'm'), 'high');
  assert.deepEqual(selectionFor({id: 'provider-a'}, model, reloaded, null), {provider: 'provider-a', model: 'm', reasoningEffort: 'low'});
});
test('switching to an unseen model uses host default; obsolete memory is never submitted', () => {
  const memory = createMemory(storage());
  assert.equal(selectionFor({id: 'p'}, model, memory, null).reasoningEffort, 'high');
  memory.set('p', 'm', 'removed');
  assert.equal(selectionFor({id: 'p'}, model, memory, null).reasoningEffort, 'high');
});
test('provider default round-trips as an omitted reasoningEffort', () => {
  const memory = createMemory(storage());const optional = {id: 'm', reasoning: {efforts: [{id: 'on', name: '开启'}]}};
  memory.set('p', 'm', null);
  assert.deepEqual(selectionFor({id: 'p'}, optional, memory, {provider: 'p', model: 'm', reasoningEffort: 'on'}), {provider: 'p', model: 'm'});
});
test('corrupt or denied local storage degrades to in-memory storage', () => {
  const broken = {getItem() { return '{bad json'; }, setItem() { throw Error('denied'); }};
  const memory = createMemory(broken);memory.set('p', 'm', 'low');assert.equal(memory.get('p', 'm'), 'low');
  const absent = createMemory();absent.set('p', 'm', null);assert.equal(absent.get('p', 'm'), null);
});
test('storage schema validates entries and ignores foreign versions', () => {
  const local = storage();local.setItem(MEMORY_KEY, JSON.stringify({version: 1, entries: [['not-json', 'high'], ['["p","m"]', 123], ['["p","safe"]', 'low']]}));
  assert.equal(createMemory(local).get('p', 'm'), undefined);
  assert.equal(createMemory(local).get('p', 'safe'), 'low');
  local.setItem(MEMORY_KEY, JSON.stringify({version: 99, entries: [['["p","safe"]', 'high']]}));
  assert.equal(createMemory(local).get('p', 'safe'), undefined);
});
test('a denied write keeps the new in-memory value ahead of stale persisted data', () => {
  const local = storage();const seed = createMemory(local);seed.set('p', 'm', 'low');
  const denied = createMemory({getItem: local.getItem, setItem() { throw Error('quota'); }});
  denied.set('p', 'm', 'high');assert.equal(denied.get('p', 'm'), 'high');
});
test('directory access uses owner session id, retries unresolved binding and disposes subscriptions', async () => {
  let ready = false;let subscriptionCount = 0;const timers = new Map();let sequence = 0;
  const clock = {setTimeout(fn) { timers.set(++sequence, fn);return sequence; }, clearTimeout(id) { timers.delete(id); }};
  let state = {current: {provider: 'p', model: 'm'}, groups: [], status: 'ready'};
  const listeners = new Set();
  const directory = {store: {getSnapshot: () => state, subscribe(fn) { subscriptionCount++;listeners.add(fn);return () => { subscriptionCount--;listeners.delete(fn); }; }}, load: async () => state, select: async () => ({ok: true})};
  const tried = [];
  const ctx = {sessions: {subagentAddress: () => undefined}, modelDirectories: {directoryFor(id) { tried.push(id);if (!ready || id !== 'owner') throw Error('scope not ready');return directory; }}};
  const access = createAccess(ctx, ['owner', 'binding'], clock);const stop = access.start();
  assert.match(access.getSnapshot().error, /scope not ready/);
  ready = true;const retry = [...timers.values()][0];timers.clear();retry();await Promise.resolve();
  assert.equal(subscriptionCount, 1);assert.deepEqual(access.getSnapshot(), state);assert.equal(tried.at(-1), 'owner');
  await access.select({provider: 'p', model: 'm'});
  stop();assert.equal(subscriptionCount, 0);assert.equal(timers.size, 0);
});
test('failed writes propagate and do not fabricate a successful current value', async () => {
  const original = {current: {provider: 'p', model: 'm', reasoningEffort: 'low'}, groups: [], status: 'ready'};
  const directory = {store: {getSnapshot: () => original, subscribe: () => () => {}}, load: async () => original, select: async () => ({ok: false, error: {message: 'host rejected'}})};
  const ctx = {sessions: {}, modelDirectories: {directoryFor: () => directory}};
  const access = createAccess(ctx, ['s']);const stop = access.start();
  await assert.rejects(access.select({provider: 'p', model: 'm', reasoningEffort: 'high'}), /host rejected/);
  assert.equal(access.getSnapshot().current.reasoningEffort, 'low');stop();
});
test('error text redacts bearer and URL credentials', () => {
  assert.equal(cleanError('Bearer secret https://a/?token=secret&ok=1'), 'Bearer [已隐藏] https://a/?token=[已隐藏]&ok=1');
});
