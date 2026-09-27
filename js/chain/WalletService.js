import { walletKeys, parseDestination, encodeAddress } from './keys.js';
import { toCoinSpendRecord } from './ChainService.js';
import { formatXch, MAX_MOJOS } from './units.js';

export const FAUCET = 'Faucet';

const displayName = (name) => name.charAt(0).toUpperCase() + name.slice(1);
const shortAddress = (address) => `${address.slice(0, 10)}…${address.slice(-4)}`;
const WALLET_NAME = /^[\p{L}\p{N} _-]{1,24}$/u;

function assertAmount(amount) {
    if (amount === null || amount === undefined) throw new Error('Enter an amount like 1.5');
    if (amount <= 0n) throw new Error('Amount must be greater than 0');
    if (amount > MAX_MOJOS) throw new Error(`Amount too large: at most ${formatXch(MAX_MOJOS)} XCH`);
}

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
        if (!WALLET_NAME.test(clean)) throw new Error('Use letters, numbers, spaces, - or _ (max 24)');
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
        assertAmount(amount);
        if (fee === null || fee === undefined) throw new Error('Enter a fee like 0.0001');
        if (fee > MAX_MOJOS) throw new Error(`Fee too large: at most ${formatXch(MAX_MOJOS)} XCH`);
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
        assertAmount(amount);
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
