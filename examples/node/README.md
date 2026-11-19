# Node Server Wallet Example

## Overview

This example shows the minimum server-side setup for using `@lumen/core` with a Stellar testnet keypair. It demonstrates how to initialize the Lumen client from a server secret, derive the public key, and perform a basic wallet operation on testnet.

## Prerequisites

- Node.js 18 or later
- pnpm installed
- A Stellar testnet keypair (secret key starting with `S...`)
- Dependencies installed from the repository root:

```bash
pnpm install
```

## Install / Run

Run the example from the repository root, passing your testnet secret via the `LUMEN_SERVER_SECRET` environment variable:

```bash
LUMEN_SERVER_SECRET=S... pnpm --filter @lumen/example-node start
```

Alternatively, run it directly from the `examples/node` directory:

```bash
cd examples/node
LUMEN_SERVER_SECRET=S... pnpm start
```

## Expected output

On success, the example prints the derived public key and the result of the wallet operation, for example:

```
Lumen server wallet initialized
Public key: G...
Operation result: ...
```

If `LUMEN_SERVER_SECRET` is missing or invalid, the example exits with an error indicating the secret could not be loaded.

## Screenshots

_No screenshots yet. Add terminal captures of a successful run here._