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
        const created = this.wallets.visible.map((w) => w.name).filter((name) => !GENESIS_WALLETS.includes(name));
        this.pause();
        this.replayError = null;
        this.savedData = null;
        this.restoredBlocks = 0;
        this.writer.stopped = this.conflict;
        this.fresh();
        this.genesis();
        for (const name of created) this.createWallet(name);
        this.emit();
    }

    /** `puzzle` ({ puzzleHashHex, label, source }) is the editor program the user picked; its source is kept only if the send pays it */
    send({ from, to, amount, fee, puzzle = null }) {
        const tx = from === FAUCET ? this.wallets.buildFaucet({ to, amount }) : this.wallets.buildSend({ from, to, amount, fee });
        const isKnown = this.wallets.find(this.wallets.labelFor(tx.toPuzzleHashHex)) || this.wallets.watched.some((w) => w.puzzleHashHex === tx.toPuzzleHashHex);
        if (puzzle && puzzle.puzzleHashHex === tx.toPuzzleHashHex) this.watchPuzzle(puzzle);
        else if (!isKnown) this.watchPuzzle({ puzzleHashHex: tx.toPuzzleHashHex, label: this.wallets.labelFor(tx.toPuzzleHashHex), source: null });
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
