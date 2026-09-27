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
