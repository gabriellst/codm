---
name: middleware
description: "Create an HTTP middleware. Use when you need to enforce a cross-cutting concern before a controller runs — authentication, operating-context guard, onboarding gate, tenancy, audit logging. Middlewares throw typed `BaseError` codes that the GlobalErrorMapper turns into HTTP statuses; the frontend can react with custom routing via the customErrorHandlers registry. Dispatch hub — routes to typescript/go variants by file extension."
---

# Middleware

Cross-cutting HTTP concern — authentication, idempotency, signature verification, rate limiting, tenancy, audit logging. Throws typed errors that map to HTTP status via the global error mapper. Defaults per context; overridable per controller.

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `MID-GO-01`).
