# @template/client

Polyglot client SDK generator for OpenAPI 3.0.3.

Given a directory of OpenAPI specs (`packages/api/<service>/public/openapi.json`),
generates symmetric TypeScript, Rust, and Go clients under `dist/{typescript,rust,go}/`.

## What this produces

- **`dist/typescript/`** — `@template/client-typescript`: Kubb-generated client functions,
  React Query hooks, Zod schemas, and an aggregate `Client.create({...})` class.
- **`dist/rust/`** — `template-client-rust`: progenitor-generated per-service modules
  with a top-level `Client` struct + `ClientBuilder`.
- **`dist/go/`** — `template/client-go`: oapi-codegen-generated per-service packages
  with a top-level `client.New(client.Config{...})` constructor.

## Usage

```bash
# Regenerate all three clients from current api specs:
bun nx run client:generate

# Equivalent (manual):
cd packages/client && bun run generate
```

## OpenAPI compliance

Specs consumed by this generator must conform to `COMPLIANCE.md`. The
`preprocessSpec` step in `lib/preprocess.ts` validates each input and rejects
non-compliant specs with a clear error.
