// Loads the clvm_tools_lsp WASM (compiler, runner, curry, debugger) in the browser or in Node.
// The browser fetches the .wasm over HTTP; Node reads it from disk and uses initSync (tests).

const WASM_DIR = new URL('./vscode-chialisp-lsp/', import.meta.url);

const isNode = typeof process !== 'undefined' && !!process.versions?.node;

let wasmModule = null;

export class WasmLoader {
    /**
     * @param {Object} options
     * @param {string} [options.cacheBust] appended to the browser JS URL so a redeploy isn't served stale
     *        (the .wasm stays cacheable, as before)
     * @returns {Promise<Object>} the initialized clvm_tools_lsp module
     */
    static async initialize({ cacheBust = '' } = {}) {
        if (wasmModule) return wasmModule;

        const query = cacheBust ? `?v=${cacheBust}` : '';
        const module = await import(new URL(`clvm_tools_lsp.js${isNode ? '' : query}`, WASM_DIR).href);

        if (isNode) {
            const { readFileSync } = await import('node:fs');
            const { fileURLToPath } = await import('node:url');
            module.initSync({ module: readFileSync(fileURLToPath(new URL('clvm_tools_lsp_bg.wasm', WASM_DIR))) });
        } else {
            await module.default(new URL('clvm_tools_lsp_bg.wasm', WASM_DIR));
        }

        wasmModule = module;
        return wasmModule;
    }

    static isInitialized() {
        return wasmModule !== null;
    }
}
