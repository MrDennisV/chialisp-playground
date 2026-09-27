import { WasmLoader } from '../../js/WasmLoader.js';

export function loadSdk() {
    return WasmLoader.loadWalletSdk();
}

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
