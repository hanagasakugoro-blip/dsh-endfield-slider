/** Delegated visual feedback. It never prevents clicks, captures pointers or writes model parameters. */
export function installButtonMotion(doc) {
  const view = doc.defaultView;
  const preference = view.matchMedia('(prefers-reduced-motion: reduce)');
  const pointers = new Map();
  const animations = new Map();
  const held = new Map();
  let keyboard;
  const selector = '[data-ef-composer] [data-ef-send],.dsh-ef-trigger,.dsh-ef-panel button';
  const targetOf = target => {
    const button = target?.closest?.('button');
    return button?.matches(selector) && !button.disabled && !button.closest('[inert]') ? button : undefined;
  };
  function stop(button) {
    animations.get(button)?.cancel();
    animations.delete(button);
    held.delete(button);
    button.removeAttribute('data-ef-pressed');
    button.removeAttribute('data-ef-releasing');
  }
  function animate(button, frames, options, done) {
    if (!button.animate || preference.matches) return;
    const previous = animations.get(button);
    const animation = button.animate(frames, options);
    animations.set(button, animation);
    previous?.cancel();
    animation.finished.then(() => {
      if (animations.get(button) !== animation) return;
      if (options.fill === 'forwards' && !done) return;
      animations.delete(button);
      done?.();
    }).catch(() => {});
  }
  function press(button) {
    if (preference.matches) return;
    const current = view.getComputedStyle(button);
    const fromScale = current.scale === 'none' ? '1' : current.scale;
    const fromTranslate = current.translate === 'none' ? '0px 0px' : current.translate;
    button.removeAttribute('data-ef-releasing');
    button.setAttribute('data-ef-pressed', '');
    held.set(button, view.performance.now());
    animate(button, [{scale: fromScale, translate: fromTranslate}, {scale: '.955', translate: '0px 2px'}], {duration: 90, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards'});
  }
  function release(button, cancelled = false) {
    if (!held.has(button)) return;
    const started = held.get(button);
    const current = view.getComputedStyle(button);
    const fromScale = current.scale === 'none' ? '1' : current.scale;
    const fromTranslate = current.translate === 'none' ? '0px 0px' : current.translate;
    held.delete(button);
    button.removeAttribute('data-ef-pressed');
    if (preference.matches || !button.isConnected || button.disabled) { stop(button);return; }
    button.setAttribute('data-ef-releasing', '');
    // A quick tap still gets a visible compression; long presses return from their actual held size.
    const quick = view.performance.now() - started < 65 && !cancelled;
    const frames = quick ? [
      {scale: fromScale, translate: fromTranslate, offset: 0},
      {scale: '.955', translate: '0px 2px', offset: .24},
      {scale: '1', translate: '0px 0px', offset: 1}
    ] : [{scale: fromScale, translate: fromTranslate}, {scale: '1', translate: '0px 0px'}];
    animate(button, frames, {duration: quick ? 240 : 190, easing: 'cubic-bezier(.16,1,.3,1)'}, () => button.removeAttribute('data-ef-releasing'));
  }
  const pointerDown = event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const button = targetOf(event.target);
    if (!button) return;
    pointers.set(event.pointerId, button);press(button);
  };
  const pointerUp = event => {
    const button = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (button) release(button, event.type === 'pointercancel');
  };
  const keyDown = event => {
    if (![' ', 'Enter'].includes(event.key) || event.repeat) return;
    keyboard = targetOf(event.target);
    if (keyboard) press(keyboard);
  };
  const keyUp = event => {
    if (![' ', 'Enter'].includes(event.key)) return;
    if (keyboard) release(keyboard);
    keyboard = undefined;
  };
  const cancel = () => {
    for (const button of new Set([...held.keys(), ...animations.keys()])) stop(button);
    pointers.clear();keyboard = undefined;
  };
  const visibility = () => { if (doc.hidden) cancel(); };
  const preferenceChange = () => { if (preference.matches) cancel(); };
  const observer = new view.MutationObserver(() => {
    for (const button of new Set([...held.keys(), ...animations.keys()])) if (!button.isConnected || button.disabled) stop(button);
  });
  observer.observe(doc.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']});
  for (const [name, handler] of [['pointerdown',pointerDown],['pointerup',pointerUp],['pointercancel',pointerUp],['keydown',keyDown],['keyup',keyUp]]) doc.addEventListener(name, handler, true);
  view.addEventListener('blur', cancel);
  doc.addEventListener('visibilitychange', visibility);
  preference.addEventListener('change', preferenceChange);
  return () => {
    observer.disconnect();cancel();
    for (const [name, handler] of [['pointerdown',pointerDown],['pointerup',pointerUp],['pointercancel',pointerUp],['keydown',keyDown],['keyup',keyUp]]) doc.removeEventListener(name, handler, true);
    view.removeEventListener('blur', cancel);
    doc.removeEventListener('visibilitychange', visibility);
    preference.removeEventListener('change', preferenceChange);
  };
}
