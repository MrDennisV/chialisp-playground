# ChiaLisp Playground

**Interactive learning platform for ChiaLisp blockchain programming**

🚀 **[Try it Live](https://chialisp.mrdennis.dev/)** - No installation required

---

## What is ChiaLisp Playground?

A web-based interactive environment where you can learn ChiaLisp through hands-on examples. Perfect for blockchain developers, beginners wanting to understand Chia's smart contract language, and educators teaching blockchain programming concepts.

**Key Features:**
- 70 practical examples with explanations
- VS Code-like editor with syntax highlighting
- Instant code compilation and execution
- Progressive difficulty levels from basics to advanced
- Real-time feedback and learning

## What You Can Learn

**70 hands-on examples covering:**
- 🌱 **Fundamentals** - Variables, data types, basic operations
- 🔧 **Functions** - Creating reusable code, higher-order functions, recursion, sorting  
- 🔐 **Cryptography** - Hash functions, digital signatures, BLS verification, Merkle proofs, coin IDs
- 🎲 **Fair Play** - Commit-reveal, shared randomness, verifiable shuffles
- ⛓️ **Blockchain** - Conditions, signature-locked coins, time locks, HTLCs, announcements
- 🚀 **Modern ChiaLisp** - Macros, advanced patterns, optimization

From beginner "Hello World" to advanced blockchain smart contracts.

## How to Use

1. **Open the [live demo](https://chialisp.mrdennis.dev/)**
2. **Browse examples** in the sidebar by category
3. **Click any example** to load it into the editor
4. **Press the "Run" button** to execute and see results
5. **Experiment!** Modify the code and learn by doing

## Quick Start (Local Development)

Want to run it locally or contribute?

```bash
# Clone the repository
git clone https://github.com/MrDennisV/chialisp-playground.git
cd chialisp-playground

# Start the server
python -m http.server 8080

# Open in your browser
# http://localhost:8080
```

**Requirements:** Python 3.x (no additional dependencies needed)

## Adding New Examples

1. Create your `.clsp` file in the appropriate `examples/` subdirectory
2. Add entry to `examples/examples.json` with metadata
3. Include description and suggested solution arguments
4. Run `npm test` to check that it compiles and runs with those arguments

## Running Tests

The tests run the playground's real compiler and runner (the same WASM the site uses) in Node, no browser needed. Node 22+ is required; there is nothing to install.

```bash
npm test
```

They check that every example in `examples.json` exists, compiles and runs with its default arguments, that no `.clsp` file is left unlisted, and that curried parameters, includes and error reporting behave correctly.

## Blockchain Simulator

The cubes icon opens a local simulated blockchain (Chia Wallet SDK simulator, in your browser):

- **Start / Pause / Next** farm blocks. Each block adds 18.75 s of chain time on average, Chia's block time, so time and height locks line up like on mainnet (4,608 blocks = 1 day).
- **Wallets** Alice and Bob start with 10 XCH. Their keys come from their names, so their addresses never change. Create more with **+ New**.
- **Send XCH** from the faucet or a wallet. Transactions wait in the mempool until the next block; the summary shows the coins spent, the change and the fee.
- **this puzzle** sends to the address of the program open in the editor (with its curried parameters): that is how you lock XCH in a contract.
- The chain is saved in your browser and restored, paused, when you come back. **Reset** starts over.

Simulated keys are derived from public names: never send real funds to these addresses.

UI tests drive the simulator in a real browser:

```bash
npm install
npx playwright install chromium
npm run test:ui
```

## Built With

- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** - VS Code editor in the browser
- **ChiaLisp Language Server** - Based on [Chia Network's official LSP](https://github.com/Chia-Network/vscode-chialisp-lsp)
- **Python HTTP Server** - Built-in Python web server (no dependencies)
- **Bootstrap/MDB** - Modern UI components

## Who This Is For

- **Blockchain Developers** learning ChiaLisp for Chia Network development
- **Beginners** wanting hands-on practice with functional programming concepts
- **Educators** teaching blockchain and smart contract programming
- **Chia Community Members** exploring advanced ChiaLisp patterns

## About

Created by **[@MrDennisV](https://x.com/MrDennisV)** as an educational resource for the ChiaLisp community.

**Educational Mission:** Make ChiaLisp accessible through interactive learning, practical examples, and hands-on experimentation.

### Support the Project

If this playground helps you learn ChiaLisp, consider supporting its development:

**XCH:** `xch1a63283n8rh7yksz03774s5jaq2rw5f4je5w3f7ux7esw9y6allusdrlhg5`

### Contributing

Contributions are welcome! Whether it's:
- Adding new examples
- Improving existing tutorials
- Fixing bugs
- Enhancing the UI/UX
- Writing documentation

Please feel free to open issues and pull requests.

---

**Learn by doing. Code with confidence. Build the future of blockchain.**
