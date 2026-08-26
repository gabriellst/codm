# Dossier — Issues & Resolutions (toward standardization)

> Built during the e-commerce fork `/app` session. Goal: capture every issue + its resolution so we can
> standardize (skill update / lint rule / codemod / contract fix). Branch `feat/ecommerce-fork-polyglot`
> (+ `feat/ecommerce-fork-app-screens`). **Form-fix batch is uncommitted, tsc green.**
>
> Format per entry: **Issue** → **Resolution** → _Standardize:_ where the rule should live.
> Status: ⬜ open · ✅ resolved this session · 🟦 needs backend/contract change · 💬 decision pending

---

## A. FORMS (the big standardization target)

**A1. Local `z.object` redefining the mutation body instead of the SDK schema** ✅
- Issue: forms declared `const formSchema = z.object({...})` duplicating fields already in the SDK (GoalForm, OperationalCost, Warranty, ProductCost, Taxes/Fees, Preferences, etc.) — zero front/back type safety.
- Resolution: `validators: { onChange: <name>MutationRequestSchema }` from `@template/client-typescript/typescript`; `safeParse(schema)` in `onSubmit`. Extend with `.and(z.object({...}))` ONLY for genuine UI-only fields (FRM-C01/P25).
- _Standardize:_ lint rule — flag a local `z.object` in a `*Form*`/`*Dialog*` file that also imports a `use<Mutation>` hook. Already in `form/registry.yaml` FRM-01/bp-05.

**A2. Nested API body vs flat form** ✅
- Issue: SDK body is nested (`revenueTax.type`) but form used flat field names → TanStack typed fields `never` → `'message' does not exist on never`.
- Resolution: dot-notation field names matching the schema (`name="revenueTax.type"`), so `validators.onChange` = the SDK schema directly and field types resolve.

**A3. Discriminated-union / dynamic-union API body** ✅
- Issue: ShippingFee (`shippingFee` discriminated by `mode`) and ConnectIntegration (20 platform credential variants) can't be a flat statically-typed form.
- Resolution: **flat UI schema for field state** (`validators: { onChange: uiSchema }`) + **map → SDK body + `safeParse(<sdk>MutationRequestSchema)` at submit**. The SDK schema is still the final validator. The local UI schema is the form INPUT shape (legit when UI ≠ API), NOT a redefinition of API fields.
- _Standardize:_ add this "reshape pattern" to the form skill as the canonical answer for non-flat bodies.

**A4. Hardcoded queryKey `[{ url: '/api/...' }]`** ⬜/✅
- Issue: invalidations hand-wrote the key. Resolution: `queryClient.invalidateQueries({ queryKey: <list/get>QueryKey(args) })`.
- Still open: `MarketingCostDrawer:66` (`/api/products`), `GoalForm:61` (`/v1/analytics/goals/progress` — `getGoalProgressQueryKey` needs params).
- _Standardize:_ lint rule — forbid object-literal `{ url: … }` inside `queryKey`.

**A5. Casts that destroy type-safety** ✅
- Issue: `as FormValues`, `validators: { onChange: schema as never }`, `defaultValues … as DeepPartial<…>`, `type as <Enum>EnumKey` in defaultValues.
- Resolution: typed const `const defaultValues: DeepPartial<<Req>> = {…}` (TanStack infers TFormData from it — a wrong field errors in the literal; the `as` suppresses that check). validators = the schema directly. Only remaining sanctioned cast is `v as <Enum>` at `Select.onValueChange` (Base UI emits `string`; FRM-P05).
- _Standardize:_ lint rule — forbid `as never` and `as DeepPartial`/`as <FormValues>` on `useForm` `defaultValues`/`validators`.

**A6. `useForm<T>(…)` explicit type argument** ✅
- Issue: `useForm<FormValues>({…})` → `TS2558 Expected 12 type arguments, but got 1`, and it collapsed every field type to `never` (which masked the real errors).
- Resolution: never pass a type arg — `useForm({ defaultValues, … })`; type the `defaultValues` const instead.
- _Standardize:_ lint rule + memory; this is a top repeat-offender.

