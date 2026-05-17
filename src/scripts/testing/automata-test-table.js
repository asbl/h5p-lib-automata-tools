/**
 * Renders automata testcase results in the shared CodeQuestion table style.
 *
 * The renderer owns only DOM creation. It deliberately receives already-graded
 * rows so testcase algorithms remain reusable outside H5P and can be tested
 * without jsdom-heavy UI setup.
 */
export default class AutomataTestTable {
  /**
   * @param {object} [options] Renderer options.
   * @param {object} [options.l10n] Localized labels.
   */
  constructor(options = {}) {
    this.l10n = {
      input: 'Input',
      expected: 'Expected',
      actual: 'Actual',
      passed: 'Passed?',
      accepted: 'accepted',
      rejected: 'rejected',
      noResults: 'No test results yet.',
      ...options.l10n,
    };
    this.dom = document.createElement('div');
    this.dom.className = 'h5p-automata-test-results';
    this.renderEmpty();
  }

  /**
   * Returns the table root.
   *
   * @returns {HTMLElement} Root element.
   */
  getDOM() {
    return this.dom;
  }

  /**
   * Renders empty-state content.
   *
   * @returns {void}
   */
  renderEmpty() {
    this.dom.innerHTML = '';
    const empty = document.createElement('p');
    empty.className = 'h5p-automata-test-results-empty';
    empty.textContent = this.l10n.noResults;
    this.dom.append(empty);
  }

  /**
   * Renders testcase rows.
   *
   * @param {object[]} rows Graded rows.
   * @returns {void}
   */
  renderRows(rows = []) {
    this.dom.innerHTML = '';

    if (!rows.length) {
      this.renderEmpty();
      return;
    }

    const table = document.createElement('table');
    table.className = 'h5p-codequestion-testcases-table h5p-automata-test-table';
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    thead.append(this.createHeaderRow());
    rows.forEach((row) => tbody.append(this.createBodyRow(row)));
    table.append(thead, tbody);
    this.dom.append(table);
  }

  /**
   * Creates the table header row.
   *
   * @returns {HTMLTableRowElement} Header row.
   */
  createHeaderRow() {
    const row = document.createElement('tr');
    [this.l10n.input, this.l10n.expected, this.l10n.actual, this.l10n.passed].forEach((label) => {
      const cell = document.createElement('th');
      cell.textContent = label;
      row.append(cell);
    });
    return row;
  }

  /**
   * Creates a testcase table body row.
   *
   * @param {object} row Graded testcase row.
   * @returns {HTMLTableRowElement} Body row.
   */
  createBodyRow(row) {
    const tr = document.createElement('tr');
    tr.classList.toggle('passed', row.passed === true);
    tr.classList.toggle('failed', row.passed !== true);

    [
      row.input,
      this.formatAccepted(row.expectedAccepted),
      this.formatAccepted(row.actualAccepted),
      row.passed ? '✓' : '✗',
    ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      tr.append(cell);
    });

    return tr;
  }

  /**
   * Formats accepted/rejected flags.
   *
   * @param {boolean} accepted Acceptance flag.
   * @returns {string} Label.
   */
  formatAccepted(accepted) {
    return accepted ? this.l10n.accepted : this.l10n.rejected;
  }
}
