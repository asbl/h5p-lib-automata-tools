import AutomataModelNormalizer from '../model/automata-model-normalizer';
import AutomataValidator from '../model/automata-validator';
import { formatSymbol } from '../model/automata-symbols';

const DRAG_THRESHOLD = 6;  // px in SVG-Koordinaten bis Drag erkannt wird
const STATE_RADIUS   = 28;
const INNER_RADIUS   = 18; // Radius der Kern-Zone: Drag bewegt selektierten Zustand
const HIT_RADIUS     = 34; // Mindest-Treffzone für Drop-Target-Erkennung
const SNAP_RADIUS    = 46; // Snap-Zone außerhalb des Kreises → Transition-Start

/**
 * Gestenbasierter SVG-Editor für DFA/NFA-Automaten.
 *
 * Interaktionsmodell (keine Toolbar-Modi mehr):
 *  - Klick auf freie Fläche          → Auswahl aufheben
 *  - Doppelklick auf freie Fläche    → Zustand erstellen
 *  - Klick auf Zustand               → Zustand auswählen
 *  - Doppelklick auf Zustand         → Akzeptierend toggeln
 *  - Drag von ausgewähltem Zustand   → Zustand verschieben
 *  - Drag von nicht-selektiertem Zustand auf anderen Zustand → Transition erstellen
 *  - Drag von leerer Fläche auf Zustand → Initial State setzen
 *
 * Toolbar zeigt Initial/Accept nur wenn Zustand ausgewählt ist.
 *
 * Öffentliche API (adapter-kompatibel):
 *  getDOM(), getModel(), setModel(), getValue(), setValue(), highlightTraceFrame(), focus()
 */
export default class AutomataSvgEditor {
  constructor(options = {}) {
    this.normalizer = options.normalizer || new AutomataModelNormalizer({
      defaultType: options.type || 'dfa',
    });
    this.validator  = options.validator || new AutomataValidator();
    this.onChange   = typeof options.onChange === 'function' ? options.onChange : () => {};
    this.model      = this.normalizer.normalize(options.model);
    this.selected   = null;
    this.traceFrame = null;

    // Aktiver Drag/Interaction-Zustand
    this._ix           = null;  // { type, ...Felder, hasDragged }
    this._wasDrag      = false; // unterdrückt click nach mouseup mit Drag
    this._snapSelectId = null;  // Zustand-ID bei Snap-Zone-Klick (kein Drag)

    this.dom = this._createDOM();
    this.render();
  }

  // ── Öffentliche API ───────────────────────────────────────────────────────

  getDOM() { return this.dom; }

  getModel() { return this.normalizer.normalize(this.model); }

  setModel(model) {
    this.model      = this.normalizer.normalize(model);
    this.selected   = null;
    this.traceFrame = null;
    this._ix        = null;
    this.render();
  }

  getValue() { return JSON.stringify(this.getModel(), null, 2); }
  setValue(value) { this.setModel(value); }

  highlightTraceFrame(frame = null) {
    this.traceFrame = frame;
    this.render();
  }

  focus() { this.svg?.focus?.(); }

  // ── DOM-Aufbau ────────────────────────────────────────────────────────────

  _createDOM() {
    const root = document.createElement('div');
    root.className = 'h5p-automata-editor';

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'h5p-automata-toolbar';

    // Nur Aktions-Buttons – kein Modus-Umschalten mehr nötig
    this._btnAccept  = this._makeBtn('accepting', 'Accept',   () => this._toggleAccepting());
    this._btnInitial = this._makeBtn('initial',   'Initial',  () => this._setInitial());
    this._btnDelete  = this._makeBtn('delete',    'Delete',   () => this._deleteSelected());

    this.status = document.createElement('div');
    this.status.className = 'h5p-automata-editor-status';

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('h5p-automata-canvas');
    this.svg.setAttribute('viewBox', '0 0 720 360');
    this.svg.setAttribute('tabindex', '0');

    this.svg.addEventListener('mousedown',  (e) => this._onCanvasMouseDown(e));
    this.svg.addEventListener('mousemove',  (e) => this._onPointerMove(e));
    this.svg.addEventListener('mouseup',    (e) => this._onPointerUp(e));
    this.svg.addEventListener('mouseleave', ()  => this._onPointerLeave());
    this.svg.addEventListener('click',      (e) => this._onCanvasClick(e));
    this.svg.addEventListener('dblclick',   (e) => this._onCanvasDblClick(e));

    root.append(this.svg, this.toolbar, this.status);
    return root;
  }

