# API Changelog

All notable changes to the REST API are documented in this file.

This changelog is **generated from OpenAPI diffs** between releases. The source of truth for the API specification is `packages/server/src/openapi.ts`; the committed `docs/openapi.yaml` is generated from it and **must stay in sync**. Do not edit `docs/openapi.yaml` by hand — regenerate it from the source and commit both together.

## How entries are generated

1. On each release, the release workflow regenerates `docs/openapi.yaml` from `packages/server/src/openapi.ts`.
2. The workflow diffs the newly generated spec against the spec from the previous release tag.
3. The diff is classified using the policy below (breaking / deprecation / additive / fix).
4. A new entry is appended to the table below with the API version, date, change type, and a summary of affected paths and schemas.

The diff step runs automatically as part of the release workflow. Manual entries should only be added to clarify intent; the diff remains the authoritative record of what changed.

## Versioning policy

The API follows **Semantic Versioning** (`MAJOR.MINOR.PATCH`), independent of package versions:

- **MAJOR** — breaking changes (see below). Requires a deprecation cycle first.
- **MINOR** — backwards-compatible additions (new endpoints, new optional fields, new enum values where clients are expected to tolerate them).
- **PATCH** — backwards-compatible fixes (documentation corrections, description changes, non-behavioral schema clarifications).

The current API version is tracked in the `info.version` field of `docs/openapi.yaml`.

## What counts as a breaking change

Any of the following is a **breaking change** and requires a MAJOR version bump:

- **Removed or renamed paths** — deleting an endpoint or changing its URL.
- **Removed or renamed operations** — removing an HTTP method from a path.
- **New required request fields** — adding a field to a request body or query that is marked `required`.
- **Removed response fields** — removing a field clients may depend on.
- **Type changes** — changing the type of an existing field (e.g. `string` → `integer`), including narrowing formats.
- **Enum removals** — removing a value from an enum that clients may send or receive.
- **Auth changes** — changing or adding authentication/authorization requirements, changing security schemes, or altering scopes.
- **Status code changes** — removing or repurposing documented response status codes.
- **Parameter changes** — making an optional parameter required, or changing its type/location.

The following are **not** breaking (MINOR or PATCH):

- Adding new endpoints or operations.
- Adding new optional request fields or parameters.
- Adding new response fields.
- Adding new enum values where clients are documented to tolerate unknown values.
- Documentation, description, and example changes.

## Deprecation policy

Breaking changes must go through a deprecation cycle before removal:

1. **Announce** — mark the affected path, operation, field, or parameter as `deprecated: true` in the OpenAPI spec and document the replacement in its description.
2. **Deprecation window** — deprecated items remain functional for **at least one MINOR release and no fewer than 90 days** from the deprecation announcement.
3. **Removal** — after the window elapses, the item may be removed in the next MAJOR release. Removal is recorded as a breaking change in this changelog.
4. **Migration notes** — each deprecation entry must include the recommended replacement and, where applicable, a migration note.

Emergency security fixes may bypass the standard window but must still be documented here with rationale.

## Changelog

| API version | Date       | Type     | Summary |
|-------------|------------|----------|---------|
| 0.1.0       | —          | Initial  | Initial API specification seeded from `docs/openapi.yaml`. No prior version to diff against. |

<!--
New entries are appended above by the release workflow's OpenAPI diff step.
Format: | <version> | <YYYY-MM-DD> | <breaking|deprecation|additive|fix> | <summary of affected paths/schemas> |
-->