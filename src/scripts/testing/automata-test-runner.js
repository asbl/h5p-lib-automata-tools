import AutomataEquivalenceChecker from '../runtime/automata-equivalence-checker';
import AutomataModelNormalizer from '../model/automata-model-normalizer';
import AutomataRunner from '../runtime/automata-runner';

/**
 * Runs testcase and reference-model grading for automata questions.
 *
 * The class is a strategy facade: `runTestCases` handles example-based grading,
 * `compareWithSolution` handles language equivalence, and `grade` combines both
 * according to the authoring settings supplied by the H5P question.
 */
export default class AutomataTestRunner {
  /**
   * @param {object} [options] Runner dependencies.
   * @param {AutomataRunner} [options.runner] Execution runner.
   * @param {AutomataEquivalenceChecker} [options.equivalenceChecker] Equivalence checker.
   * @param {AutomataModelNormalizer} [options.normalizer] Model normalizer.
   */
  constructor(options = {}) {
    this.normalizer = options.normalizer || new AutomataModelNormalizer();
    this.runner = options.runner || new AutomataRunner({ normalizer: this.normalizer });
    this.equivalenceChecker = options.equivalenceChecker || new AutomataEquivalenceChecker({
      normalizer: this.normalizer,
      runner: this.runner,
    });
  }

  /**
   * Runs all input/acceptance testcases.
   *
   * @param {object|string} model Learner model.
   * @param {object[]} testCases Testcase definitions.
   * @returns {object} Testcase result.
   */
  runTestCases(model, testCases = []) {
    const rows = (Array.isArray(testCases) ? testCases : []).map((testCase, index) => {
      const input = this.normalizeInput(testCase.input);
      const expectedAccepted = this.normalizeExpected(testCase.expectedAccepted ?? testCase.accepted);
      const result = this.runner.run(model, input);
      const passed = result.accepted === expectedAccepted;

      return {
        index: index + 1,
        input,
        expectedAccepted,
        actualAccepted: result.accepted,
        passed,
        trace: result.trace,
        diagnostics: result.diagnostics,
      };
    });

    const passedCount = rows.filter((row) => row.passed).length;

    return {
      rows,
      score: rows.length ? passedCount / rows.length : 0,
      passed: rows.length > 0 && passedCount === rows.length,
    };
  }

  /**
   * Compares a learner model with a reference model.
   *
   * @param {object|string} model Learner model.
   * @param {object|string} solution Reference model.
   * @returns {object} Equivalence result.
   */
  compareWithSolution(model, solution) {
    return this.equivalenceChecker.compare(model, solution);
  }

  /**
   * Runs the configured grading strategy.
   *
   * @param {object} config Grading config.
   * @param {object|string} config.model Learner model.
   * @param {object[]} [config.testCases] Testcases.
   * @param {object|string|null} [config.solution] Reference model.
   * @param {string} [config.gradingMethod] Grading method.
   * @returns {object} Combined grading result.
   */
  grade(config = {}) {
    const method = config.gradingMethod || 'byTestCases';
    const testCaseResult = this.runTestCases(config.model, config.testCases || []);
    const equivalence = method === 'bySolution' && config.solution
      ? this.compareWithSolution(config.model, config.solution)
      : null;

    const score = equivalence
      ? (equivalence.equivalent ? 1 : 0)
      : testCaseResult.score;

    return {
      method,
      score,
      passed: score === 1,
      testCases: testCaseResult,
      equivalence,
    };
  }

  /**
   * Normalizes testcase input.
   *
   * @param {*} input Raw input.
   * @returns {string} Normalized input string.
   */
  normalizeInput(input = '') {
    return String(input ?? '');
  }

  /**
   * Normalizes expected acceptance values from H5P semantics.
   *
   * @param {*} value Raw expected value.
   * @returns {boolean} Expected accepted flag.
   */
  normalizeExpected(value = false) {
    if (typeof value === 'boolean') {
      return value;
    }

    return ['true', '1', 'accepted', 'accept', 'yes'].includes(String(value).toLowerCase());
  }
}
