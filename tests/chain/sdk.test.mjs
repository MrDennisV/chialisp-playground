import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers/chain.mjs';

test('the wallet SDK loads in Node and its simulator farms a block', async () => {
    const sdk = await loadSdk();
    const sim = new sdk.Simulator();
    const clvm = new sdk.Clvm();
    const puzzle = clvm.parse('1');
    const coin = sim.newCoin(puzzle.treeHash(), 1n);
    const solution = clvm.list([clvm.list([clvm.int(51n), clvm.atom(puzzle.treeHash()), clvm.int(1n)])]);

    sim.spendCoins([new sdk.CoinSpend(coin, puzzle.serialize(), solution.serialize())], []);

    assert.equal(sim.height(), 1);
    assert.equal(sim.coinState(coin.coinId()).spentHeight, 0);
});

test('loading the SDK twice returns the same instance', async () => {
    assert.equal(await loadSdk(), await loadSdk());
});
