import {createMemory, createAccess} from './core.mjs';
import {createPickerComponent} from './ui.mjs';
import {installButtonMotion} from './motion.mjs';
import {installComposerEffects} from './composer.mjs';

export const inject = ['slots', 'sessions', 'remote', 'remote.session', 'modelDirectories'];

export function installLocalStyles(doc, css) {
  const body = doc.body;
  body.setAttribute('data-dsh-ef-slider', '');
  const style = doc.createElement('style');
  style.setAttribute('data-dsh-ef-styles', '');
  style.textContent = css;
  doc.head.append(style);
  const cards = new Set();
  const sends = new Set();
  const composerEffects = installComposerEffects(doc);
  let frame;
  const mark = () => {
    frame = undefined;
    for (const card of doc.querySelectorAll('[data-composer-card]')) {
      if (!card.querySelector('[data-composer-input]') || /cardWorkspaceTrigger/.test(card.className)) {
        card.removeAttribute('data-ef-composer');cards.delete(card);continue;
      }
      card.setAttribute('data-ef-composer', '');
      cards.add(card);
      // The host's primary buttons share an export in this verified release.
      // Identify those buttons once; their send/stop/disabled handlers remain owned by DSH.
      for (const button of card.querySelectorAll('button[class*="_primary"]')) {
        button.setAttribute('data-ef-send', '');
        sends.add(button);
      }
    }
    for (const card of cards) if (!card.isConnected) cards.delete(card);
    for (const button of sends) if (!button.isConnected || !button.closest('[data-ef-composer]')) { button.removeAttribute('data-ef-send');sends.delete(button); }
    composerEffects.sync(cards);
  };
  mark();
  const stopMotion = installButtonMotion(doc);
  const observer = new MutationObserver(records => {
    composerEffects.onMutations(records);
    if (frame !== undefined) return;
    if (!records.some(record => record.type === 'attributes'
      ? record.target.matches?.('[data-composer-card],[data-composer-input]')
      : [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches?.('[data-composer-card],[data-composer-input],button,[data-ef-composer-chrome],[data-ef-toolbar-chrome]') || node.querySelector?.('[data-composer-card],[data-composer-input],button[class*="_primary"]'))))) return;
    frame = window.requestAnimationFrame(mark);
  });
  observer.observe(body, {childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-composer-input', 'data-phase', 'disabled']});
  return () => {
    stopMotion();
    composerEffects.dispose();
    observer.disconnect();
    window.cancelAnimationFrame(frame);
    style.remove();
    body.removeAttribute('data-dsh-ef-slider');
    for (const card of cards) card.removeAttribute('data-ef-composer');
    for (const button of sends) button.removeAttribute('data-ef-send');
  };
}

export function apply(ctx) {
  ctx.effect(() => installLocalStyles(document, CSS), 'endfield: composer styles');
  let storage;
  try { storage = window.localStorage; } catch {}
  const memory = createMemory(storage);
  const Picker = createPickerComponent(React, ReactDOM);
  function Entry(props) {
    const access = React.useMemo(() => createAccess(ctx, [props.sessionId, props.__efBindingKey]), [props.sessionId, props.__efBindingKey]);
    return React.createElement(Picker, {key: JSON.stringify([props.sessionId, props.__efBindingKey]), access, memory, locked: props.locked});
  }
  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
    name: 'conversation.input.model', id: 'endfield-reasoning-slider/model', priority: -10,
    label: () => '模型与推理',
    inject: bindingKey => ({__efBindingKey: bindingKey})
  }, Entry));
}
