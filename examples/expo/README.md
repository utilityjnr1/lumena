# Lumen Expo example

This Expo app demonstrates native key generation from a BIP-39 mnemonic,
encrypted key persistence with Expo SecureStore, and a Stellar testnet payment
that the Lumen server co-signs and submits.

## Overview

The example shows how to:

- Generate a Stellar keypair natively from a BIP-39 mnemonic.
- Encrypt the local signer with a user passphrase before persisting its secret
  material in Expo SecureStore.
- Build and submit a co-signed Stellar testnet XLM payment, where the Lumen
  server acts as the sponsor/co-signer.

`react-native-quick-crypto` requires a native development build, so this example
does not run in Expo Go.

## Prerequisites

- Node.js and pnpm installed, with the workspace dependencies installed from
  the repository root (`pnpm install`).
- An Android emulator/device or, on macOS, an iOS simulator/device with the
  native toolchain set up.
- A running Lumen server exposing a public API URL.
- The server's Stellar co-signer public key (`G...`).
- A funded Stellar testnet destination account to receive the payment.

## Install and run

From the repository root, set the public API URL and the server's Stellar
co-signer public key:

```powershell
$env:EXPO_PUBLIC_LUMEN_SERVER_URL = "https://your-lumen-server.example"
$env:EXPO_PUBLIC_LUMEN_COSIGNER_PUBLIC_KEY = "G..."
```

Build the workspace packages before running the app so Metro can load their
compiled exports:

```powershell
pnpm --filter @lumen/core build
pnpm --filter @lumen/web-sdk build
pnpm --filter @lumen/react-native build
```

Build and install the native app first (Expo Go is not supported):

```powershell
pnpm --filter @lumen/example-expo android
```

On macOS, build the iOS app instead:

```powershell
pnpm --filter @lumen/example-expo ios
```

Then start the Expo dev server:

```powershell
pnpm --filter @lumen/example-expo start
```

## Expected output

- The app launches in the native development build and shows the wallet
  creation flow.
- Creating a testnet wallet with a strong passphrase displays a recovery phrase;
  record it offline.
- The passphrase encrypts the local signer before its secret material is
  persisted in SecureStore.
- Providing a funded testnet destination submits a co-signed XLM payment, and
  the app reports the submitted transaction.

The server URL and public key are public client configuration; never put a
sponsor secret or API secret in the Expo app.

## Screenshots

_Add screenshots of the wallet creation flow and a submitted co-signed payment
here._