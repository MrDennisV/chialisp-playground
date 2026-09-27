# Blockchain Simulator (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local simulated Chia blockchain to the playground: Start/Pause/Next/Reset chain controls, a mempool, a faucet, wallets the user controls, XCH sends with change and fee, "this puzzle" addresses, and persistence across reloads.

**Architecture:** The official `chia-wallet-sdk-wasm` 0.36.0 `Simulator` runs in the browser (loaded lazily through `WasmLoader`). Plain ES modules under `js/chain/` split the work: `ChainService` owns the simulator, blocks and mempool; `WalletService` owns wallets, coins and sends; `ChainLog` and `persistence.js` store an action log in IndexedDB; `ChainSession` composes them and is the only thing the UI (`ChainView`) talks to. Persistence replays the action log into a fresh simulator, because the simulator can't be serialized.

**Tech Stack:** Vanilla JS (ES modules for new code, the existing classic scripts untouched), `chia-wallet-sdk-wasm` 0.36.0, IndexedDB, MDB/Bootstrap modals already on the page, `node:test` for `npm test`, Playwright for `npm run test:ui`.

**Spec:** `docs/superpowers/specs/2026-09-26-blockchain-simulator-design.md`. The approved interactive mockup is in `.mockups/chain.html`, `.mockups/chain.css` and `.mockups/chain.js` (git-excluded, local only). Serve the repo with `python -m http.server 8080` and open `http://localhost:8080/.mockups/chain.html` to see the target UI.

## Global Constraints

- SDK: `chia-wallet-sdk-wasm` **0.36.0**, vendored in `js/vendor/chia-wallet-sdk/`, loaded only when the Chain view is first opened.
- Address prefix displayed: **`txch`** only. Pasted `xch1…` is accepted with the notice "Mainnet address — nothing is sent on mainnet; the simulator only uses its puzzle hash (the same one as txch1…)".
- Key derivation: `SecretKey.fromSeed(sha256("chialisp-playground:" + lowercase(trimmed name))).deriveSynthetic()`.
- Genesis: block #1 with **Alice** and **Bob** funded with **10 XCH** each.
- Each block advances chain time **52 s**. Running mode farms a block every **3 s** of real time.
- Default fee **0.0001** XCH. Faucet sends have no fee.
- Restored chains start **paused**.
- Persistence: IndexedDB, coalesced writes, `durability: 'strict'`, generation counter; `npm test` stays dependency-free and browser-free; Playwright only under `npm run test:ui`.
- Code, identifiers, comments, commit messages and UI copy in **English**.
- No AI attribution anywhere (no `Co-Authored-By`, no "Generated with…").
- Don't modify unrelated existing code; reuse existing CSS classes (`sidebar-header`, `sidebar-toolbar`, `toolbar-group`, `sidebar-btn*`, `debug-output`, `debug-sidebar-content`, `open-file-btn`, `panel-tab`, `panel-section`, `status-item`) and theme variables (`--vscode-*`).

## Review Focus

1. **Comma as decimal separator.** A Spanish-speaking learner types `1,5` in Amount. Expected: it means 1.5 XCH. Test: `parseXch('1,5') === 1_500_000_000_000n` (Task 2).
2. **A wallet named "Faucet".** "Faucet" is also the From option for the faucet. Expected: creating a wallet with that name (any case) is rejected with "Faucet is reserved". Test in Task 4.
3. **Invalid curried parameters for "this puzzle".** `CompilationService.compileCode` swallows curry errors and returns the uncurried hash. Expected: the chip is disabled with "Invalid curried parameters", never an address for the wrong puzzle. Test in Task 7 (`resolvePuzzleAddress`).
4. **Storage unavailable** (private mode, quota, blocked IndexedDB). Expected: the chain keeps working in memory with a notice, and never throws. Test in Task 6.
5. **Amounts that aren't valid XCH:** `0`, `-1`, `abc`, more than 12 decimals. Expected: a clear message, nothing submitted. Tests in Tasks 2 and 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `js/vendor/chia-wallet-sdk/*` (create) | Vendored SDK 0.36.0: `chia_wallet_sdk_wasm_bg.js`, `chia_wallet_sdk_wasm_bg.wasm`, `chia_wallet_sdk_wasm.d.ts`, `LICENSE`, `VERSION`. |
| `js/WasmLoader.js` (modify) | Adds `loadWalletSdk()`: manual instantiation of the bundler-target SDK in browser and Node. |
| `js/chain/units.js` (create) | Mojo ⇄ XCH parsing and formatting with bigint. |
| `js/chain/keys.js` (create) | Wallet keys from names, `txch` address encoding, destination parsing. |
| `js/chain/ChainService.js` (create) | Simulator, tick coin, mempool, farming blocks, coin index, block history. |
| `js/chain/WalletService.js` (create) | Wallets (create/hide/restore), coins and balances, coin selection, faucet and send transactions, watched addresses. |
| `js/chain/ChainLog.js` (create) | Action log with merged block runs; bigint-safe snapshot (de)serialization. |
| `js/chain/persistence.js` (create) | `MemoryChainPersistence`, `BrowserChainPersistence` (IndexedDB), `CoalescedWriter`. |
| `js/chain/ChainSession.js` (create) | Composition root: genesis, actions, timers, reset, record + persist, replay, conflict/storage/replay-error states. |
| `js/chain/puzzleAddress.js` (create) | Resolves "this puzzle": compile the editor program with its saved curry params into a puzzle hash, or an error. |
| `js/chain/ChainView.js` (create) | DOM rendering and event wiring for the sidebar view, CHAIN tab, status bar item and modals. |
| `js/chain/boot.js` (create) | Lazy boot: status bar summary on load, SDK + session on first open. |
| `css/chain.css` (create) | Chain view styles (ported from `.mockups/chain.css`). |
| `index.html` (modify) | Activity button, sidebar view, CHAIN tab + section, status bar item, Send and Reset modals, CSS link, module script. |
| `docker/nginx/default.conf` (modify) | Gzip `application/wasm`. |
| `tests/helpers/chain.mjs` (create) | Loads the SDK in Node; manual timers; session factory. |
| `tests/chain/*.test.mjs` (create) | Service tests (run by `npm test`). |
| `tests-ui/*` (create) | Playwright UI tests + static server (run by `npm run test:ui`). |
| `package.json`, `README.md` (modify) | `test:ui` script, Playwright dev dependency, docs. |

---

### Task 1: Vendor the wallet SDK and load it through WasmLoader

**Files:**
- Create: `js/vendor/chia-wallet-sdk/` (vendored package files)
- Modify: `js/WasmLoader.js`
- Modify: `docker/nginx/default.conf`
- Create: `tests/helpers/chain.mjs`
- Test: `tests/chain/sdk.test.mjs`

**Interfaces:**
- Produces: `WasmLoader.loadWalletSdk(): Promise<Sdk>` where `Sdk` is the SDK module namespace (`Simulator`, `Clvm`, `Coin`, `CoinSpend`, `SecretKey`, `Address`, `sha256`, `toHex`, `fromHex`, `standardPuzzleHash`, …). Repeated calls return the same object.
- Produces (tests): `loadSdk(): Promise<Sdk>` in `tests/helpers/chain.mjs`.

- [ ] **Step 1: Vendor the package**

```bash
cd "$(mktemp -d)" && npm pack chia-wallet-sdk-wasm@0.36.0 && tar xzf chia-wallet-sdk-wasm-0.36.0.tgz
DEST=/path/to/chialisp-playground/js/vendor/chia-wallet-sdk
mkdir -p "$DEST"
cp package/chia_wallet_sdk_wasm_bg.js package/chia_wallet_sdk_wasm_bg.wasm package/chia_wallet_sdk_wasm.d.ts "$DEST/"
curl -sL https://raw.githubusercontent.com/xch-dev/chia-wallet-sdk/main/LICENSE -o "$DEST/LICENSE"
echo "chia-wallet-sdk-wasm 0.36.0 (npm), bundler target; instantiated by js/WasmLoader.js" > "$DEST/VERSION"
```

Expected: the directory holds 5 files; `chia_wallet_sdk_wasm_bg.wasm` is about 6.5 MB. Do **not** copy `chia_wallet_sdk_wasm.js`: it imports the `.wasm` as a module, which browsers can't do.

- [ ] **Step 2: Write the failing test**

`tests/helpers/chain.mjs`:

```js
import { WasmLoader } from '../../js/WasmLoader.js';

export function loadSdk() {
    return WasmLoader.loadWalletSdk();
}
```

`tests/chain/sdk.test.mjs`:

```js
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
```

- [ ] **Step 3: Run it to see it fail**

Run: `npm test`
Expected: FAIL, `WasmLoader.loadWalletSdk is not a function`.

- [ ] **Step 4: Implement `loadWalletSdk`**

In `js/WasmLoader.js`, add below `const WASM_DIR = …`:

```js
const WALLET_SDK_DIR = new URL('./vendor/chia-wallet-sdk/', import.meta.url);
```

below `let wasmModule = null;`:

```js
let walletSdk = null;
```

and inside `class WasmLoader`, after `initialize`:

```js
    /**
     * Loads chia-wallet-sdk (blockchain simulator, keys, addresses). The package is a bundler
     * build that imports its .wasm as a module, which browsers can't do, so it is instantiated here.
     * @returns {Promise<Object>} the SDK module
     */
    static async loadWalletSdk() {
        if (walletSdk) return walletSdk;

        const glue = await import(new URL('chia_wallet_sdk_wasm_bg.js', WALLET_SDK_DIR).href);
        const imports = { './chia_wallet_sdk_wasm_bg.js': glue };
        const wasmUrl = new URL('chia_wallet_sdk_wasm_bg.wasm', WALLET_SDK_DIR);

        let instance;
        if (isNode) {
            const { readFileSync } = await import('node:fs');
            const { fileURLToPath } = await import('node:url');
            ({ instance } = await WebAssembly.instantiate(readFileSync(fileURLToPath(wasmUrl)), imports));
        } else {
            ({ instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), imports));
        }

        glue.__wbg_set_wasm(instance.exports);
        instance.exports.__wbindgen_start?.();
        walletSdk = glue;
        return walletSdk;
    }
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all tests pass (the previous 97 plus 2 new).

- [ ] **Step 6: Gzip the wasm in production**

In `docker/nginx/default.conf` change the `gzip_types` line to:

```nginx
    gzip_types text/css application/javascript image/svg+xml application/json text/plain application/wasm;
```

- [ ] **Step 7: Commit**

```bash
git add js/vendor/chia-wallet-sdk js/WasmLoader.js docker/nginx/default.conf tests/helpers/chain.mjs tests/chain/sdk.test.mjs
git commit -m "Vendor chia-wallet-sdk-wasm 0.36.0 and load it through WasmLoader"
```

---

### Task 2: XCH units and wallet keys

**Files:**
- Create: `js/chain/units.js`
- Create: `js/chain/keys.js`
- Test: `tests/chain/units.test.mjs`, `tests/chain/keys.test.mjs`

**Interfaces:**
- Consumes: `loadSdk()` (Task 1).
- Produces (`units.js`):
  - `MOJOS_PER_XCH: bigint`
  - `parseXch(text: string): bigint | null` (accepts `.` or `,`, max 12 decimals, no sign)
  - `formatXch(mojos: bigint): string`
- Produces (`keys.js`):
  - `ADDRESS_PREFIX = 'txch'`
  - `walletKeys(sdk, name): { secretKey, publicKey, publicKeyHex, puzzleHashHex, address }` (hex strings without `0x`)
  - `encodeAddress(sdk, puzzleHashHex): string`
  - `parseDestination(sdk, input): { puzzleHashHex, mainnet: boolean }`; throws `Error('Enter a txch1… or xch1… address, or a 0x puzzle hash')`

- [ ] **Step 1: Write the failing tests**

`tests/chain/units.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOJOS_PER_XCH, parseXch, formatXch } from '../../js/chain/units.js';

