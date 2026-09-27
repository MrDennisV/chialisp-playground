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
