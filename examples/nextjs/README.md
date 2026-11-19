# Next.js Example

Minimal `@lumen/react` integration for App Router projects.

## Overview

This example demonstrates how to integrate `@lumen/react` into a Next.js App Router project. It shows the minimal setup required to connect a Next.js application to a Lumen server, including environment configuration and the React provider wiring.

## Prerequisites

- Node.js 18 or later
- pnpm installed (`npm install -g pnpm`)
- A running Lumen server (default: `http://localhost:3000`)
- Dependencies installed from the repository root:

  ```bash
  pnpm install
  ```

## Install / Run

From the repository root, start the example dev server with the Lumen server URL configured:

```bash
NEXT_PUBLIC_LUMEN_SERVER_URL=http://localhost:3000 pnpm --filter @lumen/example-nextjs dev
```

Alternatively, from within `examples/nextjs`:

```bash
NEXT_PUBLIC_LUMEN_SERVER_URL=http://localhost:3000 pnpm dev
```

The dev server starts on the port configured by Next.js (default `http://localhost:3001` if `3000` is taken by the Lumen server).

## Expected output

- The terminal prints the Next.js startup banner and the local URL, e.g.:

  ```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3001
  - ready in XXX ms
  ```

- Opening the local URL in a browser renders the example page connected to the Lumen server.
- No errors appear in the browser console related to `@lumen/react` or the server connection.

## Screenshots

_Add a screenshot of the running example here (e.g. `screenshots/nextjs-home.png`)._