# Dashboard Read-Model — Tier-3 exemplar (template polyglot)

> **Not live code.** Every `.ts` here is copied from
> `template@feat/template-polyglot` (tip `ccdd8c531`, 2026-07-01) — purged product
> vocabulary renamed to neutral identifiers (product-residue rail), otherwise
> verbatim — and carries a
> `// CONTEXT-ORIGIN:` header naming its origin file. It is **not part of the
> workspace build** (no `package.json`, not referenced by any `tsconfig`, not an
> Nx project), so the `@codedm/*` imports intentionally do not resolve. Read it
> as a reference for the pattern, not as something to compile.

This is the **composition-first discriminated-union read model** pattern: how a
single BFF query (`GetDashboard`) returns a **different shape** depending on two
orthogonal axes — without a soup of optional fields, without four separate
endpoints, and without a query param for the mode.

---

## The two axes

| Axis | Values | Source |
|---|---|---|
| `viewScope` | `SINGLE` \| `MULTI` | query input (which store set) |
| `dashboardMode` | `GLOBAL` \| `NATIONAL` | **persisted** `StoreVisualization`, *not* a query param |

Their product is a **2×2 matrix** of output shapes:
`SINGLE_GLOBAL`, `SINGLE_NATIONAL`, `MULTI_GLOBAL`, `MULTI_NATIONAL`. Each is a
`kind` literal that discriminates the union.

---

## `GetDashboard.ts` — the `variant()` composer + the union

Origin: `src/ui/usecases/GetDashboard.ts`.

### 1. Section fragments

Shared shape pieces are declared once as plain objects and reused across
variants:

```
const STORE  = { store: z.object({ id: z.uuid(), currency: z.enum(CurrencyCode) }) }
const STAT   = { stat: StatSchema }
const STAT_NATIONAL = { stat: StatNationalSchema }
const STAT_CONSOLIDATED = { stat: ConsolidatedStatSchema, perStore: PerStoreStatSchema }
const ADDITIONAL = { additionalCost: AdditionalCostSchema }
// … etc
```

The `NATIONAL` fragments extend the `GLOBAL` ones (payment-methods breakdown,
draft-orders); the `CONSOLIDATED` fragments are the `MULTI` counterparts
(plus `perStore`).

### 2. The `variant()` composer

A tiny helper that stamps the three discriminator literals and spreads any
number of section fragments into one object schema:

```
const variant = (kind, viewScope, dashboardMode, ...shapes) =>
  z.object({
    kind:         z.literal(kind),
    viewScope: z.literal(viewScope),
    dashboardMode: z.literal(dashboardMode),
    ...Object.assign({}, ...shapes),
  })
```

Each of the four variants is then one readable line:

```
const SINGLE_GLOBAL   = variant('SINGLE_GLOBAL',   ViewScope.SINGLE, DashboardMode.GLOBAL,   STORE, STAT, ADDITIONAL)
const SINGLE_NATIONAL = variant('SINGLE_NATIONAL', ViewScope.SINGLE, DashboardMode.NATIONAL, STORE, STAT_NATIONAL, ADDITIONAL_NATIONAL)
const MULTI_GLOBAL    = variant('MULTI_GLOBAL',    ViewScope.MULTI,  DashboardMode.GLOBAL,   STAT_CONSOLIDATED, ADDITIONAL_CONSOLIDATED)
const MULTI_NATIONAL  = variant('MULTI_NATIONAL',  ViewScope.MULTI,  DashboardMode.NATIONAL, STAT_CONSOLIDATED_NATIONAL, ADDITIONAL_CONSOLIDATED_NATIONAL)
```

### 3. `GetDashboardOutputSchema`

```
export const GetDashboardOutputSchema =
  z.discriminatedUnion('kind', [SINGLE_GLOBAL, SINGLE_NATIONAL, MULTI_GLOBAL, MULTI_NATIONAL])
```

This union is the SDK/OpenAPI contract. The frontend `switch`es on `kind` and
gets full narrowing — a `MULTI_*` response has `perStore`, a `SINGLE_*` response
has `store`, a `*_NATIONAL` response has the national extensions, and the type
system knows which at every branch.

### 4. Faker body, real contract

The handler seeds `faker` deterministically from the request (stable refetches),
reads `dashboardMode` from the persisted `StoreVisualization` (default `GLOBAL`),
computes `kind = ${SINGLE|MULTI}_${mode}`, and builds the matching variant with
typed faker builders (each annotated by its schema so `tsc` verifies the shape).
**The contract above is final; only the body is a stand-in** — swap it for real
cross-context aggregation later without touching the union.

---

## `StoreVisualization.ts` — why `dashboardMode` isn't a query param

Origin: `src/ui/entities/StoreVisualization.ts`.

A minimal aggregate: one row per store, holding `dashboardMode`
(`GLOBAL | NATIONAL`). `GetDashboard` reads it to pick the union variant, so the
mode is a **persisted preference**, not something the client passes each call —
the dashboard "remembers" how you last set it.

The read/write pair that drives it:

- **`controllers/GetStoreVisualization.ts`** — `GET /store-visualization`,
  returns the session store's persisted mode.
- **`controllers/SetStoreVisualization.ts`** — `POST /store-visualization`,
  upserts it (`changeMode`).

---

## Why it's worth lifting

- **No optional-field soup.** A field that only exists in `NATIONAL` lives in
  the `NATIONAL` variants only — it's never `T | undefined` on a `GLOBAL`
  response. The client never guards a field the current shape can't have.
- **One endpoint, N shapes.** A single query + a single discriminated union
  beats four endpoints or one loose payload; the composer keeps the four
  variants DRY (shared fragments) without collapsing their distinct types.
- **Mode is server-owned state, not client input.** Persisting it in
  `StoreVisualization` keeps the contract stable and the axis honest.

### Origin files (branch `feat/template-polyglot` @ `ccdd8c531`)

| Exemplar file | Origin |
|---|---|
| `GetDashboard.ts` | `packages/api/typescript/src/ui/usecases/GetDashboard.ts` |
| `StoreVisualization.ts` | `…/src/ui/entities/StoreVisualization.ts` |
| `controllers/GetStoreVisualization.ts` | `…/src/ui/controllers/GetStoreVisualization.ts` |
| `controllers/SetStoreVisualization.ts` | `…/src/ui/controllers/SetStoreVisualization.ts` |

The section schemas the fragments reference (`StatSchema`, `StatNationalSchema`,
`ConsolidatedStatSchema`, `AdditionalCostSchema`, …) live in
`…/src/ui/schemas` on the origin branch and are not reproduced here.
