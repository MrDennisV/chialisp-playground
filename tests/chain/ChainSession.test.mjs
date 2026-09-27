import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSession, manualTimers } from '../helpers/chain.mjs';
import { MemoryChainPersistence } from '../../js/chain/persistence.js';
import { MOJOS_PER_XCH, parseXch } from '../../js/chain/units.js';

const TEN = 10n * MOJOS_PER_XCH;

test('a new chain starts at block #1 with Alice and Bob funded with 10 XCH', async () => {
    const { session } = await openSession();
    assert.equal(session.chain.height, 1);
    assert.equal(session.state, 'stopped');
    assert.deepEqual(session.wallets.visible.map((w) => w.name), ['Alice', 'Bob']);
    for (const wallet of session.wallets.visible) assert.equal(session.wallets.balanceOf(wallet.puzzleHashHex), TEN);
});

test('Start farms a block per tick, Pause stops it, Next farms one more', async () => {
    const { session, timers } = await openSession();
    session.start();
    assert.equal(session.state, 'running');
    timers.fire();
    timers.fire();
    assert.equal(session.chain.height, 3);

    session.pause();
    assert.equal(session.state, 'paused');
    assert.equal(timers.active, 0);
    session.next();
    assert.equal(session.chain.height, 4);
});

test('a reload restores height, balances, hidden wallets and the pending mempool, paused', async () => {
    const persistence = new MemoryChainPersistence();
    const { session } = await openSession({ persistence });
    const bob = session.wallets.find('Bob');
    session.next();
    session.send({ from: 'Alice', to: bob.address, amount: parseXch('1.5'), fee: parseXch('0.0001') });
    session.next();
    session.send({ from: 'Bob', to: session.wallets.find('Alice').address, amount: parseXch('2'), fee: 0n });
    session.createWallet('Carol');
    session.hideWallet('Carol');
    session.start();
    await session.flush();

    const { session: restored } = await openSession({ persistence, timers: manualTimers() });

    assert.equal(restored.chain.height, session.chain.height);
    assert.equal(restored.state, 'paused');
    assert.equal(restored.restoredBlocks, session.chain.height);
    assert.equal(restored.chain.mempool.length, 1);
    assert.deepEqual(restored.wallets.hiddenNames, ['Carol']);
    for (const name of ['Alice', 'Bob']) {
        const w = restored.wallets.find(name);
        assert.equal(restored.wallets.balanceOf(w.puzzleHashHex), session.wallets.balanceOf(session.wallets.find(name).puzzleHashHex));
    }
    const coinIds = (s) => s.wallets.coinsFor(s.wallets.find('Bob').puzzleHashHex).map((c) => c.id).sort();
    assert.deepEqual(coinIds(restored), coinIds(session));
});

test('reset returns to genesis, keeps created wallets empty, and is what a reload then sees', async () => {
    const persistence = new MemoryChainPersistence();
    const { session } = await openSession({ persistence });
    session.next();
    session.next();
    const dave = session.createWallet('Dave');
    session.send({ from: 'Alice', to: dave.address, amount: parseXch('3'), fee: 0n });
    session.next();
    session.reset();
    await session.flush();
    assert.equal(session.chain.height, 1);
    assert.deepEqual(session.wallets.visible.map((w) => w.name), ['Alice', 'Bob', 'Dave']);
    assert.equal(session.wallets.balanceOf(dave.puzzleHashHex), 0n);

    const { session: reloaded } = await openSession({ persistence });
    assert.equal(reloaded.chain.height, 1);
    assert.deepEqual(reloaded.wallets.visible.map((w) => w.name), ['Alice', 'Bob', 'Dave']);
});

test('a send to "this puzzle" records its source only when the send succeeds', async () => {
    const { session } = await openSession();
    const puzzle = { puzzleHashHex: 'ab'.repeat(32), label: 'piggybank.clsp', source: { file: 'examples/blockchain/piggybank.clsp', curriedParams: '(3600)', compiledHex: 'ff01' } };

    assert.throws(() => session.send({ from: 'Alice', to: '0x' + puzzle.puzzleHashHex, amount: null, fee: 0n, puzzle }), /Enter an amount/);
    assert.deepEqual(session.wallets.watched, []);
    assert.equal(session.log.entries.some((e) => e.type === 'watch'), false);

    session.send({ from: 'Alice', to: '0x' + puzzle.puzzleHashHex, amount: parseXch('2'), fee: 0n, puzzle });
    assert.deepEqual(session.wallets.watched.map((w) => [w.label, w.source?.file]), [['piggybank.clsp', 'examples/blockchain/piggybank.clsp']]);
});

test('a puzzle source is never attached to a different destination', async () => {
    const { session } = await openSession();
    const puzzle = { puzzleHashHex: 'ab'.repeat(32), label: 'b.clsp', source: { file: 'b.clsp', curriedParams: '', compiledHex: 'ff01' } };
    const other = 'cd'.repeat(32);

    session.send({ from: 'Alice', to: '0x' + other, amount: parseXch('1'), fee: 0n, puzzle });

    const [watched] = session.wallets.watched;
    assert.equal(watched.puzzleHashHex, other);
    assert.equal(watched.source, null);
});

test('a chain changed by another tab stops this tab from farming', async () => {
    const persistence = new MemoryChainPersistence();
    const { session: tabA } = await openSession({ persistence });
    const { session: tabB } = await openSession({ persistence });
    tabA.next();
    await tabA.flush();

    tabB.start();
    tabB.next();
    await tabB.flush();

    assert.equal(tabB.conflict, true);
    assert.equal(tabB.state, 'paused');
    tabB.start();
    assert.equal(tabB.state, 'paused');
});

test('with storage unavailable the chain still works in memory and says so', async () => {
    const broken = {
        loadWithGeneration: async () => { throw new Error('IndexedDB blocked'); },
        saveIfGeneration: async () => { throw new Error('IndexedDB blocked'); },
    };
    const { session } = await openSession({ persistence: broken });
    session.next();
    await session.flush();
    assert.equal(session.chain.height, 2);
    assert.equal(session.storageError, true);
});

test('a saved chain that no longer replays is kept, not overwritten', async () => {
    const persistence = new MemoryChainPersistence();
    const bogusSend = { type: 'send', tx: { kind: 'spend', coinSpends: [{ coin: { parentCoinInfo: '00'.repeat(32), puzzleHash: '00'.repeat(32), amount: '1' }, puzzleReveal: '01', solution: '80' }], signerNames: [], inputIds: [], outputs: [] } };
    const data = JSON.stringify({ version: 1, entries: [bogusSend, { type: 'blocks', count: 1 }], prefs: {}, summary: { height: 1 } });
    await persistence.saveIfGeneration(data, 0);

    const { session } = await openSession({ persistence });
    session.next();
    await session.flush();

    assert.match(session.replayError, /DoubleSpend|UnknownUnspent|WrongPuzzleHash/);
    assert.equal(session.savedData, data);
    assert.equal(persistence.data, data);
});
