import AutomataModelNormalizer from '../model/automata-model-normalizer';
import AutomataRunner from './automata-runner';

/**
 * Checks language equivalence for DFA/NFA models by determinizing both models
 * and searching the product automaton for an accepting mismatch.
 *
 * This class acts as the grading strategy for "compare against solution" tasks.
 * It is independent from any DOM code, so it can be tested and later moved to a
 * worker without changing the question UI.
 */
export default class AutomataEquivalenceChecker {
  /**
   * @param {object} [options] Checker dependencies.
   * @param {AutomataModelNormalizer} [options.normalizer] Model normalizer.
   * @param {AutomataRunner} [options.runner] Runner implementation.
   */
  constructor(options = {}) {
    this.normalizer = options.normalizer || new AutomataModelNormalizer();
    this.runner = options.runner || new AutomataRunner({ normalizer: this.normalizer });
  }

  /**
   * Compares two automata.
   *
   * @param {object|string} actual Learner model.
   * @param {object|string} expected Reference model.
   * @returns {object} Equivalence result.
   */
  compare(actual, expected) {
    const left = this.toDfa(this.normalizer.normalize(actual));
    const right = this.toDfa(this.normalizer.normalize(expected));
    const alphabet = [...new Set([...left.alphabet, ...right.alphabet])].sort();
    const leftCompleted = this.completeDfa(left, alphabet);
    const rightCompleted = this.completeDfa(right, alphabet);
    const start = [this.getInitialState(leftCompleted), this.getInitialState(rightCompleted)];
    const queue = [{ pair: start, word: [] }];
    const seen = new Set([this.pairKey(start)]);

    while (queue.length) {
      const { pair, word } = queue.shift();
      const [leftState, rightState] = pair;

      if (this.isAccepting(leftCompleted, leftState) !== this.isAccepting(rightCompleted, rightState)) {
        const input = word.join('');
        return {
          equivalent: false,
          counterexample: input,
          actualAccepted: this.runner.run(actual, input).accepted,
          expectedAccepted: this.runner.run(expected, input).accepted,
        };
      }

      alphabet.forEach((symbol) => {
        const nextPair = [
          this.nextDfaState(leftCompleted, leftState, symbol),
          this.nextDfaState(rightCompleted, rightState, symbol),
        ];
        const key = this.pairKey(nextPair);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ pair: nextPair, word: [...word, symbol] });
        }
      });
    }

    return { equivalent: true, counterexample: null };
  }

  /**
   * Converts a DFA or NFA to a DFA using subset construction.
   *
   * @param {object} model Normalized automaton.
   * @returns {object} DFA model.
   */
  toDfa(model) {
    if (model.type === 'dfa') {
      return model;
    }

    const initial = this.runner.epsilonClosure(
      model,
      model.states.filter((state) => state.initial).map((state) => state.id),
    ).sort();
    const accepting = new Set(model.states.filter((state) => state.accepting).map((state) => state.id));
    const queue = [initial];
    const seen = new Map([[this.subsetId(initial), initial]]);
    const states = [];
    const transitions = [];

    while (queue.length) {
      const subset = queue.shift();
      const id = this.subsetId(subset);
      states.push({
        id,
        label: subset.length ? subset.join(',') : '∅',
        initial: id === this.subsetId(initial),
        accepting: subset.some((stateId) => accepting.has(stateId)),
        x: 0,
        y: 0,
      });

      model.alphabet.forEach((symbol) => {
        const moved = this.runner.move(model, subset, symbol).states;
        const closed = this.runner.epsilonClosure(model, moved).sort();
        const targetId = this.subsetId(closed);
        transitions.push({
          id: `d_${id}_${symbol}_${targetId}`.replace(/[^\w-]/g, '_'),
          from: id,
          to: targetId,
          symbols: [symbol],
        });

        if (!seen.has(targetId)) {
          seen.set(targetId, closed);
          queue.push(closed);
        }
      });
    }

    return {
      type: 'dfa',
      alphabet: [...model.alphabet],
      states,
      transitions,
    };
  }

  /**
   * Completes a DFA by adding a sink state where needed.
   *
   * @param {object} model DFA model.
   * @param {string[]} alphabet Unified alphabet.
   * @returns {object} Complete DFA model.
   */
  completeDfa(model, alphabet = []) {
    const states = model.states.map((state) => ({ ...state }));
    const transitions = model.transitions.map((transition) => ({ ...transition, symbols: [...transition.symbols] }));
    const sinkId = '__sink';
    let needsSink = false;

    states.forEach((state) => {
      alphabet.forEach((symbol) => {
        if (!this.nextDfaState({ transitions }, state.id, symbol)) {
          needsSink = true;
          transitions.push({
            id: `complete_${state.id}_${symbol}`,
            from: state.id,
            to: sinkId,
            symbols: [symbol],
          });
        }
      });
    });

    if (needsSink) {
      states.push({ id: sinkId, label: 'sink', initial: false, accepting: false, x: 0, y: 0 });
      alphabet.forEach((symbol) => {
        transitions.push({
          id: `complete_${sinkId}_${symbol}`,
          from: sinkId,
          to: sinkId,
          symbols: [symbol],
        });
      });
    }

    return {
      type: 'dfa',
      alphabet,
      states,
      transitions,
    };
  }

  /**
   * Returns the initial state ID of a DFA.
   *
   * @param {object} model DFA model.
   * @returns {string|null} Initial state ID.
   */
  getInitialState(model) {
    return model.states.find((state) => state.initial)?.id || null;
  }

  /**
   * Returns whether a state is accepting.
   *
   * @param {object} model DFA model.
   * @param {string} stateId State ID.
   * @returns {boolean} True if accepting.
   */
  isAccepting(model, stateId) {
    return model.states.find((state) => state.id === stateId)?.accepting === true;
  }

  /**
   * Returns a DFA successor state.
   *
   * @param {object} model DFA model.
   * @param {string} stateId State ID.
   * @param {string} symbol Input symbol.
   * @returns {string|null} Successor state ID.
   */
  nextDfaState(model, stateId, symbol) {
    return model.transitions.find((transition) => (
      transition.from === stateId && transition.symbols.includes(symbol)
    ))?.to || null;
  }

  /**
   * Creates a stable ID for a subset state.
   *
   * @param {string[]} subset State subset.
   * @returns {string} Stable subset ID.
   */
  subsetId(subset = []) {
    return subset.length ? subset.join('__') : '__empty';
  }

  /**
   * Creates a product-state key.
   *
   * @param {string[]} pair Pair of state IDs.
   * @returns {string} Stable key.
   */
  pairKey(pair = []) {
    return pair.join('\u0000');
  }
}
