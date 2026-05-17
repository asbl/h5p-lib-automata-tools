import { EPSILON, formatSymbol } from './automata-symbols';

/**
 * Validates normalized automata models before they are executed or graded.
 *
 * The validator returns messages instead of throwing so UI classes can decide
 * whether to show warnings inline, in the console, or in a feedback area.
 * Subclasses can override `validateCustomRules` for language-course-specific
 * constraints such as required state names or a maximum state count.
 */
export default class AutomataValidator {
  /**
   * Validates a model.
   *
   * @param {object} model Normalized automaton model.
   * @returns {object[]} Validation messages.
   */
  validate(model = {}) {
    const messages = [
      ...this.validateStates(model),
      ...this.validateTransitions(model),
      ...this.validateDeterminism(model),
      ...this.validateCustomRules(model),
    ];

    return messages;
  }

  /**
   * Returns true if a model has no blocking validation errors.
   *
   * @param {object} model Normalized automaton model.
   * @returns {boolean} True if executable.
   */
  isExecutable(model = {}) {
    return !this.validate(model).some((message) => message.level === 'error');
  }

  /**
   * Validates basic state requirements.
   *
   * @param {object} model Normalized automaton model.
   * @returns {object[]} Validation messages.
   */
  validateStates(model = {}) {
    const states = Array.isArray(model.states) ? model.states : [];
    const messages = [];

    if (!states.length) {
      messages.push(this.createMessage('error', 'missing_states', 'At least one state is required.'));
    }

    if (!states.some((state) => state.initial)) {
      messages.push(this.createMessage('error', 'missing_initial_state', 'At least one initial state is required.'));
    }

    const initialCount = states.filter((state) => state.initial).length;
    if (model.type === 'dfa' && initialCount > 1) {
      messages.push(this.createMessage('error', 'dfa_multiple_initial_states', 'A DFA must have exactly one initial state.'));
    }

    return messages;
  }

  /**
   * Validates transition references and labels.
   *
   * @param {object} model Normalized automaton model.
   * @returns {object[]} Validation messages.
   */
  validateTransitions(model = {}) {
    const states = new Set((model.states || []).map((state) => state.id));
    const alphabet = new Set(model.alphabet || []);
    const messages = [];

    (model.transitions || []).forEach((transition) => {
      if (!states.has(transition.from) || !states.has(transition.to)) {
        messages.push(this.createMessage(
          'error',
          'transition_unknown_state',
          `Transition ${transition.id} references an unknown state.`,
        ));
      }

      if (!Array.isArray(transition.symbols) || transition.symbols.length === 0) {
        messages.push(this.createMessage(
          'warning',
          'transition_without_symbols',
          `Transition ${transition.id} has no symbols.`,
        ));
      }

      (transition.symbols || []).forEach((symbol) => {
        if (symbol === EPSILON && model.type === 'dfa') {
          messages.push(this.createMessage(
            'error',
            'dfa_epsilon_transition',
            'A DFA cannot use epsilon transitions.',
          ));
        }

        if (symbol !== EPSILON && !alphabet.has(symbol)) {
          messages.push(this.createMessage(
            'error',
            'transition_symbol_outside_alphabet',
            `Symbol "${formatSymbol(symbol)}" is not in the alphabet.`,
          ));
        }
      });
    });

    return messages;
  }

  /**
   * Validates DFA determinism.
   *
   * @param {object} model Normalized automaton model.
   * @returns {object[]} Validation messages.
   */
  validateDeterminism(model = {}) {
    if (model.type !== 'dfa') {
      return [];
    }

    const seen = new Set();
    const messages = [];

    (model.transitions || []).forEach((transition) => {
      (transition.symbols || []).forEach((symbol) => {
        const key = `${transition.from}\u0000${symbol}`;
        if (seen.has(key)) {
          messages.push(this.createMessage(
            'error',
            'dfa_duplicate_transition',
            `A DFA may only have one transition for state "${transition.from}" and symbol "${formatSymbol(symbol)}".`,
          ));
        }
        seen.add(key);
      });
    });

    return messages;
  }

  /**
   * Override in subclasses for course-specific validation rules.
   *
   * @param {object} _model Normalized automaton model.
   * @returns {object[]} Validation messages.
   */
  validateCustomRules(model = {}) {
    void model;
    return [];
  }

  /**
   * Creates a validation message.
   *
   * @param {'error'|'warning'|'info'} level Message severity.
   * @param {string} code Stable message code.
   * @param {string} message Human-readable message.
   * @returns {object} Validation message.
   */
  createMessage(level, code, message) {
    return { level, code, message };
  }
}