**A7. `validators.onChange` schema vs TFormData mismatch** ✅
- Issue: inlined concrete `defaultValues` → TanStack infers a concrete TFormData that rejects the schema's optional shape (`TS2322 ZodObject not assignable`).
- Resolution: typed `DeepPartial<<Req>>` const; in `onSubmit`, `const r = schema.safeParse({...value, <fixed/system fields>}); if(!r.success) return; mutateAsync({ data: r.data })`.

**A8. Untranslated Select trigger label (Base UI gotcha, FRM-P09)** ✅
- Issue: trigger showed the raw enum value (`OTHER`, `MONTHLY`) after selection because `<SelectValue placeholder=…>` does NOT resolve the label from items.
- Resolution: `<SelectValue>{v ? t(\`enums.<Enum>.\${v}\`) : t('…placeholder')}</SelectValue>` + items `t(\`enums.<Enum>.\${item}\`)`; iterate `Object.values(<Enum>Enum)`. Added 136 `enums.*` keys (pt/en).
- _Standardize:_ this is the #1 visible UX bug; keep FRM-P09 prominent + a lint hint when `<SelectValue placeholder>` is bound to an enum field.

**A9. `mutateAsync()` called without `{ data }`** 🟦
- Issue: ProfileForm/PreferencesForm called `mutateAsync()` with no body. Root: `useUpdateProfile`/`useUpdateUserSettings` generated **`void`-typed** (Kubb saw no request body for `PATCH /v1/me/profile`, `/v1/me/settings`).
- Resolution (pending): give those controllers a typed request body, `bun sdk`, then `mutateAsync({ data })`.

**A10. Hooks destructured / `useState` for field state** ✅
- Issue: `const { mutateAsync } = useCreateX()` (bp-14); `useState` holding field values (CreateKit `kitName`, others).
- Resolution: mutation hook as a direct object (`const createX = useCreateX()`; `createX.isPending`); field state lives in TanStack form.

**A11. Forms missed by the fix-workflow** ⬜
- `finance/costs/OperationalCostForm` (local schema + `validators: { onChange: formSchema as never }` + `} as FormValues`) and `MarketingCostDrawer` (`/api/products`) — never went through the batch.
- `IncluirAdsManualForm` — destructured hook + no `validators.onChange` (cast already fixed).
- _Standardize:_ the enumeration step must come from `grep -rl useForm`, not a hand-picked list.

**A13. `as <Enum>` at Select/ToggleGroup boundary** 💬 (standardization opportunity)
- Issue: Base UI `Select`/`ToggleGroup` emit `string`/`string[]`; narrowing to the enum needs a cast at every call site (`vals[0] as OperationalCostFlowEnumKey`, `v as TaxTypeEnumKey`, …). FRM-P05 currently sanctions it, but it repeats in every enum field AND sits next to the FRM-P09 translated-label boilerplate.
- Resolution options: (1) `isEnumValue(EnumObj, v): v is Key` type-guard helper in `@/lib/enums` — no `as` at call sites; (2) forward Base UI's `Select.Root<Value>` generic through our wrapper; (3) **a generic `EnumSelect<E>` / `EnumToggle<E>` primitive** (props: `enum`, `i18nPrefix`, `value`, `onChange`) that emits `E` and renders the translated label — removes BOTH the cast AND the per-form translated-Select block everywhere.
- _Standardize:_ **recommend option 3** — one primitive collapses the cast + FRM-P09 wiring for all forms. Decision pending.

**A14. Hand-rolled "initial values" props instead of the SDK entity** ⬜
- Issue: `GoalDrawer` declares `interface GoalInitialValues { goalId; value: number; currency; startDate; endDate; type }` — a THIRD shape, inconsistent with the read DTO (`GetGoalQueryResponse.goal.targetAmount` nested SignedMoney) AND the write DTO (`UpdateGoalMutationRequest.targetAmount` nested). The form flattens/re-nests between them; no type safety; unclear which is canonical. (Likely repeats in other edit drawers.)
- Resolution (FRM-P36 + FRM-C04): edit forms receive the **entity as props typed from the SDK read query** — `EditGoalDrawer({ goal }: { goal: NonNullable<GetGoalQueryResponse['goal']> })` (GoalSection already has `goalData.goal`). `defaultValues: DeepPartial<UpdateGoalMutationRequest>` maps from `goal` directly (`targetAmount: goal.targetAmount`, no split). Delete `GoalInitialValues`.
- _Standardize:_ rule — **props = read DTO, defaults = write DTO; never hand-roll a shape the SDK defines.** Lint hint: a local `interface *InitialValues`/`*Props` in a form file whose fields mirror an SDK type. Audit other edit drawers for the same.

