import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayground, readSource } from '../helpers/playground.mjs';
import { resolvePuzzleAddress } from '../../js/chain/puzzleAddress.js';

let playground;
before(async () => {
    playground = await createPlayground();
});

const FILE = 'examples/blockchain/piggybank.clsp';
const compile = (source, filename, params) => playground.compilationService.compileCode(source, filename, params);

test('uses the curried program hash, so each curry is a different address', async () => {
    const source = readSource(FILE);
    const hour = await resolvePuzzleAddress({ filename: FILE, source, curriedParams: '(3600)', compile });
    const day = await resolvePuzzleAddress({ filename: FILE, source, curriedParams: '(86400)', compile });
    const expected = await compile(source, FILE, { curriedParams: '(3600)' });

    assert.equal(hour.name, 'piggybank.clsp');
    assert.equal(hour.puzzleHashHex, expected.curriedHash);
    assert.notEqual(hour.puzzleHashHex, day.puzzleHashHex);
    assert.deepEqual(hour.source, { file: FILE, curriedParams: '(3600)', compiledHex: expected.hex });
});

test('refuses invalid curried parameters instead of returning the uncurried hash', async () => {
    const result = await resolvePuzzleAddress({ filename: FILE, source: readSource(FILE), curriedParams: '(0xZZ', compile });
    assert.equal(result.error, 'Invalid curried parameters');
    assert.equal(result.puzzleHashHex, undefined);
});

test('reports compile errors', async () => {
    const result = await resolvePuzzleAddress({ filename: 'x.clsp', source: '(mod (a) (+ a', curriedParams: '', compile });
    assert.match(result.error, /Compilation failed/);
});

test('asks for a file when none is open', async () => {
    const result = await resolvePuzzleAddress({ filename: '', source: '', curriedParams: '', compile });
    assert.equal(result.error, 'Open a .clsp file first');
});
