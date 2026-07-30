# Frontend CLI Reference

> The frontend has a unified scaffolder at `bun cli` (entry: `scripts/cli.ts`, frontend code in `scripts/cli/frontend/`). It's the **first thing to reach for** when creating a route, component, dialog, form, onboarding step, translation key, or input mask.
>
> Historical design record: [`superpowers/specs/2026-05-13-frontend-cli-design.md`](./superpowers/specs/2026-05-13-frontend-cli-design.md).

## 1. Philosophy: a scaffolder, not a generator

The CLI produces a **typed skeleton** that the agent or developer wires up. Generated files reference SDK symbols by **name**; resolving missing imports, filling in form fields, defining cards' value sources, and wiring mutations is the agent's job after scaffolding. `tsc` errors immediately after generation are **expected** — they're the agent's TODO list.

**What the CLI guarantees:**
- The file lives in the right place.
- It follows the canonical shape (CVA + `cn()`, `.and()` for SDK schemas, `useDialogStore` for dialogs, `zodValidator` + `RouteError` for routes, etc.).
- Every user-facing string slot is wired through `t('<prefix>.<slot>')` and the i18n writer seeded both locale JSONs.
- Imports come from the right modules (SDK, `@/lib/utils`, `class-variance-authority`, …) — even if the named imports don't resolve yet.

**What the CLI does NOT do:**
- Validate that the SDK identifiers exist.
- Produce ready-to-run code.
- Run `tsc` against its own output.

## 2. House rules (every generated file follows)

1. **CVA + `cn()`.** Components emit a `cva()` declaration with `variants`/`defaultVariants` and use `cn(<name>Variants({...}), className)`. Imports: `cn` from `@/lib/utils`, `cva` + `VariantProps` from `class-variance-authority`.
2. **Typed SDK references.** Types and hooks are imported from `'@codedm/client-typescript/typescript'` by name. Form schemas reference SDK Zod request schemas via `.pick()` / `.shape`. No `any`, no `as unknown as`.
3. **i18n is mandatory for every user-facing string.** Headings, FieldLabels, placeholders, button text, dialog title/description/footer, empty-state messages, toasts, `aria-label` on container regions, `title` tooltips, route breadcrumbs — all use `t('<prefix>.<slot>')` (or `i18n.t(...)` outside React components). The CLI **refuses to generate** when a template would emit visible text without `--i18n=<prefix>`.
4. **Compose SDK schemas with `.and()`**, never `.extend()` (which would overwrite SDK constraints like `.default()`, `.refine()`, `.max()`).
5. **Canonical route wiring**: `validateSearch: zodValidator(<schema>)`, `errorComponent: RouteError`, `staticData.breadcrumb: i18n.t('nav.<key>')`, `export const Route = createFileRoute(...)({...})`.
6. **E2E-respecting selectors**: `aria-label` only on icon-only buttons and container regions. Inputs use `<FieldLabel>`. Visible text stays as visible text.

## 3. Mental model

- **Verb** = top-level subcommand: `route`, `component`, `dialog`, `form`, `onboarding-step`, `i18n`, `mask`, `store`, `primitive`.
- **Recipe** (for `component`) = a preset bundle of blocks: `plain`, `section`, `card`, `empty-state`, `live-settings`.
- **Block** = a small fragment contributing imports/hooks/JSX/declarations to the generated file: `element`, `sdk`, `variants`, `query`, `store`, `search`, `labels`, `consts`, `i18n`, `skeleton`, `composer`.
- **Flag** = `--name=value` (or bare `--name` for booleans).

## 4. Flag syntax conventions

- Flags with values: `--flag=value` (always `=`, never space). `--flag value` is also accepted as a fallback.
- Boolean flags: bare `--flag` to enable; `--no-flag` to disable. Defaults documented per flag.
- Multi-value flags: comma-separated CSV. `--state=query,store,search`.
- **Exceptions** (use `;` instead of `,` because the value contains `=`):
  - `--variants`: `|` between groups, `,` within values. `--variants=size:sm,md|tone:default,muted`.
  - `--with-pt`, `--with-en`, `--mask` (onboarding-step), `--import` (route), `--consts` (component): `;` between `key=value` entries.

