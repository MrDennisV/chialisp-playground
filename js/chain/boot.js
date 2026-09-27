import { WasmLoader } from '../WasmLoader.js';
import { ChainSession } from './ChainSession.js';
import { BrowserChainPersistence } from './persistence.js';
import { ChainView } from './ChainView.js';
import { parseSnapshot } from './ChainLog.js';
import { resolvePuzzleAddress } from './puzzleAddress.js';

const persistence = new BrowserChainPersistence();

function resolvePuzzle() {
    const playground = window.playground;
    const filename = playground?.editorService?.getCurrentFile?.() ?? '';
    return resolvePuzzleAddress({
        filename,
        source: filename ? playground.editorService.editor.getValue() : '',
        curriedParams: filename ? playground.getFileParameters(filename).curriedParams : '',
        compile: (source, file, params) => playground.compilationService.compileCode(source, file, params),
    });
}

const view = new ChainView({ root: document, resolvePuzzle });
let opening = null;

/** The 6.5 MB SDK is fetched only the first time someone opens the simulator. */
function openChain() {
    if (opening) return opening;
    view.showLoading();
    opening = (async () => {
        try {
            const sdk = await WasmLoader.loadWalletSdk();
            const session = await ChainSession.open({ sdk, persistence });
            view.attach(session);
            window.addEventListener('pagehide', () => session.flush());
        } catch (error) {
            console.error('Blockchain simulator failed to load:', error);
            opening = null;
            view.showLoadError(error, openChain);
        }
    })();
    return opening;
}

function showChainView() {
    // the playground wires its activity bar only after Monaco and the compiler load, so an early click must switch the view itself
    window.playground?.switchSidebarView('chain');
    return openChain();
}

document.getElementById('chainViewBtn').addEventListener('click', showChainView);
document.getElementById('statusBarChain').addEventListener('click', showChainView);
document.querySelector('[data-panel="chain"]').addEventListener('click', openChain);

// show where the saved chain stands without loading the SDK
persistence.loadWithGeneration()
    .then(({ data }) => {
        if (data && !opening) view.setStatusSummary(parseSnapshot(data).summary.height);
    })
    .catch(() => {});
