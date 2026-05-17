import {
  EPSILON,
  normalizeSymbol,
  normalizeSymbolList,
} from './automata-symbols';

/**
 * Creates stable, runner-ready automata models from author or learner input.
 *
 * The class is intentionally small and overrideable: specialized question types
 * can subclass `normalizeState`, `normalizeTransition` or `getDefaultModel` to
 * add metadata without changing the runner contract.
 */
export default class AutomataModelNormalizer {
  /**
   * @param {object} [options] Normalizer options.
   * @param {string} [options.defaultType='dfa'] Default automaton type.
   * @param {string[]} [options.defaultAlphabet=['a', 'b']] Default alphabet.
   */
  constructor(options = {}) {
    this.defaultType = options.defaultType || 'dfa';
    this.defaultAlphabet = options.defaultAlphabet || ['a', 'b'];
  }

  /**
   * Returns a minimal editable automaton used when no valid model is present.
   *
   * @returns {object} Default automaton model.
   */
  getDefaultModel() {
    return {
      type: this.defaultType,
      alphabet: [...this.defaultAlphabet],
      states: [
        { id: 'q0', label: 'q0', initial: true, accepting: false, x: 120, y: 130 },
        { id: 'q1', label: 'q1', initial: false, accepting: true, x: 320, y: 130 },
      ],
      transitions: [
        { id: 't0', from: 'q0', to: 'q1', symbols: ['a'] },
        { id: 't1', from: 'q1', to: 'q1', symbols: ['a', 'b'] },
      ],
    };
  }

  /**
   * Parses a model from object or JSON string input.
   *
   * @param {object|string|null} value Raw model input.
   * @returns {object} Parsed model or default model.
   */
  parse(value) {
    if (!value) {
      return this.getDefaultModel();
    }

    if (typeof value === 'object') {
      return value;
    }

    try {
      return JSON.parse(String(value));
    }
    catch (_error) {
      return this.getDefaultModel();
    }
  }

  /**
   * Normalizes a full automaton model.
   *
   * @param {object|string|null} value Raw model input.
   * @returns {object} Normalized model.
   */
  normalize(value) {
    const raw = this.parse(value);
    const type = ['dfa', 'nfa'].includes(raw.type) ? raw.type : this.defaultType;
    const alphabet = this.normalizeAlphabet(raw.alphabet);
    const states = this.normalizeStates(raw.states);
    const stateIds = new Set(states.map((state) => state.id));
    const transitions = this.normalizeTransitions(raw.transitions, stateIds, alphabet, type);

    if (!states.some((state) => state.initial) && states[0]) {
      states[0].initial = true;
    }

    return {
      type,
      alphabet,
      states,
      transitions,
    };
  }

  /**
   * Normalizes alphabet symbols while excluding epsilon.
   *
   * @param {string[]} alphabet Raw alphabet.
   * @returns {string[]} Normalized alphabet.
   */
  normalizeAlphabet(alphabet = []) {
    const symbols = Array.isArray(alphabet) ? alphabet : String(alphabet).split(',');
    const normalized = [...new Set(
      symbols
        .map((symbol) => normalizeSymbol(symbol))
        .filter((symbol) => symbol !== EPSILON),
    )];

    return normalized.length ? normalized : [...this.defaultAlphabet];
  }

  /**
   * Normalizes all states.
   *
   * @param {object[]} states Raw states.
   * @returns {object[]} Normalized states.
   */
  normalizeStates(states = []) {
    const rawStates = Array.isArray(states) && states.length
      ? states
      : this.getDefaultModel().states;
    const usedIds = new Set();

    return rawStates.map((state, index) => this.normalizeState(state, index, usedIds));
  }

  /**
   * Normalizes a single state and keeps UI coordinates if present.
   *
   * @param {object} state Raw state.
   * @param {number} index State index.
   * @param {Set<string>} usedIds Already-used IDs.
   * @returns {object} Normalized state.
   */
  normalizeState(state = {}, index = 0, usedIds = new Set()) {
    const baseId = this.normalizeId(state.id || state.label || `q${index}`, `q${index}`);
    let id = baseId;
    let suffix = 1;

    while (usedIds.has(id)) {
      id = `${baseId}_${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);

    return {
      id,
      label: String(state.label || id),
      initial: state.initial === true,
      accepting: state.accepting === true,
      x: Number.isFinite(Number(state.x)) ? Number(state.x) : 120 + (index * 160),
      y: Number.isFinite(Number(state.y)) ? Number(state.y) : 130,
    };
  }

  /**
   * Normalizes transitions and removes references to missing states.
   *
   * @param {object[]} transitions Raw transitions.
   * @param {Set<string>} stateIds Valid state IDs.
   * @param {string[]} alphabet Normalized alphabet.
   * @param {string} type Automaton type.
   * @returns {object[]} Normalized transitions.
   */
  normalizeTransitions(transitions = [], stateIds = new Set(), alphabet = [], type = 'dfa') {
    const rawTransitions = Array.isArray(transitions) ? transitions : [];

    return rawTransitions
      .map((transition, index) => this.normalizeTransition(transition, index, alphabet, type))
      .filter((transition) => stateIds.has(transition.from) && stateIds.has(transition.to));
  }

  /**
   * Normalizes a single transition.
   *
   * @param {object} transition Raw transition.
   * @param {number} index Transition index.
   * @param {string[]} alphabet Normalized alphabet.
   * @param {string} type Automaton type.
   * @returns {object} Normalized transition.
   */
  normalizeTransition(transition = {}, index = 0, alphabet = [], type = 'dfa') {
    const symbols = normalizeSymbolList(transition.symbols || transition.symbol || transition.label)
      .filter((symbol) => type === 'nfa' || symbol !== EPSILON)
      .filter((symbol) => symbol === EPSILON || alphabet.includes(symbol));

    const curveRaw = Number(transition.curve);

    return {
      id: this.normalizeId(transition.id || `t${index}`, `t${index}`),
      from: this.normalizeId(transition.from || ''),
      to: this.normalizeId(transition.to || ''),
      symbols,
      ...(Number.isFinite(curveRaw) ? { curve: curveRaw } : {}),
    };
  }

  /**
   * Normalizes an identifier to a compact machine-readable string.
   *
   * @param {string} value Raw identifier.
   * @param {string} [fallback=''] Fallback identifier.
   * @returns {string} Normalized identifier.
   */
  normalizeId(value = '', fallback = '') {
    const normalized = String(value)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '');

    return normalized || fallback;
  }
}
