# Schema Export & Discriminated-Union Frontend — Two Cross-Cutting Decisions

> **Status:** Accepted (2026-06-07)
> **Date:** 2026-06-07
> **Scope:** the OpenAPI emitter (`packages/api/typescript/core`) AND the React app (`packages/app/react`) — two decisions that each span backend *and* frontend, so they outgrow any single skill.

## Context

A "solidify learnings" pass (handoff: `/tmp/handoff-solidify-learnings.md`, DEEP DIVE 1 + DEEP DIVE 2; form arc captured in `.specs/2026-06-05-form-issues-dossier.md`) surfaced two durable rules that don't belong to one artifact's skill because each is a *contract* shared across the wire:

1. When the backend models an operation as a **discriminated union**, the frontend must reflect those cases — the discriminant becomes the UI's selector/filter, and each variant validates against its own concrete member, never a flattened all-optional form.
2. **Only wire-safe schemas** may be registered as named OpenAPI components, because a registered schema's full field set *and* its `.refine()` source are emitted verbatim into the public `openapi.json` + client SDK.

Both are already encoded in the relevant skills and in `CLAUDE.md` "Non-Negotiables" (items 3 and 4). This ADR is the consolidated rationale + consequences behind those pointers; it **references** the skills and exemplar files rather than duplicating them.

---

## Decision 1 — A discriminated backend operation ⇒ variant-specific frontend UI

**A contract that models an operation as a discriminated union (genuinely different shapes per discriminant value) is a signal that the concept itself has distinct cases. The frontend reflects them. The discriminant is the selector/filter — not something to paper over.**

Examples: `shippingFee` discriminated by `mode`; the connect-integration body discriminated by the `(platform, connectionMode)` tuple; a payment by `method`.

### Two concrete shapes

- **(a) The union is a FIELD of a larger body.** Make the form field *be* the SDK union via `schema.pick({ field: true })`. The discriminant drives conditional rendering; the value sub-shape comes straight from the member (no hand-rolled money). Exemplar: `packages/app/react/src/routes/(app)/settings/taxesAndFees/-components/ShippingFeeSection/ShippingFeeForm.tsx` (`.pick({ shippingFee: true })`, `<form.Field name="shippingFee.mode">` + conditional `<form.Field name="shippingFee.value">`).
- **(b) The union IS the whole body.** Write **one small component per variant** (duplication is fine — each stays fully typed), dispatched by a **map keyed on the discriminant**, never an `if`-chain. Exemplar: `packages/app/react/src/routes/(app)/settings/integrations/-components/ConnectIntegrationSheet/platforms/<platform>/{oauth,credentials,manual}.tsx` + `platforms/index.ts` (the `CONNECT_FORMS` map keyed by `${platform}:${connectionMode}`).

### Generic helpers

The introspection lives in `packages/app/react/src/lib/union.ts` and works on any `z.union` / `z.discriminatedUnion` (both expose `.options`):

