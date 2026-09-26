// Runs the playground's real Debugger + CompilationService in Node, no browser.
// Only the browser-specific pieces are swapped: include files come from disk
// instead of XMLHttpRequest, and every file is treated as an example.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WasmLoader } from '../../js/WasmLoader.js';

const require = createRequire(import.meta.url);
const Debugger = require('../../js/Debugger.js');
const CompilationService = require('../../js/services/CompilationService.js');
const ExamplesService = require('../../js/services/ExamplesService.js');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const storageStub = { getSourceTypeFromFilename: () => 'example' };

function readFromRepo(filepath) {
    const full = path.join(ROOT, filepath);
    return fs.existsSync(full) && fs.statSync(full).isFile() ? fs.readFileSync(full, 'utf8') : null;
}

export async function createPlayground() {
    const debuggerInstance = new Debugger();
    debuggerInstance.useWasmModule(await WasmLoader.initialize());
    debuggerInstance.createFileReader = () => readFromRepo;

    const compilationService = new CompilationService(storageStub, debuggerInstance);
    const examplesService = new ExamplesService();

    return {
        compilationService,
        /** Same argument formatting the UI uses when an example is opened */
        paramsFor: (example) => examplesService._formatParameters(example),
        run: (source, { curriedParams = '', solutionParams = '()', filename = 'examples/test.clsp' } = {}) =>
            compilationService.runCode(source, filename, { curriedParams, solutionParams }),
    };
}

export function readSource(file) {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/** Every entry of examples.json, flattened, with its module key */
export function loadExamples() {
    const data = JSON.parse(readSource('examples/examples.json'));
    const examples = [{ key: 'welcome', moduleKey: null, ...data.welcome }];
    for (const [moduleKey, module] of Object.entries(data.modules)) {
        for (const [key, example] of Object.entries(module.examples)) {
            examples.push({ key, moduleKey, ...example });
        }
    }
    return examples;
}