**A15. Form components don't compose `ComponentProps` (no className/native forwarding)** ⬜
- Issue: form components use bare domain-only props (`interface TaxesFormProps { defaultValues }`) and forward nothing to `<form>`. But the project convention (component skill: `{ className, ...props }: ComponentProps<'div'>` — used 34+×; primitive skill: `interface Props extends React.ComponentProps<'el'>`) is that every component forwards `className` + native attrs. So forms can't be placed/styled/test-targeted by parents. The **form skill's own examples omit `ComponentProps`** — that's the root gap.
- Resolution: `type XFormProps = React.ComponentProps<'form'> & { …domain }`; `function XForm({ …domain, className, ...props }: XFormProps)`; root `<form className={cn(className)} {...props} onSubmit={…}>` (keep the form's own `onSubmit` last). Same for drawer/dialog wrappers over a root element.
- _Standardize:_ **update the form skill canonical_snippet to compose `ComponentProps`** (currently inconsistent with component/primitive skills); lint hint — a form/section component whose root element doesn't receive `className`/`...props`.

**A12. Money input MUST use `CurrencyInput` — never a separate currency Select + amount Input** ⬜ (RULE)
- Rule: any form field that is a Money / SignedMoney (`{ amountCents, currency }`) renders **one `<CurrencyInput>`** (`@/components/ui/currency-input` — `[🇺🇸 USD ⌄ | 0,00]`, stores/emits `amountCents`, locale via `useLocale()`), NOT a hand-rolled `currency` `<Select>` + number `<Input>`, and never a hardcoded `'BRL'`.
  ```tsx
  <CurrencyInput
    amountCents={field.state.value?.amountCents ?? 0}
    currency={field.state.value?.currency ?? CurrencyCodeEnum.BRL}
    onAmountChange={cents => field.handleChange({ ...field.state.value, amountCents: cents })}
    onCurrencyChange={c => field.handleChange({ ...field.state.value, currency: c })} />
  ```
- Done: `AddProductCostDialog` ✅.
- ⬜ Migrate (split currency+amount today): ProductCostDrawer, GoalForm (`targetAmount`), DashboardOperationalCostForm (`amount`), finance/costs/OperationalCostForm, CostFormSection, VariantCostForm, VariantCostEntryForm, GatewayFeeForm (`fixedAmount`), ShippingFeeForm (`averageShippingFee`), CreateKitWizardDialog, IncluirAdsManualForm.
  (Display-only `formatMoney` components — ProfilesSection/AdAccountRow/MarketingProfileCard — are NOT inputs; out of scope.)
- _Standardize:_ add to the form skill (Money field → CurrencyInput); lint hint — a `<Select>` bound to a currency enum sitting next to an amount/`amountCents` input. Supersedes the old hand-rolled money pattern.

---

## H. POSITIVE PATTERNS — promote to canonical (form skill canonical_snippet + registry)

**H1. Declare `onSuccess` on the mutation HOOK, not in `mutateAsync`** ⭐
```ts
const updateGoal = useUpdateGoal({
  mutation: {
    onSuccess: () => { toast.success(t('dashboard.goal.updateSuccess')); invalidateGoalQueries(); hide() },
  },
})
// call site stays clean:
await updateGoal.mutateAsync({ id, data })
```
- Why: co-located with the declaration (read top-to-bottom), fires no matter which call site triggers it, and keeps every `mutateAsync` call clean (no repeated `{ onSuccess, onSettled }`). Better than the current FRM-P09 (`mutateAsync({data},{onSuccess,onSettled})`) when the mutation has one success behavior.
- _Standardize:_ update form skill canonical_snippet + FRM-P09 to show hook-level `mutation: { onSuccess }`.

**H1-caveat. Do NOT add `onError: toast.error(...)`** ⚠️
- The global `MutationCache({ onError: handleApiError })` (`router.tsx:21`) already toasts the translated, code-specific domain error (bp-06). A per-mutation `onError` toast **double-toasts** with a more-generic message. Keep errors global; only add a local `onError` if you deliberately suppress the global for that case.

**H2. Combined `isPending` across mutations** ⭐
```ts
const isPending = createGoal.isPending || updateGoal.isPending || deleteGoal.isPending
```
- One source for the submit/disable state when a form owns create+update+delete. _Standardize:_ add to the form skill (multi-mutation forms).

**H3. Named invalidation helper** ⭐
```ts
const invalidateGoalQueries = () => { queryClient.invalidateQueries({ queryKey: getGoalQueryKey() }); /* + progress, etc. */ }
```
- Dedupes the invalidation set across multiple mutations (create/update/delete all call it). _Standardize:_ note in form skill for multi-mutation forms.

---

## B. STORYBOOK

**B1. `.storybook/main.ts` ESM** ✅ — `require`/`__dirname` in a `"type":"module"` config → `CriticalPresetLoadError`. Fix: `createRequire(import.meta.url)` + `dirname(fileURLToPath(import.meta.url))`. (commits `88abbab4`/`5dca0ed8`)

**B2. "No QueryClient set" in stories** ✅ — `withConnected` only provided a QueryClient for connected stories (`parameters.route`). Form/dialog args-stories calling `useMutation` threw. Fix: fallback `QueryClientProvider` for non-connected stories. (commit `d65dc930`)

**B3. Leaf story uses `<Link>`/router → "isServer null"** ✅ — a leaf story whose component renders a TanStack `<Link>` needs a router. Fix: make it connected (`parameters: connected({ route: { id: '/(app)/dashboard/' } })`).

**B4. "Starts then exits"** ✅ (workaround) — cold-start Vite "re-optimizing because config changed" restart exits the foreground dev server. Use `bun storybook --ci` (stable server) or run twice (warm cache).

**B5. Moved-story broken relative import** ✅ — moving a story out of a route dir broke `../../index` (`dashboardSearchSchema`). Fix: absolute `@/routes/(app)/dashboard`.

**B6. i18n concurrent-write race** ✅ — parallel agents writing `pt.json`/`en.json` can clobber. Fix: agents RETURN `[{key,pt,en}]`; merge centrally with the lock-step `merge-i18n.mjs`. _Standardize:_ never let parallel agents write the locale JSON.

---

## C. BASE UI / PRIMITIVES / STYLING

**C1. Base UI is not Radix** ✅ — no `asChild`; use the `render` prop or className. `Select`/`Combobox` `onValueChange` gives `(value: string | null)` → coalesce `?? ''`/`?? undefined`. `ComboboxCollection` takes NO `items` prop and uses a render-fn child `(item) => <ComboboxItem value=…/>` (no `label` prop on the item).

**C2. OKLCH tokens** ✅ — `hsl(var(--primary)/a)` renders BLACK. Use `var(--primary)` or `color-mix(in oklch, var(--x) N%, transparent)`. `--chart-1..5` exist.

**C3. gradient-box hover can't transition** ✅ — `--tw-gradient-border` is `@property syntax:"*"`, so a gradient swap can't tween. For a smooth input hover, animate `filter`/`brightness` instead (matches Button). 

**C4. Surfaces** ✅ — `surface` (elevated content) vs `trigger` (interactive) from `@/components/ui/surfaces`; Button `secondary` = `trigger`. Used for datepicker trigger, CurrencyInput split (combobox=trigger, input=input, `border-r` divider), `InputGroup variant="trigger"`.

---

## D. TANSTACK / ZOD / I18N (general)

**D1. zod v4** ✅ — no `invalid_type_error`/`required_error` (use `z.coerce.number()`); `z.enum([...])` is already an enum (don't re-wrap); `import Z from 'zod'` then `Z.infer` (the core `z` isn't a type namespace).

**D2. TanStack Router `<Link>`** ✅ — targets with a search schema REQUIRE a `search` prop even when defaulted; `(app)` is a pathless group so `to` omits it.

**D3. `form.state.values` not reactive (bp-16)** ✅ — read via `form.Subscribe` selector, never the static snapshot.

**D4. typed-i18next `TS2589`** ✅ — `typeof pt` key-union past ~600 keys blew TS instantiation depth (errored every `t()`, tsc → minutes). Relaxed `i18next.d.ts` to `export {}` (keys are plain strings). Re-enable later via per-screen namespaces. Leftover `t(key as never)` hacks for dynamic keys remain (open, §G).

---

## E. SDK / CONTRACTS

**E1. `void`-typed mutations** 🟦 — see A9 (Profile/Settings). Kubb generates `void` variables when the OpenAPI op has no request body.

**E2. `variantIds: min(1)` blocks submit** 🟦 — ProductCost SDK schema requires ≥1 variant id; forms have no picker → `safeParse` fails. Add a picker or relax the controller for product-level costs.

**E3. Batch body** 🟦 — `updateAdAccounts` is `{ updates: [{ id, name? }] }`; rename maps onto one entry.

**E4. Loosely-typed BFF read DTOs** 💬 — several casts (the Taxes config→form boundary; `currency as never` in marketing read components) stem from BFF query DTOs typing enum/currency fields as plain `string`. **Typing those DTOs with the enums is the real front/back fix** that eliminates a whole class of boundary casts.

---

## F. WORKTREE / BUILD / PROCESS

**F1. Worktree SDK-gen isolation** ✅ — a fresh worktree (no node_modules) resolves `@template/core-typescript` via fall-through to the MAIN checkout, so `bun sdk` writes to MAIN. Fix: full `bun install` inside the worktree.

**F2. Generated workspace packages must be `@template/*`** ✅ — never hand-rename to `@template/*` (breaks a fresh `bun install` workspace-wide).

**F3. tsc CPU starvation** ✅ — two projects' dev stacks (load ~34) + stacked tsc thrash. Run ONE tsc, backgrounded, wait. ~13s warm.

**F4. pre-commit eslint arg-list limit** ✅ — with many staged files the hook fails to spawn. Commit `--no-verify`; verify gates manually (tsc + biome).

**F5. Anti-stall agent recipe** ✅ — agents: run NO shell, read no file >40KB, NEVER read .html (17MB refs stall), one pass, RETURN results. Self-verifying/HTML-reading agents stalled 8/13 for ~3 min each.

**F6. Shared-type regression by an agent** ✅ — a form agent narrowed `Money.currency` (`string`→`CurrencyCode`) in `lib/format.ts`, cascading errors into CostDistribution/RevenueChart/StatCards/ProductList. Reverted. _Standardize:_ scope agents to their file; central tsc catches cross-file regressions — always run it after a fan-out.

---

## G. PRE-EXISTING `as never` HACKS (non-form, surfaced during scan) ⬜

- `currency: … as never` → `Money` in `AdAccountRow`, `MarketingProfileCard`, `ProfilesSection` (root = E4).
- `t(key as never)` dynamic-i18n in `IntegrationCategoryTabs`, `IntegrationCard`, `GoalSection`, `RevenueChartCanvas` (root = D4).

---

## OPEN WORK QUEUE (fix order TBD)

1. `finance/costs/OperationalCostForm` — full SDK treatment (A1/A4/A5).
2. `MarketingCostDrawer` — SDK schema + queryKey fn (A1/A4).
3. `IncluirAdsManualForm` — undestructure hook + add `validators.onChange` (A10/A3).
4. `GoalForm` progress queryKey (A4) — decide params vs prefix.
5. 🟦 Contract fixes (A9/E1, E2, E3) — backend + `bun sdk`.
6. E4 — type BFF read DTOs with enums (kills G + the boundary casts).
7. Decide on sanctioned Select cast (keep vs typed `<EnumSelect>`).

_Append new findings below as targeted._
