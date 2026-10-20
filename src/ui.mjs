import {EMPTY_STATE, modelKey, sameModel, levelsOf, choiceOf, effectiveEffort, selectionFor, cleanError} from './core.mjs';
import {capturePanelClose, playPanelClose} from './closing.mjs';

export function createPickerComponent(React, ReactDOM) {
  const h = React.createElement;
  const {useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore, useId} = React;
  const panelShakeAmplitude = 1 / 4;
  const panelShakeFrames = [
    [0, 0, 0, 0], [.08, -5, 3, -.35], [.16, 4, -3, .3], [.24, -4, -2, -.28],
    [.33, 5, 2, .35], [.42, -3, 3, -.25], [.51, 3, -2, .2], [.61, -2, -1, -.15],
    [.71, 2, 2, .12], [.82, -1, 1, -.08], [.92, 1, -1, .05], [1, 0, 0, 0]
  ].map(([offset, x, y, angle]) => ({offset, translate: `${x * panelShakeAmplitude}px ${y * panelShakeAmplitude}px`, rotate: `${angle * panelShakeAmplitude}deg`, easing: 'steps(1,end)'}));
  const chevron = () => h('svg', {className: 'dsh-ef-chevron', viewBox: '0 0 12 12', 'aria-hidden': true}, h('path', {d: 'M2 4 6 8 10 4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5}));
  const chipIcon = () => h('svg', {className: 'dsh-ef-trigger-icon', width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true}, h('path', {d: 'M4 4h8v8H4zM1 6h3M1 10h3M12 6h3M12 10h3M6 1v3M10 1v3M6 12v3M10 12v3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4}));
  const hatch = className => h('svg', {className: `dsh-ef-hatch ${className ?? ''}`, viewBox: '0 0 84 12', preserveAspectRatio: 'xMidYMid slice', focusable: 'false', 'aria-hidden': true},
    h('path', {d: 'M-6 12 6 0M2 12 14 0M10 12 22 0M18 12 30 0M26 12 38 0M34 12 46 0M42 12 54 0M50 12 62 0M58 12 70 0M66 12 78 0M74 12 86 0M82 12 94 0', fill: 'none', stroke: 'currentColor', strokeWidth: 1}));
  // The cover enters first; only its second pass exposes the panel through a short particle trail.
  const dissolveCells = Array.from({length: 32}, (_, i) => {
    const column = i % 4, row = Math.floor(i / 4);
    const size = [4, 7, 11, 15][column] + ((row * 5 + column * 2) % 3 - 1);
    return {x: column * 18 + (18 - size) / 2, y: row * 18 + (18 - size) / 2, width: size, height: size,
      style: {'--ef-particle-color': i % 5 === 0 ? '#fffa00' : '#161616', '--ef-particle-drift': `${((i * 7) % 17) - 8}px`, '--ef-particle-delay': `${(i % 3) * 37}ms`}};
  });
  const impactTiles = [
    ['0%', '18%', '64%', '8%', '#f05080'], ['42%', '32%', '58%', '6%', '#207080'],
    ['0%', '48%', '84%', '9%', '#e0b080'], ['26%', '63%', '74%', '7%', '#306080'],
    ['12%', '75%', '45%', '10%', '#a0dd80'], ['74%', '15%', '12%', '16%', '#d02080'],
    ['8%', '34%', '10%', '13%', '#40dc80']
  ];
  const revealMask = (key, name) => h('span', {key, className: 'dsh-ef-panel-opening', 'aria-hidden': true},
    h('svg', {width: '100%', height: '100%', focusable: 'false'},
      h('defs', null,
        h('filter', {id: `${name}-shift`, x: '-4%', y: '-4%', width: '108%', height: '108%', colorInterpolationFilters: 'sRGB'},
          h('feFlood', {floodColor: 'rgb(50%,50%,50%)', result: 'neutral'}),
          impactTiles.map(([x, y, width, height, floodColor], i) => h('feFlood', {key: i, x, y, width, height, floodColor, result: `tile-${i}`})),
          h('feMerge', {result: 'tiles'}, h('feMergeNode', {in: 'neutral'}), impactTiles.map((_, i) => h('feMergeNode', {key: i, in: `tile-${i}`}))),
          h('feDisplacementMap', {in: 'SourceGraphic', in2: 'tiles', scale: 18, xChannelSelector: 'R', yChannelSelector: 'G'})),
        h('pattern', {id: `${name}-pixels`, width: 72, height: 144, patternUnits: 'userSpaceOnUse', patternTransform: 'translate(-72 0)'},
          dissolveCells.map((cell, i) => h('rect', {key: i, className: 'dsh-ef-reveal-pixel', ...cell}))),
        h('pattern', {id: `${name}-dots`, width: 12, height: 12, patternUnits: 'userSpaceOnUse'},
          h('circle', {className: 'dsh-ef-reveal-dot', cx: 6, cy: 6, r: 2.2})),
        h('mask', {id: name, x: 0, y: 0, width: '100%', height: '100%', maskUnits: 'userSpaceOnUse', style: {maskType: 'luminance'}},
          h('rect', {className: 'dsh-ef-cover-in dsh-ef-cover-mask', width: '100%', height: '100%', fill: '#fff'}))),
      h('g', {className: 'dsh-ef-cover-in dsh-ef-cover-layer'},
        h('g', {className: 'dsh-ef-cover-out'},
          h('rect', {className: 'dsh-ef-cover-ink', width: '100%', height: '100%'}),
          h('rect', {className: 'dsh-ef-cover-yellow', x: '72%', width: '28%', height: '100%'}),
          h('rect', {x: -72, width: 72, height: '100%', fill: `url(#${name}-pixels)`}),
          h('rect', {x: -96, width: 24, height: '100%', fill: `url(#${name}-dots)`})))));
  const waveFill = () => h('span', {className: 'dsh-ef-wave', 'aria-hidden': true},
    h('span', {className: 'dsh-ef-wave-layer dsh-ef-wave-layer--mist'}, h('svg', {viewBox: '0 0 400 40', preserveAspectRatio: 'none', focusable: 'false'},
      h('path', {d: 'M0 17C33 35 66 35 100 17S166-1 200 17S266 35 300 17S366-1 400 17V40H0Z'}))),
    h('span', {className: 'dsh-ef-wave-layer dsh-ef-wave-layer--paper'}, h('svg', {viewBox: '0 0 400 40', preserveAspectRatio: 'none', focusable: 'false'},
      h('path', {d: 'M0 26C33 8 66 8 100 26S166 44 200 26S266 8 300 26S366 44 400 26V40H0Z'}))));

  return function Picker({access, memory, locked = false}) {
    const state = useSyncExternalStore(access.subscribe, access.getSnapshot, () => EMPTY_STATE);
    const [open, setOpen] = useState(false);
    const [rendered, setRendered] = useState(false);
    const [opening, setOpening] = useState(false);
    const [entrySequence, setEntrySequence] = useState(0);
    const [pane, setPane] = useState(null);
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const [slow, setSlow] = useState(false);
    const [confirmation, setConfirmation] = useState(null);
    const [saved, setSaved] = useState(false);
    const [position, setPosition] = useState(null);
    const panel = useRef(null);
    const trigger = useRef(null);
    const search = useRef(null);
    const gesture = useRef(null);
    const closingSnapshot = useRef(null);
    const alive = useRef(true);
    const writing = useRef(false);
    const live = useRef(null);
    const id = useId();
    const revealId = `dsh-ef-reveal-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const choice = choiceOf(state);
    const levels = levelsOf(choice?.model);
    const effective = effectiveEffort(choice?.model, state.current);
    const committedIndex = levels.findIndex(x => x.id === effective);
    const signature = JSON.stringify([state.current?.provider, state.current?.model, state.current?.reasoningEffort, levels.map(x => x.id)]);
    // Position stays continuous during a drag; only the preview label and saved value are discrete.
    const preview = draft?.signature === signature ? draft : null;
    const index = preview?.index ?? committedIndex;
    const label = levels[index]?.name;
    const busy = saving || !!state.pending || state.status === 'selecting';
    const disabled = locked || busy;
    const ready = state.status === 'ready' || state.status === 'error';
    const confirmed = saved && !busy && !preview && sameModel(state.current, confirmation) && effective === confirmation?.effort;
    live.current = {state, signature, levels, choice, disabled};
    const provider = state.groups.find(x => x.id === pane);
    const filtered = provider?.models.filter(model => model.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];

    useEffect(() => {
      alive.current = true;
      const stop = access.start();
      return () => { alive.current = false; stop(); };
    }, [access]);

    // Observe the authoritative value, including successful changes through /model.
    // Never restore browser memory over a host value on first mount.
    useEffect(() => {
      if (state.status === 'ready' && !state.pending && choice && effective !== undefined) {
        memory.set(choice.group.id, choice.model.id, effective);
      }
    }, [memory, state.status, state.pending, signature]);

    function cancelGesture() {
      const previous = gesture.current;
      gesture.current = null;
      setDraft(null);
      if (previous?.element?.hasPointerCapture?.(previous.pointer)) previous.element.releasePointerCapture(previous.pointer);
    }
    useEffect(() => {
      // A pending write must retain its snap target instead of returning to the old host value.
      if (gesture.current) cancelGesture();
    }, [signature, disabled]);
    useEffect(() => { if (locked) close(false); }, [locked]);
    useEffect(() => {
      if (saved && (busy || !sameModel(state.current, confirmation) || effective !== confirmation?.effort)) setSaved(false);
    }, [saved, busy, signature, effective, confirmation]);
    useEffect(() => {
      if (!saved) return;
      const timer = window.setTimeout(() => setSaved(false), 1600);
      return () => window.clearTimeout(timer);
    }, [saved, confirmation]);
    useEffect(() => {
      const sheet = panel.current;
      const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (!open || !rendered || !confirmed || !sheet?.animate || preference.matches) return;
      // Independent properties preserve the panel's entry/exit and every child's feedback.
      const animation = sheet.animate(panelShakeFrames, {duration: 146});
      animation.id = 'dsh-ef-panel-confirm';
      const preferenceChange = () => { if (preference.matches) animation.cancel(); };
      preference.addEventListener('change', preferenceChange);
      return () => {
        preference.removeEventListener('change', preferenceChange);
        animation.cancel();
      };
    }, [open, rendered, confirmed, confirmation?.sequence]);
    useLayoutEffect(() => {
      if (open) { setRendered(true); return; }
      cancelGesture();
      const snapshot = closingSnapshot.current;
      closingSnapshot.current = null;
      if (!rendered) return;
      const finish = () => { setRendered(false); setPosition(null); };
      if (!snapshot || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
      return playPanelClose(snapshot, finish);
    }, [open, rendered]);

    useLayoutEffect(() => {
      if (!open || !rendered || !position || !opening) return;
      const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (preference.matches) { setOpening(false); return; }
      panel.current.scrollTop = 0;
      const finish = () => setOpening(false);
      const preferenceChange = () => { if (preference.matches) finish(); };
      const visibility = () => { if (document.hidden) finish(); };
      const timer = window.setTimeout(finish, 530);
      preference.addEventListener('change', preferenceChange);
      window.addEventListener('blur', finish);
      document.addEventListener('visibilitychange', visibility);
      return () => {
        window.clearTimeout(timer);
        preference.removeEventListener('change', preferenceChange);
        window.removeEventListener('blur', finish);
        document.removeEventListener('visibilitychange', visibility);
      };
    }, [open, rendered, !!position, opening, entrySequence]);

    function close(restoreFocus = true) {
      if (!open) return;
      closingSnapshot.current = capturePanelClose(panel.current);
      cancelGesture();
      setOpen(false);
      setOpening(false);
      if (restoreFocus) trigger.current?.focus({preventScroll: true});
    }
    function show() {
      if (locked) return;
      if (open) { close(); return; }
      setPane(null);
      setQuery('');
      setNotice('');
      setSaved(false);
      closingSnapshot.current = null;
      setOpening(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      setEntrySequence(value => value + 1);
      setOpen(true);
      access.load();
    }

    useLayoutEffect(() => {
      if (!open || !rendered) return;
      let frame;
      const place = () => {
        const button = trigger.current;
        const bounds = button?.getBoundingClientRect();
        const sheet = panel.current;
        if (!bounds || !sheet) return;
        if (!button.getClientRects().length || !bounds.width || !bounds.height) { close(false); return; }
        // Anchor to the button's resting layout rather than its press/release motion.
        const style = window.getComputedStyle(button);
        const [scaleX, scaleY = scaleX] = style.scale === 'none' ? [1] : style.scale.split(' ').map(Number);
        const [shiftX = 0, shiftY = 0] = style.translate === 'none' ? [] : style.translate.split(' ').map(parseFloat);
        const [originX, originY] = style.transformOrigin.split(' ').map(parseFloat);
        const anchor = {
          top: bounds.top - shiftY - originY * (1 - scaleY),
          bottom: bounds.bottom - shiftY + bounds.height / scaleY - bounds.height - originY * (1 - scaleY),
          right: bounds.right - shiftX + bounds.width / scaleX - bounds.width - originX * (1 - scaleX)
        };
        const width = Math.min(420, window.innerWidth - 24);
        const above = anchor.top - 20;
        const below = window.innerHeight - anchor.bottom - 20;
        const up = above >= Math.min(sheet.scrollHeight, 300) || above >= below;
        const maxHeight = Math.max(80, up ? above : below);
        const next = {
          left: Math.max(12, Math.min(window.innerWidth - width - 12, anchor.right - width)),
          ...(up ? {bottom: window.innerHeight - anchor.top + 8} : {top: anchor.bottom + 8}),
          maxHeight: Math.min(window.innerHeight - 24, maxHeight), width
        };
        setPosition(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
      };
      const schedule = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(place); };
      place();
      const observer = new ResizeObserver(schedule);
      observer.observe(trigger.current);
      observer.observe(panel.current);
      window.addEventListener('resize', schedule);
      window.addEventListener('scroll', schedule, true);
      window.visualViewport?.addEventListener('resize', schedule);
      window.visualViewport?.addEventListener('scroll', schedule);
      return () => {
        observer.disconnect();
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', schedule);
        window.removeEventListener('scroll', schedule, true);
        window.visualViewport?.removeEventListener('resize', schedule);
        window.visualViewport?.removeEventListener('scroll', schedule);
      };
    }, [open, rendered, pane, query, state.groups, levels.length]);

    useEffect(() => {
      if (!open || !rendered) return;
      const target = search.current ?? panel.current?.querySelector('[data-ef-option][aria-pressed=true]') ?? panel.current?.querySelector('[data-ef-option]') ?? panel.current?.querySelector('button');
      target?.focus({preventScroll: true});
    }, [open, rendered, pane]);

    useEffect(() => {
      if (!open) return;
      const outside = event => {
        if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(false);
      };
      document.addEventListener('pointerdown', outside, true);
      return () => document.removeEventListener('pointerdown', outside, true);
    }, [open]);

    async function commit(selection) {
      if (writing.current || live.current.disabled || !ready) return;
      const current = live.current.state;
      const target = choiceOf(current, selection);
      if (!target) { setNotice('模型目录已变化，请重新选择。'); return; }
      const savedEffort = current.current?.reasoningEffort;
      const savedValid = savedEffort === undefined || levelsOf(target.model).some(level => level.id === savedEffort);
      if (sameModel(current.current, selection) && savedValid && effectiveEffort(target.model, current.current) === effectiveEffort(target.model, selection)) {
        setDraft(null); return;
      }
      writing.current = true;
      setSaving(true);
      setSlow(false);
      setSaved(false);
      setNotice('');
      const timer = window.setTimeout(() => { if (alive.current) setSlow(true); }, 15000);
      try {
        await access.select(selection);
        const actual = effectiveEffort(target.model, selection);
        if (alive.current) {
          setConfirmation(value => ({sequence: (value?.sequence ?? 0) + 1, ...selection, effort: actual, modelChanged: !sameModel(current.current, selection)}));
          setSaved(true);
        }
        if (actual !== undefined) memory.set(selection.provider, selection.model, actual);
      } catch (error) {
        if (alive.current) setNotice(`未保存。${cleanError(error)}`);
      } finally {
        window.clearTimeout(timer);
        writing.current = false;
        if (alive.current) { setSaving(false); setSlow(false); setDraft(null); }
      }
    }

    function selectLevel(next, startedWith = signature) {
      const now = live.current;
      if (now.signature !== startedWith || now.disabled || writing.current || !now.choice || !now.levels[next]) { cancelGesture(); return; }
      setSaved(false);
      setDraft({signature: now.signature, type: 'snap', index: next, ratio: now.levels.length > 1 ? next / (now.levels.length - 1) : 0});
      const effort = now.levels[next].id;
      commit({provider: now.choice.group.id, model: now.choice.model.id, ...(effort === null ? {} : {reasoningEffort: effort})});
    }
    function pointValue(event, element) {
      const rect = element.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
      return {ratio, index: Math.round(ratio * (levels.length - 1))};
    }
    function pointerDown(event) {
      if (disabled || levels.length < 2 || event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault();
      event.currentTarget.focus({preventScroll: true});
      const next = pointValue(event, event.currentTarget);
      gesture.current = {type: 'pointer', pointer: event.pointerId, element: event.currentTarget, signature, index: next.index};
      event.currentTarget.setPointerCapture(event.pointerId);
      setSaved(false);
      // A track tap glides to its target; the first movement switches to direct finger tracking.
      setDraft({signature, type: 'press', ...next});
    }
    function pointerMove(event) {
      const current = gesture.current;
      if (current?.type !== 'pointer' || current.pointer !== event.pointerId) return;
      const next = pointValue(event, event.currentTarget);
      current.index = next.index;
      setDraft({signature: current.signature, type: 'pointer', ...next});
    }
    function pointerUp(event) {
      const current = gesture.current;
      if (current?.type !== 'pointer' || current.pointer !== event.pointerId) return;
      const next = pointValue(event, event.currentTarget);
      gesture.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      selectLevel(next.index, current.signature);
    }
    function sliderKeyDown(event) {
      if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); cancelGesture(); return; }
      const steps = {ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 2, PageDown: -2};
      if (!(event.key in steps) && event.key !== 'Home' && event.key !== 'End') return;
      if (disabled || levels.length < 2) return;
      event.preventDefault();event.stopPropagation();
      const old = gesture.current?.index ?? Math.max(0, index);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? levels.length - 1 : Math.max(0, Math.min(levels.length - 1, old + steps[event.key]));
      if (gesture.current?.type === 'pointer') cancelGesture();
      gesture.current = {type: 'keyboard', signature, index: next};
      setSaved(false);
      setDraft({signature, type: 'keyboard', index: next, ratio: next / (levels.length - 1)});
    }
    function sliderKeyUp(event) {
      if (!['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) return;
      const current = gesture.current;
      if (current?.type === 'keyboard') {
        gesture.current = null;
        selectLevel(current.index, current.signature);
      }
    }
    function keyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();event.stopPropagation();
        if (gesture.current) { cancelGesture(); return; }
        if (pane !== null) { setPane(null); setQuery(''); return; }
        close();return;
      }
      if (event.target.getAttribute('role') === 'slider') return;
      if (event.key === 'Tab') {
        const focusable = [...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(x => x.getClientRects().length);
        const at = focusable.indexOf(document.activeElement);
        if (event.shiftKey && at <= 0) { event.preventDefault();focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && at === focusable.length - 1) { event.preventDefault();focusable[0]?.focus(); }
      }
      if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
      const options = [...panel.current.querySelectorAll('[data-ef-option]:not(:disabled)')];
      if (!options.length) return;
      const at = options.indexOf(document.activeElement);
      if (at < 0 && event.target !== search.current) return;
      event.preventDefault();
      options[(at + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
    }

    const caption = choice?.model.name ?? (state.status === 'loading' ? '正在读取模型' : '请选择模型');
    const currentLabel = levels[committedIndex]?.name;
    const totalModels = state.groups.reduce((n, group) => n + group.models.length, 0);
    const rangeDisabled = disabled || !ready || committedIndex < 0 || levels.length < 2;
    const progress = (preview?.ratio ?? (levels.length > 1 && index >= 0 ? index / (levels.length - 1) : 0)) * 100;
    const selectionFlash = () => confirmed && h('i', {key: confirmation.sequence, className: 'dsh-ef-selection-flash', 'aria-hidden': true});
    const footer = slow ? '保存仍在等待宿主确认。' : busy ? '正在保存…' : preview ? '正在预览 / 松手后保存' : saved ? '已保存 / 用于下一次请求' : '连续拖动 / 松手吸附并保存';
    const button = h('button', {
      type: 'button', className: 'dsh-ef dsh-ef-trigger', ref: trigger, disabled: locked,
      'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': rendered ? id : undefined,
      'aria-label': `${caption}${currentLabel ? `，推理等级 ${currentLabel}` : ''}，选择模型与推理等级`,
      title: `${caption}${currentLabel ? ` / ${currentLabel}` : ''}`, onClick: show
    }, waveFill(), chipIcon(), h('span', {className: 'dsh-ef-trigger-name'}, caption), currentLabel && h('span', {className: 'dsh-ef-trigger-effort'}, currentLabel), chevron(), confirmed && h('i', {key: confirmation.sequence, className: 'dsh-ef-confirm-flash', 'aria-hidden': true}));

    const options = provider ? filtered.map((model, row) => {
      const selected = sameModel(state.current, {provider: provider.id, model: model.id});
      return h('button', {
        key: model.id, type: 'button', className: 'dsh-ef-option', 'data-ef-option': '', 'aria-pressed': selected,
        style: {'--ef-row-order': Math.min(row, 5)},
        disabled: disabled || !ready, onClick: () => commit(selectionFor(provider, model, memory, live.current.state.current))
      }, h('span', {className: 'dsh-ef-option-copy'}, h('i', {className: 'dsh-ef-mark', 'aria-hidden': true}), h('span', {className: 'dsh-ef-option-index', 'aria-hidden': true}, String(provider.models.indexOf(model) + 1).padStart(2, '0')), h('span', {className: 'dsh-ef-option-name'}, model.name)),
        h('span', {className: 'dsh-ef-option-meta'}, h('span', {className: 'dsh-ef-count'}, levelsOf(model).length > 1 ? `${levelsOf(model).length} 档` : ''), selected && h('span', {className: 'dsh-ef-selected-icon', 'aria-hidden': true}, '✓')), selected && confirmation?.modelChanged && selectionFlash());
    }) : state.groups.map((group, row) => h('button', {
      key: group.id, type: 'button', className: 'dsh-ef-option', 'data-ef-option': '',
      style: {'--ef-row-order': Math.min(row, 5)},
      'aria-pressed': state.current?.provider === group.id, onClick: () => { setPane(group.id);setQuery(''); }
    }, h('span', {className: 'dsh-ef-option-copy'}, h('i', {className: 'dsh-ef-mark', 'aria-hidden': true}), h('span', {className: 'dsh-ef-option-index', 'aria-hidden': true}, String(row + 1).padStart(2, '0')), h('span', {className: 'dsh-ef-option-name'}, group.name)), h('span', {className: 'dsh-ef-option-meta'}, h('span', {className: 'dsh-ef-count'}, `${group.models.length} 模型`), h('span', {className: 'dsh-ef-option-arrow', 'aria-hidden': true}, '↗'))));

    const entering = open && opening && !!position;
    const sheet = rendered && h('section', {
      ref: panel, id, role: 'dialog', 'aria-label': '模型与推理', 'aria-modal': false,
      'aria-hidden': !open || undefined, inert: !open ? true : undefined,
      'aria-busy': busy || state.status === 'loading', className: 'dsh-ef dsh-ef-panel', 'data-closing': !open ? '' : undefined,
      'data-entry-impact': entering ? '' : undefined,
      style: {...position, visibility: position ? 'visible' : 'hidden', maskImage: entering ? `url(#${revealId})` : undefined, '--ef-entry-pixel-filter': entering ? `url(#${revealId}-shift)` : undefined}, onKeyDown: keyDown
    },
      open && opening && position && revealMask(entrySequence, revealId),
      h('header', {className: 'dsh-ef-header'},
        h('span', {className: 'dsh-ef-header-word', 'aria-hidden': true}, 'MODEL'), hatch('dsh-ef-header-hatch'),
        h('div', {className: 'dsh-ef-header-copy'}, h('div', {className: 'dsh-ef-eyebrow'}, '// MODEL & REASONING'), h('h2', {className: 'dsh-ef-title'}, '模型与推理')),
        h('button', {type: 'button', className: 'dsh-ef-icon-button', 'aria-label': '关闭模型面板', onClick: () => close()}, '×')),
      h('div', {className: 'dsh-ef-nav'}, h('div', {className: 'dsh-ef-nav-title'}, pane !== null && h('button', {type: 'button', className: 'dsh-ef-icon-button', 'aria-label': '返回提供方', onClick: () => { setPane(null);setQuery(''); }}, '‹'),
        h('span', {className: 'dsh-ef-nav-step', 'aria-hidden': true}, provider ? '02' : '01'), h('div', {className: 'dsh-ef-nav-copy'}, h('span', {className: 'dsh-ef-eyebrow'}, provider ? 'MODELS' : 'PROVIDERS'), h('span', {className: 'dsh-ef-nav-name'}, provider?.name ?? '模型提供方'))),
        h('span', {className: 'dsh-ef-count'}, provider ? `${filtered.length} / ${provider.models.length} 模型` : `${state.groups.length} 提供方`)),
      provider && h('input', {type: 'search', className: 'dsh-ef-search', ref: search, placeholder: '搜索模型', 'aria-label': '搜索模型', value: query, onChange: event => setQuery(event.target.value)}),
      h('div', {key: `${pane ?? 'providers'}:${query}`, className: 'dsh-ef-list', 'data-ef-direction': pane === null ? 'back' : 'forward', role: 'group', 'aria-label': provider ? `${provider.name}的模型` : '模型提供方'}, options,
        !options.length && h('p', {className: 'dsh-ef-empty', role: 'status'}, state.status === 'loading' ? '正在读取宿主模型目录…' : provider ? '没有匹配的模型。' : '宿主暂未提供可用模型。')),
      state.error && !notice && h('div', {className: 'dsh-ef-notice', role: 'status'}, cleanError(state.error), h('button', {type: 'button', className: 'dsh-ef-retry', disabled: busy, onClick: () => access.load()}, '重试')),
      state.failures.map((failure, i) => h('div', {key: i, className: 'dsh-ef-notice', role: 'status'}, cleanError(failure.message ?? failure.error?.message ?? failure.provider ?? '此提供方暂不可用。'))),
      h('div', {className: 'dsh-ef-effort'},
        h('div', {className: 'dsh-ef-effort-heading'}, h('div', null, h('div', {className: 'dsh-ef-eyebrow'}, '// REASONING EFFORT'), h('h3', null, '推理等级')),
          label && h('div', {className: 'dsh-ef-value'}, h('span', {className: 'dsh-ef-level-position', 'aria-label': `第 ${index + 1} 档，共 ${levels.length} 档`}, h('b', null, String(index + 1).padStart(2, '0')), h('span', null, `/ ${String(levels.length).padStart(2, '0')}`)), h('strong', {key: `${state.current?.provider}:${state.current?.model}:${index}`, title: label}, label, selectionFlash()))),
        h('div', {className: 'dsh-ef-effort-divider', 'aria-hidden': true}, h('span', null), hatch()),
        levels.length ? h(React.Fragment, null,
          h('div', {
            role: 'slider', className: 'dsh-ef-range', tabIndex: rangeDisabled ? -1 : 0,
            'aria-label': '推理等级', 'aria-orientation': 'horizontal', 'aria-valuemin': 0, 'aria-valuemax': Math.max(0, levels.length - 1),
            'aria-valuenow': Math.max(0, index), 'aria-valuetext': label ?? '等待宿主默认值', 'aria-disabled': rangeDisabled,
            'data-dragging': preview?.type === 'pointer' ? '' : undefined, style: {'--ef-progress': `${progress}%`, '--ef-ratio': progress / 100},
            onPointerDown: rangeDisabled ? undefined : pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp,
            onPointerCancel: cancelGesture, onLostPointerCapture: () => { if (gesture.current?.type === 'pointer') cancelGesture(); },
            onKeyDown: sliderKeyDown, onKeyUp: sliderKeyUp,
            onBlur: () => {
              const current = gesture.current;
              if (current?.type === 'keyboard') { gesture.current = null; selectLevel(current.index, current.signature); }
            }
          }, h('div', {className: 'dsh-ef-track', 'aria-hidden': true}, h('div', {className: 'dsh-ef-fill'})), levels.map((level, i) => h('i', {key: level.id ?? '@default', className: 'dsh-ef-tick', 'data-ef-active': i === index ? '' : undefined, 'aria-hidden': true, style: {left: `${levels.length > 1 ? i / (levels.length - 1) * 100 : 0}%`}})), h('div', {className: 'dsh-ef-cursor', 'aria-hidden': true}, h('div', {key: `${state.current?.provider}:${state.current?.model}:${confirmation?.sequence ?? 0}`, className: 'dsh-ef-thumb'}, selectionFlash()))),
          h('div', {className: 'dsh-ef-labels', style: {'--ef-level-count': levels.length}}, levels.map((level, i) => h('button', {
            key: level.id ?? '@default', type: 'button', className: 'dsh-ef-label', title: level.name,
            'aria-label': `推理等级：${level.name}`, 'aria-pressed': i === index, disabled: disabled || !ready,
            onClick: () => selectLevel(i)
          }, level.name, i === committedIndex && selectionFlash()))),
          h('p', {className: 'dsh-ef-hint', role: 'status', 'aria-live': 'polite'}, levels.length === 1 ? '此模型只提供一个推理档位。' : footer)
        ) : h('p', {className: 'dsh-ef-empty'}, choice ? '此模型未公布可调推理等级。' : '选择可用模型后，将显示它支持的推理等级。')),
      notice && h('div', {className: 'dsh-ef-notice', role: 'alert'}, notice),
      h('footer', {className: 'dsh-ef-footer'}, h('span', null, h('i', {className: 'dsh-ef-footer-mark', 'aria-hidden': true}), '用于下一次请求'), h('span', null, `${totalModels} 模型`))
    );
    return h(React.Fragment, null, button, sheet && ReactDOM.createPortal(sheet, document.body));
  };
}
