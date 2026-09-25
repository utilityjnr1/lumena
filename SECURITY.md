# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through [GitHub Security Advisories](https://github.com/utilityjnr1/lumena/security/advisories/new). Do not open a public issue, discussion, or pull request for a suspected security flaw.

Include, when possible:

- the affected package or service and version;
- a description of the impact and the security boundary crossed;
- minimal reproduction steps or a proof of concept; and
- any logs, request IDs, or configuration details needed to reproduce the issue.

Please do not include production secrets, private keys, passkey data, or other sensitive user information in a report. Redact those values before sharing diagnostic material.

## Response and disclosure

We will acknowledge a complete report within three business days and provide an initial assessment within seven days. The target remediation timeline is seven days for a critical issue, 30 days for a high-severity issue, and 90 days for a lower-severity issue when a practical fix is needed. We will coordinate timing with the reporter and will not publish exploit details before users have had an appropriate opportunity to update.

If a fix is not available within the target window, we will provide an interim mitigation, status update, or affected-version guidance. We may accelerate disclosure when an active exploit or material user risk makes delay unsafe. We will credit reporters who want to be acknowledged, subject to their preference.

## Security model

Lumen wallets are designed around the following controls:

- **2-of-2 multisig:** A user-controlled passkey or device key and a Lumen server co-signer are both required to authorize wallet transactions. Neither signer should be able to authorize a transaction alone.
- **Policy enforcement:** The server evaluates configured spend limits, transaction velocity, destination allowlists, time bounds, and session-key restrictions before adding its signature.
- **Protected signing keys:** Production deployments should keep co-signer and fee-payer private keys in a KMS or HSM, with least-privilege access and audit logging. Raw environment secrets are for local development and testnet use only.
- **Fee sponsorship:** Approved transactions may be wrapped in a fee-bump envelope so users do not pay Stellar transaction fees. Sponsorship must not be usable to bypass wallet authorization or policy controls.

These controls reduce the impact of a compromised component, but they do not eliminate the need to protect user devices, passkeys, hosting, network endpoints, and signing credentials.

## In scope

Reports are in scope when they demonstrate a vulnerability in Lumen code or infrastructure, including:

- bypassing the 2-of-2 threshold, owner-signature checks, or server authorization;
- bypassing or incorrectly applying policy enforcement, including spend, velocity, allowlist, time-bound, or session-key controls;
- unauthorized co-signing, fee-bump submission, account sponsorship, or use of custodial keys;
- authentication, authorization, replay, transaction-validation, or rate-control flaws that expose protected operations;
- disclosure of secrets, private signing material, passkey data, or sensitive user information; or
- meaningful denial of service, injection, or remote code execution against a Lumen service or package.

## Out of scope

The following are generally not in scope:

- vulnerabilities that exist only in a third-party Stellar, cloud, identity, or hosting service and are not introduced or worsened by Lumen;
- loss or compromise of a user's passkey, device, private key, or credentials when no Lumen control was bypassed;
- reports that rely on intentionally unsafe production configuration, such as exposing raw signing secrets, without identifying a corresponding implementation flaw;
- feature requests, usability questions, documentation corrections, or best-practice guidance without a security impact; and
- automated scanning noise, denial-of-service testing against third-party services, or findings that cannot be reproduced.

Researchers should avoid accessing other users' data, modifying production state, exfiltrating secrets, or causing lasting service disruption. Good-faith research that follows this policy will be handled fairly.

## Supported versions

| Version | Supported |
|---|---|
| `0.1.x` | Yes |