test('parses whole and fractional XCH into mojos', () => {
    assert.equal(parseXch('10'), 10n * MOJOS_PER_XCH);
    assert.equal(parseXch('1.5'), 1_500_000_000_000n);
    assert.equal(parseXch('0.0001'), 100_000_000n);
    assert.equal(parseXch(' 2 '), 2n * MOJOS_PER_XCH);
});

test('accepts a comma as the decimal separator', () => {
    assert.equal(parseXch('1,5'), 1_500_000_000_000n);
});

test('rejects text that is not a non-negative XCH amount', () => {
    for (const bad of ['', 'abc', '-1', '1.2.3', '1e3', '.5', '0.0000000000001']) {
        assert.equal(parseXch(bad), null, `"${bad}" should be rejected`);
    }
});

test('formats mojos without trailing zeros', () => {
    assert.equal(formatXch(10n * MOJOS_PER_XCH), '10');
    assert.equal(formatXch(8_499_900_000_000n), '8.4999');
    assert.equal(formatXch(1n), '0.000000000001');
    assert.equal(formatXch(0n), '0');
});
```

`tests/chain/keys.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL, cannot find module `js/chain/units.js`.

- [ ] **Step 3: Implement `units.js`**

```js
export const MOJOS_PER_XCH = 1_000_000_000_000n;

const XCH_AMOUNT = /^(\d+)(?:[.,](\d{1,12}))?$/;

/** "1.5" or "1,5" → mojos; null for anything that isn't a non-negative amount with at most 12 decimals */
export function parseXch(text) {
    const match = XCH_AMOUNT.exec(String(text).trim());
    if (!match) return null;
    const fraction = (match[2] ?? '').padEnd(12, '0');
    return BigInt(match[1]) * MOJOS_PER_XCH + BigInt(fraction || '0');
}

export function formatXch(mojos) {
    const whole = mojos / MOJOS_PER_XCH;
    const fraction = (mojos % MOJOS_PER_XCH).toString().padStart(12, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : `${whole}`;
}
```

- [ ] **Step 4: Implement `keys.js`**

```js
export const ADDRESS_PREFIX = 'txch';

const SEED_NAMESPACE = 'chialisp-playground:';
const HEX_PUZZLE_HASH = /^0x[0-9a-fA-F]{64}$/;
const ACCEPTED_PREFIXES = ['txch', 'xch'];
const DESTINATION_ERROR = 'Enter a txch1… or xch1… address, or a 0x puzzle hash';

/** Simulator wallets derive their keys from their public name, so anyone can recompute them. */
export function walletKeys(sdk, name) {
    const seed = sdk.sha256(new TextEncoder().encode(SEED_NAMESPACE + name.trim().toLowerCase()));
    const secretKey = sdk.SecretKey.fromSeed(seed).deriveSynthetic();
    const publicKey = secretKey.publicKey();
    const puzzleHashHex = sdk.toHex(sdk.standardPuzzleHash(publicKey));
    return {
        secretKey,
        publicKey,
        publicKeyHex: sdk.toHex(publicKey.toBytes()),
        puzzleHashHex,
        address: encodeAddress(sdk, puzzleHashHex),
    };
}

export function encodeAddress(sdk, puzzleHashHex) {
    return new sdk.Address(sdk.fromHex(puzzleHashHex), ADDRESS_PREFIX).encode();
}

export function parseDestination(sdk, input) {
    const value = String(input).trim();
    if (HEX_PUZZLE_HASH.test(value)) return { puzzleHashHex: value.slice(2).toLowerCase(), mainnet: false };

    let decoded = null;
    try {
        decoded = sdk.Address.decode(value);
    } catch {
        throw new Error(DESTINATION_ERROR);
    }
    if (!ACCEPTED_PREFIXES.includes(decoded.prefix) || decoded.puzzleHash.length !== 32) throw new Error(DESTINATION_ERROR);
    return { puzzleHashHex: sdk.toHex(decoded.puzzleHash), mainnet: decoded.prefix === 'xch' };
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Prove the tests bite**

One at a time, confirm the named test FAILS, then restore:
- remove `.toLowerCase()` in `walletKeys` → "the same name always derives the same wallet…";
- change `[.,]` to `[.]` in `units.js` → "accepts a comma as the decimal separator";
- drop `decoded.prefix === 'xch'` (return `mainnet: false`) → "parses txch, xch and 0x destinations…".

- [ ] **Step 7: Commit**

```bash
git add js/chain/units.js js/chain/keys.js tests/chain/units.test.mjs tests/chain/keys.test.mjs
git commit -m "Add XCH units and name-derived simulator wallet keys"
```

---

### Task 3: ChainService (blocks, mempool, tick coin, coin index)

**Files:**
- Create: `js/chain/ChainService.js`
- Test: `tests/chain/ChainService.test.mjs`

**Interfaces:**
- Consumes: `loadSdk()` (Task 1).
- Produces:
  - `BLOCK_SECONDS = 52`
  - `toCoinSpendRecord(sdk, coinSpend): CoinSpendRecord`, where `CoinSpendRecord = { coin: { parentCoinInfo, puzzleHash, amount: string }, puzzleReveal, solution }` (hex without `0x`)
  - `class ChainService`:
    - `constructor({ sdk })`
    - getters: `height: number`, `chainSeconds: number`, `mempool: Tx[]`, `blocks: Block[]` (oldest first)
    - `submit(tx): Tx` (adds an `id`)
    - `farmBlock(): Block`
    - `coinsByPuzzleHash(puzzleHashHex): CoinView[]`
    - `coinObject(coinIdHex): sdk.Coin`
    - `onChange(listener): () => void`
  - `Tx` is either
    - `{ kind: 'faucet', from: 'Faucet', puzzleHashHex, toPuzzleHashHex, amount: bigint, outputs }`, or
    - `{ kind: 'spend', from, toPuzzleHashHex, amount, fee, change, coinSpends: CoinSpendRecord[], secretKeys, signerNames, inputIds, outputs }`
  - `outputs: [{ id: string|null, puzzleHashHex, amount }]`
  - `Block = { height, seconds, txs: Tx[], rejected: [{ tx, error }] }`
  - `CoinView = { id, parentId, puzzleHashHex, amount: bigint, confirmedBlock: number, spentBlock: number|null }`

Block numbering: the simulator records a block's coins at `createdHeight = N - 1` and then `height()` becomes `N`. Every display value uses the block number `N`.

- [ ] **Step 1: Write the failing tests**

`tests/chain/ChainService.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL, cannot find module `js/chain/ChainService.js`.

- [ ] **Step 3: Implement `ChainService.js`**

```js
export const BLOCK_SECONDS = 52;

const TICK_AMOUNT = 1n;

export function toCoinSpendRecord(sdk, coinSpend) {
    return {
        coin: {
            parentCoinInfo: sdk.toHex(coinSpend.coin.parentCoinInfo),
            puzzleHash: sdk.toHex(coinSpend.coin.puzzleHash),
            amount: coinSpend.coin.amount.toString(),
        },
        puzzleReveal: sdk.toHex(coinSpend.puzzleReveal),
        solution: sdk.toHex(coinSpend.solution),
    };
}

const cleanError = (error) => String(error?.message ?? error).replace(/^Simulator error: /, '');

/**
 * Owns the simulator. The simulator only forms a block when something is spent and rejects an
 * empty bundle, so every block also spends a "tick" coin (puzzle `1`) that recreates itself.
 */
export class ChainService {
    constructor({ sdk }) {
        this.sdk = sdk;
        this.sim = new sdk.Simulator();
        this.clvm = new sdk.Clvm();
        this.tickPuzzle = this.clvm.parse('1');
        this.tickPuzzleHash = this.tickPuzzle.treeHash();
        this.tickCoin = this.sim.newCoin(this.tickPuzzleHash, TICK_AMOUNT);
        this.pending = [];
        this.history = [];
        this.coinIdsByPuzzleHash = new Map();
        this.listeners = new Set();
        this.nextTxId = 1;
    }

    get height() {
        return this.sim.height();
    }

    get chainSeconds() {
        return this.height * BLOCK_SECONDS;
    }

    get mempool() {
        return [...this.pending];
    }

    get blocks() {
        return [...this.history];
    }

    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    submit(tx) {
        const entry = { ...tx, id: this.nextTxId++ };
        this.pending.push(entry);
        this.emit();
        return entry;
    }

    farmBlock() {
        const txs = this.pending.splice(0);
        const faucets = txs.filter((tx) => tx.kind === 'faucet');
        const spends = txs.filter((tx) => tx.kind === 'spend');

        // newCoin applies immediately, so faucet coins belong to this block whatever happens to the spends
        for (const tx of faucets) this.indexCoin(this.sim.newCoin(this.sdk.fromHex(tx.puzzleHashHex), tx.amount));

        let included = spends;
        let rejected = [];
        try {
            this.spendWithTick(spends);
        } catch (error) {
            // a failed spendCoins leaves the simulator untouched, so the block is farmed without the spends
            rejected = spends.map((tx) => ({ tx, error: cleanError(error) }));
            included = [];
            this.spendWithTick([]);
        }
        this.indexChildren(included);
        this.sim.passTime(BigInt(BLOCK_SECONDS));

        const block = { height: this.height, seconds: this.chainSeconds, txs: [...faucets, ...included], rejected };
        this.history.push(block);
        this.emit();
        return block;
    }

    coinsByPuzzleHash(puzzleHashHex) {
        const ids = this.coinIdsByPuzzleHash.get(puzzleHashHex) ?? new Set();
        return [...ids].map((id) => {
            const state = this.sim.coinState(this.sdk.fromHex(id));
            return {
                id,
                parentId: this.sdk.toHex(state.coin.parentCoinInfo),
                puzzleHashHex,
                amount: state.coin.amount,
                confirmedBlock: state.createdHeight + 1,
                spentBlock: state.spentHeight === undefined ? null : state.spentHeight + 1,
            };
        });
    }

    coinObject(coinIdHex) {
        return this.sim.coinState(this.sdk.fromHex(coinIdHex)).coin;
    }

    spendWithTick(spendTxs) {
        const coinSpends = [this.tickSpend(), ...spendTxs.flatMap((tx) => tx.coinSpends.map((record) => this.toCoinSpend(record)))];
        this.sim.spendCoins(coinSpends, spendTxs.flatMap((tx) => tx.secretKeys));
        this.tickCoin = new this.sdk.Coin(this.tickCoin.coinId(), this.tickPuzzleHash, TICK_AMOUNT);
    }

    tickSpend() {
        const clvm = this.clvm;
        const recreate = clvm.list([clvm.list([clvm.int(51n), clvm.atom(this.tickPuzzleHash), clvm.int(TICK_AMOUNT)])]);
        return new this.sdk.CoinSpend(this.tickCoin, this.tickPuzzle.serialize(), recreate.serialize());
    }

    toCoinSpend(record) {
        const { sdk } = this;
        const coin = new sdk.Coin(sdk.fromHex(record.coin.parentCoinInfo), sdk.fromHex(record.coin.puzzleHash), BigInt(record.coin.amount));
        return new sdk.CoinSpend(coin, sdk.fromHex(record.puzzleReveal), sdk.fromHex(record.solution));
    }

    indexChildren(spendTxs) {
        for (const record of spendTxs.flatMap((tx) => tx.coinSpends)) {
            const spentId = this.toCoinSpend(record).coin.coinId();
            for (const child of this.sim.children(spentId)) this.indexCoin(child.coin);
        }
    }

    indexCoin(coin) {
        const puzzleHashHex = this.sdk.toHex(coin.puzzleHash);
        if (!this.coinIdsByPuzzleHash.has(puzzleHashHex)) this.coinIdsByPuzzleHash.set(puzzleHashHex, new Set());
        this.coinIdsByPuzzleHash.get(puzzleHashHex).add(this.sdk.toHex(coin.coinId()));
    }

    emit() {
        for (const listener of this.listeners) listener();
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Prove the tests bite**

One at a time, run `npm test` and confirm the named test FAILS, then restore:
- delete `this.sim.passTime(...)` → "every block advances the relative clock by 52 seconds";
- replace `this.spendWithTick([])` in the catch with `throw error` → "a rejected block keeps its faucet coins…";
- remove `this.indexChildren(included)` → "relative height locks count blocks exactly" (the spent coin's `spentBlock` can't be found).

- [ ] **Step 6: Commit**

```bash
git add js/chain/ChainService.js tests/chain/ChainService.test.mjs
git commit -m "Add ChainService: simulator blocks, mempool and coin index"
```

---

### Task 4: WalletService (wallets, coins, sends, watched addresses)

**Files:**
- Create: `js/chain/WalletService.js`
- Test: `tests/chain/WalletService.test.mjs`

**Interfaces:**
- Consumes:
  - `ChainService` (`submit`, `farmBlock`, `mempool`, `coinsByPuzzleHash`, `coinObject`) and `toCoinSpendRecord` (Task 3);
  - `walletKeys`, `parseDestination`, `encodeAddress` (Task 2);
  - `formatXch` (Task 2).
- Produces `class WalletService`:
  - `constructor({ sdk, chain })`
  - `create(name): Wallet`, where `Wallet = { key, name, secretKey, publicKey, publicKeyHex, puzzleHashHex, address }`
  - `hide(name): void`
  - `find(name): Wallet | null` (visible or hidden)
  - getters `visible: Wallet[]` and `hiddenNames: string[]`
  - `coinsFor(puzzleHashHex): WalletCoin[]`, where `WalletCoin = { id: string|null, amount: bigint, status: 'confirmed'|'spending'|'pending', confirmedBlock: number|null }`
  - `balanceOf(puzzleHashHex): bigint` (confirmed, not being spent)
  - `labelFor(puzzleHashHex): string` (wallet name, watched label, or a shortened address)
  - `previewSend({ from, to, amount, fee }): { inputs: WalletCoin[], amount, fee, change, toPuzzleHashHex, mainnet }`; throws `Error` with a user message
  - `buildSend({ from, to, amount, fee }): Tx` and `buildFaucet({ to, amount }): Tx` (the `Tx` shapes from Task 3)
  - `faucetTx(puzzleHashHex, amount): Tx`
  - `watch(puzzleHashHex, { label, source = null }): void` and `unwatch(puzzleHashHex): void`
  - getter `watched: [{ puzzleHashHex, address, label, source }]`
- Constants: `FAUCET = 'Faucet'`.

- [ ] **Step 1: Write the failing tests**

`tests/chain/WalletService.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL, cannot find module `js/chain/WalletService.js`.

