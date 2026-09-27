import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChainLog, serializeSnapshot, parseSnapshot } from '../../js/chain/ChainLog.js';
import { MemoryChainPersistence, CoalescedWriter } from '../../js/chain/persistence.js';

test('consecutive block entries merge into one run', () => {
    const log = new ChainLog();
    log.record({ type: 'blocks', count: 1 });
    log.record({ type: 'blocks', count: 1 });
    log.record({ type: 'faucet', puzzleHashHex: 'aa', amount: 5n });
    log.record({ type: 'blocks', count: 1 });
    assert.deepEqual(log.entries.map((e) => [e.type, e.count ?? null]), [['blocks', 2], ['faucet', null], ['blocks', 1]]);
});

test('snapshots round-trip bigints', () => {
    const snapshot = { version: 1, entries: [{ type: 'faucet', puzzleHashHex: 'aa', amount: 12_345_678_901_234_567n }] };
    assert.deepEqual(parseSnapshot(serializeSnapshot(snapshot)), snapshot);
});

test('many save requests in one tick produce one write', async () => {
    const persistence = new MemoryChainPersistence();
    let version = 0;
    const writer = new CoalescedWriter({ persistence, snapshot: () => `v${++version}`, onConflict() {}, onError() {} });
    for (let i = 0; i < 10; i++) writer.request();
    await writer.flush();
    assert.equal(persistence.writes, 1);
    assert.equal(persistence.data, 'v1');
});

test('a request during an in-flight write chains exactly one more write with the latest state', async () => {
    const persistence = new MemoryChainPersistence();
    let state = 'first';
    const writer = new CoalescedWriter({ persistence, snapshot: () => state, onConflict() {}, onError() {} });
    writer.request();
    await Promise.resolve();
    state = 'second';
    writer.request();
    writer.request();
    await writer.flush();
    assert.equal(persistence.writes, 2);
    assert.equal(persistence.data, 'second');
});

test('a write from a stale tab is rejected and reported as a conflict', async () => {
    const persistence = new MemoryChainPersistence();
    const tabA = new CoalescedWriter({ persistence, snapshot: () => 'A', onConflict() {}, onError() {} });
    let conflicts = 0;
    const tabB = new CoalescedWriter({ persistence, snapshot: () => 'B', onConflict: () => conflicts++, onError() {} });

    tabA.request();
    await tabA.flush();
    tabB.request();
    await tabB.flush();

    assert.equal(conflicts, 1);
    assert.equal(tabB.stopped, true);
    assert.equal(persistence.data, 'A');
});

test('storage errors are reported, not thrown', async () => {
    const broken = { loadWithGeneration: async () => ({ data: null, generation: 0 }), saveIfGeneration: async () => { throw new Error('QuotaExceededError'); } };
    let errors = 0;
    const writer = new CoalescedWriter({ persistence: broken, snapshot: () => 'x', onConflict() {}, onError: () => errors++ });
    writer.request();
    await writer.flush();
    assert.equal(errors, 1);
});
