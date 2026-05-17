import AutomataModelNormalizer from '../model/automata-model-normalizer';
import AutomataSvgEditor from './automata-svg-editor';

/**
 * Adapter that makes automata editors look like LibCodeTools editor managers.
 *
 * CodeContainer expects editor managers to expose `setupEditors`, `getDOM`,
 * `getCode`, `setCode` and `focus`. This class implements that small contract
 * while delegating actual graph editing to an editor strategy such as
 * `AutomataSvgEditor`.
 */
export default class AutomataEditorManager {
  /**
   * @param {object} parent Container using the manager.
   * @param {object} [options] Editor manager options.
   * @param {typeof AutomataSvgEditor} [options.editorClass] Editor strategy class.
   */
  constructor(parent, options = {}) {
    this.parent = parent;
    this.options = options;
    this.normalizer = options.normalizer || new AutomataModelNormalizer({
      defaultType: options.automatonType || 'dfa',
    });
    this.editorClass = options.editorClass || AutomataSvgEditor;
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'h5p-automata-editor-manager';
    this.editor = null;
  }

  /**
   * Initializes the editor.
   *
   * @returns {Promise<void>} Resolves when ready.
   */
  async setupEditors() {
    this.editor = new this.editorClass({
      model: this.options.model || this.options.code,
      type: this.options.automatonType || 'dfa',
      normalizer: this.normalizer,
      onChange: () => this.parent?.resizeActionHandler?.(),
    });
    this.wrapper.innerHTML = '';
    this.wrapper.append(this.editor.getDOM());
  }

  /**
   * Returns the manager DOM.
   *
   * @returns {HTMLElement} Editor wrapper.
   */
  getDOM() {
    return this.wrapper;
  }

  /**
   * Returns serialized graph code for CodeQuestion APIs.
   *
   * @returns {string} Serialized model.
   */
  getCode() {
    return this.editor?.getValue?.() || JSON.stringify(this.normalizer.normalize(this.options.model), null, 2);
  }

  /**
   * Sets serialized graph code.
   *
   * @param {string|object} code Serialized model.
   * @returns {void}
   */
  setCode(code) {
    this.editor?.setValue?.(code);
  }

  /**
   * Returns the live automata model.
   *
   * @returns {object} Normalized model.
   */
  getModel() {
    return this.editor?.getModel?.() || this.normalizer.normalize(this.options.model);
  }

  /**
   * Highlights a trace frame in the visual editor.
   *
   * @param {object|null} frame Trace frame.
   * @returns {void}
   */
  highlightTraceFrame(frame = null) {
    this.editor?.highlightTraceFrame?.(frame);
  }

  /**
   * Focuses the editor.
   *
   * @returns {void}
   */
  focus() {
    this.editor?.focus?.();
  }

  /**
   * Compatibility no-op for CodeQuestion focus handling.
   *
   * @returns {void}
   */
  closeFileManager() {}

  /**
   * Compatibility no-op for fullscreen handling.
   *
   * @returns {void}
   */
  restoreDynamicHeight() {}

  /**
   * Accepts theme changes from CodeContainer.
   *
   * @param {string} _theme Theme name.
   * @returns {void}
   */
  setTheme(theme) {
    this.theme = theme === 'dark' ? 'dark' : 'light';
  }
}
