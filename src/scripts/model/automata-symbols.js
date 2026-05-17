/**
 * Shared constants and symbol helpers for finite automata.
 * Keep these helpers tiny and side-effect free so model, runner and editor
 * classes can use the same interpretation of epsilon transitions.
 */
export const EPSILON = '';
export const EPSILON_LABEL = 'ε';

/**
 * Normalizes user-facing transition labels to the internal symbol format.
 *
 * Subclasses or callers that support richer alphabets should wrap this helper
 * instead of duplicating epsilon aliases.
 *
 * @param {string} symbol Raw transition symbol.
 * @returns {string} Internal symbol, with epsilon represented by an empty string.
 */
export const normalizeSymbol = (symbol = '') => {
  const value = String(symbol).trim();
  return ['ε', 'eps', 'epsilon', 'lambda', 'λ'].includes(value.toLowerCase())
    ? EPSILON
    : value;
};

/**
 * Converts an internal symbol into a readable label.
 *
 * @param {string} symbol Internal transition symbol.
 * @returns {string} User-facing symbol label.
 */
export const formatSymbol = (symbol = '') => (
  symbol === EPSILON ? EPSILON_LABEL : String(symbol)
);

/**
 * Splits a comma-separated transition label into normalized symbols.
 *
 * @param {string|string[]} value Transition symbol input.
 * @returns {string[]} Unique normalized symbols.
 */
export const normalizeSymbolList = (value = []) => {
  const rawSymbols = Array.isArray(value) ? value : String(value).split(',');

  return [...new Set(
    rawSymbols
      .filter((symbol) => String(symbol).trim() !== '')
      .map((symbol) => normalizeSymbol(symbol)),
  )];
};
