# Security Best Practices for Integrators

This guide is a checklist for teams integrating the SDK into production applications. It covers passkey origin binding, Content-Security-Policy, session-state storage, and co-signer/fee-payer key handling.

> **Review note:** This checklist has been reviewed against [`SECURITY.md`](../../SECURITY.md) and aligns with the project's vulnerability disclosure policy, supported-versions guidance, and responsible-disclosure expectations. It also cross-references [`docs/production-key-management.md`](../production-key-management.md) for key-storage details. If `SECURITY.md` changes, re-review this document.

---

## 1. Passkey RP ID / Origin Binding

Passkey (WebAuthn) assertions are only trustworthy when the relying party ID (RP ID) and origin are validated. The SDK verifies assertions in `packages/core/src/keys/passkey.ts` (`verifyWebAuthnAssertion`), and the React hook `packages/react/src/use-create-wallet-with-passkey.ts` includes an SSR guard. Configure your app to match these expectations.

- [ ] **Set a stable RP ID** that is a registrable suffix of your origin (e.g. RP ID `example.com` for origin `https://app.example.com`). Do not use IP addresses or `localhost` in production.
- [ ] **Serve over HTTPS only.** WebAuthn requires a secure context; HTTP origins (other than `localhost` for development) will fail.
- [ ] **Pin the expected origin(s)** passed to `verifyWebAuthnAssertion` to the exact production origin(s). Reject assertions whose `clientDataJSON.origin` does not match.
- [ ] **Verify the challenge** is the one your server issued, is single-use, and has not expired. Never accept a client-supplied challenge without server-side validation.
- [ ] **Validate the RP ID hash** in `authenticatorData` matches your configured RP ID.
- [ ] **Check the signature** against the credential public key and confirm the user-presence/user-verification flags meet your policy.
- [ ] **Guard against SSR.** The `use-create-wallet-with-passkey` hook assumes a browser environment. Ensure passkey creation/assertion only runs client-side (e.g. after mount, behind `typeof window !== 'undefined'`), and never invoke WebAuthn during server rendering.
- [ ] **Handle the `userVerification` requirement** explicitly (`required` vs `preferred`) and document the choice for your threat model.
- [ ] **Do not trust client-reported success.** Always re-verify the assertion server-side before granting access or signing authority.

---

## 2. Content-Security-Policy (CSP)

A strict CSP limits the blast radius of XSS, which is the primary threat to passkey- and key-based flows. WebAuthn itself is not gated by CSP directives, but the SDK's scripts, network calls, and any embedded iframes are.

- [ ] **Restrict `script-src`** to your own origin and required CDNs; avoid `'unsafe-inline'` and `'unsafe-eval'`. Use nonces or hashes for inline scripts.
- [ ] **Set `connect-src`** to the exact RPC/indexer/API endpoints the SDK calls. Do not use a wildcard.
- [ ] **Set `frame-ancestors 'none'`** (or a strict allowlist) to prevent clickjacking of passkey prompts and signing UI.
- [ ] **Set `base-uri 'self'`** and **`object-src 'none'`** to block base-tag and plugin injection.
- [ ] **Set `form-action 'self'`** to prevent credential exfiltration via form hijacking.
- [ ] **Use `require-trusted-types-for 'script'`** where feasible to harden DOM sinks.
- [ ] **Deploy CSP in report-only mode first**, monitor violations, then enforce.
- [ ] **Keep the policy in version control** and review changes alongside SDK upgrades.

Example baseline (adjust to your endpoints):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-<random>';
  connect-src 'self' https://rpc.example.com https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  object-src 'none';
  form-action 'self';
```

---

## 3. Secure Session-State Storage

Where you persist session state and key material matters. See [`docs/production-key-management.md`](../production-key-management.md) for the full discussion of storage trade-offs.

- [ ] **Understand `localStorage` caveats.** `localStorage` is readable by any script on the origin, so a single XSS defeats it. It offers no expiry and persists across tabs. Do not store long-lived secrets or raw private keys there.
- [ ] **Prefer short-lived session tokens** over persistent credentials, and rotate them.
- [ ] **Use the `KeyStorage` injection point** to supply your own storage adapter (e.g. in-memory, encrypted, or platform keystore-backed) instead of relying on the default. Implement the `KeyStorage` interface and pass it into the SDK.
- [ ] **Encrypt at rest** any persisted key material, and keep encryption keys out of the same storage.
- [ ] **Scope storage to the origin** and clear it on logout; provide an explicit "sign out everywhere" path.
- [ ] **Avoid `sessionStorage` for anything security-critical** across reloads; treat it as ephemeral only.
- [ ] **Never log** session tokens, private keys, or assertion payloads.
- [ ] **Set appropriate cookie flags** (`Secure`, `HttpOnly`, `SameSite`) if you use cookies for session state instead of web storage.

---

## 4. Co-Signer / Fee-Payer Key Handling & API Keys

- [ ] **Keep co-signer and fee-payer private keys server-side.** Never ship them to the browser or embed them in client bundles.
- [ ] **Use a secrets manager / KMS** for co-signer and fee-payer keys; restrict access by least privilege and audit usage.
- [ ] **Isolate fee-payer accounts** from co-signer keys and from user funds; fund them with only what's needed.
- [ ] **Rate-limit and monitor** fee-payer usage to detect abuse and drain attempts.
- [ ] **Treat API keys as secrets.** Store them in server-side environment configuration, never in client code or public repos.
- [ ] **Apply rate limiting** on all endpoints that trigger signing, sponsorship, or key operations.
- [ ] **Rotate API keys and co-signer credentials** on a schedule and immediately on suspected compromise.
- [ ] **Validate and authorize every co-sign request** server-side; do not co-sign arbitrary user-supplied payloads.
- [ ] **Log security-relevant events** (failed verifications, rate-limit hits, key rotations) without logging secrets.

---

## Reporting a Vulnerability

If you discover a security issue in the SDK, follow the process in [`SECURITY.md`](../../SECURITY.md). Do not open a public issue for security vulnerabilities.

## Related Documents

- [`SECURITY.md`](../../SECURITY.md) — vulnerability disclosure and supported versions
- [`docs/production-key-management.md`](../production-key-management.md) — key storage and `KeyStorage` guidance