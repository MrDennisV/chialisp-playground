import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createPlayground, loadExamples, readSource, ROOT } from './helpers/playground.mjs';

const examples = loadExamples();
const runnable = examples.filter((e) => e.file.endsWith('.clsp'));

let playground;
before(async () => {
    playground = await createPlayground();
});

test('every example file listed in examples.json exists', () => {
    const missing = examples.filter((e) => !fs.existsSync(path.join(ROOT, e.file))).map((e) => e.file);
    assert.deepEqual(missing, []);
});

test('every .clsp under examples/ is listed in examples.json', () => {
    const listed = new Set(examples.map((e) => e.file));
    const onDisk = fs
        .readdirSync(path.join(ROOT, 'examples'), { recursive: true })
        .map((f) => `examples/${f.replaceAll('\\', '/')}`)
        .filter((f) => f.endsWith('.clsp'));
    assert.deepEqual(onDisk.filter((f) => !listed.has(f)), []);
});

for (const example of runnable) {
    test(`runs with its default arguments: ${example.moduleKey ?? 'welcome'}/${example.key}`, async () => {
        const params = playground.paramsFor(example);
        const result = await playground.compilationService.runCode(readSource(example.file), example.file, params);
        assert.ok(result.result !== undefined, 'produced a result');
        assert.ok(Number(result.cost) > 0, 'reported a cost');
    });
}
