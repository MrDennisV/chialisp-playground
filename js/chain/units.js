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
