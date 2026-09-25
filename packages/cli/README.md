# `@lumen/cli`

Command-Line Interface (CLI) tool for inspecting wallets, managing policy specs, monitoring sponsor balances, and decoding transactions in the Lumen ecosystem.

## Installation

```bash
# Executable directly via npx
npx @lumen/cli --help
```

## Commands Reference

### 1. `lumen status`
Checks the health of the Lumen server and the fee-sponsor account balance.

```bash
npx @lumen/cli status --server http://localhost:3000
```

### 2. `lumen policy get <walletId>`
Retrieves and displays the active policy rules for the specified wallet ID.

```bash
npx @lumen/cli policy get G...
```

### 3. `lumen policy set <file.json>`
Applies policy rules defined in a JSON file to a wallet.

```bash
npx @lumen/cli policy set ./policy-spec.json
```

### 4. `lumen policy delete <walletId>`
Removes the policy for the specified wallet ID.

```bash
npx @lumen/cli policy delete G...
```

### 5. `lumen wallet create`
Triggers creation of a new test sponsored wallet on the server.

```bash
npx @lumen/cli wallet create
```

### 6. `lumen wallet balance <address>`
Queries Horizon for all asset balances held by the specified address. Defaults to Stellar Testnet; use `--network` to select `mainnet` or `local`, or `--horizon-url` to provide a custom Horizon URL.

```bash
npx @lumen/cli wallet balance G... --network testnet
```

### 7. `lumen cosign inspect <xdr>`
Decodes transaction XDR, displays operation details, and simulates policy checks.

```bash
npx @lumen/cli cosign inspect "AAAAAgAAA..."
```

### 8. `lumen cosign submit <xdr> <walletAddress>`
Submits a signed transaction XDR to the server's `/cosign` endpoint for policy validation and co-signing.

```bash
npx @lumen/cli cosign submit "AAAAAgAAA..." G...
```

---

## Development

You can run and develop `@lumen/cli` in isolation without running the entire monorepo.

### Prerequisites

1. **Install Dependencies**: Install dependencies from the repository root:
   ```bash
   pnpm install
   ```

2. **Build Dependent Packages**: Build the monorepo dependencies (`@lumen/core` and `@lumen/types`):
   ```bash
   pnpm build
   ```

3. **(Optional) Start Server & Network**: To run commands communicating with the backend (`status`, `wallet create`, `policy`):
   ```bash
   # Start local Stellar standalone container
   docker compose -f docker/docker-compose.yml up -d stellar

   # Start the Lumen server
   pnpm --filter @lumen/server dev
   ```

### Running in Development Mode

Run TypeScript in watch mode to automatically compile `src/` to `dist/` on changes:

```bash
pnpm --filter @lumen/cli dev
```

### Running the Local CLI Binary

Test commands with your local build:

```bash
node packages/cli/bin/lumen.js --help
node packages/cli/bin/lumen.js status --server http://localhost:3000
```

### Additional Package Scripts

From the repository root:

```bash
# Typecheck TypeScript files
pnpm --filter @lumen/cli typecheck

# Lint source files
pnpm --filter @lumen/cli lint

# Build CLI package
pnpm --filter @lumen/cli build

# Clean build artifacts
pnpm --filter @lumen/cli clean
```

---

## License

MIT
