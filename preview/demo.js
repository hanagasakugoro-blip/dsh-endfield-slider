const React = window.__efReact;
const h = React.createElement;
const definitions = [
  {id: 'demo-a', name: '演示提供方 A', models: [
    {id: 'same-name', name: '示例 · 多档模型', reasoning: {defaultEffort: 'high', efforts: [{id: 'low', name: '低'},{id: 'medium', name: '标准'},{id: 'high', name: '高'},{id: 'max', name: '最高'}]}},
    {id: 'two-level', name: '示例 · 双档模型', reasoning: {defaultEffort: 'off', efforts: [{id: 'off', name: '关闭'},{id: 'on', name: '开启'}]}},
    {id: 'no-reasoning', name: '示例 · 无推理模型'},
    {id: 'eight-level', name: '示例 · 八档模型', reasoning: {defaultEffort: 'e4', efforts: Array.from({length: 8}, (_, i) => ({id: `e${i + 1}`, name: `等级 ${i + 1}`}))}},
    {id: 'default-level', name: '示例 · 提供方默认', reasoning: {efforts: [{id: 'enabled', name: '开启'}]}},
    {id: 'one-level', name: '示例 · 单档模型', reasoning: {defaultEffort: 'only', efforts: [{id: 'only', name: '固定'}]}}
  ]},
  {id: 'demo-b', name: '演示提供方 B', models: [{id: 'same-name', name: '示例 · 多档模型', reasoning: {defaultEffort: 'low', efforts: [{id: 'low', name: '低'},{id: 'high', name: '高'}]}}]}
];
const listeners = new Set();
const initial = JSON.parse(sessionStorage.getItem('ef-demo-current') ?? 'null') ?? {provider: 'demo-a', model: 'same-name', reasoningEffort: 'high'};
let snapshot = {current: initial, groups: structuredClone(definitions), failures: [], status: 'ready', pending: null, error: null, routable: true};
const publish = next => { snapshot = next;for (const listener of listeners) listener(); };
const store = {getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener);return () => listeners.delete(listener); }};
const calls = [];
let rejectNext = false;
let delay = 60;
const directory = {
  store,
  async load() {
    if (snapshot.status !== 'selecting') publish({...snapshot, status: 'ready', error: null});
    return snapshot;
  },
  async select(selection) {
    calls.push(structuredClone(selection));
    publish({...snapshot, status: 'selecting', pending: selection});
    await new Promise(resolve => setTimeout(resolve, delay));
    if (rejectNext) {
      rejectNext = false;
      publish({...snapshot, status: 'error', pending: null, error: '演示：宿主拒绝了此次写入。'});
      return {ok: false, error: {code: 'DEMO_REJECTED', message: '演示：宿主拒绝了此次写入。'}};
    }
    const model = snapshot.groups.find(group => group.id === selection.provider)?.models.find(model => model.id === selection.model);
    const current = {...selection, ...(selection.reasoningEffort === undefined && model?.reasoning?.defaultEffort !== undefined ? {reasoningEffort: model.reasoning.defaultEffort} : {})};
    publish({...snapshot, current, status: 'ready', pending: null, error: null});
    sessionStorage.setItem('ef-demo-current', JSON.stringify(current));
    return {ok: true};
  }
};
const cleanup = [];
let Entry;
let slotProps = {};
let root;
const ctx = {
  sessions: {subagentAddress: () => undefined}, remote: {session: {}},
  modelDirectories: {directoryFor(id) { if (id !== 'demo-session') throw Error('Unknown demonstration binding');return directory; }},
  effect(callback) { const dispose = callback();cleanup.push(dispose);return dispose; },
  slots: {
    inject(name, callback) { return callback(); },
    register(options, component) {
      if (options.name !== 'conversation.input.model' || options.priority !== -10) throw Error('Unexpected slot registration');
      slotProps = options.inject('binding-key-different-from-session-id');
      Entry = component;
      return () => { Entry = null;render(); };
    }
  }
};
window.__efModules['dsh-endfield-reasoning-slider'].apply(ctx);
function demoSend(input = document.querySelector('[data-composer-input]')) {
  if (window.__efDemo.locked || window.__efDemo.sendDisabled) return;
  if (window.__efDemo.sendMode === 'stop') { window.__efDemo.stopped++;return; }
  window.__efDemo.sent++;
  if (input) { input.setAttribute('data-phase', 'plain');input.textContent = ''; }
}
function demoKeyDown(event) {
  const native = event.nativeEvent;
  if (event.key !== 'Enter' || native.repeat || native.shiftKey || native.altKey || native.ctrlKey && native.metaKey || native.isComposing || native.keyCode === 229 || window.__efDemo.locked || window.__efDemo.sendDisabled) return;
  event.preventDefault();
  if (window.__efDemo.consumeNextEnter) {
    window.__efDemo.consumeNextEnter = false;
    if (window.__efDemo.clearOnConsume) { event.currentTarget.textContent = '';window.__efDemo.clearOnConsume = false; }
    return;
  }
  if (!event.currentTarget.textContent.trim()) return;
  event.currentTarget.setAttribute('data-phase', 'adjudicating');
  demoSend(event.currentTarget);
}
function App() {
  return h(React.Fragment, null,
    h('header', {className: 'demo-header'}, h('strong', null, 'DSH / 模型与推理'), h('span', null, '0.8.2 / 面板开合动效')),
    h('div', {className: 'demo-controls'},
      h('button', {onClick: () => document.body.toggleAttribute('data-ds-dark-theme')}, '切换深浅模式'),
      h('button', {onClick: async event => {
        const control = event.currentTarget;
        control.disabled = true;
        try {
          const trigger = document.querySelector('.dsh-ef-trigger');
          if (!trigger || trigger.disabled) return;
          if (trigger.getAttribute('aria-expanded') === 'true') {
            trigger.click();
            while (document.querySelector('.dsh-ef-panel')) await new Promise(resolve => requestAnimationFrame(resolve));
          }
          trigger.click();
          await new Promise(resolve => setTimeout(resolve, 530));
        } finally { control.disabled = false; }
      }}, '重播面板转场'),
      h('button', {onClick: () => { rejectNext = true; }}, '模拟下次保存失败'),
      h('button', {onClick: () => window.__efDemo.setLocked(!window.__efDemo.locked)}, '切换宿主锁定'),
      h('button', {onClick: () => { while (cleanup.length) cleanup.pop()?.();Entry = null;render(); }}, '预览卸载')),
    h('main', {className: 'demo-info'}, h('span', {className: 'demo-badge'}, '交互预览 / 演示目录'), h('h1', null, '让每一次推理，恰到其位。'), h('p', null, '点击模型按钮，黑黄块先向右铺满，再伴随粒子向右擦除；覆盖层从 200ms 起缓入缓出渐隐，450ms 完全透明。保留黑白反相与像素错位，开启约 0.5 秒；关闭时像素横条错层向右拉长，300ms 内整体淡出。'), h('p', {className: 'demo-statement'}, '本页使用模拟宿主和演示模型，不连接模型服务；安装到 DSH 后才会读取实际模型目录。')),
    h('div', {className: 'demo-composer', 'data-phase': 'hero'},
      h('div', {'data-composer-card': '', className: 'demo-card'},
        h('div', {className: 'demo-scroll'}, h('div', {'data-composer-input': true, 'data-phase': 'plain', className: 'demo-input', contentEditable: !window.__efDemo.locked, suppressContentEditableWarning: true, role: 'textbox', 'aria-label': '消息', onKeyDown: demoKeyDown}, h('p', null, '把想法交给模型…'))),
        h('div', {className: 'demo_row'}, h('div', {className: 'demo-tools'}, h('button', {type: 'button', 'aria-label': '添加附件'}, '+'), h('button', {type: 'button'}, '默认权限')),
          h('div', {className: 'demo-trailing'}, Entry && h(Entry, {sessionId: 'demo-session', ...slotProps, locked: window.__efDemo.locked}), h('button', {type: 'button', className: 'demo_primary', 'aria-label': window.__efDemo.sendMode === 'stop' ? '停止' : '发送', disabled: window.__efDemo.locked || window.__efDemo.sendDisabled, onClick: () => demoSend()}, window.__efDemo.sendMode === 'stop' ? h('svg', {width:16,height:16,viewBox:'0 0 16 16','aria-hidden':true}, h('rect', {x:3,y:3,width:10,height:10,rx:3,fill:'currentColor'})) : '↑')))))
  );
}
function render() { root.render(h(App)); }
window.__efDemo = {
  locked: false, sent: 0, stopped: 0, sendMode: 'send', sendDisabled: false, consumeNextEnter: false, calls, directory, definitions,
  state: () => snapshot,
  setLocked(value) { this.locked = value;render(); },
  setSendMode(value) { this.sendMode = value;render(); },
  setSendDisabled(value) { this.sendDisabled = value;render(); },
  rejectNext() { rejectNext = true; },
  delay(value) { delay = value; },
  external(selection) { publish({...snapshot, current: selection, status: 'ready', pending: null}); },
  setState(patch) { publish({...snapshot, ...patch}); },
  unmount() { root.unmount();while (cleanup.length) cleanup.pop()?.(); }
};
root = window.__efRoot.createRoot(document.getElementById('demo'));
if (new URL(location.href).searchParams.has('dark')) document.body.setAttribute('data-ds-dark-theme', '');
render();
