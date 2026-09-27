import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers/chain.mjs';
import { ChainService, BLOCK_SECONDS, toCoinSpendRecord } from '../../js/chain/ChainService.js';

let sdk;
before(async () => {
    sdk = await loadSdk();
});

const faucet = (puzzleHashHex, amount) => ({
    kind: 'faucet', from: 'Faucet', puzzleHashHex, toPuzzleHashHex: puzzleHashHex, amount,
    outputs: [{ id: null, puzzleHashHex, amount }],
});

// Anyone-can-spend puzzle `1` wrapped with a relative height or seconds assertion
function assertingCoinSpend(chain, coinId, conditionCode, value) {
    const clvm = new sdk.Clvm();
    const coin = chain.coinObject(coinId);
    const solution = clvm.list([
        clvm.list([clvm.int(BigInt(conditionCode)), clvm.int(BigInt(value))]),
        clvm.list([clvm.int(51n), clvm.atom(coin.puzzleHash), clvm.int(coin.amount)]),
    ]);
    return {
        kind: 'spend', from: 'test', toPuzzleHashHex: sdk.toHex(coin.puzzleHash), amount: coin.amount, fee: 0n, change: 0n,
        coinSpends: [toCoinSpendRecord(sdk, new sdk.CoinSpend(coin, clvm.parse('1').serialize(), solution.serialize()))],
        secretKeys: [], signerNames: [], inputIds: [coinId], outputs: [],
    };
}

const ANYONE = () => sdk.toHex(new sdk.Clvm().parse('1').treeHash());

test('Next farms exactly one block and advances chain time', () => {
    const chain = new ChainService({ sdk });
    assert.equal(chain.height, 0);
    chain.farmBlock();
    chain.farmBlock();
    assert.equal(chain.height, 2);
    assert.equal(chain.chainSeconds, 2 * BLOCK_SECONDS);
    assert.deepEqual(chain.blocks.map((b) => b.height), [1, 2]);
});

test('a faucet send waits in the mempool and confirms in the next block', () => {
    const chain = new ChainService({ sdk });
    const target = 'ab'.repeat(32);
    chain.submit(faucet(target, 5n));
    assert.equal(chain.mempool.length, 1);
    assert.deepEqual(chain.coinsByPuzzleHash(target), []);

    const block = chain.farmBlock();

    assert.equal(chain.mempool.length, 0);
    assert.equal(block.txs.length, 1);
    const [coin] = chain.coinsByPuzzleHash(target);
    assert.equal(coin.amount, 5n);
    assert.equal(coin.confirmedBlock, 1);
    assert.equal(coin.spentBlock, null);
});

test('several mempool transactions confirm in the same block', () => {
    const chain = new ChainService({ sdk });
    chain.submit(faucet('aa'.repeat(32), 1n));
    chain.submit(faucet('bb'.repeat(32), 2n));
    const block = chain.farmBlock();
    assert.equal(block.height, 1);
    assert.equal(block.txs.length, 2);
});

test('relative height locks count blocks exactly', () => {
    const chain = new ChainService({ sdk });
    chain.submit(faucet(ANYONE(), 7n));
    chain.farmBlock();
    const [coin] = chain.coinsByPuzzleHash(ANYONE());

    chain.submit(assertingCoinSpend(chain, coin.id, 82, 3)); // ASSERT_HEIGHT_RELATIVE 3
    const early = chain.farmBlock();
    assert.equal(early.rejected.length, 1);
    assert.match(early.rejected[0].error, /AssertHeightRelativeFailed/);

    chain.farmBlock();
    chain.submit(assertingCoinSpend(chain, coin.id, 82, 3));
    const onTime = chain.farmBlock();
    assert.equal(onTime.rejected.length, 0);
    assert.equal(chain.coinsByPuzzleHash(ANYONE()).find((c) => c.id === coin.id).spentBlock, onTime.height);
});

test('coins created by a confirmed spend are listed under their puzzle hash', () => {
    const chain = new ChainService({ sdk });
    chain.submit(faucet(ANYONE(), 6n));
    chain.farmBlock();
    const [coin] = chain.coinsByPuzzleHash(ANYONE());

    chain.submit(assertingCoinSpend(chain, coin.id, 82, 1)); // recreates a 6-mojo coin at the same puzzle hash
    const block = chain.farmBlock();

    const child = chain.coinsByPuzzleHash(ANYONE()).find((c) => c.id !== coin.id);
    assert.equal(block.rejected.length, 0);
    assert.equal(child.amount, 6n);
    assert.equal(child.parentId, coin.id);
    assert.equal(child.confirmedBlock, block.height);
    assert.equal(child.spentBlock, null);
});

test('every block advances the relative clock by 52 seconds', () => {
    const chain = new ChainService({ sdk });
    chain.submit(faucet(ANYONE(), 9n));
    chain.farmBlock();
    const [coin] = chain.coinsByPuzzleHash(ANYONE());

    chain.submit(assertingCoinSpend(chain, coin.id, 80, 2 * BLOCK_SECONDS)); // ASSERT_SECONDS_RELATIVE 104
    assert.equal(chain.farmBlock().rejected.length, 1);
    chain.submit(assertingCoinSpend(chain, coin.id, 80, 2 * BLOCK_SECONDS));
    assert.equal(chain.farmBlock().rejected.length, 0);
});

test('a rejected block keeps its faucet coins, drops the spends and keeps farming', () => {
    const chain = new ChainService({ sdk });
    chain.submit(faucet(ANYONE(), 3n));
    chain.farmBlock();
    const [coin] = chain.coinsByPuzzleHash(ANYONE());

    chain.submit(assertingCoinSpend(chain, coin.id, 82, 100));
    chain.submit(faucet('cd'.repeat(32), 4n));
    const block = chain.farmBlock();

    assert.equal(block.rejected.length, 1);
    assert.equal(block.txs.length, 1);
    assert.equal(chain.coinsByPuzzleHash('cd'.repeat(32))[0].amount, 4n);
    assert.equal(chain.farmBlock().height, block.height + 1);
});

test('a faucet coin the simulator refuses is reported, and the rest of the block still confirms', () => {
    const chain = new ChainService({ sdk });
    chain.submit(faucet('aa'.repeat(32), 2n ** 64n));
    chain.submit(faucet('bb'.repeat(32), 5n));

    const block = chain.farmBlock();

    assert.equal(block.rejected.length, 1);
    assert.equal(block.txs.length, 1);
    assert.equal(chain.coinsByPuzzleHash('bb'.repeat(32))[0].amount, 5n);
    assert.deepEqual(chain.coinsByPuzzleHash('aa'.repeat(32)), []);
});

test('coin spend records rebuild the same coin', () => {
    const chain = new ChainService({ sdk });
    chain.submit(faucet(ANYONE(), 2n));
    chain.farmBlock();
    const [coin] = chain.coinsByPuzzleHash(ANYONE());
    const record = assertingCoinSpend(chain, coin.id, 82, 1).coinSpends[0];
    const rebuilt = new sdk.Coin(sdk.fromHex(record.coin.parentCoinInfo), sdk.fromHex(record.coin.puzzleHash), BigInt(record.coin.amount));
    assert.equal(sdk.toHex(rebuilt.coinId()), coin.id);
});

test('listeners hear submits and blocks', () => {
    const chain = new ChainService({ sdk });
    let calls = 0;
    chain.onChange(() => calls++);
    chain.submit(faucet('ee'.repeat(32), 1n));
    chain.farmBlock();
    assert.equal(calls, 2);
});
