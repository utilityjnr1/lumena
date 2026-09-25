# Wallet Lifecycle

Lumena wallets move through four operational states:

1. Generated: a local keypair or passkey credential is created.
2. Sponsored: the sponsor account funds the wallet and pays the setup fee.
3. Protected: multisig is configured so the server co-signer enforces policy.
4. Active: payments, contract calls, and sponsored fee-bump submissions are available.

Recovery and closure should keep policy in sync with on-chain state. When a wallet is retired, remove stored policy, stop sponsor monitoring for the account, and use account merge only after balances, trustlines, and claimable balances are cleared.
