# Security Policy

## Supported Versions

We actively maintain the following versions of Lumen and its packages:

| Package | Supported |
| --- | --- |
| `@lumen/core` (latest) | ✅ |
| `@lumen/server` (latest) | ✅ |
| `@lumen/web-sdk` (latest) | ✅ |
| `@lumen/react` (latest) | ✅ |
| `@lumen/types` (latest) | ✅ |
| Older / pinned releases | ❌ |

---

## Reporting a Vulnerability

**Do not open a public GitHub Issue for security vulnerabilities.**

If you discover a security vulnerability in Lumen, please report it using [GitHub's private security advisory feature](https://github.com/utilityjnr1/lumena/security/advisories/new).

Include as much detail as possible:

- A clear description of the vulnerability and its potential impact.
- Steps to reproduce the issue (proof-of-concept code is helpful).
- The affected package(s) and version(s).
- Any suggested remediation or patch.

You will receive acknowledgement within **48 hours**. We aim to triage, validate, and produce a fix within **14 days** for critical or high severity issues.

---

## Automated Security Scanning

This repository uses the following automated tools to detect and prevent vulnerabilities:

### CodeQL Static Analysis

Every push to `main` and every pull request triggers a [CodeQL](https://codeql.github.com/) scan of all JavaScript and TypeScript source code using the `security-extended` query suite. Results are uploaded to the [GitHub Security tab](https://github.com/utilityjnr1/lumena/security/code-scanning).

The workflow is defined in [`.github/workflows/security.yml`](../.github/workflows/security.yml).

**How to reproduce locally:**

```bash
# Install the CodeQL CLI: https://github.com/github/codeql-action
codeql database create lumena-db --language=javascript-typescript
codeql database analyze lumena-db --format=sarif-latest --output=results.sarif \
  javascript-security-extended.qls
```

### Dependency Audit (`pnpm audit`)

Every push and pull request also runs `pnpm audit --audit-level=high`. This fails the CI pipeline if any **high** or **critical** severity vulnerability is found in the dependency tree.

The scan runs weekly (Mondays at 08:00 UTC) via a scheduled workflow to catch newly-published advisories for existing dependencies.

**How to run manually:**

```bash
# From the repository root (scans all workspace packages)
pnpm audit

# Fail only on high+ severity
pnpm audit --audit-level=high

# Output as JSON for tooling integration
pnpm audit --json
```

---

## Security Best Practices for Integrators

Because Lumen manages cryptographic keys and co-signs financial transactions, we recommend the following practices for production deployments:

### 1. Protect the Co-Signer and Fee-Payer Keys

- Store `COSIGNER_SECRET` and `FEE_PAYER_SECRET` in a secrets manager (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager) — **never** in `.env` files committed to source control.
- Use the hardware-backed signer implementations (`AwsKmsSigner`, `GcpKmsSigner`, `VaultSigner`) instead of `EnvSigner` in any environment with real funds.

### 2. Enable the API Key Middleware

Configure `API_KEY` in your environment or pass `apiKey` in `ServerOpts` to protect all server endpoints from unauthorized access. See the [Server Security section in README.md](../README.md#server-security--configuration) for details.

### 3. Configure Rate Limiting

Set `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` appropriately for your expected traffic. Low limits on `/cosign` and `/fee-bump` protect the sponsor account from being drained by abuse.

### 4. Configure Spend Limits and Velocity Rules

Use the `PolicyEngine` to configure per-transaction and daily spend caps, destination allowlists, and velocity rules. These rules are the primary on-chain defence against malicious transactions slipping through co-signing.

### 5. Monitor the Sponsor Account Balance

Enable `SponsorMonitorService` and configure webhook alerts (`balance.low` events) so you are notified before the sponsor account drops below the reserve threshold.

### 6. Keep Dependencies Up to Date

Run `pnpm audit` regularly and update dependencies promptly when security advisories are published. The scheduled weekly workflow will open alerts in GitHub Security if new vulnerabilities are discovered.

---

## Disclosure Policy

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure). We ask that:

1. You give us reasonable time to investigate and remediate before public disclosure.
2. You do not exploit the vulnerability or access user data beyond what is necessary to demonstrate the issue.
3. You do not disclose the vulnerability to third parties until a fix has been released.

We will publicly acknowledge reporters in the release notes unless you prefer to remain anonymous.
