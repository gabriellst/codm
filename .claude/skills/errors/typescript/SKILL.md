---
name: errors
description: Define and register error types for a context. Use when adding new domain or application errors. Use this skill whenever you need custom error types with HTTP status codes, error codes, and frontend translations.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Define Error Types

Creates and registers error types for domain and application layer following project patterns.

## Why Structured Errors Matter

Structured error types enable consistent error handling across the entire stack. Domain errors represent business rule violations (thrown by entities), application errors represent use case failures (thrown by use cases). Each error maps to an HTTP status code via the framework's **runtime registry** in core; the frontend reads back a structured `{ code, message }` from the response.

## When to Use This Skill

- Adding a new domain context with its own failure modes
- An entity needs to reject invalid state transitions
- A use case needs to communicate "not found" or "already exists"
- You need a new HTTP error response for the frontend

## When NOT to Use This Skill

- Validation format errors — these come from Zod schema validation automatically
- Infrastructure errors (database, network) — these are caught by the framework
- Generic errors already covered by base framework codes

## Prerequisites

- Read `docs/BACKEND.md` — Error Handling section
- Context must exist (use `/bounded-context` first if needed)

## Error Categories [ERR-P03]

The project defines 4 error layers:

| Layer | Type | Purpose |
|-------|------|---------|
| **Domain** | `DomainErrors` | Business rule violations in entities/value objects |
| **Application** | `ApplicationErrors` | Use case level errors |
| **Interface** | `InterfaceErrors` | Controller/API layer errors |
| **Infrastructure** | `InfrastructureErrors` | External service/database errors |

## Architecture: Runtime Registry

Core defines a runtime registry mapping `code → HttpStatusCode`. Each context registers its own codes via `registerErrorCodes()` at module-load time, mirroring Go's `RegisterErrorCodes()`. **Core never imports from contexts** — adding a new context-specific code means touching the context, not core.

```ts
// packages/api/typescript/core/src/utils/GlobalErrorMapper.ts (FRAMEWORK)
export function registerErrorCodes(codes: Record<string, HttpStatusCode>): void {
  Object.assign(registry, codes)
}
export const GlobalErrorMapper: Readonly<Record<string, HttpStatusCode>> = registry
```

## Process

### Step 1: Define Error Types + Register Codes [ERR-01, ERR-02, ERR-03, ERR-04, ERR-06, ERR-P01, ERR-P02, ERR-P04, ERR-P06, ERR-P07]

Edit `<context>/errors/index.ts`. The file does two things — declare the TYPE unions (for `BaseError<T>` generics) AND call `registerErrorCodes()` at module load:

```ts
// packages/api/typescript/src/billing/errors/index.ts
import { HttpStatusCode, registerErrorCodes } from '@codedm/core-typescript'
import type {
  BaseDomainErrors,
  BaseApplicationErrors,
  BaseInterfaceErrors,
  BaseInfrastructureErrors,
} from '@codedm/core-typescript'

// ── Type unions used as BaseError<T> generics ──────────────────────────

export type BillingDomainErrors = 'INVALID_INVOICE_TOTAL' | 'INVOICE_ALREADY_PAID'
export type DomainErrors = BaseDomainErrors | BillingDomainErrors

export type BillingApplicationErrors =
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_ALREADY_EXISTS'
  | 'UNAUTHORIZED_INVOICE_ACCESS'
export type ApplicationErrors = BaseApplicationErrors | BillingApplicationErrors

export type BillingInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | BillingInterfaceErrors

export type BillingInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | BillingInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

// ── Side-effect: plug this context's codes into the framework registry ─

registerErrorCodes({
  // 400 — domain validation
  INVALID_INVOICE_TOTAL: HttpStatusCode.BAD_REQUEST,
  // 403 — authorization
  UNAUTHORIZED_INVOICE_ACCESS: HttpStatusCode.FORBIDDEN,
  // 404 — entity lookup
  INVOICE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
  // 409 — business-rule conflict
  INVOICE_ALREADY_PAID: HttpStatusCode.CONFLICT,
  INVOICE_ALREADY_EXISTS: HttpStatusCode.CONFLICT,
})
```

