import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers/chain.mjs';
import { ChainService } from '../../js/chain/ChainService.js';
import { WalletService } from '../../js/chain/WalletService.js';
import { MOJOS_PER_XCH } from '../../js/chain/units.js';

let sdk;
before(async () => {
    sdk = await loadSdk();
});

const XCH = (n) => BigInt(Math.round(n * 1e4)) * (MOJOS_PER_XCH / 10_000n);

function fundedChain() {
    const chain = new ChainService({ sdk });
    const wallets = new WalletService({ sdk, chain });
    const alice = wallets.create('Alice');
    const bob = wallets.create('Bob');
    chain.submit(wallets.buildFaucet({ to: alice.address, amount: XCH(10) }));
    chain.submit(wallets.buildFaucet({ to: bob.address, amount: XCH(10) }));
    chain.farmBlock();
    return { chain, wallets, alice, bob };
}

test('a send pays the destination, returns change and pays the fee, confirmed in the next block', () => {
    const { chain, wallets, alice, bob } = fundedChain();

    chain.submit(wallets.buildSend({ from: 'Alice', to: bob.address, amount: XCH(1.5), fee: XCH(0.0001) }));
    assert.deepEqual(wallets.coinsFor(alice.puzzleHashHex).map((c) => c.status).sort(), ['pending', 'spending']);
    assert.equal(wallets.balanceOf(alice.puzzleHashHex), 0n);

    const block = chain.farmBlock();

    assert.equal(block.rejected.length, 0);
    assert.equal(wallets.balanceOf(alice.puzzleHashHex), XCH(8.4999));
    assert.equal(wallets.balanceOf(bob.puzzleHashHex), XCH(11.5));
    assert.deepEqual(wallets.coinsFor(bob.puzzleHashHex).map((c) => c.amount).sort(), [XCH(1.5), XCH(10)].sort());
});

test('the preview matches what the send does', () => {
    const { wallets, bob } = fundedChain();
    const preview = wallets.previewSend({ from: 'Alice', to: bob.address, amount: XCH(1.5), fee: XCH(0.0001) });
    assert.equal(preview.inputs.length, 1);
    assert.equal(preview.inputs[0].amount, XCH(10));
    assert.equal(preview.change, XCH(8.4999));
    assert.equal(preview.mainnet, false);
});

test('coins are selected largest first and never twice', () => {
    const { chain, wallets, alice, bob } = fundedChain();
    chain.submit(wallets.buildFaucet({ to: alice.address, amount: XCH(1) }));
    chain.farmBlock();

    const first = wallets.previewSend({ from: 'Alice', to: bob.address, amount: XCH(2), fee: 0n });
    assert.deepEqual(first.inputs.map((c) => c.amount), [XCH(10)]);

    chain.submit(wallets.buildSend({ from: 'Alice', to: bob.address, amount: XCH(2), fee: 0n }));
    const second = wallets.previewSend({ from: 'Alice', to: bob.address, amount: XCH(0.5), fee: 0n });
    assert.deepEqual(second.inputs.map((c) => c.amount), [XCH(1)]);
});

test('rejects sends the wallet cannot make, with messages a learner understands', () => {
    const { wallets, alice, bob } = fundedChain();
    const send = (form) => () => wallets.buildSend({ from: 'Alice', to: bob.address, amount: XCH(1), fee: 0n, ...form });

    assert.throws(send({ amount: XCH(20) }), /Alice has 10 XCH confirmed; needs 20/);
    assert.throws(send({ amount: 0n }), /Amount must be greater than 0/);
    assert.throws(send({ amount: null }), /Enter an amount like 1.5/);
    assert.throws(send({ fee: null }), /Enter a fee like 0.0001/);
    assert.throws(send({ to: alice.address }), /Sending to yourself\? Pick another address/);
    assert.throws(send({ to: 'nope' }), /Enter a txch1… or xch1… address, or a 0x puzzle hash/);
});

test('amounts above what a coin can hold are rejected before anything is submitted', () => {
    const { wallets, bob } = fundedChain();
    const huge = 20_000_000n * MOJOS_PER_XCH;
    assert.throws(() => wallets.buildFaucet({ to: bob.address, amount: huge }), /Amount too large: at most 18446744.073709551615 XCH/);
    assert.throws(() => wallets.previewSend({ from: 'Alice', to: bob.address, amount: huge, fee: 0n }), /Amount too large/);
    assert.throws(() => wallets.previewSend({ from: 'Alice', to: bob.address, amount: 1n, fee: huge }), /Fee too large/);
});

test('a pasted mainnet address pays the same puzzle hash and is flagged', () => {
    const { chain, wallets, bob } = fundedChain();
    const mainnet = new sdk.Address(sdk.fromHex(bob.puzzleHashHex), 'xch').encode();
    const tx = wallets.buildSend({ from: 'Alice', to: mainnet, amount: XCH(1), fee: 0n });
    assert.equal(tx.mainnet, true);
    chain.submit(tx);
    chain.farmBlock();
    assert.equal(wallets.balanceOf(bob.puzzleHashHex), XCH(11));
});

test('hiding a wallet keeps its coins; re-creating it by name brings them back', () => {
    const { wallets, bob } = fundedChain();
    wallets.hide('bob');
    assert.deepEqual(wallets.visible.map((w) => w.name), ['Alice']);
    assert.deepEqual(wallets.hiddenNames, ['Bob']);

    const back = wallets.create('BOB');
    assert.equal(back.address, bob.address);
    assert.equal(wallets.balanceOf(back.puzzleHashHex), XCH(10));
});

test('wallet names are unique, non-empty and cannot be Faucet', () => {
    const { wallets } = fundedChain();
    assert.throws(() => wallets.create('alice'), /Alice already exists/);
    assert.throws(() => wallets.create('   '), /Enter a name/);
    assert.throws(() => wallets.create('faucet'), /Faucet is reserved/);
    assert.equal(wallets.create('carol').name, 'Carol');
});

test('wallet names use letters, numbers, spaces, - or _ and at most 24 characters', () => {
    const { wallets } = fundedChain();
    for (const bad of ['x" data-copy="PWNED', '<b>', 'a'.repeat(25), 'semi;colon']) {
        assert.throws(() => wallets.create(bad), /Use letters, numbers, spaces, - or _ \(max 24\)/, bad);
    }
    assert.equal(wallets.create('María-José 2').name, 'María-José 2');
});

test('watched addresses carry a label and show their coins', () => {
    const { chain, wallets } = fundedChain();
    const contract = 'ef'.repeat(32);
    wallets.watch(contract, { label: 'piggybank.clsp', source: { file: 'examples/blockchain/piggybank.clsp' } });
    chain.submit(wallets.buildSend({ from: 'Alice', to: '0x' + contract, amount: XCH(2), fee: 0n }));
    chain.farmBlock();

    assert.deepEqual(wallets.watched.map((w) => w.label), ['piggybank.clsp']);
    assert.equal(wallets.labelFor(contract), 'piggybank.clsp');
    assert.equal(wallets.balanceOf(contract), XCH(2));

    wallets.unwatch(contract);
    assert.deepEqual(wallets.watched, []);
});