## 5. Conflict policy

- **File-creating artifacts** (`route`, `component`, `dialog`, `form`, `onboarding-step`, `store`, `primitive`): if the target file exists, the CLI skips and warns. Delete first to regenerate.
- **`i18n`**: deep-merges into existing JSON; never overwrites existing leaves unless `--force`.
- **`mask`**: appends to `lib/masks.ts`. Skips and warns on export-name collision.

## 6. Per-verb reference

### `route <path>`

```
bun cli route <path> --i18n=<prefix> \
  [--detail] \
  [--extend=<SDKSchemaName>] [--sdk=<Identifier>] \
  [--search=<spec> | --search-file=<path>] \
  [--export-item-type[=<TypeName>]] [--no-export-params-type] \
  [--import=<spec>] [--layout=<plain|app>]
```

| Flag | Effect |
|---|---|
| `--detail` | Emits `/$id` variant. Search-schema flags ignored. Detail breadcrumb uses parent segment. `--sdk` imports `Get<Identifier>QueryResponse`. |
| `--layout=<plain\|app>` | `app` (default) wraps in `<div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8 flex flex-col gap-6">`. `plain` is a bare `<main>`. |
| `--i18n=<prefix>` | **Required.** Breadcrumb becomes `i18n.t('nav.<segment>')`. Auto-triggers i18n writer with `nav.<segment>`, `<prefix>.title`, `<prefix>.subtitle`. |
| `--extend=<SDKSchemaName>` | Composes search schema with `.and()` against the SDK params schema. |
| `--search=<spec>` | Per-field DSL: `<name>:<type>[?][=<default>]` (see §6.1 below). |
| `--search-file=<path>` | Escape hatch for complex schemas — path to a TS file whose default export is a Zod object literal. The CLI inlines imports + body. |
| `--sdk=<Identifier>` | Any SDK-exported identifier. List routes import `List<Identifier>sQueryResponse`; detail routes import `Get<Identifier>QueryResponse`. |
| `--loader[=<name>]` | Emits `loaderDeps: ({ search }) => search` + `loader` com `ensureQueryData(<name>({ params: deps })).catch(() => null)` (prefetch canon — skill `route/react` §Loader & Prefetch). Sem valor, deriva de `--extend` (`listXQueryParamsSchema` → `listXQueryOptions`). Com `--detail`, valor explícito obrigatório; emite `{ <param>: params.<param> }` (ajuste o nome do arg se o SDK usar outro — ex.: `id`). Multi-query: à mão, ver a skill. |
| `--export-params-type` / `--no-export-params-type` | Emit `export type <RoutePascal>SearchParams = z.infer<typeof <routeCamel>SearchSchema>`. Default **on** (auto-off under `--detail`). |
| `--export-item-type` / `--export-item-type=<TypeName>` | Row-type alias. Bare form uses `<RoutePascal>Item`. Requires `--sdk`. Ignored under `--detail`. |
| `--import=<spec>` | Extra imports. Format: `from1=sym1,sym2;from2=sym3`. |

#### 6.1 `--search` DSL

Each spec is `<name>:<type>[?][=<default>]`. Types: `string`, `number`, `boolean`, `date`, `enum:<EnumName>`, `id`. Modifiers: `?` → `.optional()`, `=<literal>` → `.default(<literal>)`, `=fn:<expr>` → `.default(<expr>)` verbatim.

**When the inline DSL gets ugly** (multiple `fn:` defaults with curly-brace args), use `--search-file=<path>` instead.

#### 6.2 Worked example — agenda

```ts
// agenda.search.ts
import { z } from 'zod'
import { CalendarView } from '@/components/CalendarWidget'
import { startOfWeek, endOfWeek } from 'date-fns'

export default z.object({
  startDate: z.coerce.date().optional().default(() => startOfWeek(new Date(), { weekStartsOn: 0 })),
  endDate: z.coerce.date().optional().default(() => endOfWeek(new Date(), { weekStartsOn: 0 })),
  view: z.enum(CalendarView).optional().default(CalendarView.WEEK),
  selectedAppointmentId: z.string().optional(),
  unitId: z.string().optional(),
  search: z.string().optional(),
})
```