- [ ] **Step 3: Implement `WalletService.js`**

```js
import { walletKeys, parseDestination, encodeAddress } from './keys.js';
import { toCoinSpendRecord } from './ChainService.js';
import { formatXch } from './units.js';

export const FAUCET = 'Faucet';

const displayName = (name) => name.charAt(0).toUpperCase() + name.slice(1);
const shortAddress = (address) => `${address.slice(0, 10)}…${address.slice(-4)}`;

export class WalletService {
    constructor({ sdk, chain }) {
        this.sdk = sdk;
        this.chain = chain;
        this.wallets = [];
        this.hidden = [];
        this.watchedByPuzzleHash = new Map();
    }

    get visible() {
        return [...this.wallets];
    }

    get hiddenNames() {
        return this.hidden.map((w) => w.name);
    }

    get watched() {
        return [...this.watchedByPuzzleHash.values()];
    }

    create(name) {
        const clean = String(name).trim();
        const key = clean.toLowerCase();
        if (!clean) throw new Error('Enter a name');
        if (key === FAUCET.toLowerCase()) throw new Error(`${FAUCET} is reserved`);
        const existing = this.wallets.find((w) => w.key === key);
        if (existing) throw new Error(`${existing.name} already exists`);

        const hiddenIndex = this.hidden.findIndex((w) => w.key === key);
        const wallet = hiddenIndex === -1
            ? { key, name: displayName(clean), ...walletKeys(this.sdk, clean) }
            : this.hidden.splice(hiddenIndex, 1)[0];
        this.wallets.push(wallet);
        return wallet;
    }

    hide(name) {
        const index = this.wallets.findIndex((w) => w.key === String(name).trim().toLowerCase());
        if (index !== -1) this.hidden.push(...this.wallets.splice(index, 1));
    }

    find(name) {
        const key = String(name).trim().toLowerCase();
        return [...this.wallets, ...this.hidden].find((w) => w.key === key) ?? null;
    }

    labelFor(puzzleHashHex) {
        const wallet = [...this.wallets, ...this.hidden].find((w) => w.puzzleHashHex === puzzleHashHex);
        if (wallet) return wallet.name;
        return this.watchedByPuzzleHash.get(puzzleHashHex)?.label ?? shortAddress(encodeAddress(this.sdk, puzzleHashHex));
    }

    coinsFor(puzzleHashHex) {
        const mempool = this.chain.mempool;
        const spending = new Set(mempool.flatMap((tx) => tx.inputIds ?? []));
        const confirmed = this.chain.coinsByPuzzleHash(puzzleHashHex)
            .filter((coin) => coin.spentBlock === null)
            .map((coin) => ({
                id: coin.id,
                amount: coin.amount,
                status: spending.has(coin.id) ? 'spending' : 'confirmed',
                confirmedBlock: coin.confirmedBlock,
            }));
        const pending = mempool
            .flatMap((tx) => tx.outputs)
            .filter((output) => output.puzzleHashHex === puzzleHashHex)
            .map((output) => ({ id: output.id, amount: output.amount, status: 'pending', confirmedBlock: null }));
        return [...confirmed, ...pending];
    }

    balanceOf(puzzleHashHex) {
        return this.coinsFor(puzzleHashHex)
            .filter((coin) => coin.status === 'confirmed')
            .reduce((sum, coin) => sum + coin.amount, 0n);
    }

    previewSend({ from, to, amount, fee }) {
        const wallet = this.find(from);
        if (!wallet) throw new Error(`Unknown wallet ${from}`);
        if (amount === null || amount === undefined) throw new Error('Enter an amount like 1.5');
        if (fee === null || fee === undefined) throw new Error('Enter a fee like 0.0001');
        if (amount <= 0n) throw new Error('Amount must be greater than 0');
        const { puzzleHashHex: toPuzzleHashHex, mainnet } = parseDestination(this.sdk, to);
        if (toPuzzleHashHex === wallet.puzzleHashHex) throw new Error('Sending to yourself? Pick another address');

        const needed = amount + fee;
        const spendable = this.coinsFor(wallet.puzzleHashHex)
            .filter((coin) => coin.status === 'confirmed')
            .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
        const inputs = [];
        let gathered = 0n;
        for (const coin of spendable) {
            if (gathered >= needed) break;
            inputs.push(coin);
            gathered += coin.amount;
        }
        if (gathered < needed) {
            throw new Error(`${wallet.name} has ${formatXch(this.balanceOf(wallet.puzzleHashHex))} XCH confirmed; needs ${formatXch(needed)}`);
        }
        return { inputs, amount, fee, change: gathered - needed, toPuzzleHashHex, mainnet, wallet };
    }

    buildSend(form) {
        const { inputs, amount, fee, change, toPuzzleHashHex, mainnet, wallet } = this.previewSend(form);
        const { sdk } = this;
        const clvm = new sdk.Clvm();
        const coins = inputs.map((coin) => this.chain.coinObject(coin.id));

        const conditions = [clvm.createCoin(sdk.fromHex(toPuzzleHashHex), amount)];
        if (change > 0n) conditions.push(clvm.createCoin(sdk.fromHex(wallet.puzzleHashHex), change));
        if (fee > 0n) conditions.push(clvm.reserveFee(fee));
        // the first input carries every output; the others only contribute their value
        coins.forEach((coin, i) => clvm.spendStandardCoin(coin, wallet.publicKey, clvm.delegatedSpend(i === 0 ? conditions : [])));

        const parent = coins[0].coinId();
        const outputId = (puzzleHashHex, value) => sdk.toHex(new sdk.Coin(parent, sdk.fromHex(puzzleHashHex), value).coinId());
        const outputs = [{ id: outputId(toPuzzleHashHex, amount), puzzleHashHex: toPuzzleHashHex, amount }];
        if (change > 0n) outputs.push({ id: outputId(wallet.puzzleHashHex, change), puzzleHashHex: wallet.puzzleHashHex, amount: change });

        return {
            kind: 'spend',
            from: wallet.name,
            toPuzzleHashHex,
            amount,
            fee,
            change,
            mainnet,
            coinSpends: clvm.coinSpends().map((cs) => toCoinSpendRecord(sdk, cs)),
            secretKeys: [wallet.secretKey],
            signerNames: [wallet.key],
            inputIds: inputs.map((coin) => coin.id),
            outputs,
        };
    }

    buildFaucet({ to, amount }) {
        if (amount === null || amount === undefined) throw new Error('Enter an amount like 1.5');
        if (amount <= 0n) throw new Error('Amount must be greater than 0');
        const { puzzleHashHex, mainnet } = parseDestination(this.sdk, to);
        return { ...this.faucetTx(puzzleHashHex, amount), mainnet };
    }

    faucetTx(puzzleHashHex, amount) {
        return {
            kind: 'faucet',
            from: FAUCET,
            puzzleHashHex,
            toPuzzleHashHex: puzzleHashHex,
            amount,
            fee: 0n,
            mainnet: false,
            outputs: [{ id: null, puzzleHashHex, amount }],
        };
    }

    watch(puzzleHashHex, { label, source = null }) {
        if (this.wallets.some((w) => w.puzzleHashHex === puzzleHashHex)) return;
        this.watchedByPuzzleHash.set(puzzleHashHex, { puzzleHashHex, address: encodeAddress(this.sdk, puzzleHashHex), label, source });
    }

    unwatch(puzzleHashHex) {
        this.watchedByPuzzleHash.delete(puzzleHashHex);
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Prove the tests bite**

One at a time, confirm the named test FAILS, then restore:
- drop the change `createCoin` → "a send pays the destination, returns change…" (the change silently becomes fee, so Alice's balance is wrong);
- remove `spending.has(coin.id) ? 'spending' :` → "coins are selected largest first and never twice";
- remove the `FAUCET` check → "wallet names are unique, non-empty and cannot be Faucet".

- [ ] **Step 6: Commit**

```bash
git add js/chain/WalletService.js tests/chain/WalletService.test.mjs
git commit -m "Add WalletService: name-derived wallets, coin selection and sends"
```

---

### Task 5: Action log and persistence

**Files:**
- Create: `js/chain/ChainLog.js`
- Create: `js/chain/persistence.js`
- Test: `tests/chain/persistence.test.mjs`

**Interfaces:**
- Produces (`ChainLog.js`):
  - `class ChainLog { constructor(entries = []); entries: Entry[]; record(entry): void }`. Consecutive `{ type: 'blocks', count }` entries merge.
  - `serializeSnapshot(object): string` and `parseSnapshot(text): object` (bigint-safe).
  - `Entry` is one of:
    - `{ type: 'wallet-created', name }`, `{ type: 'wallet-hidden', name }`
    - `{ type: 'watch', puzzleHashHex, label, source }`, `{ type: 'unwatch', puzzleHashHex }`
    - `{ type: 'faucet', puzzleHashHex, amount: bigint }`
    - `{ type: 'send', tx }` (a spend `Tx` without `secretKeys` and `id`)
    - `{ type: 'blocks', count }`
- Produces (`persistence.js`):
  - `MemoryChainPersistence`, `BrowserChainPersistence`: `loadWithGeneration(): Promise<{ data: string|null, generation: number }>` and `saveIfGeneration(data: string, expectedGeneration: number): Promise<{ ok: boolean, generation: number }>`
  - `class CoalescedWriter { constructor({ persistence, snapshot: () => string, onConflict, onError }); generation: number; stopped: boolean; request(): void; flush(): Promise<void> }`

- [ ] **Step 1: Write the failing tests**

`tests/chain/persistence.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL, cannot find module `js/chain/ChainLog.js`.

