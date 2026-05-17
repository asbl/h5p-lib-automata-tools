import AutomataModelNormalizer from '../model/automata-model-normalizer';
import AutomataValidator from '../model/automata-validator';
import { EPSILON, formatSymbol } from '../model/automata-symbols';

/**
 * Executes DFA and NFA models and returns traceable execution results.
 *
 * The runner deliberately exposes trace frames instead of only a boolean result
 * so editors, canvases and testcase tables can visualize the active states at
 * every input step. Subclasses can override `tokenize` to support token streams
 * beyond single-character alphabets.
 */
export default class AutomataRunner {
  /**
   * @param {object} [options] Runner dependencies.
   * @param {AutomataModelNormalizer} [options.normalizer] Model normalizer.
   * @param {AutomataValidator} [options.validator] Model validator.
   */
  constructor(options = {}) {
    this.normalizer = options.normalizer || new AutomataModelNormalizer();
    this.validator = options.validator || new AutomataValidator();
  }

  /**
   * Runs an automaton for a given input.
   *
   * @param {object|string} model Raw or normalized automaton model.
   * @param {string|string[]} input Input word or token list.
   * @returns {object} Execution result with accepted flag and trace frames.
   */
  run(model, input = '') {
    const normalized = this.normalizer.normalize(model);
    const diagnostics = this.validator.validate(normalized);
    const blockingError = diagnostics.find((message) => message.level === 'error');

    if (blockingError) {
      return {
        accepted: false,
        input: this.tokenize(input),
        trace: [],
        diagnostics,
        error: blockingError.message,
      };
    }

    return normalized.type === 'nfa'
      ? this.runNfa(normalized, input, diagnostics)
      : this.runDfa(normalized, input, diagnostics);
  }

  /**
   * Runs a DFA model.
   *
   * @param {object} model Normalized DFA.
   * @param {string|string[]} input Input word or token list.
   * @param {object[]} diagnostics Validation diagnostics.
   * @returns {object} Execution result.
   */
  runDfa(model, input = '', diagnostics = []) {
    const tokens = this.tokenize(input);
    let current = model.states.find((state) => state.initial)?.id || null;
    const trace = [this.createTraceFrame(model, 0, null, current ? [current] : [], 'Initial state')];

    tokens.forEach((token, index) => {
      const transition = this.findDfaTransition(model, current, token);
      current = transition?.to || null;
      trace.push(this.createTraceFrame(
        model,
        index + 1,
        token,
        current ? [current] : [],
        transition
          ? `${transition.from} --${formatSymbol(token)}--> ${transition.to}`
          : `No transition for ${formatSymbol(token)}`,
        transition ? [transition.id] : [],
      ));
    });

    const accepted = Boolean(current && model.states.find((state) => state.id === current)?.accepting);

    return {
      accepted,
      input: tokens,
      trace,
      diagnostics,
      finalStates: current ? [current] : [],
    };
  }

  /**
   * Runs an NFA model with epsilon closure support.
   *
   * @param {object} model Normalized NFA.
   * @param {string|string[]} input Input word or token list.
   * @param {object[]} diagnostics Validation diagnostics.
   * @returns {object} Execution result.
   */
  runNfa(model, input = '', diagnostics = []) {
    const tokens = this.tokenize(input);
    const initialStates = model.states.filter((state) => state.initial).map((state) => state.id);
    let current = this.epsilonClosure(model, initialStates);
    const trace = [this.createTraceFrame(model, 0, null, current, 'Initial epsilon closure')];

    tokens.forEach((token, index) => {
      const move = this.move(model, current, token);
      current = this.epsilonClosure(model, move.states);
      trace.push(this.createTraceFrame(
        model,
        index + 1,
        token,
        current,
        `Read ${formatSymbol(token)}`,
        move.transitions,
      ));
    });

    const accepting = new Set(model.states.filter((state) => state.accepting).map((state) => state.id));
    const accepted = current.some((stateId) => accepting.has(stateId));

    return {
      accepted,
      input: tokens,
      trace,
      diagnostics,
      finalStates: current,
    };
  }

  /**
   * Converts input to tokens. Default behavior is character-wise.
   *
   * @param {string|string[]} input Input word or token list.
   * @returns {string[]} Input tokens.
   */
  tokenize(input = '') {
    if (Array.isArray(input)) {
      return input.map((token) => String(token));
    }

    return [...String(input)];
  }

  /**
   * Finds the unique DFA transition for state and symbol.
   *
   * @param {object} model Normalized DFA.
   * @param {string|null} stateId Current state ID.
   * @param {string} symbol Input symbol.
   * @returns {object|null} Matching transition.
   */
  findDfaTransition(model, stateId, symbol) {
    return (model.transitions || []).find((transition) => (
      transition.from === stateId && transition.symbols.includes(symbol)
    )) || null;
  }

  /**
   * Performs an NFA move without epsilon closure.
   *
   * @param {object} model Normalized NFA.
   * @param {string[]} stateIds Active state IDs.
   * @param {string} symbol Input symbol.
   * @returns {object} Target states and used transition IDs.
   */
  move(model, stateIds = [], symbol = '') {
    const active = new Set(stateIds);
    const targetStates = new Set();
    const transitionIds = new Set();

    (model.transitions || []).forEach((transition) => {
      if (active.has(transition.from) && transition.symbols.includes(symbol)) {
        targetStates.add(transition.to);
        transitionIds.add(transition.id);
      }
    });

    return {
      states: [...targetStates],
      transitions: [...transitionIds],
    };
  }

  /**
   * Computes epsilon closure for a set of NFA states.
   *
   * @param {object} model Normalized NFA.
   * @param {string[]} stateIds State IDs.
   * @returns {string[]} Closure state IDs.
   */
  epsilonClosure(model, stateIds = []) {
    const closure = new Set(stateIds);
    const queue = [...stateIds];

    while (queue.length) {
      const stateId = queue.shift();
      (model.transitions || []).forEach((transition) => {
        if (transition.from !== stateId || !transition.symbols.includes(EPSILON)) {
          return;
        }

        if (!closure.has(transition.to)) {
          closure.add(transition.to);
          queue.push(transition.to);
        }
      });
    }

    return [...closure];
  }

  /**
   * Creates a trace frame consumed by visualizers.
   *
   * @param {object} model Normalized model.
   * @param {number} index Input position.
   * @param {string|null} symbol Consumed symbol.
   * @param {string[]} activeStates Active state IDs.
   * @param {string} description Human-readable step description.
   * @param {string[]} transitionIds Used transition IDs.
   * @returns {object} Trace frame.
   */
  createTraceFrame(model, index, symbol, activeStates, description, transitionIds = []) {
    const accepting = new Set(model.states.filter((state) => state.accepting).map((state) => state.id));

    return {
      index,
      symbol,
      activeStates,
      activeTransitions: transitionIds,
      description,
      acceptedSoFar: activeStates.some((stateId) => accepting.has(stateId)),
    };
  }
}
