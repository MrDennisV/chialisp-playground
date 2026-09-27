const NO_CURRY = new Set(['', '()']);

/** The address of the program in the editor, with the curried parameters its Run modal uses. */
export async function resolvePuzzleAddress({ filename, source, curriedParams, compile }) {
    if (!filename) return { name: 'program.clsp', error: 'Open a .clsp file first' };
    const name = filename.split('/').pop();
    const curry = (curriedParams ?? '').trim();
    try {
        const result = await compile(source, filename, { curriedParams: curry });
        // compileCode swallows curry failures and falls back to the uncurried hash
        if (!NO_CURRY.has(curry) && !result.curriedHash) return { name, error: 'Invalid curried parameters' };
        return { name, puzzleHashHex: result.hash, source: { file: filename, curriedParams: curry, compiledHex: result.hex } };
    } catch (error) {
        return { name, error: String(error?.message ?? error) };
    }
}