  _makeBtn(action, label, callback) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `h5p-automata-toolbar-button ${action}`;
    btn.textContent = label;
    btn.addEventListener('click', callback);
    this.toolbar.append(btn);
    return btn;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    this._renderToolbar();
    this.svg.innerHTML = '';
    this.svg.append(this._createArrowMarker());
    this.model.transitions.forEach((t) => this._renderTransition(t));
    this.model.states.forEach((s) => this._renderState(s));
    if (this._ix?.hasDragged) this._renderGhost();
    this._renderStatus();
  }

  _renderToolbar() {
    const stateSelected    = this.selected?.type === 'state';
    const anythingSelected = this.selected !== null;

    this._btnAccept.hidden  = !stateSelected;
    this._btnInitial.hidden = !stateSelected;
    this._btnDelete.hidden  = !anythingSelected;

    if (stateSelected) {
      const state = this._getState(this.selected.id);
      this._btnAccept.textContent = state?.accepting ? 'No Accept' : 'Accept';
    }
  }

  _renderState(state) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('h5p-automata-state');
    group.classList.toggle('selected',
      this.selected?.type === 'state' && this.selected.id === state.id);
    group.classList.toggle('active',
      this.traceFrame?.activeStates?.includes(state.id) === true);

    // Drop-Target-Hervorhebung beim Dragging
    const ix = this._ix;
    const isDropTarget = ix?.hasDragged && ix.hoverStateId === state.id && (
      (ix.type === 'drag-transition' && ix.stateId !== state.id) ||
      ix.type === 'drag-initial'
    );
    group.classList.toggle('drop-target', isDropTarget);
    group.setAttribute('data-state-id', state.id);

    group.addEventListener('mousedown', (e) => this._onStateMouseDown(e, state));
    group.addEventListener('click',     (e) => this._onStateClick(e, state));
    group.addEventListener('dblclick',  (e) => this._onStateDblClick(e, state));

    if (state.initial) {
      const arrow = this._createLine(state.x - 58, state.y, state.x - 32, state.y);
      arrow.classList.add('h5p-automata-initial-arrow');
      arrow.setAttribute('marker-end', 'url(#h5p-automata-arrow)');
      group.append(arrow);
    }

    group.append(this._createCircle(state.x, state.y, STATE_RADIUS));
    if (state.accepting) {
      group.append(this._createCircle(state.x, state.y, 22));
    }

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', state.x);
    text.setAttribute('y', state.y + 5);
    text.textContent = state.label;
    group.append(text);

    this.svg.append(group);
  }

  _renderTransition(transition) {
    const from = this._getState(transition.from);
    const to   = this._getState(transition.to);
    if (!from || !to) return;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('h5p-automata-transition');
    group.classList.toggle('selected',
      this.selected?.type === 'transition' && this.selected.id === transition.id);
    group.classList.toggle('active',
      this.traceFrame?.activeTransitions?.includes(transition.id) === true);
    group.setAttribute('data-transition-id', transition.id);
    group.addEventListener('mousedown', (e) => this._onTransitionMouseDown(e, transition));
    group.addEventListener('click',     (e) => this._onTransitionClick(e, transition));

    const pathD = this._getTransitionPath(from, to, transition.curve);

    // Unsichtbarer breiter Hit-Bereich für einfacheres Klicken/Ziehen
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', pathD);
    hitPath.classList.add('h5p-automata-transition-hit');
    group.append(hitPath);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('marker-end', 'url(#h5p-automata-arrow)');
    group.append(path);

    const labelPt = this._getTransitionLabelPoint(from, to, transition.curve);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', labelPt.x);
    label.setAttribute('y', labelPt.y);
    label.textContent = transition.symbols.map((s) => formatSymbol(s)).join(', ');
    group.append(label);

    this.svg.append(group);
  }

  /** Zeichnet Ghost-Pfeil während Transition/Initial-Drag. */
  _renderGhost() {
    const ix = this._ix;
    if (!ix) return;

    if (ix.type === 'drag-transition') {
      const from = this._getState(ix.stateId);
      if (!from) return;
      const line = this._createLine(from.x, from.y, ix.cursorX, ix.cursorY);
      line.setAttribute('marker-end', 'url(#h5p-automata-arrow)');
      line.classList.add('h5p-automata-ghost-arrow');
      this.svg.append(line);
    }

    if (ix.type === 'drag-initial') {
      const line = this._createLine(ix.startX, ix.startY, ix.cursorX, ix.cursorY);
      line.setAttribute('marker-end', 'url(#h5p-automata-arrow)');
      line.classList.add('h5p-automata-ghost-arrow', 'initial');
      this.svg.append(line);
    }
  }

  _renderStatus() {
    const diagnostics = this.validator.validate(this.getModel());
    this.status.innerHTML = '';
    if (!diagnostics.length) {
      this.status.textContent = 'Automaton ready.';
      return;
    }
    diagnostics.forEach((d) => {
      const item = document.createElement('div');
      item.className = `h5p-automata-diagnostic ${d.level}`;
      item.textContent = d.message;
      this.status.append(item);
    });
  }

  // ── Mouse-Events: Canvas ──────────────────────────────────────────────────

  _onCanvasMouseDown(event) {
    if (event.target !== this.svg) return;
    const pt = this._getSvgPoint(event);
    event.preventDefault();

    // Snap-Zone: leicht außerhalb eines Zustands → Transition starten (bei Drag)
    // oder Zustand selektieren (bei Klick ohne Drag)
    const snapState = this._getStateAtPoint(pt, SNAP_RADIUS);
    if (snapState) {
      this._snapSelectId = snapState.id;
      this._ix = {
        type: 'drag-transition',
        stateId: snapState.id,
        startX: pt.x, startY: pt.y,
        cursorX: snapState.x, cursorY: snapState.y,
        hoverStateId: null,
        hasDragged: false,
      };
      return;
    }

    this._snapSelectId = null;
    this._ix = {
      type: 'drag-initial',
      startX: pt.x, startY: pt.y,
      cursorX: pt.x, cursorY: pt.y,
      hoverStateId: null,
      hasDragged: false,
    };
  }

  _onCanvasClick(event) {
    if (event.target !== this.svg) return;
    if (this._wasDrag) { this._wasDrag = false; return; }

    // Snap-Zone-Klick ohne Drag → Zustand selektieren statt deselektieren
    if (this._snapSelectId) {
      this.selected = { type: 'state', id: this._snapSelectId };
      this._snapSelectId = null;
      this._applySelection();
      return;
    }

    this.selected = null;
    this._applySelection();
  }

  _onCanvasDblClick(event) {
    if (event.target !== this.svg) return;
    const pt = this._getSvgPoint(event);

    // Snap-Zone: Doppelklick nahe eines Zustands → wie Doppelklick auf den Zustand
    const snapState = this._getStateAtPoint(pt, SNAP_RADIUS);
    if (snapState) {
      this._onStateDblClick(event, snapState);
      return;
    }

    const id = this._addState(pt.x, pt.y);
    this.selected = { type: 'state', id };
    this.render();
  }

  // ── Mouse-Events: State ───────────────────────────────────────────────────

  _onStateMouseDown(event, state) {
    event.preventDefault();
    event.stopPropagation();
    const pt = this._getSvgPoint(event);
    const isSelected = this.selected?.type === 'state' && this.selected.id === state.id;
    const distFromCenter = Math.hypot(pt.x - state.x, pt.y - state.y);

    // Kern-Zone (≤ INNER_RADIUS) + selektiert → verschieben.
    // Rand-Zone oder nicht selektiert → Transition erstellen.
    if (isSelected && distFromCenter <= INNER_RADIUS) {
      this._ix = {
        type: 'drag-move',
        stateId: state.id,
        startX: pt.x, startY: pt.y,
        offsetX: state.x - pt.x,
        offsetY: state.y - pt.y,
        hasDragged: false,
      };
    } else {
      this._ix = {
        type: 'drag-transition',
        stateId: state.id,
        startX: pt.x, startY: pt.y,
        cursorX: state.x, cursorY: state.y,
        hoverStateId: null,
        hasDragged: false,
      };
    }
  }

  _onStateClick(event, state) {
    event.stopPropagation();
    if (this._wasDrag) { this._wasDrag = false; return; }
    this.selected = { type: 'state', id: state.id };
    this._applySelection(); // kein DOM-Rebuild → dblclick landet auf originalem Element
  }

  /** Doppelklick auf Zustand → erst selektieren; wenn bereits selektiert → Akzeptierend toggeln. */
  _onStateDblClick(event, state) {
    event.stopPropagation();
    const isSelected = this.selected?.type === 'state' && this.selected.id === state.id;
    this.selected = { type: 'state', id: state.id };
    if (isSelected) {
      state.accepting = !state.accepting;
      this._emitChange();
    } else {
      this.render();
    }
  }

  // ── Mouse-Events: Transition ──────────────────────────────────────────────

  _onTransitionMouseDown(event, transition) {
    event.preventDefault();
    event.stopPropagation();
    const pt = this._getSvgPoint(event);
    const isSelected = this.selected?.type === 'transition' && this.selected.id === transition.id;
    const isSelfLoop = transition.from === transition.to;

    // Selektierte Nicht-Schleifen-Transition → Kurve verschieben
    if (isSelected && !isSelfLoop) {
      this._ix = {
        type: 'drag-curve',
        transitionId: transition.id,
        hasDragged: false,
        startX: pt.x, startY: pt.y,
      };
    } else {
      // Nicht selektiert → nur Klick registrieren, DOM nicht anfassen
      this._ix = { type: 'select-only', hasDragged: false, startX: pt.x, startY: pt.y };
    }
  }

  _onTransitionClick(event, transition) {
    event.stopPropagation();
    if (this._wasDrag) { this._wasDrag = false; return; }
    this.selected = { type: 'transition', id: transition.id };
    this._applySelection();
  }

  // ── Mouse-Events: gemeinsam ───────────────────────────────────────────────

  _onPointerMove(event) {
    if (!this._ix) return;
    const pt = this._getSvgPoint(event);
    const ix = this._ix;

    if (!ix.hasDragged) {
      const dx = pt.x - ix.startX;
      const dy = pt.y - ix.startY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) ix.hasDragged = true;
    }
    if (!ix.hasDragged) return;

    if (ix.type === 'drag-move') {
      const state = this._getState(ix.stateId);
      if (state) {
        state.x = Math.max(40, Math.min(680, pt.x + ix.offsetX));
        state.y = Math.max(40, Math.min(320, pt.y + ix.offsetY));
      }
      this.render();
      return;
    }

    if (ix.type === 'drag-curve') {
      const t = this.model.transitions.find((tr) => tr.id === ix.transitionId);
      if (t) {
        const from = this._getState(t.from);
        const to   = this._getState(t.to);
        if (from && to) {
          const angle  = Math.atan2(to.y - from.y, to.x - from.x);
          const startX = from.x + Math.cos(angle) * 30;
          const startY = from.y + Math.sin(angle) * 30;
          const endX   = to.x   - Math.cos(angle) * 34;
          const endY   = to.y   - Math.sin(angle) * 34;
          const midX   = (startX + endX) / 2;
          const midY   = (startY + endY) / 2;
          // Projektion des Cursors auf die senkrechte Richtung zur Verbindungslinie
          t.curve = -(pt.x - midX) * Math.sin(angle) + (pt.y - midY) * Math.cos(angle);
        }
      }
      this.render();
      return;
    }

    if (ix.type === 'drag-transition' || ix.type === 'drag-initial') {
      ix.cursorX = pt.x;
      ix.cursorY = pt.y;
      ix.hoverStateId = this._getStateAtPoint(pt)?.id ?? null;
      this.svg.style.cursor = ix.hoverStateId ? 'crosshair' : 'default';
      this.render();
    }
    // select-only: kein visuelles Feedback nötig
  }

  _onPointerUp(event) {
    const ix = this._ix;
    if (!ix) return;

    const pt = this._getSvgPoint(event);
    this._wasDrag = ix.hasDragged;
    this._ix = null;
    this.svg.style.cursor = '';

    // Kein Drag → DOM nicht neu aufbauen, damit der folgende click-Event
    // noch die originalen Elemente (mit ihren Listenern) vorfindet.
    if (!ix.hasDragged) return;

    this._snapSelectId = null; // Drag hat stattgefunden → kein Snap-Klick

    if (ix.type === 'drag-move') {
      this._emitChange();
    }
    else if (ix.type === 'drag-curve') {
      this._emitChange();
    }
    else if (ix.type === 'drag-transition') {
      const target = this._getStateAtPoint(pt);
      if (target && target.id !== ix.stateId) {
        this._addTransition(ix.stateId, target.id);
      } else {
        this.render(); // Ghost-Pfeil entfernen
      }
    }
    else if (ix.type === 'drag-initial') {
      const target = this._getStateAtPoint(pt);
      if (target) {
        this.model.states.forEach((s) => { s.initial = s.id === target.id; });
        this._emitChange();
      } else {
        this.render(); // Ghost-Pfeil entfernen
      }
    }
    // select-only: Klick-Handler übernimmt
  }

  _onPointerLeave() {
    if (!this._ix) return;
    const { type, hasDragged } = this._ix;
    this._ix = null;
    this._snapSelectId = null;
    this.svg.style.cursor = '';
    if (hasDragged && (type === 'drag-move' || type === 'drag-curve')) {
      this._emitChange(); // ruft intern render() auf
    } else {
      this.render();
    }
  }

  // ── Modell-Aktionen ───────────────────────────────────────────────────────

  _addState(x, y) {
    const nextIndex = this.model.states.length;
    const id = this._createUniqueStateId(`q${nextIndex}`);
    this.model.states.push({
      id, label: id,
      initial: this.model.states.length === 0,
      accepting: false,
      x, y,
    });
    this._emitChange();
    return id;
  }

  _addTransition(from, to) {
    const label = typeof window?.prompt === 'function'
      ? window.prompt(
          'Transition symbols (comma-separated, ε for epsilon):',
          this.model.alphabet[0] || 'a'
        )
      : (this.model.alphabet[0] || 'a');
    if (label === null) return;

    const transition = this.normalizer.normalizeTransition(
      {
        id: `t${Date.now()}`,
        from, to,
        symbols: String(label).split(','),
      },
      this.model.transitions.length,
      this.model.alphabet,
      this.model.type
    );

    if (transition.symbols.length) {
      this.model.transitions.push(transition);
      this._emitChange();
    }
  }

  _toggleAccepting() {
    const state = this._getSelectedState();
    if (!state) return;
    state.accepting = !state.accepting;
    this._emitChange();
  }

  _setInitial() {
    if (this.selected?.type !== 'state') return;
    this.model.states.forEach((s) => { s.initial = s.id === this.selected.id; });
    this._emitChange();
  }

  _deleteSelected() {
    if (!this.selected) return;
    if (this.selected.type === 'state') {
      this.model.states = this.model.states.filter((s) => s.id !== this.selected.id);
      this.model.transitions = this.model.transitions.filter(
        (t) => t.from !== this.selected.id && t.to !== this.selected.id
      );
    }
    else if (this.selected.type === 'transition') {
      this.model.transitions = this.model.transitions.filter((t) => t.id !== this.selected.id);
    }
    this.selected = null;
    this._emitChange();
  }

  _emitChange() {
    this.model = this.normalizer.normalize(this.model);
    this.onChange(this.getModel());
    this.render();
  }

  // ── Hilfsmethoden ─────────────────────────────────────────────────────────

  /**
   * Aktualisiert die selected-Klasse auf allen SVG-Elementen ohne DOM-Rebuild.
   * Dadurch bleibt die dblclick-Event-Kette intakt.
   */
  _applySelection() {
    this.svg.querySelectorAll('.h5p-automata-state').forEach((g) => {
      const id = g.getAttribute('data-state-id');
      g.classList.toggle('selected', this.selected?.type === 'state' && this.selected.id === id);
    });
    this.svg.querySelectorAll('.h5p-automata-transition').forEach((g) => {
      const id = g.getAttribute('data-transition-id');
      g.classList.toggle('selected', this.selected?.type === 'transition' && this.selected.id === id);
    });
    this._renderToolbar();
  }

  _getState(stateId) {
    return this.model.states.find((s) => s.id === stateId) || null;
  }

  _getSelectedState() {
    return this.selected?.type === 'state' ? this._getState(this.selected.id) : null;
  }

  _getStateAtPoint(pt, radius = HIT_RADIUS) {
    return this.model.states.find((s) => Math.hypot(s.x - pt.x, s.y - pt.y) <= radius) || null;
  }

  _createUniqueStateId(base) {
    const ids = new Set(this.model.states.map((s) => s.id));
    let id = base;
    let n = 1;
    while (ids.has(id)) id = `${base}_${n++}`;
    return id;
  }

  _getSvgPoint(event) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 720,
      y: ((event.clientY - rect.top) / rect.height) * 360,
    };
  }

  _createArrowMarker() {
    const defs   = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    const path   = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    marker.setAttribute('id',           'h5p-automata-arrow');
    marker.setAttribute('viewBox',      '0 0 10 10');
    marker.setAttribute('refX',         '9');
    marker.setAttribute('refY',         '5');
    marker.setAttribute('markerWidth',  '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient',       'auto-start-reverse');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    marker.append(path);
    defs.append(marker);
    return defs;
  }

  _createCircle(x, y, r) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x);
    c.setAttribute('cy', y);
    c.setAttribute('r', r);
    return c;
  }

  _createLine(x1, y1, x2, y2) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1);
    l.setAttribute('y1', y1);
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
    return l;
  }

  _getTransitionPath(from, to, curve) {
    if (from.id === to.id) {
      return `M ${from.x - 8} ${from.y - 30} C ${from.x - 70} ${from.y - 95}, ${from.x + 70} ${from.y - 95}, ${from.x + 8} ${from.y - 30}`;
    }
    const offset = curve ?? 24;
    const angle  = Math.atan2(to.y - from.y, to.x - from.x);
    const startX = from.x + Math.cos(angle) * 30;
    const startY = from.y + Math.sin(angle) * 30;
    const endX   = to.x   - Math.cos(angle) * 34;
    const endY   = to.y   - Math.sin(angle) * 34;
    const midX   = (startX + endX) / 2;
    const midY   = (startY + endY) / 2;
    const curveX = midX - Math.sin(angle) * offset;
    const curveY = midY + Math.cos(angle) * offset;
    return `M ${startX} ${startY} Q ${curveX} ${curveY} ${endX} ${endY}`;
  }

  _getTransitionLabelPoint(from, to, curve) {
    if (from.id === to.id) {
      return { x: from.x, y: from.y - 92 };
    }
    const offset = curve ?? 24;
    const angle  = Math.atan2(to.y - from.y, to.x - from.x);
    const startX = from.x + Math.cos(angle) * 30;
    const startY = from.y + Math.sin(angle) * 30;
    const endX   = to.x   - Math.cos(angle) * 34;
    const endY   = to.y   - Math.sin(angle) * 34;
    const midX   = (startX + endX) / 2;
    const midY   = (startY + endY) / 2;
    // Hälfte des Bezier-Abstands + fester Abstand → Label folgt der Kurve
    return {
      x: midX - Math.sin(angle) * (offset / 2 + 14),
      y: midY + Math.cos(angle) * (offset / 2 + 14),
    };
  }
}
