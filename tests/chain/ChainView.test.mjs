import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedBlocks, FEED_LIMIT } from '../../js/chain/ChainView.js';

test('the block feed shows only the newest blocks, newest first', () => {
    const blocks = Array.from({ length: 500 }, (_, i) => ({ height: i + 1 }));
    const shown = feedBlocks(blocks);
    assert.equal(FEED_LIMIT, 200);
    assert.equal(shown.length, 200);
    assert.equal(shown[0].height, 500);
    assert.equal(shown.at(-1).height, 301);
});
