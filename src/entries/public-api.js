import AutomataEditorManager from '../scripts/editor/automata-editor-manager';
import AutomataSvgEditor from '../scripts/editor/automata-svg-editor';
import AutomataModelNormalizer from '../scripts/model/automata-model-normalizer';
import AutomataValidator from '../scripts/model/automata-validator';
import AutomataEquivalenceChecker from '../scripts/runtime/automata-equivalence-checker';
import AutomataRunner from '../scripts/runtime/automata-runner';
import AutomataTestRunner from '../scripts/testing/automata-test-runner';
import AutomataTestTable from '../scripts/testing/automata-test-table';

H5P.AutomataTools = {
  AutomataEditorManager,
  AutomataSvgEditor,
  AutomataModelNormalizer,
  AutomataValidator,
  AutomataEquivalenceChecker,
  AutomataRunner,
  AutomataTestRunner,
  AutomataTestTable,
};

H5P.AutomataEditorManager = AutomataEditorManager;
H5P.AutomataSvgEditor = AutomataSvgEditor;
H5P.AutomataModelNormalizer = AutomataModelNormalizer;
H5P.AutomataValidator = AutomataValidator;
H5P.AutomataEquivalenceChecker = AutomataEquivalenceChecker;
H5P.AutomataRunner = AutomataRunner;
H5P.AutomataTestRunner = AutomataTestRunner;
H5P.AutomataTestTable = AutomataTestTable;
