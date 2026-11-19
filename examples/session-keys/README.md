# Lumen Session Keys Demo

## Overview

An interactive **Vite + React** application demonstrating Lumen's **session key** pattern — enabling instant micropayments and rapid actions without displaying a wallet signing prompt for every transaction.

### What This Demo Shows

| Feature | Description |
| --- | --- |
| **Session key creation** | Generates a scoped ed25519 keypair via `@lumen/web-sdk` valid for 5 minutes with a 10 XLM spend cap. |
| **Instant micropayments** | A rapid-action "Tip 0.1 XLM" button sends payments instantly using the session key — no popup, no extra confirmation. |
| **Live spend allowance** | A real-time progress bar shows how much of the 10 XLM cap has been used. |
| **Countdown timer** | A countdown shows remaining session validity; the key expires automatically after 5 minutes. |
| **Manual revocation** | A "Revoke Session Key" button immediately invalidates the session key on-chain. |
| **Event log** | A live log panel shows every event (session created, payment sent, revocation, errors). |

---

## 🏗️ How Session Keys Work in Lumen

```
1. App creates a random ed25519 keypair (the session key)
2. Session key is registered on the wallet account as a scoped signer
   with a spend limit rule enforced by the PolicyEngine
3. Subsequent transactions are signed by the session key (no user prompt)
4. Server co-signs after verifying the spend cap and time bounds
5. Server fee-bumps the transaction (user pays zero XLM in fees)
6. On expiry or manual revocation, the signer weight is removed on-chain
```

For a detailed walkthrough see [docs/guides/gasless-transactions.md](../../docs/guides/gasless-transactions.md).

---

## Prerequisites

- Node.js 20+
- pnpm
- The `@lumen/server` co-signer running locally (see below)

## Install

From the repository root:

```bash
pnpm install
```

## Run

### 1. Start `@lumen/server`

The demo communicates with the Lumen co-signer server. Start it first:

```bash
pnpm --filter @lumen/server dev
```

The server starts on `http://localhost:3000`.

### 2. Start the session-keys demo

```bash
pnpm --filter session-keys dev
```

Navigate to **`http://localhost:5174`** in your browser (the dev server port is set in `vite.config.ts`).

### 3. Walk through the demo

1. **Create a seedless wallet** — click "Create Seedless Wallet". The server provisions and sponsors the account.
2. **Create a session key** — click "Create Session Key". A 5-minute scoped keypair is generated and registered on the wallet.
3. **Send instant micropayments** — click "⚡ Tip 0.1 XLM" repeatedly. Each tap sends 0.1 XLM with no signing prompt. Watch the spend allowance bar fill up.
4. **Observe expiry** — the countdown timer shows remaining session validity. The key expires automatically after 5 minutes.
5. **Revoke manually** — click "Revoke Session Key" to invalidate the session key before it expires.

## Expected Output

- The wallet panel shows a funded, sponsored account after "Create Seedless Wallet".
- After "Create Session Key", the countdown timer starts at 5:00 and the spend allowance bar shows 0 / 10 XLM used.
- Each "⚡ Tip 0.1 XLM" tap sends instantly with no signing prompt; the allowance bar advances by 0.1 XLM per tap.
- The event log records each action (session created, payment sent, revocation, errors).
- When the timer reaches 0:00 or "Revoke Session Key" is clicked, further tips are rejected and the log shows the session as expired/revoked.

## Screenshots

_Add screenshots of the wallet panel, active session key with countdown, and the event log here._

---

## 🛠️ Architecture

```
examples/session-keys/
├── src/
│   ├── App.tsx       # Main demo UI — wallet, session key, micropayments, log
│   ├── main.tsx      # React entrypoint
│   └── index.css     # Dark mode design system
├── index.html        # HTML template
├── package.json      # Dependencies (mirrors examples/playground)
├── tsconfig.json     # TypeScript config
├── vite.config.ts    # Vite dev server on port 5174
└── README.md         # This file
```

---

## Related Packages

| Package | Role |
| --- | --- |
| `@lumen/web-sdk` | `LumenClient.createSessionKey()` — generates the scoped keypair |
| `@lumen/core` | `setupSessionKey()` — registers the keypair as a multisig signer |
| `@lumen/server` | `POST /session-key` — validates and persists the session key policy |
| `@lumen/server` | `POST /cosign` — enforces spend cap before co-signing |

---

## Further Reading

- [Examples index](../README.md)
- [Lumen README](../../README.md)
- [docs/guides/gasless-transactions.md](../../docs/guides/gasless-transactions.md)
- [Session Keys & Scoped Temporary Delegation (Issue #11)](https://github.com/utilityjnr1/lumena/issues/11)
