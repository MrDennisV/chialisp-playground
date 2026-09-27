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

export const FEED_LIMIT = 200;

/** Newest first, capped so a chain left running for hours still renders instantly */
export function feedBlocks(blocks) {
    return blocks.slice(-FEED_LIMIT).reverse();
}

/** Renders the simulator from ChainSession state and forwards user actions to it. No chain logic here. */
export class ChainView {
    constructor({ root = document, resolvePuzzle }) {
        this.root = root;
        this.resolvePuzzle = resolvePuzzle;
        this.session = null;
        this.lastHeight = null;
        this.puzzleChip = null;
        this.pendingPuzzle = false;
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
                    <span class="chain-wallet-name">${escapeHtml(w.name)}<button class="chain-icon-btn chain-wallet-send" data-send-from="${escapeHtml(w.key)}" title="Send from ${escapeHtml(w.name)}" aria-label="Send from ${escapeHtml(w.name)}"><i class="fas fa-paper-plane"></i></button><button class="chain-icon-btn chain-wallet-remove" data-remove-wallet="${escapeHtml(w.key)}" title="Remove from panel (coins stay on chain)" aria-label="Remove ${escapeHtml(w.name)}"><i class="fas fa-times"></i></button></span>
                    <span class="chain-balance ${hasPending ? 'pending' : ''}">${formatXch(wallets.balanceOf(w.puzzleHashHex))} XCH</span>
                </div>
                <div class="chain-wallet-ids">
                    <span class="chain-mono">${short(w.address, 9, 4)}<button class="chain-icon-btn" data-copy="${w.address}" title="Copy address" aria-label="Copy ${escapeHtml(w.name)}'s address"><i class="far fa-copy"></i></button></span>
                    <span class="chain-mono">pk ${short('0x' + w.publicKeyHex, 6, 4)}<button class="chain-icon-btn" data-copy="0x${w.publicKeyHex}" title="Copy public key" aria-label="Copy ${escapeHtml(w.name)}'s public key"><i class="far fa-copy"></i></button></span>
                </div>
                <button class="chain-coins-toggle" data-toggle="${escapeHtml(w.key)}"><i class="fas fa-chevron-${open ? 'down' : 'right'}"></i> Coins (${coins.length})</button>
                ${open ? `<div class="chain-coins">${this.coinRows(coins)}</div>` : ''}
            </div>`;
        });
        this.$('chainWallets').innerHTML = rows.join('');
    }

    showNewWalletForm() {
        this.$('chainNewWallet').innerHTML = '<div class="chain-wallet"><form id="chainNewWalletForm"><input class="form-control form-control-sm bg-dark text-white" id="chainNewWalletName" placeholder="Name, e.g. Carol" aria-label="New wallet name"><div class="chain-send-error" id="chainNewWalletError"></div></form></div>';
        this.$('chainNewWalletName').focus();
    }

    hideNewWalletForm() {
        this.$('chainNewWallet').innerHTML = '';
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
        const blocks = feedBlocks(chain.blocks).map((block) => {
            const txs = block.txs.map((tx) => this.txLine(tx)).join('');
            const rejected = block.rejected.map(({ tx, error }) => `<div class="chain-tx chain-rejected">✕ ${escapeHtml(tx.from)} → ${escapeHtml(this.session.wallets.labelFor(tx.toPuzzleHashHex))} rejected: ${escapeHtml(error)}</div>`).join('');
            return `<div class="chain-block ${block.height === newest && this.session.running ? 'new' : ''}">
                <span class="chain-block-num">#${block.height}</span>
                <span class="chain-block-time">+${duration(block.seconds)}</span>
                <div>${txs || rejected ? txs + rejected : '<span class="chain-block-empty">empty block</span>'}</div>
            </div>`;
        });
        const older = chain.blocks.length - FEED_LIMIT;
        const olderNote = older > 0 ? `<div class="chain-feed-empty">… ${older} older blocks</div>` : '';
        this.$('chainFeed').innerHTML = pending + blocks.join('') + olderNote;
    }

    // ---------- send modal ----------

    async openSend(fromKey = FAUCET) {
        const { wallets } = this.session;
        const from = this.$('chainFrom');
        from.innerHTML = [`<option value="${FAUCET}">${FAUCET}</option>`, ...wallets.visible.map((w) => `<option value="${escapeHtml(w.key)}">${escapeHtml(w.name)}</option>`)].join('');
        from.value = fromKey;
        this.$('chainSendError').textContent = '';
        this.$('chainTo').value = '';
        this.pendingLabel = null;
        this.pendingPuzzle = false;
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
            const puzzle = this.pendingPuzzle
                ? { puzzleHashHex: this.puzzleChip.puzzleHashHex, label: this.puzzleChip.name, source: this.puzzleChip.source }
                : null;
            this.session.send({ ...form, puzzle });
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
        this.$('chainNewWalletBtn').addEventListener('click', () => this.showNewWalletForm());
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
                this.hideNewWalletForm();
                return;
            }
            try {
                this.session.createWallet(name);
                this.hideNewWalletForm();
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
