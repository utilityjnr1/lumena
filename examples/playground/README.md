# Lumen Playground Example App

## Overview

An interactive Vite + React demonstration application showcasing **seedless wallet onboarding**, **gasless transaction signing**, and **spend limit policy enforcement** powered by `@lumen/web-sdk` and `@lumen/server`.

---

## 🌟 Key Features

1. **Seedless Wallet Onboarding**: Create co-managed Stellar wallets provisioned without private key management.
2. **Wallet Balance Inspector**: View native XLM and Soroban USDC token balances.
3. **Gasless Payments**: Submit sponsored payments where fee bumps and co-signatures are handled seamlessly.
4. **Policy Enforcement Controls**: Set spend limit, velocity, and destination allowlist policies directly on the co-signer policy engine.
5. **Live Log Inspector**: Detailed real-time view of transaction XDRs, co-sign responses, and server policy evaluations.

---

## Prerequisites

- Node.js 18+ and `pnpm` installed at the root of the workspace.
- Dependencies installed from the repository root:
  ```bash
  pnpm install
  ```

---

## Install & Run

### 1. Start `@lumen/server`
Before launching the playground, start the co-signer and fee sponsor server:
```bash
pnpm --filter @lumen/server dev
```
The server will start listening on `http://localhost:3000`.

### 2. Start Playground Development Server
In a separate terminal, launch the playground app:
```bash
pnpm --filter playground dev
```

### 3. Open in Browser
Navigate to `http://localhost:5173` to test and interact with the application.

---

## Expected Output

- The `@lumen/server` terminal logs that the co-signer and fee sponsor are listening on `http://localhost:3000`.
- The playground terminal prints the Vite dev server URL (`http://localhost:5173`).
- Opening the browser shows the playground UI with the wallet onboarding, balance inspector, payment, and policy controls.
- The live log inspector displays transaction XDRs, co-sign responses, and server policy evaluations as you interact with the app.

---

## Screenshots

_No screenshots are checked in yet. Add images under `examples/playground/docs/` and reference them here._

---

## 🛠️ Architecture

```
examples/playground/
├── src/
│   ├── App.tsx          # Main interactive interface & components
│   ├── main.tsx         # Application entrypoint
│   └── index.css        # Glassmorphism dark mode UI design system
├── index.html           # HTML template
├── package.json         # Package configuration
├── vite.config.ts       # Vite bundler configuration
└── README.md            # Setup documentation
```

## Full Wallet Flow

Use the playground to create a wallet, inspect its funded account address, configure a policy, submit a sponsored payment, and review the live log output. Keep `@lumen/server` running while using the playground because co-signing and fee-bump submission are server-backed flows.