- [ ] **Step 3: Implement `ChainLog.js`**

```js
/** What happened on the simulated chain, in order. Replaying it rebuilds the chain exactly. */
export class ChainLog {
    constructor(entries = []) {
        this.entries = entries;
    }

    record(entry) {
        const last = this.entries.at(-1);
        if (entry.type === 'blocks' && last?.type === 'blocks') {
            last.count += entry.count;
            return;
        }
        this.entries.push({ ...entry });
    }
}

const BIGINT_TAG = '$bigint';

export function serializeSnapshot(snapshot) {
    return JSON.stringify(snapshot, (_key, value) => (typeof value === 'bigint' ? { [BIGINT_TAG]: value.toString() } : value));
}

export function parseSnapshot(text) {
    return JSON.parse(text, (_key, value) =>
        value && typeof value === 'object' && typeof value[BIGINT_TAG] === 'string' ? BigInt(value[BIGINT_TAG]) : value);
}
```

- [ ] **Step 4: Implement `persistence.js`**

```js
/** Test and fallback backend. Same contract as BrowserChainPersistence. */
export class MemoryChainPersistence {
    constructor() {
        this.data = null;
        this.generation = 0;
        this.writes = 0;
    }

    async loadWithGeneration() {
        return { data: this.data, generation: this.generation };
    }

    async saveIfGeneration(data, expectedGeneration) {
        if (expectedGeneration !== this.generation) return { ok: false, generation: this.generation };
        this.data = data;
        this.generation += 1;
        this.writes += 1;
        return { ok: true, generation: this.generation };
    }
}

/**
 * IndexedDB backend, same approach as chia-gaming-connect's BrowserPersistence: the snapshot and a
 * generation counter are written in one strict-durability transaction, and a write is rejected
 * if another tab committed since this tab loaded.
 */
export class BrowserChainPersistence {
    constructor(dbName = 'chialisp-playground-chain') {
        this.dbName = dbName;
        this.storeName = 'chain';
    }

    openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(this.storeName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async loadWithGeneration() {
        const db = await this.openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const data = store.get('snapshot');
            const generation = store.get('generation');
            tx.oncomplete = () => {
                db.close();
                resolve({ data: data.result ?? null, generation: typeof generation.result === 'number' ? generation.result : 0 });
            };
            tx.onerror = () => { db.close(); reject(tx.error); };
            tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IndexedDB transaction aborted')); };
        });
    }

    async saveIfGeneration(data, expectedGeneration) {
        const db = await this.openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readwrite', { durability: 'strict' });
            const store = tx.objectStore(this.storeName);
            let result;
            const request = store.get('generation');
            request.onsuccess = () => {
                const current = typeof request.result === 'number' ? request.result : 0;
                if (current !== expectedGeneration) {
                    result = { ok: false, generation: current };
                    return;
                }
                store.put(data, 'snapshot');
                store.put(current + 1, 'generation');
                result = { ok: true, generation: current + 1 };
            };
            tx.oncomplete = () => { db.close(); resolve(result); };
            tx.onerror = () => { db.close(); reject(tx.error); };
            tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IndexedDB transaction aborted')); };
        });
    }
}

/**
 * Coalesced writes: requests in the same tick share one write; a request while a write is in
 * flight chains exactly one follow-up that stores the latest snapshot.
 */
export class CoalescedWriter {
    constructor({ persistence, snapshot, onConflict, onError }) {
        this.persistence = persistence;
        this.snapshot = snapshot;
        this.onConflict = onConflict;
        this.onError = onError;
        this.generation = 0;
        this.stopped = false;
        this.flushPromise = null;
        this.snapshotTaken = false;
        this.pendingAfterFlush = false;
    }

    request() {
        if (this.stopped) return;
        if (this.flushPromise) {
            // a scheduled write that hasn't taken its snapshot yet already includes this change
            if (this.snapshotTaken) this.pendingAfterFlush = true;
            return;
        }
        this.snapshotTaken = false;
        this.flushPromise = Promise.resolve().then(() => this.runFlush());
    }

    async runFlush() {
        try {
            this.snapshotTaken = true;
            const result = await this.persistence.saveIfGeneration(this.snapshot(), this.generation);
            if (result.ok) {
                this.generation = result.generation;
            } else {
                this.stopped = true;
                this.onConflict();
            }
        } catch (error) {
            this.onError(error);
        } finally {
            if (this.pendingAfterFlush && !this.stopped) {
                this.pendingAfterFlush = false;
                this.snapshotTaken = false;
                this.flushPromise = this.runFlush();
            } else {
                this.pendingAfterFlush = false;
                this.flushPromise = null;
            }
        }
    }

    async flush() {
        if (!this.flushPromise) this.request();
        while (this.flushPromise) await this.flushPromise;
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Prove the tests bite**

Confirm the named test FAILS, then restore:
- in `request()`, replace `if (this.snapshotTaken) this.pendingAfterFlush = true;` with `this.pendingAfterFlush = true;` → "many save requests in one tick produce one write";
- in `MemoryChainPersistence.saveIfGeneration` remove the generation check → "a write from a stale tab is rejected…".

- [ ] **Step 7: Commit**

```bash
git add js/chain/ChainLog.js js/chain/persistence.js tests/chain/persistence.test.mjs
git commit -m "Add the chain action log and coalesced IndexedDB persistence"
```

---

### Task 6: ChainSession (genesis, actions, timers, reset, replay)

**Files:**
- Create: `js/chain/ChainSession.js`
- Modify: `tests/helpers/chain.mjs`
- Test: `tests/chain/ChainSession.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces:
  - `GENESIS_WALLETS = ['Alice', 'Bob']`, `GENESIS_AMOUNT = 10n * MOJOS_PER_XCH`, `BLOCK_INTERVAL_MS = 3000`
  - `class ChainSession`:
    - `static open({ sdk, persistence, timers = globalThis }): Promise<ChainSession>`
    - read-only state: `chain: ChainService`, `wallets: WalletService`, `running: boolean`, `restoredBlocks: number`, `conflict: boolean`, `storageError: boolean`, `replayError: string|null`, `savedData: string|null`, `prefs: { expanded: string[] }`
    - `state: 'stopped'|'running'|'paused'`
    - actions: `start()`, `pause()`, `next()`, `reset()`, `send({ from, to, amount, fee }): Tx`, `createWallet(name)`, `hideWallet(name)`, `watchPuzzle({ puzzleHashHex, label, source })`, `unwatch(puzzleHashHex)`, `setExpanded(walletKey, open)`
    - `onChange(listener): () => void`, `flush(): Promise<void>`
  - `snapshot()` produces `{ version: 1, entries, prefs, summary: { height } }`, serialized.
- Produces (tests): `manualTimers()` and `openSession({ persistence, timers })` in `tests/helpers/chain.mjs`.

- [ ] **Step 1: Extend the test helper**

Append to `tests/helpers/chain.mjs`:

```js
import { ChainSession } from '../../js/chain/ChainSession.js';
import { MemoryChainPersistence } from '../../js/chain/persistence.js';

/** setInterval stand-in: nothing fires until the test calls fire() */
export function manualTimers() {
    const intervals = new Map();
    let nextId = 1;
    return {
        setInterval(fn) {
            const id = nextId++;
            intervals.set(id, fn);
            return id;
        },
        clearInterval(id) {
            intervals.delete(id);
        },
        fire() {
            for (const fn of [...intervals.values()]) fn();
        },
        get active() {
            return intervals.size;
        },
    };
}

export async function openSession({ persistence = new MemoryChainPersistence(), timers = manualTimers() } = {}) {
    const sdk = await loadSdk();
    const session = await ChainSession.open({ sdk, persistence, timers });
    return { session, persistence, timers, sdk };
}
```

- [ ] **Step 2: Write the failing tests**

`tests/chain/ChainSession.test.mjs`:

```js
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

test('reset returns to genesis and is what a reload then sees', async () => {
    const persistence = new MemoryChainPersistence();
    const { session } = await openSession({ persistence });
    session.next();
    session.next();
    session.createWallet('Dave');
    session.reset();
    await session.flush();
    assert.equal(session.chain.height, 1);
    assert.deepEqual(session.wallets.visible.map((w) => w.name), ['Alice', 'Bob']);

    const { session: reloaded } = await openSession({ persistence });
    assert.equal(reloaded.chain.height, 1);
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
```

- [ ] **Step 3: Run to see them fail**

Run: `npm test`
Expected: FAIL, cannot find module `js/chain/ChainSession.js`.

- [ ] **Step 4: Implement `ChainSession.js`**

