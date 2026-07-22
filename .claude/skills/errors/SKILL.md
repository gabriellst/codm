---
name: errors
description: "Define and register error types for a context. Use when adding new domain or application errors. Use this skill whenever you need custom error types with HTTP status codes, error codes, and frontend translations. Dispatch hub — routes to typescript/go variants by file extension."
---

# Errors

Vocabulary of what can go wrong in the business. `DomainErrors` are invariant violations raised by entities and value objects (`INVALID_STATUS_TRANSITION`, `PROFANE_COMMENT`). `ApplicationErrors` are orchestration failures raised by use cases and handlers (`VIDEO_NOT_FOUND`, `UNAUTHORIZED`). Each carries a code, HTTP status, and i18n key — never a free-form string.

## Architecture (identical across both languages)

Core defines a **runtime registry** mapping `error-code → HTTP-status` plus a `register*` function. Each context plugs in its own codes at startup. **Core never imports from contexts** — adding a new context-specific code means touching the context's `errors/` file, never the framework.

| | TypeScript | Go |
|---|---|---|
| Register fn (in core) | `registerErrorCodes(codes)` | `RegisterErrorCodes(map)` |
| Per-context call site | module-load side-effect at bottom of `<ctx>/errors/index.ts` | `init()` in `<ctx>/errors/codes.go` |
| Side-effect trigger | `import './errors'` in `<ctx>/registry.ts` | anonymous `_ "…/errors"` import in `<ctx>/module.go` |
| Status lookup | `GlobalErrorMapper[code]` | `MapErrorToHTTP` middleware |

The shape and idioms of this primitive differ per backend language; the lang-specific playbooks below carry the concrete rules, code, and bad practices.

## Language variants

| Backend | Playbook | Registry |
|---|---|---|
| TypeScript — `packages/api/typescript/` | [`typescript/SKILL.md`](./typescript/SKILL.md) | [`typescript/registry.yaml`](./typescript/registry.yaml) |
| Go — `packages/api/go/` | [`go/SKILL.md`](./go/SKILL.md) | [`go/registry.yaml`](./go/registry.yaml) |

## How dispatch works

`scripts/review.ts` infers the language from the file extension (`.ts` / `.go`) and loads the matching `<lang>/registry.yaml`. The CLI scaffolder takes a `--lang` flag (`--lang=typescript` / `--lang=go`) or infers it from cwd. When editing or reviewing code, open the lang playbook matching the file you're touching — patterns and bad practices are coded per-language (e.g. `ERR-GO-01`).
