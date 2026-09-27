/**
 * Chia makes a block every 18.75 s on average (4,608 a day). passTime only takes whole seconds,
 * so blocks alternate 19, 19, 19, 18: every four blocks add exactly 75 s.
 */
export const AVERAGE_BLOCK_SECONDS = 18.75;
const BLOCK_SECONDS_CYCLE = [19, 19, 19, 18];

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
        this.elapsedSeconds = 0;
    }

    get height() {
        return this.sim.height();
    }

    get chainSeconds() {
        return this.elapsedSeconds;
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
        const rejected = [];
        const createdFaucets = [];
        for (const tx of faucets) {
            try {
                this.indexCoin(this.sim.newCoin(this.sdk.fromHex(tx.puzzleHashHex), tx.amount));
                createdFaucets.push(tx);
            } catch (error) {
                rejected.push({ tx, error: cleanError(error) });
            }
        }

        let included = spends;
        try {
            this.spendWithTick(spends);
        } catch (error) {
            // a failed spendCoins leaves the simulator untouched, so the block is farmed without the spends
            rejected.push(...spends.map((tx) => ({ tx, error: cleanError(error) })));
            included = [];
            this.spendWithTick([]);
        }
        this.indexChildren(included);
        const seconds = BLOCK_SECONDS_CYCLE[(this.history.length) % BLOCK_SECONDS_CYCLE.length];
        this.sim.passTime(BigInt(seconds));
        this.elapsedSeconds += seconds;

        const block = { height: this.height, seconds: this.chainSeconds, txs: [...createdFaucets, ...included], rejected };
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
