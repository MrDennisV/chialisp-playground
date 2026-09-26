import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayground, loadExamples, readSource } from './helpers/playground.mjs';

// Labels keep small numbers out of the first list position, where the
// disassembler would print them as opcode names (1 -> q, 2 -> a, ...).
const ECHO = '(mod (A B c) (include *standard-cl-24*) (list "first" A "second" B "third" c))';
const ECHOED = '("first" 10 "second" 20 "third" 30)';

let playground;
before(async () => {
    playground = await createPlayground();
});

async function runExample(key, overrides = {}) {
    const example = loadExamples().find((e) => e.key === key);
    const params = { ...playground.paramsFor(example), ...overrides };
    return playground.compilationService.runCode(readSource(example.file), example.file, params);
}

describe('runCode', () => {
    test('passes solution arguments straight through when nothing is curried', async () => {
        const { result } = await playground.run(ECHO, { solutionParams: '(10 20 30)' });
        assert.equal(result, ECHOED);
    });

    test('treats "()" curry params as no curry', async () => {
        const { result } = await playground.run(ECHO, { curriedParams: '()', solutionParams: '(10 20 30)' });
        assert.equal(result, ECHOED);
    });

    test('curries parameters exactly once', async () => {
        const { result } = await playground.run(ECHO, { curriedParams: '(10 20)', solutionParams: '(30)' });
        assert.equal(result, ECHOED);
    });

    test('reports the curried puzzle hash separately from the base program', async () => {
        const run = await playground.run(ECHO, { curriedParams: '(10 20)', solutionParams: '(30)' });
        assert.notEqual(run.hash, run.compilation.hash);
    });

    test('rejects invalid curry params instead of running uncurried', async () => {
        await assert.rejects(
            playground.run(ECHO, { curriedParams: '(0xZZ', solutionParams: '(30)' }),
            /Invalid curried parameters/
        );
    });

    test('surfaces compile errors', async () => {
        await assert.rejects(playground.run('(mod (a) (+ a'), /Compilation failed/);
    });

    test('surfaces runtime errors raised with x', async () => {
        await assert.rejects(playground.run('(mod () (x "boom"))'), /Runtime error/);
    });

    test('resolves includes from examples/includes', async () => {
        const source = '(mod () (include *standard-cl-24*) (include "includes/condition_codes.clib") (list "code" CREATE_COIN))';
        const { result } = await playground.run(source);
        assert.equal(result, '("code" 51)');
    });
});

describe('curried examples use their curry args once', () => {
    test('curry: OPERATION and BASE_VALUE are curried, input comes from the solution', async () => {
        const { result } = await runExample('curry_understanding');
        assert.match(result, /\("Current parameters:" \("add" 10 7\)\)/);
        assert.match(result, /\("Calculation result:" 17\)/);
    });

    test('piggybank: creates the coin for the recipient, not for the time lock', async () => {
        const { result } = await runExample('piggybank');
        assert.match(result, /0x0123456789abcdef 0x00e8d4a51000/);
        assert.doesNotMatch(result, / 3600 0x0123456789abcdef/);
    });

    test('password protection: pays the recipient', async () => {
        const { result } = await runExample('password_protection');
        assert.match(result, /0x0123456789abcdef 0x00e8d4a51000/);
    });

    test('password protection: a wrong password fails the spend', async () => {
        await assert.rejects(runExample('password_protection', { curriedParams: "('wrong')" }), /Invalid password/);
    });
});

describe('new examples compute the right values', () => {
    test('coin id matches the native coinid operator', async () => {
        const { result } = await runExample('coin_id');
        assert.match(result, /\("Matches:" 1\)/);
    });

    test('square-and-multiply matches modpow and the inverse checks out', async () => {
        const { result } = await runExample('modular_exponentiation');
        assert.match(result, /\("Both agree:" 1\)/);
        assert.match(result, /\("base \* inverse mod p = 1:" 1\)/);
        assert.match(result, /\("Wrong inverse rejected:" \(\)\)/);
    });

    test('curried puzzle hash from hashes equals sha256tree of the curried program', async () => {
        const { result } = await runExample('curried_puzzle_hash');
        assert.match(result, /\("Running it gives:" 30\)/);
        assert.match(result, /\("Same result:" 1\)/);
    });

    test('merkle proof accepts the item and rejects fakes', async () => {
        const { result } = await runExample('merkle_proof');
        assert.match(result, /\("Proof valid:" 1\)/);
        assert.match(result, /\("Fake item with same proof:" \(\)\)/);
        assert.match(result, /\("Right item, wrong position:" \(\)\)/);
    });

    test('commit-reveal accepts the honest reveal and rejects both cheats', async () => {
        const { result } = await runExample('commit_reveal');
        assert.match(result, /\("Step 3 - Honest reveal valid:" 1\)/);
        assert.match(result, /\("Cheat - change the move:" \(\)\)/);
        assert.match(result, /\("Cheat - change the salt:" \(\)\)/);
    });

    test('deterministic shuffle is reproducible and a permutation', async () => {
        const { result } = await runExample('deterministic_shuffle');
        // lists contain "()" for 0, so match up to the closing "))" of each entry
        const shuffled = result.match(/\("Shuffled:" \((.*?)\)\) \("Same/)[1];
        const again = result.match(/\("Same seed again:" \((.*?)\)\) \("Different/)[1];
        assert.equal(shuffled, again);
        // 10 items (0 prints as (), small numbers may print as opcodes)
        assert.equal(shuffled.split(' ').length, 10);
    });

    test('merge sort sorts records by score', async () => {
        const { result } = await runExample('merge_sort');
        assert.match(result, /\(\("alice" 95\) \("bob" 88\) \("carol" 72\)\)/);
        assert.match(result, /\("Descending:" \(88 61 42 25 19 7 3\)\)/);
    });

    test('higher-order functions: fold and pipeline results', async () => {
        const { result } = await runExample('higher_order_functions');
        assert.match(result, /\("fold sum:" 21\)/);
        assert.match(result, /\("pipeline \(odd -> square -> sum\):" 35\)/);
    });

    test('HTLC: the right secret pays the receiver before the timeout', async () => {
        const { result } = await runExample('hash_time_locked_contract');
        assert.match(result, /0x81bae876b70513c9decc608eed549977a81afa1c2b6b4080aec256339e792e0f 0x00e8d4a51000/);
        assert.match(result, /\(84 3600\)/);
    });

    test('HTLC: no secret refunds the sender after the timeout', async () => {
        const { result } = await runExample('hash_time_locked_contract', { solutionParams: '(1000000000000 ())' });
        assert.match(result, /0x0a367b92cf0b037dfd89960ee832d56f7fc151681bb41e53690e776f5786998a 0x00e8d4a51000/);
        assert.match(result, /\(80 3600\)/);
    });

    test('HTLC: a wrong secret fails the spend', async () => {
        await assert.rejects(
            runExample('hash_time_locked_contract', { solutionParams: "(1000000000000 'guess')" }),
            /wrong secret/
        );
    });

    test('signature-locked coin requires a signature over the conditions', async () => {
        const { result } = await runExample('signature_locked_coin');
        assert.match(result, /0x88ae83c1777027b3df993a126f625e648a59408521539ddbc03ae116b382a11143bf987aa74f7989dfb599df30823a8a/);
    });
});
