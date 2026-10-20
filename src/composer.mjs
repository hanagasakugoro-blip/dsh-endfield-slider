/** Local decoration and intent feedback; the host owns editing and submission. */
export function installComposerEffects(doc) {
  const view = doc.defaultView;
  const preference = view.matchMedia('(prefers-reduced-motion: reduce)');
  const states = new Map();
  const composingUntil = new WeakMap();
  const span = (className, parent) => {
    const node = doc.createElement('span');
    node.className = className;
    parent.append(node);
    return node;
  };
  const isStop = button => !!button?.querySelector('svg rect[width="10"][height="10"]') || /^(停止|stop(?: generating)?)$/iu.test(button?.getAttribute('aria-label')?.trim() ?? '');
  const sendButton = card => [...card.querySelectorAll('button[data-ef-send]')].find(button => !isStop(button));
  const enabled = button => button && !button.matches(':disabled') && !button.closest('[inert]');
  function clearKey(state) {
    if (!state.key) return;
    view.clearTimeout(state.key.timer);
    view.cancelAnimationFrame(state.key.frame);
    state.key = null;
  }
  function cancel(state) {
    clearKey(state);
    for (const animation of state.animations) animation.cancel();
    state.animations.clear();
  }
  function animate(state, node, frames, id) {
    const animation = node.animate(frames, {duration: 165});
    animation.id = id;
    state.animations.add(animation);
    animation.finished.then(() => state.animations.delete(animation), () => state.animations.delete(animation));
  }
  function pulse(state) {
    cancel(state);
    if (preference.matches || !state.card.isConnected || !state.chrome.animate) return;
    const flash = [
      {offset: 0, opacity: 1, color: '#fff', easing: 'steps(1,end)'},
      {offset: .28, opacity: 1, color: '#161616', easing: 'steps(1,end)'},
      {offset: .72, opacity: 0, color: '#161616'},
      {offset: 1, opacity: 0, color: '#161616'}
    ];
    for (const node of state.pulses) animate(state, node, flash, 'dsh-ef-composer-flash');
    animate(state, state.signal, [
      {offset: 0, opacity: 1, translate: '0px 0px', scale: '.6 1', easing: 'steps(1,end)'},
      {offset: .15, opacity: 1, translate: '6px -2px', scale: '1.4 1', easing: 'steps(1,end)'},
      {offset: .33, opacity: 1, translate: '-4px 2px', scale: '.85 1', easing: 'steps(1,end)'},
      {offset: .55, opacity: 1, translate: '4px -2px', scale: '1.15 1', easing: 'steps(1,end)'},
      {offset: .8, opacity: 1, translate: '-2px 0px', scale: '1 1', easing: 'steps(1,end)'},
      {offset: 1, opacity: 0, translate: '0px 0px', scale: '1 1'}
    ], 'dsh-ef-composer-signal');
  }
  function mount(card, row) {
    const chrome = span('dsh-ef-composer-chrome', card);
    chrome.setAttribute('data-ef-composer-chrome', '');
    chrome.setAttribute('aria-hidden', 'true');
    span('dsh-ef-pass-spine', chrome);
    const info = span('dsh-ef-pass-info', chrome);
    span('dsh-ef-pass-ticks', info);
    span('dsh-ef-pass-info-label', info).textContent = 'INPUT';
    span('dsh-ef-pass-mark', chrome);
    const contours = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    contours.setAttribute('class', 'dsh-ef-pass-contours');
    contours.setAttribute('viewBox', '0 0 180 60');
    contours.setAttribute('preserveAspectRatio', 'none');
    contours.setAttribute('focusable', 'false');
    for (let line = 0; line < 6; line++) {
      const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      const y = 8 + line * 8;
      path.setAttribute('d', `M-8 ${y}C24 ${y-18} 40 ${y+20} 68 ${y+6}S108 ${y-24} 132 ${y-4}S166 ${y+16} 190 ${y-8}`);
      contours.append(path);
    }
    chrome.append(contours);
    const pulses = ['tl', 'tr', 'bl', 'br'].map(corner => span('dsh-ef-corner-pulse', span(`dsh-ef-composer-corner dsh-ef-composer-corner--${corner}`, chrome)));
    span('dsh-ef-composer-hatch', chrome);
    span('dsh-ef-composer-hatch dsh-ef-composer-hatch--bottom', chrome);
    for (const edge of ['top', 'bottom']) pulses.push(span('dsh-ef-composer-edge-pulse', span(`dsh-ef-composer-edge dsh-ef-composer-edge--${edge}`, chrome)));
    span('dsh-ef-composer-focus-signal', chrome);
    const heading = span('dsh-ef-composer-heading', chrome);
    span('dsh-ef-composer-heading-cn', heading).textContent = '消息';
    span('dsh-ef-composer-heading-en', heading).textContent = ' / MESSAGE';
    span('dsh-ef-composer-identity', chrome).textContent = 'DSH';
    span('dsh-ef-composer-slot', chrome);
    const notch = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    notch.setAttribute('class', 'dsh-ef-composer-notch');
    notch.setAttribute('viewBox', '0 0 14 42');
    notch.setAttribute('focusable', 'false');
    const profile = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    profile.setAttribute('d', 'M14 0H9L1 8V34L9 42H14');
    notch.append(profile);
    chrome.append(notch);
    const groups = [...row.children];
    const tools = groups[0], trailing = groups.at(-1);
    row.setAttribute('data-ef-toolbar', '');
    tools?.setAttribute('data-ef-tools', '');
    if (trailing !== tools) trailing?.setAttribute('data-ef-trailing', '');
    const toolbar = span('dsh-ef-toolbar-chrome', row);
    toolbar.setAttribute('data-ef-toolbar-chrome', '');
    toolbar.setAttribute('aria-hidden', 'true');
    pulses.push(span('dsh-ef-toolbar-pulse', toolbar));
    const signal = span('dsh-ef-composer-send-signal', toolbar);
    return {card, row, tools, trailing, chrome, toolbar, pulses, signal, animations: new Set(), key: null};
  }
  function disposeState(state) {
    cancel(state);
    state.chrome.remove();
    state.toolbar.remove();
    state.row.removeAttribute('data-ef-toolbar');
    state.tools?.removeAttribute('data-ef-tools');
    state.trailing?.removeAttribute('data-ef-trailing');
  }
  function sync(cards) {
    for (const [card, state] of states) {
      if (!cards.has(card) || !card.isConnected || state.chrome.parentNode !== card || state.row.parentNode !== card || state.toolbar.parentNode !== state.row || state.tools?.parentNode !== state.row || state.trailing?.parentNode !== state.row) {
        disposeState(state);
        states.delete(card);
      }
    }
    for (const card of cards) {
      if (states.has(card)) continue;
      const row = [...card.children].find(node => typeof node.className === 'string' && node.className.includes('_row'));
      if (row) states.set(card, mount(card, row));
    }
  }
  function checkKey(state) {
    const key = state.key;
    if (!key || !key.event.defaultPrevented || !key.input.isConnected) return;
    const phase = key.input.getAttribute('data-phase');
    const enteredSubmit = phase !== key.phase && (phase === 'adjudicating' || phase === 'submitting');
    const cleared = key.input.textContent.trim() === '' && (key.text !== '' || key.button.matches(':disabled') || isStop(key.button));
    if (enteredSubmit || cleared) pulse(state);
  }
  const click = event => {
    const button = event.target?.closest?.('button[data-ef-send]');
    if (!enabled(button) || isStop(button)) return;
    const state = states.get(button.closest('[data-ef-composer]'));
    if (state) pulse(state);
  };
  const keyDown = event => {
    const input = event.target?.closest?.('[data-composer-input]');
    const state = states.get(input?.closest('[data-ef-composer]'));
    if (!state) return;
    clearKey(state);
    if (event.key !== 'Enter' || event.repeat || event.shiftKey || event.altKey || event.getModifierState('AltGraph') || event.ctrlKey && event.metaKey || event.isComposing || event.keyCode === 229 || input.hasAttribute('data-composer-composing') || (composingUntil.get(input) ?? 0) > view.performance.now() || !input.isContentEditable || input.getAttribute('aria-disabled') === 'true') return;
    // In this host release an open trigger menu consumes Enter whenever it has
    // a highlighted item. Picking a chip can briefly clear its text DOM too.
    if ([...state.card.querySelectorAll('[data-trigger-menu] [role="listbox"][aria-activedescendant]')].some(menu => menu.getClientRects().length > 0)) return;
    const button = sendButton(state.card);
    if (!enabled(button)) return;
    const key = {input, button, event, text: input.textContent.trim(), phase: input.getAttribute('data-phase')};
    state.key = key;
    // The host consumes Enter for sends and for popup choices. Only its local
    // submit/clear transition confirms the send gesture; no remote reply is awaited.
    view.queueMicrotask(() => { if (state.key === key) checkKey(state); });
    key.frame = view.requestAnimationFrame(() => { if (state.key === key) checkKey(state); });
    key.timer = view.setTimeout(() => { if (state.key === key) clearKey(state); }, 120);
  };
  const composition = event => {
    const input = event.target?.closest?.('[data-composer-input]');
    if (!input) return;
    composingUntil.set(input, event.type === 'compositionstart' ? Infinity : view.performance.now() + 10);
    const state = states.get(input.closest('[data-ef-composer]'));
    if (state) clearKey(state);
  };
  const cancelAll = () => { for (const state of states.values()) cancel(state); };
  const visibility = () => { if (doc.hidden) cancelAll(); };
  const preferenceChange = () => { if (preference.matches) cancelAll(); };
  doc.addEventListener('click', click, true);
  doc.addEventListener('keydown', keyDown, true);
  doc.addEventListener('compositionstart', composition, true);
  doc.addEventListener('compositionend', composition, true);
  view.addEventListener('blur', cancelAll);
  doc.addEventListener('visibilitychange', visibility);
  preference.addEventListener('change', preferenceChange);
  return {
    sync,
    onMutations() { for (const state of states.values()) if (state.key) checkKey(state); },
    dispose() {
      for (const state of states.values()) disposeState(state);
      states.clear();
      doc.removeEventListener('click', click, true);
      doc.removeEventListener('keydown', keyDown, true);
      doc.removeEventListener('compositionstart', composition, true);
      doc.removeEventListener('compositionend', composition, true);
      view.removeEventListener('blur', cancelAll);
      doc.removeEventListener('visibilitychange', visibility);
      preference.removeEventListener('change', preferenceChange);
    }
  };
}
