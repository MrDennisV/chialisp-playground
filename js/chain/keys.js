export const ADDRESS_PREFIX = 'txch';

const SEED_NAMESPACE = 'chialisp-playground:';
const HEX_PUZZLE_HASH = /^0x[0-9a-fA-F]{64}$/;
const ACCEPTED_PREFIXES = ['txch', 'xch'];
const DESTINATION_ERROR = 'Enter a txch1… or xch1… address, or a 0x puzzle hash';

/** Simulator wallets derive their keys from their public name, so anyone can recompute them. */
export function walletKeys(sdk, name) {
    const seed = sdk.sha256(new TextEncoder().encode(SEED_NAMESPACE + name.trim().toLowerCase()));
    const secretKey = sdk.SecretKey.fromSeed(seed).deriveSynthetic();
    const publicKey = secretKey.publicKey();
    const puzzleHashHex = sdk.toHex(sdk.standardPuzzleHash(publicKey));
    return {
        secretKey,
        publicKey,
        publicKeyHex: sdk.toHex(publicKey.toBytes()),
        puzzleHashHex,
        address: encodeAddress(sdk, puzzleHashHex),
    };
}

export function encodeAddress(sdk, puzzleHashHex) {
    return new sdk.Address(sdk.fromHex(puzzleHashHex), ADDRESS_PREFIX).encode();
}

export function parseDestination(sdk, input) {
    const value = String(input).trim();
    if (HEX_PUZZLE_HASH.test(value)) return { puzzleHashHex: value.slice(2).toLowerCase(), mainnet: false };

    let decoded = null;
    try {
        decoded = sdk.Address.decode(value);
    } catch {
        throw new Error(DESTINATION_ERROR);
    }
    if (!ACCEPTED_PREFIXES.includes(decoded.prefix) || decoded.puzzleHash.length !== 32) throw new Error(DESTINATION_ERROR);
    return { puzzleHashHex: sdk.toHex(decoded.puzzleHash), mainnet: decoded.prefix === 'xch' };
}