```bash
bun cli route '(app)/agenda' \
  --extend=listAppointmentsQueryParamsSchema \
  --sdk=Appointment \
  --search-file=./agenda.search.ts \
  --export-item-type=AgendaAppointmentItem \
  --i18n=agenda --layout=app
```

#### 6.3 Worked example — patients (inline DSL)

```bash
bun cli route '(app)/patients' \
  --extend=listPatientsQueryParamsSchema --sdk=Patient \
  --search='status:enum:PatientStatus?,search:string?,onlyActive:boolean?=true' \
  --export-item-type=PatientListItem \
  --i18n=patients --layout=app
```

#### 6.4 Worked example — detail

```bash
bun cli route '(app)/patients/$patientId' --detail --sdk=Patient --i18n=patientDetail
```

### `component <route> <Name>`

```
bun cli component <route> <Name> [flags]
```

| Flag | Effect |
|---|---|
| `--recipe=<plain\|section\|card\|empty-state\|live-settings>` | Default `plain`. See §7. |
| `--as=<section\|div\|article\|aside\|button\|a>` | Root element. Defaults per recipe. |
| `--sdk=<Identifier>` | SDK type/hook reference. Auto-imports `useList<X>s` when paired with `--state=query`. |
| `--mutation=<Hook>` | SDK mutation hook. Activates the `composer` block AND feeds it: textarea + Enter-to-send (Shift+Enter breaks a line) + a `send()` that dies on empty text **or** on the in-flight mutation. Independent of `--sdk` — a component may read a type with one and write with the other. `--no-composer` opts out. |
| `--state=<csv>` | Multi: `query`, `store`, `search`. Wires the matching blocks. |
| `--store=<StoreName>` | Required when `--state=store`. Imports `use<StoreName>Store`. |
| `--variants=<spec>` | CVA variants (`name:v1,v2\|name:v1,v2`). Emits empty class strings; fill in after. |
| `--labels` | Typed enum-label wiring. Requires `--sdk=<Enum>`. Emits `useTranslation` + a `(value: <Enum>) => t(\`enums.<Enum>.${value}\`)` helper AND auto-seeds `enums.<Enum>.*` into both locale files from the SDK enum's values (lock-step, `TODO[..]` stubs to fill). Never emits a `Record<Enum, string>` label map (component bp-23). |
| `--consts=<spec>` | `;`-separated `key=value` pairs become exported consts. |
| `--i18n=<prefix>` | Required if the template emits visible text. |
| `--skeleton` | Inline `data === undefined` block. Auto-on for `section` recipe. |
| `--no-<block>` | Opt out of a recipe-enabled block (e.g. `--no-skeleton`). |
| `--no-i18n-write` | Keep the block but skip JSON write (rare). |

**Output:** `packages/app/react/src/routes/<route>/-components/<Name>/index.tsx`. Always route-scoped. For global atoms (Button, Card, Input) use `bun cli primitive`.

#### 6.5 Worked example — section + query

```bash
bun cli component '(app)/patients' PatientListSection \
  --recipe=section --sdk=Patient --state=query,search \
  --i18n=patients.list
```

#### 6.6 Worked example — card with variants

```bash
bun cli component '(app)/patients' PatientCard \
  --recipe=card --sdk=Patient \
  --variants='size:sm,md,lg|tone:default,muted' \
  --i18n=patients.card
```

#### 6.7 Worked example — composer block (`--mutation`)

```bash
bun cli component '(app)/threads/$threadId' IssueSteerComposer \
  --mutation=useSteerIssue --i18n=threadDetail.composer
```

Emits the textarea + Enter-to-send (Shift+Enter breaks a line) + `send()` shape with the mutation
wired in. `--recipe=plain` is the default here — the composer block owns the whole body, so no
other recipe scaffolding is needed. `--no-composer` on a component that also takes `--mutation`
opts back out (rare — the flag exists only for `--mutation` used purely for wiring, not layout).

### `dialog <route> <Name>`

```
bun cli dialog <route> <Name> --crud=<create|update|delete|confirm> --i18n=<prefix> \
  [--sdk=<Identifier>] [--mutation=<hookName>] [--invalidate=<csv>]
```

