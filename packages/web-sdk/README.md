# @lumen/web-sdk

Browser SDK for the Lumen wallet platform. Provides a simple client for creating seedless, gasless Stellar wallets and sending payments — no XLM required by the end user.

## Installation

```bash
pnpm add @lumen/web-sdk
```

## Quick start

`LumenClient` keeps created wallets in memory for the lifetime of the client instance. Set `serverUrl` to send payments through the Lumen policy, co-signing, and fee-bump endpoints.

```ts
import { LumenClient } from "@lumen/web-sdk";

const client = new LumenClient({
  network: "testnet",
  serverUrl: "http://localhost:3000",
  sponsorSecret: process.env.FEE_PAYER_SECRET!,
  serverPublicKey: process.env.COSIGNER_PUBLIC_KEY!,
});

const { address, id } = await client.createWallet();
console.log("Wallet created:", address);

const balance = await client.getBalance(id, "XLM");
console.log("Balance:", balance, "XLM");

const { hash } = await client.sendPayment(id, "GDEST...PUBKEY", "XLM", "10");
console.log("Payment submitted, tx hash:", hash);
```

The `id` returned by `createWallet` is the wallet's Stellar address. Keep `sponsorSecret` and all other Stellar secrets in a trusted server or local/testnet context; do not expose a sponsor secret to browser code.

## API reference

### `new LumenClient(opts)`

| Option | Type | Required | Description |
|---|---|---|---|
| `network` | `"testnet" \| "mainnet" \| "local"` | No | Defaults to `"testnet"` |
| `horizonUrl` | `string` | No | Override the Horizon REST endpoint |
| `rpcUrl` | `string` | No | Override the Soroban RPC endpoint |
| `serverUrl` | `string` | No | Base URL of a Lumen server; required for sending payments through policy enforcement and fee sponsorship |
| `sponsorSecret` | `string` | Yes | Secret key used to sponsor account creation |
| `serverPublicKey` | `string` | Yes | Public key of the server co-signer |

The signatures below use `PasskeyRegistrationOpts`, `PasskeyWalletResult`, and `SessionKeyInfo` exported by `@lumen/web-sdk`. `Wallet` is exported by `@lumen/core`; `ScValInput` and `ContractSimulationResult` are exported by `@lumen/types`.

### `LumenClient` methods

| Method | TypeScript signature | Purpose | Brief example |
|---|---|---|---|
| `createWallet` | `createWallet(): Promise<{ address: string; id: string }>` | Sponsors a new account and configures 2-of-2 multisig. | `const { id } = await client.createWallet();` |
| `createWalletWithPasskey` | `createWalletWithPasskey(opts?: PasskeyRegistrationOpts): Promise<PasskeyWalletResult>` | Registers a passkey, then creates a passkey-controlled wallet. | `const { id } = await client.createWalletWithPasskey({ username: "alice" });` |
| `signWithPasskey` | `signWithPasskey(opts: { credentialId?: string; transactionXdr: string; username?: string }): Promise<{ signedXdr: string; publicKey: string }>` | Authenticates with a passkey and signs a transaction XDR. | `const { signedXdr } = await client.signWithPasskey({ transactionXdr, username: "alice" });` |
| `getWallet` | `getWallet(id: string): Wallet \| undefined` | Returns the in-memory core wallet, or `undefined` when the ID is unknown. | `const wallet = client.getWallet(id);` |
| `getBalance` | `getBalance(id: string, assetCode?: string): Promise<string>` | Reads a native XLM or supported issued-asset balance. | `const balance = await client.getBalance(id, "XLM");` |
| `sendPayment` | `sendPayment(id: string, destination: string, assetCode: string, amount: string): Promise<{ hash: string }>` | Builds and submits a payment through the configured server path. | `const { hash } = await client.sendPayment(id, destination, "XLM", "10");` |
| `simulateContract` | `simulateContract(id: string, contractId: string, method: string, args?: ScValInput[]): Promise<ContractSimulationResult>` | Simulates a Soroban contract method without signing or submitting. | `const result = await client.simulateContract(id, contractId, "get_balance", [address]);` |
| `invokeContract` | `invokeContract(id: string, contractId: string, method: string, args?: ScValInput[], fee?: string): Promise<{ hash: string }>` | Signs and submits a Soroban contract invocation with an optional fee override. | `const { hash } = await client.invokeContract(id, contractId, "transfer", [{ value: "10", type: "i128" }]);` |
| `createSessionKey` | `createSessionKey(durationSeconds: number = 3600): SessionKeyInfo` | Generates a session keypair and expiry timestamp. | `const session = client.createSessionKey(3600);` |

