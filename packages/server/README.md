# @lumen/server

Server-side daemon and HTTP API service for the Lumen non-custodial wallet ecosystem. Provides policy-enforced transaction co-signing, gasless fee-bump envelope sponsorship, sponsored account creation, and SEP-10 Web Authentication.

---

## Features

- **Co-Signing Engine**: 2-of-2 multisig transaction validation with configurable spending policies (spend limits, velocity tracking, destination allowlists).
- **Fee Sponsorship**: Wraps approved user transactions in Stellar fee-bump envelopes so end users pay zero XLM transaction fees.
- **Transaction Webhooks**: Notifies subscribed endpoints of successful fee-bump submissions with the `transaction.fee_bump.submitted` event.
- **Sponsored Account Creation**: Creates new Stellar keypairs and funds initial account reserves.
- **SEP-10 Web Authentication**: Standardized challenge-response authentication for Stellar accounts with JWT issuance.
- **Hardware Signer Support**: Supports environment variable keys (`EnvSigner`) for development/testnet and AWS KMS / CloudHSM (`AwsKmsSigner`) for production.

---

## Development

You can run and test `@lumen/server` in isolation from the root of the monorepo without running other services.

### Prerequisites

1. **Docker (Local Stellar Network)**:
   The server requires access to a running Stellar Horizon and Soroban RPC instance. Start the local standalone container via Docker Compose from the repository root:

   ```bash
   docker compose -f docker/docker-compose.yml up -d stellar
   ```

2. **Environment Configuration**:
   Ensure `.env` exists in the repository root with required keys (run `pnpm setup` or copy `.env.example` to `.env`):

   ```bash
   cp .env.example .env
   ```

   Key environment variables:
   ```env
   STELLAR_NETWORK=local
   HORIZON_URL=http://localhost:8000
   SOROBAN_RPC_URL=http://localhost:8000/rpc
   SIGNER_PROVIDER=env
   COSIGNER_SECRET=S...
   FEE_PAYER_SECRET=S...
   PORT=3000
   LUMEN_LOG_LEVEL=debug
   ```

3. **Build Monorepo Dependencies**:
   Before running the server, build all workspace dependencies (`@lumen/core`, `@lumen/types`):

   ```bash
   pnpm build
   ```

### Running in Development Mode

Run the server with automatic reloading upon code changes:

```bash
pnpm --filter @lumen/server dev
```

The server listens on `http://localhost:3000` (or the configured `PORT`).

### Additional Package Scripts

Run checks and tests specifically for `@lumen/server`:

```bash
# Run unit tests
pnpm --filter @lumen/server test

# Typecheck TypeScript files
pnpm --filter @lumen/server typecheck

# Lint source code
pnpm --filter @lumen/server lint

# Clean build artifacts
pnpm --filter @lumen/server clean
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/wallet/create` | Sponsors account creation and configures 2-of-2 multisig |
| `GET` | `/wallet/:address/transactions` | Retrieves a wallet's recent Stellar transactions (`limit` and `cursor` supported) |
| `GET` | `/wallet/:address/balance` | Retrieves a wallet's native and trustline balances |
| `POST` | `/cosign` | Validates transaction against policy and appends co-signer signature |
| `POST` | `/fee-bump` | Wraps transaction in a fee-bump envelope signed by fee-payer |
| `GET` | `/policy/:walletId` | Retrieves the active policy spec for a wallet |
| `POST` | `/policy` | Sets or updates policy rules for a wallet |
| `DELETE` | `/policy/:walletId` | Deletes the policy specification for a wallet |
| `GET` | `/status` | Server health check and fee-sponsor balance |
| `GET` | `/.well-known/stellar.toml` | Serves SEP-10 discovery TOML |
| `GET` | `/auth` | Generates a SEP-10 challenge transaction |
| `POST` | `/auth` | Verifies signed challenge and issues JWT |
| `GET` | `/metrics` | Prometheus metrics endpoint |
| `GET` | `/docs` | Interactive Swagger / OpenAPI documentation |

---

## Webhook Events

Register `transaction.fee_bump.submitted` to receive a webhook after a fee-bump transaction is successfully submitted to Stellar. The payload data includes the fee source and submitted transaction hash. This event is dispatched alongside the existing `transaction.sponsored` event.

---

## Authentication & Security

### CORS
Cross-origin access is disabled by default. Configure the `cors` option in `ServerOpts` to allow only the origins your application uses:

```typescript
const { app } = createServer({
  // ...
  cors: { origin: ["https://app.example.com"] },
});
```

### API Key Protection
To protect server endpoints in non-localhost deployments, configure the `apiKey` option in `ServerOpts` (or set `API_KEY` in your environment):

```typescript
import { createServer } from "@lumen/server";

const { app } = createServer({
  // ...
  apiKey: process.env.API_KEY, // e.g. "secret-token-xyz"
});
```

When `apiKey` is set:
- All routes **except** `/health` and `/metrics` require an `Authorization` header:
  ```http
  Authorization: Bearer <api-key>
  ```
- If the header is missing, malformed, or contains an invalid key, the server responds with:
  ```json
  HTTP/1.1 401 Unauthorized
  { "error": "Unauthorized" }
  ```
- `/health` and `/metrics` remain open for liveness probes, monitoring, and load balancer health checks.

### Rate Limiting
The server includes built-in rate limiting powered by `express-rate-limit` on the `/cosign` and `/fee-bump` endpoints to prevent DoS attacks and protect sponsor funds.

Configure `windowMs` and `max` in `ServerOpts` (or via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` environment variables):

```typescript
const { app } = createServer({
  // ...
  windowMs: 60 * 1000, // 1 minute window (default: 60000ms)
  max: 100,            // max requests per window per IP (default: 100)
});
```

When the limit is exceeded, the server returns:
```json
HTTP/1.1 429 Too Many Requests
{ "error": "Too Many Requests" }
```

### Policy Stores & Persistence
In addition to `InMemoryPolicyStore` and `RedisPolicyStore`, `@lumen/server` provides `FilePolicyStore` to persist policies across server restarts using a local JSON file:

```typescript
import { FilePolicyStore } from "@lumen/server";

const policyStore = new FilePolicyStore("./data/policies.json");
```
`FilePolicyStore` atomically writes updates on `savePolicy` and `deletePolicy` calls and reloads existing policies upon startup.

---

## License

MIT
