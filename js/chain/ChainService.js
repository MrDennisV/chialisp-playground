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