```js
import { ChainService } from './ChainService.js';
import { WalletService, FAUCET } from './WalletService.js';
import { walletKeys } from './keys.js';
import { ChainLog, serializeSnapshot, parseSnapshot } from './ChainLog.js';
import { CoalescedWriter } from './persistence.js';
import { MOJOS_PER_XCH } from './units.js';

export const GENESIS_WALLETS = ['Alice', 'Bob'];
export const GENESIS_AMOUNT = 10n * MOJOS_PER_XCH;
export const BLOCK_INTERVAL_MS = 3000;

const withoutKeys = ({ secretKeys, id, ...tx }) => tx;

/** Composition root of the simulator: the only object the UI talks to. */
export class ChainSession {
    static async open({ sdk, persistence, timers = globalThis }) {
        const session = new ChainSession({ sdk, persistence, timers });
        let loaded;
        try {
            loaded = await persistence.loadWithGeneration();
        } catch {
            session.storageError = true;
            loaded = { data: null, generation: 0 };
        }
        session.writer.generation = loaded.generation;

        if (!loaded.data) {
            session.genesis();
            return session;
        }
        try {
            session.replay(parseSnapshot(loaded.data));
            session.restoredBlocks = session.chain.height;
        } catch (error) {
            // keep the saved chain untouched so the user can download it; run a fresh one meanwhile
            session.replayError = String(error?.message ?? error);
            session.savedData = loaded.data;
            session.writer.stopped = true;
            session.fresh();
            session.genesis();
        }
        return session;
    }

    constructor({ sdk, persistence, timers }) {
        this.sdk = sdk;
        this.timers = timers;
        this.listeners = new Set();
        this.running = false;
        this.timer = null;
        this.restoredBlocks = 0;
        this.conflict = false;
        this.storageError = false;
        this.replayError = null;
        this.savedData = null;
        this.replaying = false;
        this.prefs = { expanded: ['alice'] };
        this.writer = new CoalescedWriter({
            persistence,
            snapshot: () => this.snapshot(),
            onConflict: () => {
                this.conflict = true;
                this.pause();
                this.emit();
            },
            onError: () => {
                this.storageError = true;
                this.emit();
            },
        });
        this.fresh();
    }

    get state() {
        if (this.running) return 'running';
        return this.chain.height > 1 || this.restoredBlocks > 0 ? 'paused' : 'stopped';
    }

    fresh() {
        this.chain = new ChainService({ sdk: this.sdk });
        this.wallets = new WalletService({ sdk: this.sdk, chain: this.chain });
        this.log = new ChainLog();
        this.chain.onChange(() => this.emit());
    }

    genesis() {
        for (const name of GENESIS_WALLETS) this.createWallet(name);
        for (const name of GENESIS_WALLETS) this.submit(this.wallets.faucetTx(this.wallets.find(name).puzzleHashHex, GENESIS_AMOUNT));
        this.next();
    }

    // ---------- actions ----------

    start() {
        if (this.running || this.conflict) return;
        this.running = true;
        this.restoredBlocks = 0;
        this.timer = this.timers.setInterval(() => this.next(), BLOCK_INTERVAL_MS);
        this.emit();
    }

    pause() {
        if (!this.running) return;
        this.running = false;
        this.timers.clearInterval(this.timer);
        this.timer = null;
        this.emit();
    }

    next() {
        if (this.conflict) return;
        this.chain.farmBlock();
        this.record({ type: 'blocks', count: 1 });
    }

    reset() {
        this.pause();
        this.replayError = null;
        this.savedData = null;
        this.restoredBlocks = 0;
        this.writer.stopped = this.conflict;
        this.fresh();
        this.genesis();
        this.emit();
    }

    send({ from, to, amount, fee }) {
        const tx = from === FAUCET ? this.wallets.buildFaucet({ to, amount }) : this.wallets.buildSend({ from, to, amount, fee });
        const isKnown = this.wallets.find(this.wallets.labelFor(tx.toPuzzleHashHex)) || this.wallets.watched.some((w) => w.puzzleHashHex === tx.toPuzzleHashHex);
        if (!isKnown) this.watchPuzzle({ puzzleHashHex: tx.toPuzzleHashHex, label: this.wallets.labelFor(tx.toPuzzleHashHex), source: null });
        this.submit(tx);
        return tx;
    }

    createWallet(name) {
        const wallet = this.wallets.create(name);
        this.record({ type: 'wallet-created', name: wallet.name });
        return wallet;
    }

    hideWallet(name) {
        this.wallets.hide(name);
        this.record({ type: 'wallet-hidden', name });
    }

    watchPuzzle({ puzzleHashHex, label, source = null }) {
        this.wallets.watch(puzzleHashHex, { label, source });
        this.record({ type: 'watch', puzzleHashHex, label, source });
    }

    unwatch(puzzleHashHex) {
        this.wallets.unwatch(puzzleHashHex);
        this.record({ type: 'unwatch', puzzleHashHex });
    }

    setExpanded(walletKey, open) {
        const expanded = new Set(this.prefs.expanded);
        open ? expanded.add(walletKey) : expanded.delete(walletKey);
        this.prefs = { ...this.prefs, expanded: [...expanded] };
        this.writer.request();
        this.emit();
    }

    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    flush() {
        return this.writer.flush();
    }

    // ---------- log, persistence, replay ----------

    submit(tx) {
        this.chain.submit(tx);
        this.record(tx.kind === 'faucet'
            ? { type: 'faucet', puzzleHashHex: tx.puzzleHashHex, amount: tx.amount }
            : { type: 'send', tx: withoutKeys(tx) });
    }

    record(entry) {
        if (this.replaying) return;
        this.log.record(entry);
        this.writer.request();
        this.emit();
    }

    snapshot() {
        return serializeSnapshot({ version: 1, entries: this.log.entries, prefs: this.prefs, summary: { height: this.chain.height } });
    }

    replay(snapshot) {
        this.replaying = true;
        try {
            for (const entry of snapshot.entries) this.apply(entry);
        } finally {
            this.replaying = false;
        }
        this.log = new ChainLog(snapshot.entries.map((entry) => ({ ...entry })));
        this.prefs = { ...this.prefs, ...snapshot.prefs };
    }

    apply(entry) {
        switch (entry.type) {
            case 'wallet-created': this.wallets.create(entry.name); break;
            case 'wallet-hidden': this.wallets.hide(entry.name); break;
            case 'watch': this.wallets.watch(entry.puzzleHashHex, { label: entry.label, source: entry.source }); break;
            case 'unwatch': this.wallets.unwatch(entry.puzzleHashHex); break;
            case 'faucet': this.chain.submit(this.wallets.faucetTx(entry.puzzleHashHex, entry.amount)); break;
            case 'send':
                this.chain.submit({ ...entry.tx, secretKeys: entry.tx.signerNames.map((name) => walletKeys(this.sdk, name).secretKey) });
                break;
            case 'blocks':
                for (let i = 0; i < entry.count; i++) {
                    const block = this.chain.farmBlock();
                    if (block.rejected.length) throw new Error(`Block #${block.height} no longer validates: ${block.rejected[0].error}`);
                }
                break;
            default:
                throw new Error(`Unknown chain log entry ${entry.type}`);
        }
    }

    emit() {
        for (const listener of this.listeners) listener();
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Prove the tests bite**

Confirm the named test FAILS, then restore:
- remove `this.restoredBlocks = session.chain.height;` → "a reload restores…, paused";
- in `apply`, skip `wallet-hidden` → "a reload restores… hidden wallets…";
- remove `session.writer.stopped = true;` in the replay catch → "a saved chain that no longer replays is kept, not overwritten".

- [ ] **Step 7: Commit**

```bash
git add js/chain/ChainSession.js tests/helpers/chain.mjs tests/chain/ChainSession.test.mjs
git commit -m "Add ChainSession: genesis, chain controls, reset and replayed persistence"
```

---

### Task 7: "This puzzle" address, markup, styles and ChainView

**Files:**
- Create: `js/chain/puzzleAddress.js`, `js/chain/ChainView.js`, `js/chain/boot.js`, `css/chain.css`
- Modify: `index.html`
- Test: `tests/chain/puzzleAddress.test.mjs`

**Interfaces:**
- Consumes: `ChainSession` (Task 6), `formatXch`/`parseXch` (Task 2), `encodeAddress`/`parseDestination` (Task 2), `FAUCET` (Task 4); from the page, `window.playground` (`editorService.getCurrentFile()`, `editorService.editor.getValue()`, `getFileParameters(file)`, `compilationService.compileCode(source, file, { curriedParams })`, `switchSidebarView(view)`) and the global `mdb.Modal`.
- Produces:
  - `resolvePuzzleAddress({ filename, source, curriedParams, compile }): Promise<{ name, puzzleHashHex, source: { file, curriedParams, compiledHex } } | { name, error }>`
  - `class ChainView`:
    - `constructor({ root = document, resolvePuzzle })`
    - `showLoading()`, `showLoadError(error, retry)`, `attach(session)`
    - `setStatusSummary(height)`: status bar text before the SDK loads

- [ ] **Step 1: Write the failing test for "this puzzle"**

`tests/chain/puzzleAddress.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find module `js/chain/puzzleAddress.js`.

- [ ] **Step 3: Implement `puzzleAddress.js`**

```js
const NO_CURRY = new Set(['', '()']);

/** The address of the program in the editor, with the curried parameters its Run modal uses. */
export async function resolvePuzzleAddress({ filename, source, curriedParams, compile }) {
    if (!filename) return { name: 'program.clsp', error: 'Open a .clsp file first' };
    const name = filename.split('/').pop();
    const curry = (curriedParams ?? '').trim();
    try {
        const result = await compile(source, filename, { curriedParams: curry });
        // compileCode swallows curry failures and falls back to the uncurried hash
        if (!NO_CURRY.has(curry) && !result.curriedHash) return { name, error: 'Invalid curried parameters' };
        return { name, puzzleHashHex: result.hash, source: { file: filename, curriedParams: curry, compiledHex: result.hex } };
    } catch (error) {
        return { name, error: String(error?.message ?? error) };
    }
}
```

- [ ] **Step 4: Run the test**

Run: `npm test`
Expected: PASS. Then delete the `if (!NO_CURRY.has(curry) …)` line and confirm "refuses invalid curried parameters" FAILS; restore.

- [ ] **Step 5: Add the markup to `index.html`**

Every new element follows the approved mockup (`.mockups/chain.html`) with its fake data removed.

(a) After the `debugViewBtn` button (inside `.activity-bar`):

```html
                    <button class="activity-btn" id="chainViewBtn" title="Blockchain Simulator" data-view="chain">
                        <i class="fas fa-cubes"></i>
                    </button>
```

(b) After the closing `</div>` of `<div class="sidebar-view" id="debugView" …>`, still inside `.sidebar-left`:

```html
                <div class="sidebar-view" id="chainView">
                    <div class="sidebar-header">
                        <span><i class="fas fa-cubes me-2"></i><span class="sidebar-header-text">BLOCKCHAIN SIMULATOR</span></span>
                        <span class="chain-header-actions">
                            <span class="chain-network-badge">simulated</span>
                            <button class="chain-icon-btn chain-reset-btn" id="chainResetBtn" title="Reset the chain" aria-label="Reset the chain"><i class="fas fa-undo"></i></button>
                        </span>
                    </div>
                    <div class="sidebar-toolbar">
                        <div class="toolbar-group">
                            <button class="sidebar-btn sidebar-btn-success" id="chainStartBtn" title="Start producing blocks"><i class="fas fa-play"></i><span>Start</span></button>
                            <button class="sidebar-btn sidebar-btn-warning" id="chainPauseBtn" title="Pause block production" disabled><i class="fas fa-pause"></i><span>Pause</span></button>
                            <button class="sidebar-btn sidebar-btn-primary" id="chainNextBtn" title="Farm one block"><i class="fas fa-step-forward"></i><span>Next</span></button>
                        </div>
                    </div>
                    <div class="debug-sidebar-content chain-content" id="chainContent">
                        <div class="chain-status" id="chainStatus" role="status" aria-label="Chain status"></div>
                        <div class="chain-notices" id="chainNotices"></div>
                        <div class="debug-output chain-card">
                            <h6><span>Wallets</span><button class="chain-link-btn" id="chainNewWalletBtn"><i class="fas fa-plus"></i> New</button></h6>
                            <div id="chainWallets"></div>
                        </div>
                        <button class="open-file-btn chain-send-open" id="chainSendOpenBtn"><i class="fas fa-paper-plane me-2"></i>Send XCH</button>
                        <div class="debug-output chain-card" id="chainOtherCard" hidden>
                            <h6><span>Other addresses</span></h6>
                            <div id="chainOther"></div>
                        </div>
                        <div class="chain-warning"><i class="fas fa-exclamation-triangle"></i> Simulated keys derived from public names. Anyone can compute them &mdash; never send real funds to these addresses.</div>
                    </div>
                </div>
```

(c) In `.panel-tabs`, before `<div class="panel-actions">`:

```html
                        <div class="panel-tab" data-panel="chain">
                            <i class="fas fa-cubes me-1"></i>
                            CHAIN <span class="chain-tab-badge" id="chainTabBadge"></span>
                        </div>
```

(d) In `.panel-content`, before `<div class="panel-section" id="educationalPanel">`:

```html
                        <div class="panel-section" id="chainPanel">
                            <div class="chain-feed" id="chainFeed"><div class="chain-feed-empty">Open the Chain view to start the simulator.</div></div>
                        </div>
```

(e) At the start of `<div class="status-right">`:

```html
            <span class="status-item chain-status-item" id="statusBarChain" title="Blockchain simulator">
                <i class="fas fa-cubes"></i> <span>Chain</span>
            </span>
```

(f) Before `<div class="modal fade" id="argsModal"`:

```html
    <div class="modal fade" id="chainSendModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content bg-dark">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fas fa-paper-plane me-2"></i>Send XCH</h5>
                    <button type="button" class="btn-close btn-close-white" data-mdb-dismiss="modal"></button>
                </div>
                <form id="chainSendForm" autocomplete="off">
                    <div class="modal-body">
                        <div class="mb-3">
                            <label for="chainFrom" class="form-label">From</label>
                            <select class="form-select bg-dark text-white" id="chainFrom"></select>
                            <div class="form-text text-muted" id="chainFromHint"></div>
                        </div>
                        <div class="mb-3">
                            <label for="chainTo" class="form-label">To</label>
                            <input type="text" class="form-control bg-dark text-white chain-mono-input" id="chainTo" placeholder="txch1… or 0x puzzle hash" spellcheck="false">
                            <div class="chain-to-shortcuts" id="chainToShortcuts"></div>
                            <div class="chain-mainnet-notice" id="chainMainnetNotice" hidden><i class="fas fa-info-circle me-1"></i>Mainnet address — nothing is sent on mainnet; the simulator only uses its puzzle hash (the same one as txch1…)</div>
                        </div>
                        <div class="row">
                            <div class="col-6 mb-3">
                                <label for="chainAmount" class="form-label">Amount (XCH)</label>
                                <input type="text" inputmode="decimal" class="form-control bg-dark text-white chain-mono-input" id="chainAmount" value="1">
                            </div>
                            <div class="col-6 mb-3">
                                <label for="chainFee" class="form-label">Fee (XCH)</label>
                                <input type="text" inputmode="decimal" class="form-control bg-dark text-white chain-mono-input" id="chainFee" value="0.0001">
                            </div>
                        </div>
                        <div class="chain-send-summary" id="chainSendSummary"></div>
                        <div class="chain-send-error" id="chainSendError" role="alert"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-mdb-dismiss="modal"><i class="fas fa-times me-1"></i>Cancel</button>
                        <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane me-1"></i>Send</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <div class="modal fade" id="chainResetModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content bg-dark">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fas fa-undo me-2"></i>Reset the chain?</h5>
                    <button type="button" class="btn-close btn-close-white" data-mdb-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    Every block, coin and transaction is discarded and the chain starts again at block #1, with Alice and Bob funded with 10 XCH each.
                    <div class="form-text text-muted mt-2">Wallets you created come back empty: their keys come from their names.</div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-mdb-dismiss="modal"><i class="fas fa-times me-1"></i>Cancel</button>
                    <button type="button" class="btn btn-danger" id="chainResetConfirmBtn"><i class="fas fa-undo me-1"></i>Reset</button>
                </div>
            </div>
        </div>
    </div>
```

(g) In `<head>`, after `css/playground.css`:

```html
    <link rel="stylesheet" href="css/chain.css">
```

(h) Before `</body>`, after the existing scripts:

```html
    <script type="module" src="js/chain/boot.js"></script>
```

- [ ] **Step 6: Add `css/chain.css`**

Copy `.mockups/chain.css` to `css/chain.css`, then make these edits:
- in the `/* ---------- send ---------- */` block, delete only the rules the modal replaced: `.chain-send`, `.chain-send label`, `.chain-send input, .chain-send select`, their `:focus` rule, `.chain-send-row`, `.chain-use-puzzle` and `.chain-send-btn`. Keep `.chain-link-btn`, `.chain-link-btn:hover`, `.chain-send-error`, `.chain-tag` and `.chain-warning`: the "+ New" link and the error text use them;
- rename `.chain-copy` to `.chain-icon-btn` everywhere (it is used for copy, send, remove and reset);
- change the first comment line to `/* Blockchain simulator view. Reuses the playground's theme tokens and debug-panel look. */`;
- append:

```css
.chain-notices:empty { display: none; }

.chain-notice {
    font-size: 11px;
    border-radius: 4px;
    padding: 6px 10px;
    color: var(--vscode-text);
    background: rgba(255, 152, 0, 0.12);
    border: 1px solid rgba(255, 152, 0, 0.4);
}

.chain-notice.error {
    background: rgba(244, 67, 54, 0.12);
    border-color: rgba(244, 67, 54, 0.45);
}

.chain-notice button {
    margin-top: 6px;
    margin-right: 6px;
}

.chain-mainnet-notice {
    margin-top: 8px;
    font-size: 12px;
    color: #4fb3ff;
}

.chain-chip:disabled { opacity: 0.5; cursor: not-allowed; }

.chain-rejected { color: var(--vscode-error); }
```

- [ ] **Step 7: Implement `ChainView.js`**

```js
import { formatXch, parseXch } from './units.js';
import { parseDestination } from './keys.js';
import { FAUCET } from './WalletService.js';
import { BLOCK_INTERVAL_MS } from './ChainSession.js';
import { BLOCK_SECONDS } from './ChainService.js';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (text, head = 8, tail = 4) => `${text.slice(0, head)}…${text.slice(-tail)}`;
const shortId = (id) => (id ? short('0x' + id, 6, 4) : '—');
const duration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
};
const STATE_LABEL = { stopped: 'Stopped', running: 'Running', paused: 'Paused' };

