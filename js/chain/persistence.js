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