### Method details

#### `createWallet`

Returns the newly created Stellar address and stores the core `Wallet` in the client for later lookups. The default starting balance is 10 XLM, and the configured server key is added as the second signer with a 2-of-2 threshold.

#### `createWalletWithPasskey`

The `username` option is required when an options object is supplied. The returned `keypair` contains signing material and should be handled as sensitive. The method registers a passkey and creates the sponsored multisig account; it does not restore a wallet after the client is recreated.

#### `signWithPasskey`

The transaction XDR must use the same network passphrase configured on the client. This method signs the transaction but does not co-sign, check policy, create a fee bump, or submit it.

#### `getWallet`

Wallet IDs are instance-local and are not persisted. An unknown ID returns `undefined`.

#### `getBalance`

Omit `assetCode` or pass `"XLM"` for native XLM. Non-native asset codes are case-sensitive and must be in the network's supported `KNOWN_ASSETS` map. The result is the raw Horizon balance string, or `"0"` when the asset has no balance.

#### `sendPayment`

Submits an owner-signed XDR to `/cosign`, then submits the co-signed XDR to `/fee-bump/submit`; the server is responsible for policy evaluation, co-signing, fee bumping, and submission. A `serverUrl` is required; payments fail explicitly if one is not configured rather than bypassing policy enforcement or fee sponsorship.

#### `simulateContract`

`args` accepts the SDK's `ScValInput` values. Simulation does not sign, co-sign, apply policy, or submit a transaction. A failed simulation is normally returned as `{ successful: false, error: string }`.

#### `invokeContract`

`fee` is an optional transaction fee string. This method signs and submits directly through the core wallet; it does not use `serverUrl` for co-signing, policy enforcement, or fee bumping.

#### `createSessionKey`

The default duration is 3,600 seconds. `SessionKeyInfo` includes `keypair`, `publicKey`, `secretKey`, and an `expiresAt` epoch-millisecond timestamp. This method generates a key only; it does not attach the key to a wallet, rotate it, revoke it, or enforce its expiry.

The package also exports standalone delegates:

```ts
createSessionKey(durationSeconds?: number): SessionKeyInfo;
createWalletWithPasskey(client: LumenClient, opts?: PasskeyRegistrationOpts): Promise<PasskeyWalletResult>;
signWithPasskey(client: LumenClient, opts: { credentialId?: string; transactionXdr: string; username?: string }): Promise<{ signedXdr: string; publicKey: string }>;
```

## Environment variables

The SDK does not read environment variables automatically. Pass the values to the constructor explicitly. The server process can use the variables below:

```env
FEE_PAYER_SECRET=S...
COSIGNER_PUBLIC_KEY=G...
STELLAR_NETWORK=testnet
```

See `.env.example` at the repository root for the full server configuration. Never place a Stellar secret in client-side code or commit one to version control.

## How it works

1. `createWallet` sponsors the account reserve and configures 2-of-2 multisig with the server co-signer.
2. `sendPayment` sends the owner-signed transaction to the server for policy evaluation and co-signing, then submits the fee-bumped transaction. A configured `serverUrl` is required.
3. `simulateContract` only simulates; `invokeContract` signs and submits directly through the core wallet without the server policy, co-signer, or fee-bump path.

## Development

You can develop `@lumen/web-sdk` in isolation without running the entire monorepo.

### Prerequisites

1. **Install Dependencies**: Ensure monorepo dependencies are installed from repository root:
   ```bash
   pnpm install
   ```

2. **Build Dependencies**: Build internal workspace dependencies (`@lumen/core`, `@lumen/types`):
   ```bash
   pnpm build
   ```

3. **(Optional) Local Network & Server**: If running integration or E2E tests against a local Stellar node:
   ```bash
   # Start local Stellar standalone container
   docker compose -f docker/docker-compose.yml up -d stellar

   # Start the Lumen server
   pnpm --filter @lumen/server dev
   ```

### Running in Development Mode

Run TypeScript in watch mode to automatically compile changes from `src/` to `dist/`:

```bash
pnpm --filter @lumen/web-sdk dev
```

### Additional Package Scripts

```bash
# Run unit tests
pnpm --filter @lumen/web-sdk test

# Typecheck source files
pnpm --filter @lumen/web-sdk typecheck

# Lint source files
pnpm --filter @lumen/web-sdk lint

# Build production bundle
pnpm --filter @lumen/web-sdk build

# Clean build artifacts
pnpm --filter @lumen/web-sdk clean
```

## License

MIT
