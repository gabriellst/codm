# OpenAPI compliance contract — @template/client

Specs consumed by `@template/client` MUST conform to the rules below.
Non-compliance is rejected by `lib/preprocess.ts` with an error naming
the violated rule.

## Rules

### R-01 — Dialect MUST be OpenAPI 3.0.3

`openapi: "3.0.3"` at the document root. Older 3.0.x is accepted; 3.1.x
is rejected. **Rationale:** progenitor 0.10 and oapi-codegen v2 consume
3.0; supporting both dialects multiplies edge-case logic.

### R-02 — Every operation MUST declare an `operationId`

`operationId` is a non-empty string that is a valid identifier in
TypeScript, Rust, and Go (matches `^[A-Za-z_][A-Za-z0-9_]*$`).
**Rationale:** generators use it to name functions; absence produces
ugly fallback names (TS, Go) or generation errors (Rust).

### R-03 — Spec MUST be a single bundled JSON file

External `$ref: 'other.yaml#/...'` MUST NOT appear. Internal
`$ref: '#/components/schemas/X'` is required. **Rationale:** none of
the three generators reliably resolve cross-file refs; upstream emitters
should bundle.

### R-04 — Request/response content-type MUST be `application/json`

`multipart/form-data`, `application/x-www-form-urlencoded`, and binary
content types are NOT supported in v1. **Rationale:** generator
post-processing for non-JSON shapes diverges per language.

### R-05 — Nullable values MUST use the OAS 3.0 form `{ ..., nullable: true }`

`anyOf: [<X>, { type: "null" }]` and `type: ["X", "null"]` are rejected.
**Rationale:** 3.0 has one canonical form; accepting 3.1 forms here
re-introduces the downgrade hack we just removed.

### R-06 — Discriminated unions MUST carry `oneOf` + `discriminator` + complete `mapping`

If `oneOf` is present AND any variant declares a discriminator literal,
then `discriminator.propertyName` MUST be set, `discriminator.mapping`
MUST cover EVERY variant, and EACH variant MUST declare the
discriminator field as `{ type: "string", enum: ["<literal>"] }`.
**Rationale:** without all three, generators fall back to untagged
unions silently.

### R-07 — `tags` are optional but recommended

If present, operations under the same tag group together in the
generated output. If absent, output is flat per service.
**Rationale:** organizational, not load-bearing.

### R-08 — Empty `paths: {}` produces an empty client package

Each generator creates the service folder and emits a placeholder
(empty barrel for TS, stub Client for Rust, package declaration for Go)
when the spec declares zero paths. **No error.**
**Rationale:** worker services with no HTTP surface are still discoverable.

### R-09 — Reserved-word sanitization is documented per target

| Target | Reserved words | Sanitization |
|---|---|---|
| TypeScript | JS reserved + DOM globals | Replace non-`[A-Za-z0-9_]` with `_`; if leading digit, prefix `_`; if reserved, suffix `Svc`. |
| Rust | strict + reserved keywords | Replace non-`[A-Za-z0-9_]` with `_`; if reserved, use `r#<name>` raw identifier. |
| Go | reserved keywords | Replace non-`[A-Za-z0-9_]` with `_`; if reserved, suffix `pkg`. |

**Rationale:** consistent rules across languages.

### R-10 — SSE endpoints MUST be flagged `x-tpl-sse: true`

Operations marked `x-tpl-sse: true` at the operation level are dropped
from the spec by `preprocessSpec` and absent from generated clients.
Consumers wire SSE with a separate library.
**Rationale:** generators don't know how to type `text/event-stream`.

### R-11 — Webhooks are NOT supported in v1

OAS 3.1's `webhooks` field is absent in 3.0. Inverted/reverse callbacks
through `callbacks: {...}` are tolerated but not generated.
**Rationale:** out of v1 scope; revisit when target generators mature.

### R-12 — Project vendor extensions namespace is `x-tpl-*`

Vendor extensions emitted by this template's tools are prefixed `x-tpl-`.
Generators ignore unrecognized `x-*` keys (no warning). Recognized
extensions in v1: `x-tpl-sse`, `x-tpl-zod-refinements`,
`x-tpl-discriminators`, `x-tpl-enum-varnames`, `x-tpl-unknown`.
**Rationale:** prevents collision with public OpenAPI extensions.