| Flag | Effect |
|---|---|
| `--crud=create\|update\|delete\|confirm` | **Required.** Selects template shape. |
| `--sdk=<Identifier>` | **Required for create/update.** Drives form schema slicing. |
| `--mutation=<hookName>` | **Required for create/update.** Optional for delete (typical: delete mutation) and confirm. |
| `--invalidate=<csv>` | Comma-separated SDK list-hook names whose query keys are invalidated. |
| `--i18n=<prefix>` | **Required.** Dialogs always have visible text. |

Self-contained: owns its form, mutation, query invalidation, toast. No `open`/`onOpenChange` props — opened via `useDialogStore.show(<Dialog />)`.

#### 6.7 Worked example — create

```bash
bun cli dialog '(app)/patients' CreatePatient \
  --crud=create --sdk=Patient --mutation=useCreatePatient \
  --invalidate=useListPatients --i18n=patients.dialogs.create
```

### `form <route> <Name>`

```
bun cli form <route> <Name> --i18n=<prefix> \
  (--from=<sdk.path> | --fields=<spec>) \
  [--edit] [--mutation=<hookName>]
```

| Flag | Effect |
|---|---|
| `--from=<SDKSchemaName[.dot.path]>` | Slice an SDK Zod schema. Mutually exclusive with `--fields`. |
| `--fields=<spec>` | Inline schema. Format: `name:text,email:email,role:select,birthdate:date,bio:textarea`. |
| `--edit` | Edit mode: takes `defaultValues` prop instead of building from scratch. |
| `--mutation=<hookName>` | Optional. With it, form calls the SDK mutation + emits toast. Without it, form is parent-controlled (`onSubmit: (data) => void`). |
| `--i18n=<prefix>` | **Required.** Form labels, placeholders, submit button all use `t()`. |

#### 6.8 Worked example — SDK-backed

```bash
bun cli form '(app)/auth' SignIn \
  --from=signInMutationRequestSchema \
  --mutation=useSignIn \
  --i18n=auth.signin
```

#### 6.9 Worked example — inline fields

```bash
bun cli form '(app)/profile' ProfileEdit \
  --fields='name:text,email:email,bio:textarea' \
  --i18n=profile.edit
```

### `onboarding-step <Name>`

```
bun cli onboarding-step <Name> --from=<sdk.path> --i18n=<prefix> \
  (--fields=<csv> | --all-fields) [--mask=<spec>]
```

| Flag | Effect |
|---|---|
| `--from=<SDKSchemaName.path>` | **Required.** Schema slice. |
| `--fields=<csv>` | **Required** unless `--all-fields`. Field names to `.pick({...})`. |
| `--all-fields` | Skip `.pick(...)` entirely (uses the full schema). |
| `--mask=<spec>` | `;`-separated `field=maskName` pairs. Mask names must exist in `lib/masks.ts`. |
| `--i18n=<prefix>` | **Required.** |

**Output:** `packages/app/react/src/routes/onboarding/-components/<Name>Step/index.tsx`. Exports `<Name>StepSchema` and `<Name>StepData`.

#### 6.10 Worked example — clinic step

```bash
bun cli onboarding-step Clinic \
  --from=completeOnboardingMutationRequest.COLLABORATOR.shape.clinicUnit \
  --fields=clinicName,clinicDocument \
  --mask='clinicDocument=cnpj' \
  --i18n=onboarding.clinic
```

### `i18n <namespace>`

```
bun cli i18n <namespace> --keys=<csv> [--with-pt=<spec>] [--with-en=<spec>] [--force] [--validate]
```

Mutates `packages/app/react/src/locales/pt.json` + `en.json` in lock-step. See §8.

### `mask <name>`

```
bun cli mask <name> (--pattern=<spec> | --ref=<existingMask>) [--mode=numeric|text]
```

Appends to `packages/app/react/src/lib/masks.ts`. Use `--pattern=auto` for a TODO placeholder skeleton.

### `store <name>` and `primitive <name>`

Unchanged from before V1. `store` emits a Zustand store; `primitive` emits a CVA-based design-system atom in `components/ui/`.