- `unionVariantValues(union, discriminant)` → the distinct literal values of a discriminant field (the selector's options).
- `pickUnionVariant(union, match)` → the **whole** matched member schema. Use **only** as a `.safeParse(...)` source — it is **NOT** a valid TanStack `validators.onChange` (the member type can't satisfy that — `TS2322`). For the narrowed *type*, use `Extract<Req, { …discriminant… }>`.
- `pickUnionVariantField(union, match, field)` → the sub-schema of **one field** of the matched member. This **IS** a valid `validators.onChange`, **and** the `.safeParse` source for that field's value, **and** (via `z.infer`) the form value's type.

> **Current truth (post-session, supersedes handoff correction C2):** member-FIELD extraction via `pickUnionVariantField` **does** work as an `onChange` validator — its return is typed precisely (`Extract<…>[field]`) so its *input* type matches the flat form value, which is what TanStack constrains. Only the **whole-member** schema (`pickUnionVariant`) is blocked as an `onChange` validator (`TS2322`); it remains `.safeParse`-only.

### How the filtering works (the 4 steps)

1. **Descriptor / selector → discriminant value.** The available variants come either from a runtime descriptor read (e.g. `listPlatformDescriptors` → `selectedItem` carrying `{ type, platform, connectionMode }`) or from a discriminant `<Select>` the user drives (e.g. ShippingFee's `mode`). The variant *type set* is derived from the SDK union **type** via `Extract` — a descriptor is only one optional source of "which variants exist / what the user picked" (supersedes handoff correction C1; the pattern does not depend on a descriptor endpoint).
2. **Filter key.** The selected discriminant value picks (i) which variant form/fields to render and (ii) which concrete member schema to validate against.
3. **Render + validate** the chosen variant against its own member (`pickUnionVariantField(...)` as `onChange`, or `pickUnionVariant(...).safeParse(...)` at submit).
4. **Thread the discriminant into the body even when it isn't an editable field.** The connect body's `type` comes from `selectedItem.type`; dropping it makes `safeParse` silently fail and the form won't submit. Discriminant fields are part of the contract member — source them from the descriptor/selector.

### Anti-pattern

Flattening a union into a single form with every field optional (a `z.record(z.string(), z.string())` catch-all, or an all-optional `uiSchema` re-declaring the members) plus a pile of `if (mode === …)` toggles. This throws away the contract, hand-rolls shapes (including money), and makes the form lie about what each case requires.

### Documented in

Form skill `FRM-P43` / `FRM-P44` + `bp-31`; component skill `CMP-P18` (the Section-side mirror: switch sub-components by a discriminant from the descriptor/store, dispatch by map); `CLAUDE.md` Non-Negotiable #3. Read-side mirror of the same principle: the `composition-first-discriminated-bff-outputs` memory (discriminated BFF *outputs* compose named section fragments under a single `z.discriminatedUnion('kind')`).

---

## Decision 2 — Only wire-safe schemas are registered as named OpenAPI components

**`registerSchemas` exposes reusable named OpenAPI components. Register ONLY shared value objects + contract DTOs — never entity (write-model) schemas.**

### Mechanism

`openapi.registerSchemas({ ...sharedObjects, ...sharedSchemas })` (in `src/shared/index.ts`) names each component from its **export key minus `Schema`** (`MoneySchema` → `Money`). No `.meta({ id })` at the definition site — registration is external (`z.globalRegistry.add(schema, { id })`), keeping schemas clean. `z.toJSONSchema` reads `globalRegistry` by default; the emitter lifts `definitions` into `components.schemas`. Mechanism: `packages/api/typescript/core/src/utils/OpenAPI.ts` (`registerSchemas`, `liftDefinitions`, `addRefinementsRecursively`, `extractRefinementsShallow`, `validateRefinementPlacement`).

### Security boundary — the real test

The discriminator is **NOT** "does it have business logic." It is three questions:

1. Is it already on the wire?  2. Does the client legitimately need the rule (symmetric validation)?  3. Is the rule sensitive/internal?

- **Value objects** (Money/Email/CPF/Phone) — self-validation/format the client already receives and needs → **register**. They live in `shared/objects` / `shared/schemas`.
- **Entity (write-model) schemas** — cross-field domain invariants + internal fields, server-authoritative → **never register**. Keep sensitive invariants in the entity/use-case.

Scope is `shared/objects` + `shared/schemas` only (supersedes handoff correction C3 / matches memory `sdk-schema-registration-shared-only`): context VOs are **not** blanket-registered — a context VO surfaces only when a controller actually references its schema (an explicit per-endpoint decision; otherwise it inlines at the use-site).

### Why it matters

A registered schema's `.refine()` **source code** is emitted verbatim — `fn.toString()` → `x-tpl-zod-refinements` — into the **public** `openapi.json` **and** the **client** SDK, alongside its full field set. Register an entity schema and you ship its private invariants and internal fields to every client. Keep sensitive rules server-side.

### Caveats

- **Only wire-referenced schemas are actually named.** Registering a VO the wire never references is inert (no `$ref` → not emitted). To name a VO, a controller/DTO must *reference* its schema — a separate, optional refactor (most finance VOs are inert today).
- A top-level `.refine()` on a registered schema must place its `x-tpl-zod-refinements` on the **component** definition, not the `$ref` node (`liftDefinitions` runs the refinement walk on the component; `addRefinementsRecursively` skips `$ref` nodes; `validateRefinementPlacement` enforces it).
- `z.instance(...)` fields serialize as `{}` → such VOs are internal-only, not wire candidates.
- `z.historical(z.discriminatedUnion)` hides the union from discriminator lifting → internal-only until the emitter handles the historical wrap (open follow-up).

### Documented in

The `schema` skill (`.claude/skills/schema/SKILL.md` + `schema/typescript/SKILL.md` "Named schema export (`registerSchemas`)"); the mechanical guardrail bounded-context `bp-05` (`registerSchemas\([^)]*[Ee]ntit` detect regex); one-line security cross-refs from the `value-object` / `entity` skills; `CLAUDE.md` Non-Negotiable #4 + the SDK section.

---

## Consequences

- The contract shape drives the UI shape on **both** axes: a discriminated *operation* gets variant-specific forms/components; a discriminated *read* (BFF output) gets composed section fragments. One source of truth, validated symmetrically.
- Generic `union.ts` helpers mean new discriminated operations need no new introspection code — only a selector + a per-variant form/field, typed straight off the SDK member.
- The OpenAPI/SDK surface is auditable as a security boundary: `bp-05`'s detect regex mechanically blocks the most damaging mistake (registering an entity schema), and the "wire-safe" test gives a principled answer for everything else.

## References

- Backend emitter: `packages/api/typescript/core/src/utils/OpenAPI.ts`
- Frontend helpers: `packages/app/react/src/lib/union.ts`
- Exemplar (union-as-field): `packages/app/react/src/routes/(app)/settings/taxesAndFees/-components/ShippingFeeSection/ShippingFeeForm.tsx`
- Exemplar (union-as-body): `packages/app/react/src/routes/(app)/settings/integrations/-components/ConnectIntegrationSheet/` (`platforms/index.ts`, `platforms/<platform>/*`, `useOauth.ts`)
- Skills: `.claude/skills/form/react/{SKILL.md,registry.yaml}` (`FRM-P43`/`FRM-P44`, `bp-31`); `.claude/skills/component/react/{SKILL.md,registry.yaml}` (`CMP-P18`); `.claude/skills/schema/{SKILL.md,typescript/SKILL.md}`; `.claude/skills/bounded-context/registry.yaml` (`bp-05`)
- `CLAUDE.md` → "Non-Negotiables" (#3, #4) + Frontend "First-Class Citizens" (Form/Component) + SDK section
- Form dossier: `.specs/2026-06-05-form-issues-dossier.md`
- Memory: `sdk-schema-registration-shared-only`, `composition-first-discriminated-bff-outputs`, `no-hacky-workarounds`