### Step 2: Trigger the side-effect from `registry.ts` [ERR-P10]

TypeScript modules only execute on import. Type-only imports (`import type`) are erased at runtime — they DON'T fire side effects. The context's `registry.ts` (which `shared/registry.ts` imports for DI bindings) must value-import `./errors`:

```ts
// packages/api/typescript/src/billing/registry.ts
import './errors' // Side-effect: registers this context's codes with the runtime registry.
import type { InstanceRegistry } from '@codedm/core-typescript'
// ... DI bindings ...
```

Without this line, the codes never register and any throw of `INVOICE_NOT_FOUND` would resolve to 500.

## HTTP Status Code Guidelines [ERR-P07]

| Error Type | Status Code | When to Use |
|------------|-------------|-------------|
| `INVALID_*` | 400 BAD_REQUEST | Validation failures |
| `*_NOT_FOUND` | 404 NOT_FOUND | Resource doesn't exist |
| `*_ALREADY_EXISTS` | 409 CONFLICT | Duplicate resource |
| `*_ALREADY_*` | 409 CONFLICT | State already applied |
| `UNAUTHORIZED_*` | 401 UNAUTHORIZED | Not authenticated |
| `*_PERMISSION`, `UNAUTHORIZED_<X>_ACCESS` | 403 FORBIDDEN | Not authorized |
| `CANNOT_*` | 403 FORBIDDEN | Business rule prevents action |
| `*_EXPIRED` | 400 BAD_REQUEST | Time-based validation |
| `*_FAILED` | 500 INTERNAL_SERVER_ERROR | Unexpected failure |

## Usage in Code

### In Entities (Domain Errors)

```ts
import { BaseError } from '@codedm/core-typescript'
import type { DomainErrors } from '../errors'

export class Invoice extends AggregateRoot {
  markPaid(): void {
    if (this.props.status === 'paid') {
      throw new BaseError<DomainErrors>('INVOICE_ALREADY_PAID')
    }
    this.props.status = 'paid'
  }
}
```

### In Use Cases (Application Errors)

```ts
import { BaseError } from '@codedm/core-typescript'
import type { ApplicationErrors } from '../errors'

@injectable()
export class MarkInvoicePaid extends Handler<...> {
  protected async handle(input: this['input']): Promise<this['output']> {
    const invoice = await this.invoiceRepo.findById(input.id)
    if (!invoice) throw new BaseError<ApplicationErrors>('INVOICE_NOT_FOUND')
    invoice.markPaid()
    await this.invoiceRepo.save(invoice)
  }
}
```

## Critical Rules [bp-01, bp-04, ERR-P08, ERR-P10]

### Always use the generic type

See `bp-01` in registry.yaml. `throw new BaseError('INVOICE_NOT_FOUND')` (no generic) compiles but loses type-safety on the code string.

### Import the correct error type

```ts
// Domain layer (entities, value objects)
import type { DomainErrors } from '../errors'
throw new BaseError<DomainErrors>('INVALID_INVOICE_TOTAL')

// Application layer (use cases, handlers)
import type { ApplicationErrors } from '../errors'
throw new BaseError<ApplicationErrors>('INVOICE_NOT_FOUND')
```

### All thrown codes MUST be registered

Every code thrown must be:
1. Listed in the relevant `<Layer>Errors` type union in `errors/index.ts`
2. Passed to `registerErrorCodes({...})` in the same file

If a code is thrown but not registered, the response defaults to **500 Internal Server Error**. Watch production logs for 500s from unknown codes — that's the signal a registration was missed.

### `registry.ts` must value-import `./errors` [ERR-P10]

Without `import './errors'` in the context's `registry.ts`, the `registerErrorCodes()` call never executes. Type-only consumers of `DomainErrors` / `ApplicationErrors` don't fire the side-effect.