/** Renders the simulator from ChainSession state and forwards user actions to it. No chain logic here. */
export class ChainView {
    constructor({ root = document, resolvePuzzle }) {
        this.root = root;
        this.resolvePuzzle = resolvePuzzle;
        this.session = null;
        this.lastHeight = null;
        this.addingWallet = false;
        this.puzzleChip = null;
        this.pendingLabel = null;
        this.sendModal = null;
        this.resetModal = null;
    }

    $(id) {
        return this.root.getElementById(id);
    }

    setStatusSummary(height) {
        this.$('statusBarChain').querySelector('span').textContent = `#${height} · Paused`;
    }

    showLoading() {
        this.$('chainStatus').innerHTML = '<div class="chain-meta chain-meta-wide"><i class="fas fa-spinner fa-spin me-1"></i>Loading the simulator…</div>';
    }

    showLoadError(error, retry) {
        this.$('chainStatus').innerHTML = `<div class="chain-notice error chain-meta-wide">The simulator could not load: ${escapeHtml(error.message ?? error)}<br><button class="btn btn-sm btn-secondary" id="chainRetryBtn">Retry</button></div>`;
        this.$('chainRetryBtn').addEventListener('click', retry, { once: true });
    }

    attach(session) {
        this.session = session;
        this.wire();
        session.onChange(() => this.render());
        this.render();
    }

    // ---------- rendering ----------

    render() {
        this.renderStatus();
        this.renderNotices();
        this.renderWallets();
        this.renderOthers();
        this.renderFeed();
    }

    renderStatus() {
        const { session } = this;
        const { chain, state } = session;
        const bumped = this.lastHeight !== null && chain.height !== this.lastHeight;
        this.lastHeight = chain.height;
        this.$('chainStatus').innerHTML = `
            <div class="chain-state ${state === 'stopped' ? '' : state}"><span class="chain-dot"></span>${STATE_LABEL[state]}</div>
            <div class="chain-height ${bumped ? 'bump' : ''}">Block #${chain.height}</div>
            <div class="chain-meta">Chain time <b>+${duration(chain.chainSeconds)}</b></div>
            <div class="chain-meta right">Mempool <b class="${chain.mempool.length ? 'chain-mempool-count' : ''}">${chain.mempool.length}</b></div>
            <div class="chain-meta chain-meta-wide">${BLOCK_INTERVAL_MS / 1000}s per block · each block +${BLOCK_SECONDS}s</div>
            ${session.restoredBlocks ? `<div class="chain-meta-wide chain-restored"><i class="fas fa-history me-1"></i>Restored ${session.restoredBlocks} blocks from your last session · paused</div>` : ''}`;
        this.$('chainStartBtn').disabled = session.running || session.conflict;
        this.$('chainPauseBtn').disabled = !session.running;
        this.$('chainNextBtn').disabled = session.conflict;

        const bar = this.$('statusBarChain');
        bar.classList.toggle('running', session.running);
        bar.querySelector('span').textContent = `#${chain.height} · ${STATE_LABEL[state]}`;
        const badge = this.$('chainTabBadge');
        badge.textContent = chain.mempool.length;
        badge.classList.toggle('show', chain.mempool.length > 0);
    }

    renderNotices() {
        const { session } = this;
        const notices = [];
        if (session.conflict) notices.push('<div class="chain-notice">This chain changed in another tab — reload to continue.</div>');
        if (session.storageError) notices.push('<div class="chain-notice">Your browser is not letting the playground save; this chain won\'t survive a reload.</div>');
        if (session.replayError) {
            notices.push(`<div class="chain-notice error">Your saved chain can't be restored (${escapeHtml(session.replayError)}). A new chain is running meanwhile.
                <br><button class="btn btn-sm btn-secondary" data-chain-action="download-log">Download saved log</button><button class="btn btn-sm btn-danger" data-chain-action="reset">Reset</button></div>`);
        }
        this.$('chainNotices').innerHTML = notices.join('');
    }

