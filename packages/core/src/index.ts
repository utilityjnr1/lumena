export { StellarClient } from "./stellar/client.js";
export { createSponsoredAccount } from "./stellar/account.js";
export { setupMultisig, setupSessionKey, type SetupMultisigOpts, type SetupSessionKeyOpts } from "./stellar/multisig.js";
export { buildFeeBump } from "./stellar/transaction.js";
export { KNOWN_ASSETS, getAsset, getNativeAsset } from "./stellar/assets.js";
export {
  changeTrust,
  claimClaimableBalance,
  mergeAccount,
  type ClaimClaimableBalanceOpts,
  type MergeAccountOpts,
  type TrustlineOpts,
} from "./stellar/account-helpers.js";
export { KeyManager } from "./keys/manager.js";
export { PasskeyManager, type PasskeyCredential, type PasskeyRegistrationOpts, type PasskeyAssertionOpts } from "./keys/passkey.js";
export { Wallet } from "./wallet/wallet.js";
export { Sep41Token } from "./stellar/sep41.js";
export { buildTimeBounds, validateTimeBounds, type TimeBoundsValidationOpts, type TimeBoundsValidationResult } from "./stellar/timebounds.js";
export { toScVal, fromScVal } from "./soroban/scval.js";
export { ContractClient } from "./soroban/client.js";
export {
  InMemoryWalletRegistry,
  RedisWalletRegistry,
  type WalletRegistry,
  type WalletRegistryEntry,
  type RedisWalletRegistryOpts,
} from "./wallet/registry.js";
