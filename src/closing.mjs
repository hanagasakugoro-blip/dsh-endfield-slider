/** Visual-only snapshots stay inert and never retain the panel's event handlers. */
export const PANEL_CLOSE_MS = 300;
let closeSequence = 0;

function capturePseudo(view, source, side) {
  const computed = view.getComputedStyle(source, side);
  if (!computed.content || ['none', 'normal'].includes(computed.content) || computed.display === 'none') return null;
  const image = source.ownerDocument.createElement('span');
  image.className = 'dsh-ef-close-pseudo';
  for (const property of Array.from(computed)) image.style.setProperty(property, computed.getPropertyValue(property));
  image.style.setProperty('animation', 'none', 'important');
  image.style.setProperty('transition', 'none', 'important');
  if (computed.content.startsWith('"')) { try { image.textContent = JSON.parse(computed.content); } catch {} }
  return image;
}

export function capturePanelClose(sheet) {
  if (!sheet?.isConnected) return null;
  const view = sheet.ownerDocument.defaultView;
  if (view.matchMedia('(prefers-reduced-motion: reduce)').matches || !sheet.animate) return null;
  const rect = sheet.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const image = sheet.cloneNode(true);
  const originals = [sheet, ...sheet.querySelectorAll('*')];
  const copies = [image, ...image.querySelectorAll('*')];
  const scroll = [];
  for (let i = 0; i < originals.length; i++) {
    const source = originals[i], copy = copies[i], computed = view.getComputedStyle(source);
    if (i === 0) for (const property of [
      'box-sizing', 'display', 'flex-direction', 'align-items', 'justify-content', 'gap', 'padding',
      'border-top', 'border-right', 'border-bottom', 'border-left', 'background-color', 'background-image',
      'overflow-x', 'overflow-y', 'overscroll-behavior', 'scrollbar-width', 'scrollbar-color',
      'color', 'font-family', 'font-size', 'font-weight', 'font-stretch', 'line-height', 'letter-spacing'
    ]) copy.style.setProperty(property, computed.getPropertyValue(property));
    for (const property of ['opacity', 'transform', 'translate', 'rotate', 'scale', 'clip-path', 'filter', 'mask-image']) {
      copy.style.setProperty(property, computed.getPropertyValue(property));
    }
    for (const property of ['color', 'position', 'isolation', 'overflow-x', 'overflow-y']) copy.style.setProperty(property, computed.getPropertyValue(property), 'important');
    copy.style.setProperty('animation', 'none', 'important');
    copy.style.setProperty('transition', 'none', 'important');
    if (source.scrollTop || source.scrollLeft) {
      copy.setAttribute('data-ef-close-scroll', String(i));
      scroll.push({index: i, top: source.scrollTop, left: source.scrollLeft});
    }
    if ('value' in source && 'value' in copy) copy.value = source.value;
    if (source.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const before = capturePseudo(view, source, '::before'), after = capturePseudo(view, source, '::after');
      if (before) copy.prepend(before);
      if (after) copy.append(after);
    }
  }
  image.classList.replace('dsh-ef-panel', 'dsh-ef-close-image');
  image.removeAttribute('data-entry-impact');
  image.removeAttribute('data-closing');
  image.removeAttribute('inert');
  Object.assign(image.style, {
    position: 'absolute', inset: 'auto', left: '0px', top: '0px', margin: '0px',
    width: `${rect.width}px`, height: `${rect.height}px`, minHeight: '0px', maxHeight: 'none',
    visibility: 'visible', pointerEvents: 'none', transform: 'none', transformOrigin: '0 50%', translate: 'none', rotate: 'none', scale: 'none'
  });
  image.style.setProperty('position', 'absolute', 'important');
  return {image, scroll, document: sheet.ownerDocument, rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}};
}

function isolateSnapshot(image, prefix) {
  const nodes = [image, ...image.querySelectorAll('*')];
  const ids = new Map(nodes.filter(node => node.id).map(node => [node.id, `${prefix}-${node.id}`]));
  for (const node of nodes) for (const {name, value} of [...node.attributes]) {
    if (name.startsWith('on')) { node.removeAttribute(name); continue; }
    let next = value;
    for (const [old, replacement] of ids) {
      next = next.replaceAll(`#${old}`, `#${replacement}`);
      if (next === old) next = replacement;
    }
    if (next !== value) node.setAttribute(name, next);
  }
}

export function playPanelClose(snapshot, onFinish) {
  const {document: doc, image, rect, scroll} = snapshot, view = doc.defaultView;
  const layer = doc.createElement('div');
  layer.className = 'dsh-ef-panel-closing';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  const frame = doc.createElement('div');
  frame.className = 'dsh-ef-close-frame';
  Object.assign(frame.style, {left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`});
  layer.append(frame);
  const sequence = ++closeSequence, strips = [];
  const unit = Math.max(8, rect.height / 35);
  for (let y = 0, row = 0; y < rect.height; row++) {
    const height = Math.min(rect.height - y, Math.max(4, Math.round(unit * [.5, .85, 1.35, .65, 1.1, 1.6][row % 6])));
    const clip = doc.createElement('div'), copy = image.cloneNode(true);
    clip.className = 'dsh-ef-close-strip';
    Object.assign(clip.style, {top: `${y}px`, height: `${height}px`, width: `${Math.max(rect.width, view.innerWidth - rect.x)}px`});
    copy.style.top = `${-y}px`;
    isolateSnapshot(copy, `dsh-ef-close-${sequence}-${row}`);
    clip.append(copy);frame.append(clip);
    strips.push({copy, scale: 1.15 + (row * 7 % 11) * .14, shift: 12 + (row * 13 % 7) * 10});
    y += height;
  }
  doc.body.append(layer);
  const animations = [];
  for (const [row, strip] of strips.entries()) {
    if (scroll.length) {
      for (const at of scroll) {
        const node = at.index === 0 ? strip.copy : strip.copy.querySelector(`[data-ef-close-scroll="${at.index}"]`);
        node.scrollTop = at.top; node.scrollLeft = at.left;
      }
    }
    const animation = strip.copy.animate([
      {transform: 'translateX(0px) scaleX(1)'},
      {transform: `translateX(${strip.shift}px) scaleX(${strip.scale})`}
    ], {duration: PANEL_CLOSE_MS, easing: 'linear', fill: 'both'});
    animation.id = `dsh-ef-close-stretch-${row}`;
    animations.push(animation);
  }
  const fade = frame.animate([{opacity: 1}, {opacity: 0}], {duration: PANEL_CLOSE_MS, easing: 'ease-in-out', fill: 'both'});
  fade.id = 'dsh-ef-close-opacity';animations.push(fade);
  const preference = view.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    preference.removeEventListener('change', preferenceChange);
    view.removeEventListener('blur', finish);
    view.removeEventListener('resize', finish);
    doc.removeEventListener('visibilitychange', visibility);
    for (const animation of animations) animation.cancel();
    layer.remove();
  }
  function finish() { if (!disposed) { dispose(); onFinish(); } }
  const preferenceChange = () => { if (preference.matches) finish(); };
  const visibility = () => { if (doc.hidden) finish(); };
  preference.addEventListener('change', preferenceChange);
  view.addEventListener('blur', finish);
  view.addEventListener('resize', finish);
  doc.addEventListener('visibilitychange', visibility);
  fade.finished.then(finish).catch(() => {});
  return dispose;
}