## 7. Recipes (component verb)

| Recipe | Auto-enabled blocks | Output shape |
|---|---|---|
| `plain` | none | Bare `function` shell. No styling, no state. |
| `section` | `element=section`, `skeleton` | Takes `data: <T> \| undefined` prop. Renders skeleton when undefined. Optional i18n header. |
| `card` | `element=article`, `variants` | Leaf card for `.map()`. Empty CVA scaffold. Pass `--i18n` if rendering text. |
| `empty-state` | `element=div`, `i18n` | Icon + heading + message + optional CTA button. **`--i18n` required.** |
| `live-settings` | `element=div`, `skeleton` | Toggle/pill controls that save on their own `onChange`/`onBlur` — no "Salvar" button. Reference shape: `ThreadSettingsDialog`. **`--i18n` required** (slots: `section`, `toggle`). |

V2 plans add `list-section`, `stats-section`, `detail-header` once V1 usage shows where the per-recipe complexity is worth encoding.

## 8. i18n writer

The `i18n` writer is the single point of mutation for the locale JSON files. Auto-invoked by every artifact that emits `t()` calls.

**Atomicity & lock-step:**
- Writes to PT + EN in a single transaction (stage to `.tmp-*`, then rename).
- Lock-step validation post-write: PT and EN must end with identical key sets.
- If either file fails, neither is committed.

**Determinism:**
- Keys sorted alphabetically at every level.
- Tab indent (matches repo convention), trailing newline.
- **First write reorders the entire file.** Existing locales may not be alphabetical today; the first invocation re-sorts them. Expect a large initial diff.

**Merge semantics:**
- Deep-merge — never overwrite existing leaves unless `--force` (direct `bun cli i18n` invocations only; auto-invocations from other artifacts are always merge-only).
- Idempotent: re-running with the same `--keys` is a no-op.

**Stub defaults:** PT = `"TODO[PT]"`, EN = `"TODO[EN]"`. Grep with `rg 'TODO\['`.

**Reserved namespaces:** `errors.*` and `enums.*` are refused (backend conventions own those).

**`--no-i18n-write`:** keeps the `t('<prefix>.<slot>')` calls in the source but skips the JSON write. Use only when editing locales by hand — otherwise i18next logs missing-key warnings.

## 9. Cookbook

### I want a list page

```bash
# 1. Write a search-schema file if your defaults are complex (else use --search= inline)
# 2. Route
bun cli route '(app)/suppliers' \
  --extend=listSuppliersQueryParamsSchema --sdk=Supplier \
  --search='search:string?,active:boolean?=true' \
  --export-item-type=SupplierItem \
  --i18n=suppliers --layout=app

# 3. List section
bun cli component '(app)/suppliers' SupplierListSection \
  --recipe=section --sdk=Supplier --state=query,search \
  --i18n=suppliers.list

# 4. Create dialog
bun cli dialog '(app)/suppliers' CreateSupplier \
  --crud=create --sdk=Supplier --mutation=useCreateSupplier \
  --invalidate=useListSuppliers --i18n=suppliers.dialogs.create
```

### I want a detail page

```bash
bun cli route '(app)/suppliers/$supplierId' --detail --sdk=Supplier --i18n=supplierDetail
bun cli component '(app)/suppliers/$supplierId' SupplierHeader --recipe=section --i18n=supplierDetail.header
bun cli dialog '(app)/suppliers/$supplierId' DeleteSupplier --crud=delete --mutation=useDeleteSupplier --invalidate=useListSuppliers --i18n=supplierDetail.delete
```

### I want to add a translation

```bash
bun cli i18n suppliers --keys=title,subtitle,empty
# Or with values:
bun cli i18n suppliers --keys=title,subtitle --with-pt='title=Fornecedores;subtitle=Lista' --with-en='title=Suppliers;subtitle=List'
```

### I want a new input mask

```bash
bun cli mask brZip --pattern='00000-000' --mode=numeric
```

## 10. Extending the CLI

When you find yourself **hand-writing a shape that the CLI doesn't cover**, the rule is: extend the CLI before merging the hand-rolled code. The CLI exists so the next engineer doesn't re-discover the same shape.

