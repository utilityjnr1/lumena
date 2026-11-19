# Examples

This directory contains runnable examples that demonstrate how to integrate and use the SDK in different environments. Each example is self-contained and includes its own `README.md` with detailed instructions.

## Index

| Example | What it demonstrates | How to run | README |
| --- | --- | --- | --- |
| `expo` | Using the SDK in an Expo (React Native) mobile app, including setup and native configuration. | `cd expo && npm install && npm start` | [expo/README.md](./expo/README.md) |
| `nextjs` | Integrating the SDK into a Next.js web application, including server/client boundaries. | `cd nextjs && npm install && npm run dev` | [nextjs/README.md](./nextjs/README.md) |
| `node` | Using the SDK in a plain Node.js script/server environment. | `cd node && npm install && npm start` | [node/README.md](./node/README.md) |
| `playground` | An interactive sandbox for experimenting with SDK features and options. | `cd playground && npm install && npm run dev` | [playground/README.md](./playground/README.md) |
| `session-keys` | Managing and using session keys with the SDK. | `cd session-keys && npm install && npm start` | [session-keys/README.md](./session-keys/README.md) |

## Shared README template

Each example's `README.md` follows a consistent structure so you can move between examples easily:

1. **Overview** — what the example demonstrates and when to use it.
2. **Prerequisites** — required tools, versions, and any environment variables or credentials.
3. **Install / Run** — step-by-step commands to install dependencies and start the example.
4. **Expected output** — what you should see when the example runs successfully.
5. **Screenshots** — visual references (where applicable) showing the example in action.

> **Note:** Run steps assume you are starting from the repository root. Always `cd` into the example directory before installing and running.