### Use `never` for empty categories

See `ERR-P02` in registry.yaml for the pattern.

### Core stays untouched

NEVER edit `packages/api/typescript/core/src/utils/GlobalErrorMapper.ts` to add a context-specific code. Core seeds framework codes only. Adding a context code there = breaking the "core never imports from contexts" rule.

### Step 3: Add Frontend Error Translations [ERR-P09]

Every error must have a user-facing translation in both locale files so the UI displays meaningful messages instead of raw error codes. The frontend resolves translations via `packages/app/react/src/lib/errors.ts` (`getErrorTranslation`), which reads from the `"errors"` key in the locale JSON.

Add the new error codes to `packages/app/react/src/locales/pt.json` and `packages/app/react/src/locales/en.json`:

```json
// packages/app/react/src/locales/pt.json
{
  "errors": {
    "INVOICE_NOT_FOUND": "Fatura não encontrada.",
    "INVOICE_ALREADY_EXISTS": "Fatura já existe.",
    "INVOICE_ALREADY_PAID": "Fatura já está paga.",
    "INVALID_INVOICE_TOTAL": "Total da fatura inválido.",
    "UNAUTHORIZED_INVOICE_ACCESS": "Você não tem permissão para acessar esta fatura."
  }
}
```

```json
// packages/app/react/src/locales/en.json
{
  "errors": {
    "INVOICE_NOT_FOUND": "Invoice not found.",
    "INVOICE_ALREADY_EXISTS": "Invoice already exists.",
    "INVOICE_ALREADY_PAID": "Invoice is already paid.",
    "INVALID_INVOICE_TOTAL": "Invalid invoice total.",
    "UNAUTHORIZED_INVOICE_ACCESS": "You don't have permission to access this invoice."
  }
}
```

## Checklist

- [ ] All `when: always` patterns present (ERR-01 through ERR-06, ERR-P01 through ERR-P10 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (ERR-C01, ERR-C02 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-04 — verify against registry.yaml)
- [ ] Type unions declared in `<context>/errors/index.ts`
- [ ] `registerErrorCodes({...})` called at the bottom of the same file with HTTP-status mapping for every code
- [ ] `<context>/registry.ts` value-imports `./errors` so the side-effect fires
- [ ] Frontend translations added in `packages/app/react/src/locales/pt.json` and `en.json`
- [ ] Core's `GlobalErrorMapper.ts` was NOT modified

## References

- `docs/BACKEND.md` — Error Handling section
- `packages/api/typescript/core/src/utils/GlobalErrorMapper.ts` — registry implementation
- `packages/api/typescript/src/auth/errors/index.ts` — canonical example (auth context registration)

## Layer → Error-Union Table (single source — other skills reference, never restate)

| Layer / artifact | Union to throw / cast | Where it appears |
|---|---|---|
| Entity / Value Object schema refinements & behavior methods | `DomainErrors` (shared VOs: `BaseDomainErrors`) | `{ error: 'CODE' as DomainErrors }`, `throw new BaseError<DomainErrors>('CODE')` |
| Use case / Handler / Service (application layer) | `ApplicationErrors` | `throw new BaseError<ApplicationErrors>('X_NOT_FOUND')` — handlers too (handler bp-08) |
| BFF query use cases shared across BFF layers (`ui/`) | `BaseApplicationErrors` | `throw new BaseError<BaseApplicationErrors>('NOT_FOUND')` (query bp-07/bp-09) |
| Controller `.refine()` (HTTP-shape validation) | `InterfaceErrors` | `.refine(fn, { error: 'INVALID_DATE_RANGE' as InterfaceErrors })` (CTRL-C16) |
| Middleware identity parse | `BaseInterfaceErrors` | `throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED')` |
| Middleware flow/business guard | `ApplicationErrors` | onboarding gate, tenancy guard |

Never: `{ message: '...' }` in a refine, `throw new Error('...')`, or a union from another row —
the GlobalErrorMapper keys status + i18n off the typed code, and tests assert the code.