    coinRows(coins) {
        if (!coins.length) return '<div class="chain-mono">no coins</div>';
        return coins.map((coin) => `<div class="chain-coin ${coin.status === 'spending' ? 'spending' : ''}">
                <span>${shortId(coin.id)}</span>
                <span>${formatXch(coin.amount)} XCH</span>
                <span class="${coin.status === 'pending' ? 'pending' : 'confirmed'}">${coin.status === 'pending' ? 'pending' : `#${coin.confirmedBlock} ✓`}</span>
            </div>`).join('');
    }

    renderWallets() {
        const { wallets, prefs } = this.session;
        const rows = wallets.visible.map((w) => {
            const coins = wallets.coinsFor(w.puzzleHashHex);
            const hasPending = coins.some((c) => c.status !== 'confirmed');
            const open = prefs.expanded.includes(w.key);
            return `<div class="chain-wallet">
                <div class="chain-wallet-top">
                    <span class="chain-wallet-name">${escapeHtml(w.name)}<button class="chain-icon-btn chain-wallet-send" data-send-from="${w.key}" title="Send from ${escapeHtml(w.name)}" aria-label="Send from ${escapeHtml(w.name)}"><i class="fas fa-paper-plane"></i></button><button class="chain-icon-btn chain-wallet-remove" data-remove-wallet="${w.key}" title="Remove from panel (coins stay on chain)" aria-label="Remove ${escapeHtml(w.name)}"><i class="fas fa-times"></i></button></span>
                    <span class="chain-balance ${hasPending ? 'pending' : ''}">${formatXch(wallets.balanceOf(w.puzzleHashHex))} XCH</span>
                </div>
                <div class="chain-wallet-ids">
                    <span class="chain-mono">${short(w.address, 9, 4)}<button class="chain-icon-btn" data-copy="${w.address}" title="Copy address" aria-label="Copy ${escapeHtml(w.name)}'s address"><i class="far fa-copy"></i></button></span>
                    <span class="chain-mono">pk ${short('0x' + w.publicKeyHex, 6, 4)}<button class="chain-icon-btn" data-copy="0x${w.publicKeyHex}" title="Copy public key" aria-label="Copy ${escapeHtml(w.name)}'s public key"><i class="far fa-copy"></i></button></span>
                </div>
                <button class="chain-coins-toggle" data-toggle="${w.key}"><i class="fas fa-chevron-${open ? 'down' : 'right'}"></i> Coins (${coins.length})</button>
                ${open ? `<div class="chain-coins">${this.coinRows(coins)}</div>` : ''}
            </div>`;
        });
        if (this.addingWallet) {
            rows.push('<div class="chain-wallet"><form id="chainNewWalletForm"><input class="form-control form-control-sm bg-dark text-white" id="chainNewWalletName" placeholder="Name, e.g. Carol" aria-label="New wallet name"><div class="chain-send-error" id="chainNewWalletError"></div></form></div>');
        }
        this.$('chainWallets').innerHTML = rows.join('');
        if (this.addingWallet) this.$('chainNewWalletName').focus();
    }

    renderOthers() {
        const { wallets } = this.session;
        const watched = wallets.watched;
        this.$('chainOtherCard').hidden = watched.length === 0;
        this.$('chainOther').innerHTML = watched.map((w) => `<div class="chain-wallet">
                <div class="chain-wallet-top">
                    <span class="chain-wallet-name">${escapeHtml(w.label)}${w.source ? '<span class="chain-tag">contract</span>' : ''}<button class="chain-icon-btn chain-wallet-remove" data-unwatch="${w.puzzleHashHex}" title="Stop watching this address" aria-label="Stop watching ${escapeHtml(w.label)}"><i class="fas fa-times"></i></button></span>
                    <span class="chain-balance">${formatXch(wallets.balanceOf(w.puzzleHashHex))} XCH</span>
                </div>
                <div class="chain-wallet-ids"><span class="chain-mono">${short(w.address, 9, 4)}<button class="chain-icon-btn" data-copy="${w.address}" title="Copy address" aria-label="Copy address"><i class="far fa-copy"></i></button></span></div>
                <div class="chain-coins">${this.coinRows(wallets.coinsFor(w.puzzleHashHex))}</div>
            </div>`).join('');
    }

    txLine(tx) {
        const { wallets } = this.session;
        const fee = tx.fee ? ` <span class="fee">fee ${formatXch(tx.fee)}</span>` : '';
        const change = tx.change ? ` <span class="fee">(change ${formatXch(tx.change)} → ${escapeHtml(tx.from)})</span>` : '';
        return `<div class="chain-tx"><span class="who">${escapeHtml(tx.from)}</span> → <span class="who">${escapeHtml(wallets.labelFor(tx.toPuzzleHashHex))}</span> <span class="amt">${formatXch(tx.amount)} XCH</span>${fee}${change}</div>`;
    }

    renderFeed() {
        const { chain } = this.session;
        const newest = chain.blocks.at(-1)?.height;
        const pending = chain.mempool.length
            ? `<div class="chain-block pending"><span class="chain-block-num">mempool</span><span class="chain-block-time">next block</span><div>${chain.mempool.map((tx) => this.txLine(tx)).join('')}</div></div>`
            : '';
        const blocks = [...chain.blocks].reverse().map((block) => {
            const txs = block.txs.map((tx) => this.txLine(tx)).join('');
            const rejected = block.rejected.map(({ tx, error }) => `<div class="chain-tx chain-rejected">✕ ${escapeHtml(tx.from)} → ${escapeHtml(this.session.wallets.labelFor(tx.toPuzzleHashHex))} rejected: ${escapeHtml(error)}</div>`).join('');
            return `<div class="chain-block ${block.height === newest && this.session.running ? 'new' : ''}">
                <span class="chain-block-num">#${block.height}</span>
                <span class="chain-block-time">+${duration(block.seconds)}</span>
                <div>${txs || rejected ? txs + rejected : '<span class="chain-block-empty">empty block</span>'}</div>
            </div>`;
        });
        this.$('chainFeed').innerHTML = pending + blocks.join('');
    }

    // ---------- send modal ----------

    async openSend(fromKey = FAUCET) {
        const { wallets } = this.session;
        const from = this.$('chainFrom');
        from.innerHTML = [`<option value="${FAUCET}">${FAUCET}</option>`, ...wallets.visible.map((w) => `<option value="${w.key}">${escapeHtml(w.name)}</option>`)].join('');
        from.value = fromKey;
        this.$('chainSendError').textContent = '';
        this.pendingLabel = null;
        this.puzzleChip = await this.resolvePuzzle();
        this.renderShortcuts();
        this.renderSummary();
        this.sendModal = this.sendModal || new mdb.Modal(this.$('chainSendModal'));
        this.sendModal.show();
    }

    readForm() {
        return {
            from: this.$('chainFrom').value,
            to: this.$('chainTo').value.trim(),
            amount: parseXch(this.$('chainAmount').value),
            fee: this.$('chainFrom').value === FAUCET ? 0n : parseXch(this.$('chainFee').value),
        };
    }

    renderShortcuts() {
        const { wallets } = this.session;
        const fromKey = this.$('chainFrom').value;
        const chips = wallets.visible
            .filter((w) => w.key !== fromKey)
            .map((w) => `<button type="button" class="chain-chip" data-to="${w.address}">${escapeHtml(w.name)}</button>`);
        const puzzle = this.puzzleChip;
        if (puzzle) {
            chips.push(puzzle.error
                ? `<button type="button" class="chain-chip chain-chip-puzzle" disabled title="${escapeHtml(puzzle.error)}"><i class="fas fa-file-code"></i> ${escapeHtml(puzzle.name)} <span class="muted">${escapeHtml(puzzle.error)}</span></button>`
                : `<button type="button" class="chain-chip chain-chip-puzzle" data-to="0x${puzzle.puzzleHashHex}" data-puzzle="1" title="${escapeHtml(puzzle.source.curriedParams ? 'curried: ' + puzzle.source.curriedParams : 'no curried parameters')}"><i class="fas fa-file-code"></i> ${escapeHtml(puzzle.name)} <span class="muted">this puzzle</span></button>`);
        }
        this.$('chainToShortcuts').innerHTML = chips.join('');
    }

    renderSummary() {
        const { wallets } = this.session;
        const form = this.readForm();
        const summary = this.$('chainSendSummary');
        const isFaucet = form.from === FAUCET;
        this.$('chainFee').disabled = isFaucet;
        this.$('chainFromHint').textContent = isFaucet
            ? 'The faucet creates new coins out of thin air (simulator only).'
            : `Signed with ${wallets.find(form.from).name}'s key · ${formatXch(wallets.balanceOf(wallets.find(form.from).puzzleHashHex))} XCH confirmed`;

        let destination = null;
        try {
            destination = parseDestination(this.session.sdk, form.to);
        } catch {
            destination = null;
        }
        this.$('chainMainnetNotice').hidden = !destination?.mainnet;
        if (!destination || !form.amount || form.amount <= 0n) {
            summary.innerHTML = '';
            return;
        }
        const label = escapeHtml(this.pendingLabel ?? wallets.labelFor(destination.puzzleHashHex));
        if (isFaucet) {
            summary.innerHTML = `New coin of <b>${formatXch(form.amount)} XCH</b> → <span class="who">${label}</span>, confirmed in the next block.`;
            return;
        }
        try {
            const preview = wallets.previewSend(form);
            summary.innerHTML = `
                <div>Spends <b>${preview.inputs.length} coin${preview.inputs.length > 1 ? 's' : ''}</b> (${preview.inputs.map((c) => formatXch(c.amount)).join(' + ')} XCH)</div>
                <div>→ <span class="who">${label}</span> <b>${formatXch(preview.amount)} XCH</b></div>
                ${preview.change ? `<div>→ <span class="who">${escapeHtml(preview.wallet.name)}</span> <b>${formatXch(preview.change)} XCH</b> <span class="muted">change</span></div>` : ''}
                ${preview.fee ? `<div>→ farmer <b>${formatXch(preview.fee)} XCH</b> <span class="muted">fee</span></div>` : ''}`;
        } catch {
            summary.innerHTML = '';
        }
    }

    submitSend(event) {
        event.preventDefault();
        const form = this.readForm();
        try {
            if (this.pendingPuzzle) {
                this.session.watchPuzzle({ puzzleHashHex: this.puzzleChip.puzzleHashHex, label: this.puzzleChip.name, source: this.puzzleChip.source });
            }
            this.session.send(form);
            this.pendingPuzzle = false;
            this.sendModal.hide();
        } catch (error) {
            this.$('chainSendError').textContent = error.message;
        }
    }

    // ---------- events ----------

    wire() {
        this.$('chainStartBtn').addEventListener('click', () => this.session.start());
        this.$('chainPauseBtn').addEventListener('click', () => this.session.pause());
        this.$('chainNextBtn').addEventListener('click', () => this.session.next());
        this.$('chainSendOpenBtn').addEventListener('click', () => this.openSend());
        this.$('chainSendForm').addEventListener('submit', (e) => this.submitSend(e));
        this.$('chainFrom').addEventListener('change', () => { this.renderShortcuts(); this.renderSummary(); });
        this.$('chainTo').addEventListener('input', () => { this.pendingLabel = null; this.pendingPuzzle = false; this.renderSummary(); });
        this.$('chainAmount').addEventListener('input', () => this.renderSummary());
        this.$('chainFee').addEventListener('input', () => this.renderSummary());
        this.$('chainToShortcuts').addEventListener('click', (e) => {
            const chip = e.target.closest('[data-to]');
            if (!chip) return;
            this.$('chainTo').value = chip.dataset.to;
            this.pendingPuzzle = chip.dataset.puzzle === '1';
            this.pendingLabel = this.pendingPuzzle ? this.puzzleChip.name : null;
            this.renderSummary();
        });
        this.$('chainNewWalletBtn').addEventListener('click', () => {
            this.addingWallet = true;
            this.renderWallets();
        });
        this.$('chainResetBtn').addEventListener('click', () => this.openReset());
        this.$('chainResetConfirmBtn').addEventListener('click', () => {
            this.resetModal.hide();
            this.session.reset();
        });

        const content = this.$('chainContent');
        content.addEventListener('click', (e) => this.handleContentClick(e));
        content.addEventListener('submit', (e) => {
            if (e.target.id !== 'chainNewWalletForm') return;
            e.preventDefault();
            const name = this.$('chainNewWalletName').value;
            if (!name.trim()) {
                this.addingWallet = false;
                this.renderWallets();
                return;
            }
            try {
                this.session.createWallet(name);
                this.addingWallet = false;
                this.renderWallets();
            } catch (error) {
                this.$('chainNewWalletError').textContent = error.message;
            }
        });
    }

    openReset() {
        this.resetModal = this.resetModal || new mdb.Modal(this.$('chainResetModal'));
        this.resetModal.show();
    }

    handleContentClick(event) {
        const target = event.target.closest('[data-copy], [data-send-from], [data-remove-wallet], [data-unwatch], [data-toggle], [data-chain-action]');
        if (!target) return;
        const { dataset } = target;
        if (dataset.copy) navigator.clipboard?.writeText(dataset.copy);
        if (dataset.sendFrom) this.openSend(dataset.sendFrom);
        if (dataset.removeWallet) this.session.hideWallet(dataset.removeWallet);
        if (dataset.unwatch) this.session.unwatch(dataset.unwatch);
        if (dataset.toggle) this.session.setExpanded(dataset.toggle, !this.session.prefs.expanded.includes(dataset.toggle));
        if (dataset.chainAction === 'reset') this.openReset();
        if (dataset.chainAction === 'download-log') this.downloadSavedLog();
    }

    downloadSavedLog() {
        const url = URL.createObjectURL(new Blob([this.session.savedData], { type: 'application/json' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: 'chialisp-playground-chain.json' });
        link.click();
        URL.revokeObjectURL(url);
    }
}
```

Note: `ChainView` reads `session.sdk` to parse destinations. `ChainSession` already stores `this.sdk`.

- [ ] **Step 8: Implement `boot.js`**

```js
import { WasmLoader } from '../WasmLoader.js';
import { ChainSession } from './ChainSession.js';
import { BrowserChainPersistence } from './persistence.js';
import { ChainView } from './ChainView.js';
import { parseSnapshot } from './ChainLog.js';
import { resolvePuzzleAddress } from './puzzleAddress.js';

const persistence = new BrowserChainPersistence();

function resolvePuzzle() {
    const playground = window.playground;
    const filename = playground?.editorService?.getCurrentFile?.() ?? '';
    return resolvePuzzleAddress({
        filename,
        source: filename ? playground.editorService.editor.getValue() : '',
        curriedParams: filename ? playground.getFileParameters(filename).curriedParams : '',
        compile: (source, file, params) => playground.compilationService.compileCode(source, file, params),
    });
}

const view = new ChainView({ root: document, resolvePuzzle });
let opening = null;

/** The 6.5 MB SDK is fetched only the first time someone opens the simulator. */
function openChain() {
    if (opening) return opening;
    view.showLoading();
    opening = (async () => {
        try {
            const sdk = await WasmLoader.loadWalletSdk();
            const session = await ChainSession.open({ sdk, persistence });
            view.attach(session);
            window.addEventListener('pagehide', () => session.flush());
        } catch (error) {
            console.error('Blockchain simulator failed to load:', error);
            opening = null;
            view.showLoadError(error, openChain);
        }
    })();
    return opening;
}

function showChainView() {
    // the playground wires its activity bar only after Monaco and the compiler load, so an early click must switch the view itself
    window.playground?.switchSidebarView('chain');
    return openChain();
}

document.getElementById('chainViewBtn').addEventListener('click', showChainView);
document.getElementById('statusBarChain').addEventListener('click', showChainView);
document.querySelector('[data-panel="chain"]').addEventListener('click', openChain);

// show where the saved chain stands without loading the SDK
persistence.loadWithGeneration()
    .then(({ data }) => {
        if (data && !opening) view.setStatusSummary(parseSnapshot(data).summary.height);
    })
    .catch(() => {});
```

- [ ] **Step 9: Check it in the browser**

Run `python -m http.server 8080` and open `http://localhost:8080/`. Walk through it:
1. Open the cubes view. Expected: "Loading the simulator…", then Block #1, Stopped, Alice and Bob with 10 XCH.
2. Next → Block #2. Start → a block every 3 s, and the status bar shows `#N · Running`. Pause.
3. Hover Alice → ✈. Pick the Bob chip, set Amount `1,5`. Expected summary: 1 coin (10 XCH) → Bob 1.5, change 8.4999, fee 0.0001. Send. Expected: the CHAIN tab badge shows 1 and the feed shows the mempool row. Next confirms it.
4. Open `piggybank.clsp`, Send XCH from Faucet, pick the "piggybank.clsp this puzzle" chip, send 2, Next. Expected: Other addresses lists `piggybank.clsp` with the `contract` tag and 2 XCH.
5. Pasting an `xch1…` address is covered by the Playwright test in Task 8 (swapping the prefix by hand breaks the bech32 checksum, so it can't be tested by editing an address).
6. Remove Bob (✕), + New → `bob` → Bob returns with his coins.
7. Reload the page. Expected: the status bar shows `#N · Paused` before the SDK loads; opening the view shows the restored notice and the same balances.
8. Reset → confirm → Block #1.

Compare against `.mockups/chain.html` side by side; spacing, colours and component styles must match.

- [ ] **Step 10: Run the suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add index.html css/chain.css js/chain/puzzleAddress.js js/chain/ChainView.js js/chain/boot.js tests/chain/puzzleAddress.test.mjs
git commit -m "Add the blockchain simulator view, send and reset modals"
```

---

### Task 8: Playwright UI tests and docs

**Files:**
- Create: `tests-ui/helpers/server.mjs`, `tests-ui/chain.ui.test.mjs`
- Modify: `package.json`, `README.md`

**Interfaces:**
- Consumes: the page from Task 7.
- Produces: `npm run test:ui`.

- [ ] **Step 1: Add the dependency and script**

In `package.json`, add `"test:ui": "node --test \"tests-ui/**/*.test.mjs\""` to `scripts`, and add:

```json
  "devDependencies": {
    "playwright": "^1.63.0"
  }
```

Run: `npm install && npx playwright install chromium`

- [ ] **Step 2: Static server helper**

`tests-ui/helpers/server.mjs`:

```js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.wasm': 'application/wasm', '.png': 'image/png', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
};

/** Serves the repo like nginx does in production; resolves with { url, close } */
export function serveRepo() {
    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() }));
    });
}
```

- [ ] **Step 3: Write the UI tests**

`tests-ui/chain.ui.test.mjs`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serveRepo } from './helpers/server.mjs';

let server;
let browser;
before(async () => {
    server = await serveRepo();
    browser = await chromium.launch();
});
after(async () => {
    await browser?.close();
    server?.close();
});

const chainStatus = (page) => page.getByRole('status', { name: 'Chain status' });

/** Waits until the chain at `height` is durably saved, so a reload can't outrun the write */
function waitForSaved(page, height) {
    return page.waitForFunction((expected) => new Promise((resolve) => {
        const open = indexedDB.open('chialisp-playground-chain', 1);
        open.onsuccess = () => {
            const tx = open.result.transaction('chain');
            const request = tx.objectStore('chain').get('snapshot');
            tx.oncomplete = () => {
                open.result.close();
                resolve(Boolean(request.result) && JSON.parse(request.result).summary.height === expected);
            };
        };
        open.onerror = () => resolve(false);
    }), height);
}

async function openChain() {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(server.url);
    await page.getByTitle('Blockchain Simulator', { exact: true }).click();
    await chainStatus(page).getByText('Block #1', { exact: true }).waitFor({ timeout: 30_000 });
    return { page, context, errors };
}

test('Next and Start/Pause move the chain and the status bar follows', async () => {
    const { page, context, errors } = await openChain();
    await page.getByRole('button', { name: 'Next' }).click();
    await chainStatus(page).getByText('Block #2', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Start' }).click();
    await chainStatus(page).getByText('Block #3', { exact: true }).waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Pause' }).click();
    assert.match(await page.locator('#statusBarChain').innerText(), /· Paused/);
    assert.deepEqual(errors, []);
    await context.close();
});

test('Alice pays Bob: pending in the mempool, confirmed by Next, change back to Alice', async () => {
    const { page, context } = await openChain();
    await page.getByRole('button', { name: 'Send from Alice' }).click();
    await page.locator('#chainToShortcuts').getByRole('button', { name: 'Bob' }).click();
    await page.getByLabel('Amount (XCH)').fill('1,5');
    await page.getByText('8.4999 XCH').waitFor();
    await page.locator('#chainSendModal').getByRole('button', { name: 'Send' }).click();

    await page.locator('.panel-tab[data-panel="chain"]').click();
    await page.locator('#chainFeed').getByText('mempool', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Next' }).click();

    await page.locator('.chain-wallet', { hasText: 'Bob' }).locator('.chain-balance', { hasText: '11.5 XCH' }).waitFor();
    await page.locator('.chain-wallet', { hasText: 'Alice' }).locator('.chain-balance', { hasText: '8.4999 XCH' }).waitFor();
    await context.close();
});

test('a pasted mainnet address shows the notice and pays the same puzzle hash', async () => {
    const { page, context } = await openChain();
    const bobAddress = await page.getByRole('button', { name: "Copy Bob's address" }).getAttribute('data-copy');
    const mainnet = await page.evaluate(async (address) => {
        const { WasmLoader } = await import('/js/WasmLoader.js');
        const sdk = await WasmLoader.loadWalletSdk();
        return new sdk.Address(sdk.Address.decode(address).puzzleHash, 'xch').encode();
    }, bobAddress);

    await page.getByRole('button', { name: 'Send XCH' }).click();
    await page.getByLabel('To', { exact: true }).fill(mainnet);
    await page.getByText('Mainnet address — nothing is sent on mainnet').waitFor();
    await page.locator('#chainSendModal').getByRole('button', { name: 'Send' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('.chain-wallet', { hasText: 'Bob' }).locator('.chain-balance', { hasText: '11 XCH' }).waitFor();
    await context.close();
});

test('a reload restores the chain paused; Reset returns to block #1', async () => {
    const { page, context } = await openChain();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await chainStatus(page).getByText('Block #3', { exact: true }).waitFor();
    await waitForSaved(page, 3);

    await page.reload();
    await page.locator('#statusBarChain').getByText('#3 · Paused').waitFor();
    await page.getByTitle('Blockchain Simulator', { exact: true }).click();
    await page.getByText('Restored 3 blocks from your last session').waitFor({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Reset the chain' }).click();
    await page.locator('#chainResetConfirmBtn').click();
    await chainStatus(page).getByText('Block #1', { exact: true }).waitFor();
    await context.close();
});

test('clicking the cubes icon while the playground is still loading opens the Chain view', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // hold Monaco back so the click lands before the playground wires its activity bar
    await page.route('**/monaco-editor/**/loader.js', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.continue();
    });
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.getByTitle('Blockchain Simulator', { exact: true }).click();
    await chainStatus(page).getByText('Block #1', { exact: true }).waitFor({ timeout: 30_000 });
    await context.close();
});

test('removing a wallet and re-creating it by name brings its coins back', async () => {
    const { page, context } = await openChain();
    await page.getByRole('button', { name: 'Remove Bob' }).click();
    assert.equal(await page.locator('#chainWallets .chain-wallet', { hasText: 'Bob' }).count(), 0);

    await page.getByRole('button', { name: 'New' }).click();
    await page.getByLabel('New wallet name').fill('bob');
    await page.getByLabel('New wallet name').press('Enter');
    await page.locator('.chain-wallet', { hasText: 'Bob' }).locator('.chain-balance', { hasText: '10 XCH' }).waitFor();
    await context.close();
});
```

