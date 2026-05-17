import { describe, expect, it } from 'vitest';

import AutomataEquivalenceChecker from '../src/scripts/runtime/automata-equivalence-checker';
import AutomataRunner from '../src/scripts/runtime/automata-runner';
import AutomataTestRunner from '../src/scripts/testing/automata-test-runner';

const evenAsDfa = {
  type: 'dfa',
  alphabet: ['a', 'b'],
  states: [
    { id: 'even', label: 'even', initial: true, accepting: true, x: 0, y: 0 },
    { id: 'odd', label: 'odd', initial: false, accepting: false, x: 0, y: 0 },
  ],
  transitions: [
    { id: 't0', from: 'even', to: 'odd', symbols: ['a'] },
    { id: 't1', from: 'odd', to: 'even', symbols: ['a'] },
    { id: 't2', from: 'even', to: 'even', symbols: ['b'] },
    { id: 't3', from: 'odd', to: 'odd', symbols: ['b'] },
  ],
};

describe('AutomataRunner', () => {
  it('runs DFA models and returns trace frames', () => {
    const runner = new AutomataRunner();
    const result = runner.run(evenAsDfa, 'aba');

    expect(result.accepted).toBe(true);
    expect(result.trace).toHaveLength(4);
    expect(result.finalStates).toEqual(['even']);
  });

  it('runs NFA models with epsilon transitions', () => {
    const runner = new AutomataRunner();
    const nfa = {
      type: 'nfa',
      alphabet: ['a'],
      states: [
        { id: 'q0', label: 'q0', initial: true, accepting: false },
        { id: 'q1', label: 'q1', initial: false, accepting: true },
      ],
      transitions: [
        { id: 'e', from: 'q0', to: 'q1', symbols: ['ε'] },
      ],
    };

    expect(runner.run(nfa, '').accepted).toBe(true);
  });
});

describe('AutomataEquivalenceChecker', () => {
  it('finds counterexamples for non-equivalent automata', () => {
    const checker = new AutomataEquivalenceChecker();
    const allDfa = {
      ...evenAsDfa,
      states: evenAsDfa.states.map((state) => ({ ...state, accepting: true })),
    };

    const result = checker.compare(allDfa, evenAsDfa);

    expect(result.equivalent).toBe(false);
    expect(result.counterexample).toBe('a');
    expect(result.actualAccepted).toBe(true);
    expect(result.expectedAccepted).toBe(false);
  });

  it('accepts equivalent DFA/NFA pairs', () => {
    const checker = new AutomataEquivalenceChecker();
    const nfa = {
      type: 'nfa',
      alphabet: ['a', 'b'],
      states: [
        { id: 'even', label: 'even', initial: true, accepting: true },
        { id: 'odd', label: 'odd', initial: false, accepting: false },
      ],
      transitions: evenAsDfa.transitions,
    };

    expect(checker.compare(evenAsDfa, nfa).equivalent).toBe(true);
  });
});

describe('AutomataTestRunner', () => {
  it('grades acceptance test cases', () => {
    const runner = new AutomataTestRunner();
    const result = runner.grade({
      model: evenAsDfa,
      gradingMethod: 'byTestCases',
      testCases: [
        { input: '', expectedAccepted: true },
        { input: 'a', expectedAccepted: false },
        { input: 'aa', expectedAccepted: true },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });
});
