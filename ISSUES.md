# Open Issues & Development Roadmap

Welcome to the **Lumen** open-source roadmap! We welcome contributions from developers of all skill levels. Whether you are looking for a `good first issue` or a complex architecture challenge, there is an open issue for you.

To start contributing:
1. **Fork the repository** to your personal GitHub account.
2. **Clone your fork**: `git clone https://github.com/<your-username>/lumena.git`
3. **Pick an issue** from the directory below or on [GitHub Issues](https://github.com/utilityjnr1/lumena/issues).
4. **Create a branch**: `git checkout -b feature/issue-<number>`
5. **Submit a Pull Request** referencing the issue number!

---

## Issue Directory

| # | Issue Title | Category | Status | GitHub Link |
|---|---|---|---|---|
| 1 | `[Feature] Redis / Database Persistence Driver for PolicyEngine` | Server / Architecture | `Completed` | [#1](https://github.com/utilityjnr1/lumena/issues/1) |
| 2 | `[Security] Multi-Operation & Path Payment Validation in PolicyEngine` | Security / Engine | `Completed` | [#2](https://github.com/utilityjnr1/lumena/issues/2) |
| 3 | `[Feature] Asset-Specific Spend Limits in PolicyEngine` | Policy Engine | `Completed` | [#3](https://github.com/utilityjnr1/lumena/issues/3) |
| 4 | `[Feature] API Authentication & Rate Limiting Middleware for Server` | Security / Server | `Completed` | [#4](https://github.com/utilityjnr1/lumena/issues/4) |
| 5 | `[DX] React Context Provider and Custom Hooks Package (@lumen/react)` | Frontend / React | `Completed` | [#5](https://github.com/utilityjnr1/lumena/issues/5) |
| 6 | `[Feature] Soroban Smart Contract Invocation Support in Core & SDK` | Stellar / Soroban | `Completed` | [#6](https://github.com/utilityjnr1/lumena/issues/6) |
| 7 | `[Feature] Google Cloud KMS & HashiCorp Vault Signer Implementations` | Cloud / KMS | `Completed` | [#7](https://github.com/utilityjnr1/lumena/issues/7) |
| 8 | `[Feature] Webhooks Notification Dispatcher in Server` | Server / Webhooks | `Completed` | [#8](https://github.com/utilityjnr1/lumena/issues/8) |
| 9 | `[Feature] TimeBounds & Expiration Enforcement on Cosigned Transactions` | Security | `Completed` | [#9](https://github.com/utilityjnr1/lumena/issues/9) |
| 10 | `[Feature] Sponsor Account Balance Monitoring & Alerting` | Server / DevOps | `Completed` | [#10](https://github.com/utilityjnr1/lumena/issues/10) |
| 11 | `[Feature] Session Keys & Scoped Temporary Delegation` | Cryptography / Core | `Completed` | [#11](https://github.com/utilityjnr1/lumena/issues/11) |
| 12 | `[Feature] Administrative Command-Line Tool (@lumen/cli)` | Tooling / CLI | `Completed` | [#12](https://github.com/utilityjnr1/lumena/issues/12) |
| 13 | `[Feature] Prometheus Metrics & Health Details Endpoint` | Observability | `Completed` | [#13](https://github.com/utilityjnr1/lumena/issues/13) |
| 14 | `[Feature] WebAuthn / Passkey Signer Integration` | Authentication | `Completed` | [#14](https://github.com/utilityjnr1/lumena/issues/14) |
| 15 | `[DX] Structured Logging Framework with Pino` | Observability | `Completed` | [#15](https://github.com/utilityjnr1/lumena/issues/15) |
| 16 | `[Feature] OpenAPI / Swagger Spec & UI for Server API` | Documentation | `Completed` | [#16](https://github.com/utilityjnr1/lumena/issues/16) |
| 17 | `[DX] Interactive Playground Example App (examples/playground)` | Example App | `Completed` | [#17](https://github.com/utilityjnr1/lumena/issues/17) |
| 18 | `[Feature] SEP-41 Soroban Token Helpers in Web SDK` | Soroban / Web SDK | `Completed` | [#18](https://github.com/utilityjnr1/lumena/issues/18) |
| 19 | `[Testing] End-to-End E2E Browser Test Suite with Playwright` | Testing | `Completed` | [#19](https://github.com/utilityjnr1/lumena/issues/19) |
| 20 | `[CI/CD] GitHub Actions Workflows & Issue Templates` | CI/CD / DevOps | `Completed` | [#20](https://github.com/utilityjnr1/lumena/issues/20) |

### Active Contributor Issues (Batch #162 – #191)

| # | Issue Title | Category | Status | GitHub Link |
|---|---|---|---|---|
| 162 | `[Feature] Add BIP-39 mnemonic phrase wallet generation and recovery to KeyManager` | Core / Keys | `Open` | [#162](https://github.com/utilityjnr1/lumena/issues/162) |
| 163 | `[Feature] Add revokeSessionKey helper function to @lumen/core` | Core / Stellar | `Open` | [#163](https://github.com/utilityjnr1/lumena/issues/163) |
| 164 | `[Feature] Support Futurenet network configuration in StellarClient` | Core / Soroban | `Open` | [#164](https://github.com/utilityjnr1/lumena/issues/164) |
| 165 | `[Feature] Add parseAsset and formatAsset utility helpers to @lumen/core` | Core / Stellar | `Open` | [#165](https://github.com/utilityjnr1/lumena/issues/165) |
| 166 | `[Bug] Export buildTransaction from @lumen/core and fix sourceAccount parameter typing` | Core / Stellar | `Open` | [#166](https://github.com/utilityjnr1/lumena/issues/166) |
| 167 | `[Feature] Add createClaimableBalance helper function to @lumen/core` | Core / Stellar | `Open` | [#167](https://github.com/utilityjnr1/lumena/issues/167) |
| 168 | `[Feature] Add delete method to KeyManager and persist deletions` | Core / Keys | `Open` | [#168](https://github.com/utilityjnr1/lumena/issues/168) |
| 169 | `[Feature] Add GET /wallets admin endpoint to query registered wallets` | Server / API | `Open` | [#169](https://github.com/utilityjnr1/lumena/issues/169) |
| 170 | `[Feature] Add GET /policy endpoint to list all configured policies` | Server / Policy | `Open` | [#170](https://github.com/utilityjnr1/lumena/issues/170) |
| 171 | `[Feature] Add ContractAllowlistRule policy type for Soroban contract calls` | Policy / Security | `Open` | [#171](https://github.com/utilityjnr1/lumena/issues/171) |
| 172 | `[Feature] Add FeeLimitRule policy type to enforce maximum allowable transaction fee` | Policy / Security | `Open` | [#172](https://github.com/utilityjnr1/lumena/issues/172) |
| 173 | `[Feature] Dispatch balance.low webhook event via WebhookDispatcher in SponsorMonitorService` | Server / Webhooks | `Open` | [#173](https://github.com/utilityjnr1/lumena/issues/173) |
| 174 | `[Feature] Add PATCH /webhooks/:id endpoint to toggle enabled state and update events` | Server / Webhooks | `Open` | [#174](https://github.com/utilityjnr1/lumena/issues/174) |
| 175 | `[Feature] Add POST /webhooks/:id/test endpoint to trigger a test webhook delivery` | Server / Webhooks | `Open` | [#175](https://github.com/utilityjnr1/lumena/issues/175) |
| 176 | `[Security] Add AzureKeyVaultSigner implementation for Microsoft Azure Key Vault` | Security / Cloud | `Open` | [#176](https://github.com/utilityjnr1/lumena/issues/176) |
| 177 | `[Bug] Add memo parameter to Wallet.send() and Wallet.buildPaymentTransaction()` | Core / Stellar | `Open` | [#177](https://github.com/utilityjnr1/lumena/issues/177) |
| 178 | `[Feature] Support custom HTTP headers and apiKey in LumenClientOpts` | Web SDK / Security | `Open` | [#178](https://github.com/utilityjnr1/lumena/issues/178) |
| 179 | `[Feature] Add importWallet and exportWallet methods to LumenClient` | Web SDK / Keys | `Open` | [#179](https://github.com/utilityjnr1/lumena/issues/179) |
| 180 | `[Feature] Add getTransactions method to LumenClient` | Web SDK / API | `Open` | [#180](https://github.com/utilityjnr1/lumena/issues/180) |
| 181 | `[Feature] Add changeTrust helper method to LumenClient` | Web SDK / Stellar | `Open` | [#181](https://github.com/utilityjnr1/lumena/issues/181) |
| 182 | `[Bug] Export useTransactionHistory from @lumen/react package index` | React / Hooks | `Open` | [#182](https://github.com/utilityjnr1/lumena/issues/182) |
| 183 | `[Feature] Add useSessionKey React hook to @lumen/react` | React / Auth | `Open` | [#183](https://github.com/utilityjnr1/lumena/issues/183) |
| 184 | `[Feature] Add useTrustline React hook to @lumen/react` | React / Stellar | `Open` | [#184](https://github.com/utilityjnr1/lumena/issues/184) |
| 185 | `[Feature] Add LumenBalance and LumenWalletCard pre-built UI components to @lumen/react` | React / UI | `Open` | [#185](https://github.com/utilityjnr1/lumena/issues/185) |
| 186 | `[Feature] CLI: add --json global flag to all commands for machine-readable output` | Tooling / CLI | `Open` | [#186](https://github.com/utilityjnr1/lumena/issues/186) |
| 187 | `[Feature] CLI: add lumen wallet list command to display registered wallets` | Tooling / CLI | `Open` | [#187](https://github.com/utilityjnr1/lumena/issues/187) |
| 188 | `[Feature] CLI: add lumen config command to save default server URL and API key` | Tooling / CLI | `Open` | [#188](https://github.com/utilityjnr1/lumena/issues/188) |
| 189 | `[CI/CD] Add CodeQL and dependency audit workflow to GitHub Actions` | CI/CD / Security | `Open` | [#189](https://github.com/utilityjnr1/lumena/issues/189) |
| 190 | `[Feature] Add examples/session-keys interactive demo app` | Examples / React | `Open` | [#190](https://github.com/utilityjnr1/lumena/issues/190) |
| 191 | `[Docs] Write docs/guides/gasless-transactions.md comprehensive onboarding guide` | Documentation | `Open` | [#191](https://github.com/utilityjnr1/lumena/issues/191) |

---

## Getting Help

If you have questions about any issue or implementation details:
- Comment on the corresponding [GitHub Issue](https://github.com/utilityjnr1/lumena/issues).
- Check the [Documentation](./docs) directory for design specs and key management architecture.
