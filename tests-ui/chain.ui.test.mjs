import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serveRepo } from './helpers/server.mjs';

let server;
let browser;
before(async () => {
    server = await serveRepo();
    browser = await chromium.launch();
});
after(async () => {
    await browser?.close();
    server?.close();
});

const chainStatus = (page) => page.getByRole('status', { name: 'Chain status' });

/** Waits until the chain at `height` is durably saved, so a reload can't outrun the write */
function waitForSaved(page, height) {
    return page.waitForFunction((expected) => new Promise((resolve) => {
        const open = indexedDB.open('chialisp-playground-chain', 1);
        open.onsuccess = () => {
            const tx = open.result.transaction('chain');
            const request = tx.objectStore('chain').get('snapshot');
            tx.oncomplete = () => {
                open.result.close();
                resolve(Boolean(request.result) && JSON.parse(request.result).summary.height === expected);
            };
        };
        open.onerror = () => resolve(false);
    }), height);
}

async function openChain() {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(server.url);
    await page.getByTitle('Blockchain Simulator', { exact: true }).click();
    await chainStatus(page).getByText('Block #1', { exact: true }).waitFor({ timeout: 30_000 });
    return { page, context, errors };
}

test('Next and Start/Pause move the chain and the status bar follows', async () => {
    const { page, context, errors } = await openChain();
    await page.getByRole('button', { name: 'Next' }).click();
    await chainStatus(page).getByText('Block #2', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Start' }).click();
    await chainStatus(page).getByText('Block #3', { exact: true }).waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Pause' }).click();
    assert.match(await page.locator('#statusBarChain').innerText(), /· Paused/);
    assert.deepEqual(errors, []);
    await context.close();
});

test('Alice pays Bob: pending in the mempool, confirmed by Next, change back to Alice', async () => {
    const { page, context } = await openChain();
    await page.getByRole('button', { name: 'Send from Alice' }).click();
    await page.locator('#chainToShortcuts').getByRole('button', { name: 'Bob' }).click();
    await page.getByLabel('Amount (XCH)').fill('1,5');
    await page.getByText('8.4999 XCH').waitFor();
    await page.locator('#chainSendModal').getByRole('button', { name: 'Send' }).click();

    await page.locator('.panel-tab[data-panel="chain"]').click();
    await page.locator('#chainFeed').getByText('mempool', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Next' }).click();

    await page.locator('.chain-wallet', { hasText: 'Bob' }).locator('.chain-balance', { hasText: '11.5 XCH' }).waitFor();
    await page.locator('.chain-wallet', { hasText: 'Alice' }).locator('.chain-balance', { hasText: '8.4999 XCH' }).waitFor();
    await context.close();
});

test('a pasted mainnet address shows the notice and pays the same puzzle hash', async () => {
    const { page, context } = await openChain();
    const bobAddress = await page.getByRole('button', { name: "Copy Bob's address" }).getAttribute('data-copy');
    const mainnet = await page.evaluate(async (address) => {
        const { WasmLoader } = await import('/js/WasmLoader.js');
        const sdk = await WasmLoader.loadWalletSdk();
        return new sdk.Address(sdk.Address.decode(address).puzzleHash, 'xch').encode();
    }, bobAddress);

    await page.getByRole('button', { name: 'Send XCH' }).click();
    await page.getByLabel('To', { exact: true }).fill(mainnet);
    await page.getByText('Mainnet address — nothing is sent on mainnet').waitFor();
    await page.locator('#chainSendModal').getByRole('button', { name: 'Send' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('.chain-wallet', { hasText: 'Bob' }).locator('.chain-balance', { hasText: '11 XCH' }).waitFor();
    await context.close();
});

test('a reload restores the chain paused; Reset returns to block #1', async () => {
    const { page, context } = await openChain();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await chainStatus(page).getByText('Block #3', { exact: true }).waitFor();
    await waitForSaved(page, 3);

    await page.reload();
    await page.locator('#statusBarChain').getByText('#3 · Paused').waitFor();
    await page.getByTitle('Blockchain Simulator', { exact: true }).click();
    await page.getByText('Restored 3 blocks from your last session').waitFor({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Reset the chain' }).click();
    await page.locator('#chainResetConfirmBtn').click();
    await chainStatus(page).getByText('Block #1', { exact: true }).waitFor();
    await context.close();
});

test('clicking the cubes icon while the playground is still loading opens the Chain view', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // hold Monaco back so the click lands before the playground wires its activity bar
    await page.route('**/monaco-editor/**/loader.js', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.continue();
    });
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.getByTitle('Blockchain Simulator', { exact: true }).click();
    await chainStatus(page).getByText('Block #1', { exact: true }).waitFor({ timeout: 30_000 });
    await context.close();
});

test('removing a wallet and re-creating it by name brings its coins back', async () => {
    const { page, context } = await openChain();
    await page.getByRole('button', { name: 'Remove Bob' }).click();
    assert.equal(await page.locator('#chainWallets .chain-wallet', { hasText: 'Bob' }).count(), 0);

    await page.getByRole('button', { name: 'New' }).click();
    await page.getByLabel('New wallet name').fill('bob');
    await page.getByLabel('New wallet name').press('Enter');
    await page.locator('.chain-wallet', { hasText: 'Bob' }).locator('.chain-balance', { hasText: '10 XCH' }).waitFor();
    await context.close();
});
