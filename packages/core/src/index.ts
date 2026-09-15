export { StellarClient } from "./stellar/client.js";
export { createSponsoredAccount } from "./stellar/account.js";
export { setupMultisig, setupSessionKey, type SetupMultisigOpts, type SetupSessionKeyOpts } from "./stellar/multisig.js";
export { buildFeeBump } from "./stellar/transaction.js";
export { KNOWN_ASSETS, getAsset, getNativeAsset } from "./stellar/assets.js";
export { KeyManager } from "./keys/manager.js";
export { PasskeyManager, type PasskeyCredential, type PasskeyRegistrationOpts, type PasskeyAssertionOpts } from "./keys/passkey.js";
export { Wallet } from "./wallet/wallet.js";
export { Sep41Token } from "./stellar/sep41.js";