Adding things:
- **A new flag**: add it to the artifact in `scripts/cli/frontend/artifacts/<verb>.ts`. Update `docs/CLI.md` flag table. Update the skill's `scaffold:` line. Same commit.
- **A new block**: add a file in `scripts/cli/frontend/blocks/`, register it in `blocks/index.ts`. Update `docs/CLI.md` §3 + §7.
- **A new recipe**: add a file in `scripts/cli/frontend/recipes/`, register it in `recipes/index.ts`. Update `docs/CLI.md` §7.
- **A new artifact (verb)**: add `scripts/cli/frontend/artifacts/<verb>.ts`, register in `scripts/cli/frontend/index.ts`. Update `docs/CLI.md` §6. Add a skill `registry.yaml` + SKILL.md section if the artifact has architectural conventions worth reviewing.

If extending blocks the feature you're shipping, file a tracked follow-up issue and link it from the PR; resolve within one week.

## 11. House rule (CLAUDE.md)

> **"If you wrote it, the CLI should write it":** if during a task you hand-write a shape that would have benefited from a CLI flag, recipe, or new artifact (i.e. you found yourself replicating boilerplate the CLI doesn't yet cover), open a ticket and add it to the CLI before the PR that introduces the hand-written code lands.

## 12. Backend commands reference

The backend scaffolder lives in `scripts/cli/backend/` and is selected automatically when `--lang` is `typescript` (the default).

**Auto-wiring (TS barrels).** Backend artifacts are wired, not just written: when a generated file declares an export hint targeting a TS barrel (`controllers/index.ts`, `handlers/internal.ts`/`external.ts`, `projections/index.ts`, `projections/projectors/index.ts`, `entities`/`usecases`/`events`/… `index.ts`, `tests/support/given/index.ts`), the CLI inserts the export line into the barrel itself — a scaffolded controller/handler that isn't barrel-registered silently never mounts (`BoundedContext.create` only sees what the barrel exports; the slice-closure detector stays as safety net). Wiring is idempotent (re-running skips when the line — or any export of the same module specifier — is already present), respects alphabetically sorted barrels (sorted insert; otherwise append), and creates the barrel when it doesn't exist yet (e.g. a context's first projector). Non-export hints stay manual and are printed as before: the Drizzle repository's `registry.ts` DI binding and Go's `module.go` fx wiring. `--print` mode is unchanged (hints only, no writes). Implementation: `scripts/cli/wire.ts`.

| Command | Syntax | Output |
|---|---|---|
| `context` | `bun cli context <name>` | Full bounded-context folder skeleton |
| `entity` | `bun cli entity <ctx> <name> [--aggregate]` | Domain entity |
| `value-object` | `bun cli value-object <ctx> <name> [--primitive]` | Value object |
| `usecase` | `bun cli usecase <ctx> <name> [--internal]` | Use case + colocated `.test.ts` |
| `controller` | `bun cli controller <ctx> <name> [--internal] [-m M] [-p P] [--mock]` | HTTP controller |
| `handler` | `bun cli handler <ctx> <name> [--external]` | Event handler + colocated `.test.ts` |
| `service` | `bun cli service <ctx> <name>` | Domain service |
| `agent` | `bun cli agent <ctx> <Name>` | Internal agent DIRECTORY: class + `prompt.ts` + `types.ts` + barrel + `.test.ts` (TS only) |
| `event` | `bun cli event <ctx> <name> [--integration]` | Domain/integration event |
| `middleware` | `bun cli middleware <ctx> <name>` | HTTP middleware |
| `enum` | `bun cli enum <ctx> <name>` | Domain enum |
| `repository` | `bun cli repository <ctx> <entityName>` | Repository abstract + Drizzle impl + `.test.ts` |
| `schema` | `bun cli schema <ctx> <name>` | Reusable Zod schema |
| `errors` | `bun cli errors <ctx>` | Error types for context |
| `query` | `bun cli query <Name>` | BFF query in `ui/usecases/` + colocated `.test.ts` |
| `projection` | `bun cli projection <ctx> <Name>` | Projection + ProjectionRepository (2 files) |
| `projector` | `bun cli projector <ctx> <Name>` | Projector (one per Projection) |
| `test` | `bun cli test <kind> <ctx> <name>` | Standalone canonical test skeleton |
| `given` | `bun cli given <ctx> <name>` | Given helper stub in `tests/support/given/` |

### `agent` verb

Scaffolds one agent DIRECTORY under `src/<ctx>/agents/<Name>Agent/` — the class, an `@injectable()`
prompt builder, the `z.agentInput()` schema, the barrel, and a colocated test that already asserts the
base stamped the identity. Pass the name WITHOUT the `Agent` suffix (`bun cli agent agent ClassifyIssue`);
the suffix is part of the citizen's shape, like `repository` taking an entity name.

Two things the scaffolder deliberately leaves to you, and prints as a NOTE rather than guessing:
adding the `AgentName` member (it prints the SCREAMING_SNAKE spelling it expects), and the DI
registration — agents bind as CLASS tokens with `{ useClass: … }` in all three envs, transient, because
a singleton agent would capture whichever `AgentRunner` was bound first. See
`.claude/skills/agent/typescript/SKILL.md`.

### `test` verb

Scaffolds a canonical integration test skeleton. `kind` is one of `usecase`, `repository`, `handler`, or `query`. The test bakes in the 3-hook lifecycle (`beforeAll`/`beforeEach(reset)`/`afterAll(destroy)`), `ownerId: 'integration-tenant'`, `testBed.resolve(...)`, `testId()` for identifiers, and the TST-17 `rejects.toMatchObject` error idiom.

```bash
bun cli test usecase billing CancelSubscription --print
# → packages/api/typescript/src/billing/usecases/CancelSubscription.test.ts

bun cli test handler billing SubscriptionCreated --print
# → packages/api/typescript/src/billing/handlers/SubscriptionCreatedHandler.test.ts

bun cli test repository billing Subscription --print
# → packages/api/typescript/src/billing/repositories/SubscriptionRepository/SubscriptionRepository.test.ts

bun cli test query ListDashboardOrders --print
# → packages/api/typescript/src/ui/usecases/ListDashboardOrders.test.ts
```

Note: `usecase`, `repository`, `handler`, and `query` generators co-emit a `.test.ts` automatically. Use the standalone `test` verb only when you need to add or regenerate a test without touching the artifact.

### `given` verb

Scaffolds a `given<Name>` helper stub in `tests/support/given/<ctx>.ts` and adds the export to `tests/support/given/index.ts`. The stub is repo-direct (never via use case) and accepts an optional `overrides` parameter following TST-18.

```bash
bun cli given billing Coupon --print
# → packages/api/typescript/tests/support/given/billing.ts
#   export: givenCoupon from './billing'
```

## 13. Skills

Skills' `scaffold:` lines are the canonical invocations. When updating an artifact, update the matching skill's `registry.yaml` and the SKILL.md "Generating" section in the same commit.

| Skill | `scaffold:` |
|---|---|
| `route/` | `bun cli route <path> [--detail] [--extend=<SDKSchemaName>] [--sdk=<Identifier>] [--search=<spec> \| --search-file=<path>] [--export-item-type[=<TypeName>]] [--import=<spec>] [--layout=<plain\|app>] --i18n=<prefix>` |
| `component/` | `bun cli component <route> <name> [--recipe=<recipe>] [--sdk=<Identifier>] [--state=<csv>] [--store=<StoreName>] [--variants=<spec>] [--i18n=<prefix>]` |
| `component/` (dialog) | `bun cli dialog <route> <name> --crud=<create\|update\|delete\|confirm> [--sdk=<Identifier>] [--mutation=<hookName>] [--invalidate=<csv>] --i18n=<prefix>` |
| `component/` (onboarding-step) | `bun cli onboarding-step <name> --from=<sdk.path> (--fields=<csv> \| --all-fields) [--mask=<spec>] --i18n=<prefix>` |
| `form/` | `bun cli form <route> <name> (--from=<sdk.path> \| --fields=<spec>) [--edit] [--mutation=<hookName>] --i18n=<prefix>` |
| `store/` | `bun cli store <name>` |
| `primitive/` | `bun cli primitive <name>` |
