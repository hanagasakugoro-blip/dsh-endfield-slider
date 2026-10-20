export const MEMORY_KEY = 'dsh.endfield.reasoning.v1';
export const EMPTY_STATE = Object.freeze({current: null, groups: [], failures: [], status: 'loading', pending: null, error: null, routable: null});
export const modelKey = (provider, model) => JSON.stringify([provider, model]);
export const sameModel = (a, b) => !!a && !!b && a.provider === b.provider && a.model === b.model;

/** Only adapter-published levels and the host's explicit provider-default option. */
export function levelsOf(model) {
  if (!model?.reasoning) return [];
  const levels = [];
  if (model.reasoning.defaultEffort === undefined) levels.push({id: null, name: '提供方默认'});
  for (const effort of model.reasoning.efforts ?? []) {
    if (typeof effort.id === 'string' && effort.id && !levels.some(x => x.id === effort.id)) {
      levels.push({id: effort.id, name: typeof effort.name === 'string' ? effort.name : effort.id});
    }
  }
  return levels;
}

export function choiceOf(state, selection = state.current) {
  if (!selection) return undefined;
  const group = state.groups.find(x => x.id === selection.provider);
  const model = group?.models.find(x => x.id === selection.model);
  return model ? {group, model} : undefined;
}

export function effectiveEffort(model, selection) {
  const levels = levelsOf(model);
  const value = selection?.reasoningEffort ?? model?.reasoning?.defaultEffort ?? null;
  if (levels.some(x => x.id === value)) return value;
  const fallback = model?.reasoning?.defaultEffort ?? null;
  return levels.some(x => x.id === fallback) ? fallback : undefined;
}

export function selectionFor(group, model, memory, current) {
  const levels = levelsOf(model);
  const remembered = memory.get(group.id, model.id);
  const currentEffort = sameModel(current, {provider: group.id, model: model.id}) ? current.reasoningEffort : undefined;
  const candidates = [remembered, currentEffort, model.reasoning?.defaultEffort, null];
  const effort = candidates.find(value => value !== undefined && levels.some(x => x.id === value));
  return {provider: group.id, model: model.id, ...(typeof effort === 'string' ? {reasoningEffort: effort} : {})};
}

/** Small versioned origin-local store. Failed persistence keeps working in memory. */
export function createMemory(storage) {
  const fallback = new Map();
  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem(MEMORY_KEY) ?? 'null');
      if (parsed?.version === 1 && Array.isArray(parsed.entries)) {
        return new Map(parsed.entries.filter(entry => {
          if (!Array.isArray(entry) || entry.length !== 2 || (entry[1] !== null && typeof entry[1] !== 'string')) return false;
          try { const pair = JSON.parse(entry[0]); return Array.isArray(pair) && pair.length === 2 && pair.every(x => typeof x === 'string'); } catch { return false; }
        }).slice(-500));
      }
    } catch {}
    return new Map();
  };
  return {
    get(provider, model) {
      const key = modelKey(provider, model);
      const saved = read();
      return fallback.has(key) ? fallback.get(key) : saved.get(key);
    },
    set(provider, model, effort) {
      if (effort !== null && typeof effort !== 'string') return;
      const key = modelKey(provider, model);
      fallback.set(key, effort);
      const entries = read();
      for (const [k, v] of fallback) entries.set(k, v);
      entries.delete(key);
      entries.set(key, effort);
      try {
        if (storage) { storage.setItem(MEMORY_KEY, JSON.stringify({version: 1, entries: [...entries].slice(-500)}));fallback.clear(); }
      } catch {}
    }
  };
}

export function cleanError(value) {
  return String(value?.message ?? value ?? '操作未完成，请重试。')
    .replace(/(Bearer\s+)\S+/gi, '$1[已隐藏]')
    .replace(/([?&](?:token|key|api_key|access_token|auth)=)[^\s&#]+/gi, '$1[已隐藏]')
    .slice(0, 350);
}

/** Resolve both slot identities without overwriting the owner's sessionId. */
export function createAccess(ctx, ids, timers = globalThis) {
  let state = EMPTY_STATE;
  let directory;
  let unsubscribe;
  let timer;
  let running = false;
  let attempt = 0;
  const listeners = new Set();
  const candidates = [...new Set(ids.filter(id => id !== undefined && id !== null))];
  const publish = next => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };
  const resolve = () => {
    let reason = '会话尚未就绪。';
    for (const id of candidates) {
      try {
        if (ctx.sessions.subagentAddress?.(id) !== undefined) {
          reason = '当前子会话由宿主管理模型。';
          continue;
        }
        const next = ctx.modelDirectories.directoryFor(id);
        if (next?.store?.getSnapshot && next.store.subscribe) return next;
      } catch (error) { reason = cleanError(error); }
    }
    publish({...EMPTY_STATE, error: reason});
    return undefined;
  };
  const bind = () => {
    if (!running) return;
    const next = resolve();
    if (!next && directory) { unsubscribe?.();unsubscribe = undefined;directory = undefined; }
    if (next && next !== directory) {
      unsubscribe?.();
      directory = next;
      unsubscribe = next.store.subscribe(() => { if (running) publish(next.store.getSnapshot()); });
      publish(next.store.getSnapshot());
      next.load().catch(error => {
        if (running && directory === next) publish({...next.store.getSnapshot(), error: cleanError(error)});
      });
      attempt = 0;
    }
    // Re-resolve after scope replacement/reconnect; never replace current with a local guess.
    timer = timers.setTimeout(bind, next ? 3000 : Math.min(2000, 100 * 2 ** Math.min(attempt++, 5)));
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() { if (!running) { running = true; bind(); } return () => this.stop(); },
    stop() { running = false; timers.clearTimeout(timer); unsubscribe?.(); unsubscribe = undefined; directory = undefined; },
    async load() {
      const target = resolve();
      if (!target) return;
      try { await target.load(); } catch (error) { if (running) publish({...target.store.getSnapshot(), error: cleanError(error)}); }
    },
    async select(selection) {
      const target = resolve();
      if (!target) throw new Error('会话尚未就绪，请稍后重试。');
      const before = target.store.getSnapshot();
      if (before.pending || before.status === 'selecting') throw new Error('正在保存上一次选择。');
      const result = await target.select(selection);
      if (!result?.ok) throw new Error(cleanError(result?.error?.message ?? '宿主尚未确认保存，请重试。'));
      return result;
    }
  };
}
