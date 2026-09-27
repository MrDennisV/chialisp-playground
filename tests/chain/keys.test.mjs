import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers/chain.mjs';
import { walletKeys, encodeAddress, parseDestination } from '../../js/chain/keys.js';

let sdk;
before(async () => {
    sdk = await loadSdk();
});

test('the same name always derives the same wallet, whatever the case or padding', () => {
    const a = walletKeys(sdk, 'Alice');
    const b = walletKeys(sdk, '  alice ');
    assert.equal(a.address, b.address);
    assert.equal(a.publicKeyHex, b.publicKeyHex);
    assert.notEqual(a.address, walletKeys(sdk, 'Bob').address);
});

test('wallet addresses are txch addresses of the standard puzzle hash', () => {
    const alice = walletKeys(sdk, 'Alice');
    assert.match(alice.address, /^txch1[02-9ac-hj-np-z]{58}$/);
    assert.equal(alice.puzzleHashHex, sdk.toHex(sdk.standardPuzzleHash(alice.publicKey)));
    assert.equal(encodeAddress(sdk, alice.puzzleHashHex), alice.address);
});

test('parses txch, xch and 0x destinations to the same puzzle hash', () => {
    const alice = walletKeys(sdk, 'Alice');
    const mainnet = new sdk.Address(sdk.fromHex(alice.puzzleHashHex), 'xch').encode();

    assert.deepEqual(parseDestination(sdk, alice.address), { puzzleHashHex: alice.puzzleHashHex, mainnet: false });
    assert.deepEqual(parseDestination(sdk, mainnet), { puzzleHashHex: alice.puzzleHashHex, mainnet: true });
    assert.deepEqual(parseDestination(sdk, '0x' + alice.puzzleHashHex.toUpperCase()), { puzzleHashHex: alice.puzzleHashHex, mainnet: false });
});

test('rejects anything that is not a txch/xch address or a 32-byte puzzle hash', () => {
    for (const bad of ['', 'hello', 'txch1invalid', '0x1234', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq']) {
        assert.throws(() => parseDestination(sdk, bad), /Enter a txch1… or xch1… address, or a 0x puzzle hash/);
    }
});