- [ ] **Step 4: Run the UI tests**

The page loads Monaco, MDB and Font Awesome from CDNs, so these tests need network access; a CDN hiccup shows up as a 30 s timeout waiting for `Block #1`, not as a product bug. Rerun before debugging.

Run: `npm run test:ui`
Expected: 6 tests pass. Then, one at a time, confirm the named test FAILS and restore:
- remove the `persistence.loadWithGeneration()…` block from `boot.js` → "a reload restores the chain paused…" (the status bar never shows `#3 · Paused` before opening);
- remove `window.playground?.switchSidebarView('chain');` from `showChainView` → "clicking the cubes icon while the playground is still loading…".

- [ ] **Step 5: Document it**

In `README.md`, after "Running Tests", add:

````markdown
## Blockchain Simulator

The cubes icon opens a local simulated blockchain (Chia Wallet SDK simulator, in your browser):

- **Start / Pause / Next** farm blocks. Each block adds 52 s of chain time, so time and height locks behave like on Chia.
- **Wallets** Alice and Bob start with 10 XCH. Their keys come from their names, so their addresses never change. Create more with **+ New**.
- **Send XCH** from the faucet or a wallet. Transactions wait in the mempool until the next block; the summary shows the coins spent, the change and the fee.
- **this puzzle** sends to the address of the program open in the editor (with its curried parameters): that is how you lock XCH in a contract.
- The chain is saved in your browser and restored, paused, when you come back. **Reset** starts over.

Simulated keys are derived from public names: never send real funds to these addresses.

UI tests drive the simulator in a real browser:

```bash
npm install
npx playwright install chromium
npm run test:ui
```
````

- [ ] **Step 6: Run everything and commit**

Run: `npm test && npm run test:ui`
Expected: both pass.

```bash
git add package.json package-lock.json tests-ui README.md
git commit -m "Add Playwright UI tests and docs for the blockchain simulator"
```
