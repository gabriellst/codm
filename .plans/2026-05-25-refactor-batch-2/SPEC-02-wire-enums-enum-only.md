# SPEC-02: Wire Enums Export Enum Only — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle. The codegen Task owns a unit
> test; the sweep Task verifies via `bun tsc` + grep-to-zero.
> The tree must compile at every commit boundary — generator change,
> regeneration, and consumer sweep ship as three sequential commits.

**Goal:** Stop the wire-enum codegen from emitting `…Schema = z.nativeEnum(…)`. The enum is the contract; consumers compose `z.enum(X)` at the point of use. Eliminates ~300 `XSchema` import sites across 11 bounded contexts, removes the deprecated `z.nativeEnum` call, and aligns generated output with the project's `z.enum(X)` convention.

**Architecture:** Three sequential atomic commits:
1. **Codegen template** — `emit-wire-ts.ts` stops emitting `…Schema` from enum files; event-payload codegen uses `z.enum(Ref)` instead of `${ref}Schema`; enum files drop the `z` import. The existing `emit-wire-ts.test.ts` is updated RED→GREEN as part of this commit.
2. **Regenerate** — `bun emit-openapi && bun sdk`. Generated `wire/enums/*.ts` no longer contain `…Schema`; generated `wire/events/*.ts` use `z.enum(...)`. No hand-edits to generated files.
3. **Consumer sweep** — mechanical codemod across `packages/api/typescript/src/**`. Every `import { XSchema } from '…/wire/enums'` becomes `import { X } from '…'`; every field `XSchema` or `XSchema.optional()` becomes `z.enum(X)` or `z.enum(X).optional()`. Verified by grep-to-zero and `bun tsc`.

**Tech Stack:** TypeScript + Bun (codegen template, generated output, consumers across 11 bounded contexts). Go emitter (`emit-wire-go.ts`) verified-only — no behavioral change expected (it never emitted TS schemas).

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-02-wire-enums-enum-only.md`
**Wave:** 1  **Stream:** B  **Depends on:** (none)
**Tasks:** 4
**Estimated minutes:** 90

> **Planner note — codegen tests pre-existing failures.** The existing `emit-wire-ts.test.ts` already has 2 failing tests (stale `_z` import path + `IntegrationEvent` type assertion). These are collateral from a previous emitter update. Task 1 fixes both the failing assertions and adds the new `…Schema`-absent assertion, so the suite goes from 2-fail to 0-fail as part of the RED→GREEN for this spec.

> **Planner note — 103 consumer import lines, 11 bounded contexts.** The grep baseline: 103 import lines across 103 files, 29 unique `XSchema` names (`CurrencyCodeSchema` × 45, `RoleSchema` × 13, …). A sed/ast codemod is appropriate; the plan step provides the exact command. Discriminated unions in `integration/schemas/platform.ts` use `z.discriminatedUnion('platform', [...])` with inline object schemas — they do not reference `XSchema` directly and are unaffected.

---

## Task 1: Codegen template stops emitting `…Schema`; test suite goes GREEN

**Phase:** Wave 1, Stream B — generator change
**Files:**
- Modify: `packages/contracts/codegen/emit-wire-ts.ts`
- Modify: `packages/contracts/codegen/emit-wire-ts.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** (none)

- [ ] **Step 1: Run the existing test to establish RED baseline**

```bash
cd packages/contracts && bun test codegen/emit-wire-ts.test.ts
```

Expected: 2 pass, 2 fail — the enum test (`z.nativeEnum`) passes (old behavior), two event tests fail (stale `_z` import path + `IntegrationEvent` type alias). Record these as the pre-existing failures that Task 1 will also fix.

- [ ] **Step 2: Update the test to assert the NEW behavior**

Edit `packages/contracts/codegen/emit-wire-ts.test.ts`:

**`emitTsEnums` block** — replace the existing single test:

```diff
 describe('emitTsEnums', () => {
-	test('produces ts enum + zod schema for a single enum', () => {
+	test('produces ts enum WITHOUT a Schema export', () => {
 		const e: ParsedEnum = { name: 'VideoStatus', values: ['UPLOADING', 'READY'], doc: 'Video lifecycle.' }
 		const out = emitTsEnums([e])
 		expect(out['video-status.ts']).toContain('export enum VideoStatus')
 		expect(out['video-status.ts']).toContain("UPLOADING = 'UPLOADING'")
 		expect(out['video-status.ts']).toContain("READY = 'READY'")
-		expect(out['video-status.ts']).toContain('export const VideoStatusSchema = z.nativeEnum(VideoStatus)')
+		expect(out['video-status.ts']).not.toContain('VideoStatusSchema')
+		expect(out['video-status.ts']).not.toContain('z.nativeEnum')
+		expect(out['video-status.ts']).not.toContain("import { z }")
 		expect(out['index.ts']).toContain("export * from './video-status'")
 	})

 	test('produces kebab-case filenames', () => {
```

**`emitTsEvents` block** — add an enum-ref test case to `sample` and fix the two stale assertions:

```diff
 	const sample: ParsedEvent = {
 		modelName: 'VideoUploadedEvent',
 		wireName: 'integration.video.uploaded',
 		doc: 'Triggers transcoding.',
 		fields: [
 			{ name: 'name', type: { kind: 'literal', value: 'integration.video.uploaded' }, required: true },
 			{ name: 'entityId', type: { kind: 'string' }, required: true },
 			{ name: 'ownerId', type: { kind: 'string' }, required: true },
 			{ name: 'occurredAt', type: { kind: 'date-time' }, required: true },
 			{ name: 'videoId', type: { kind: 'string' }, required: true },
 			{ name: 'byteSize', type: { kind: 'integer', format: 'int64' }, required: true },
 			{ name: 'optional', type: { kind: 'string' }, required: false },
+			{ name: 'status', type: { kind: 'enum-ref', ref: 'VideoStatus' }, required: true },
 		],
 	}
```

```diff
-		expect(f).toContain(`import { z } from '../_z'`)
+		expect(f).toContain(`import { z } from '@template/core-typescript/schema'`)
 		expect(f).toContain(`z.integrationEvent('integration.video.uploaded', {`)
 		expect(f).toContain('videoId: z.string()')
 		expect(f).toContain('byteSize: z.number().int()')
 		expect(f).toContain('optional: z.string().optional()')
+		expect(f).toContain('status: z.enum(VideoStatus),')
+		expect(f).toContain(`import { VideoStatus } from '../enums'`)
+		expect(f).not.toContain('VideoStatusSchema')
 		expect(f).not.toContain('entityId: z.string()')
```

```diff
-		expect(out).toContain('export type IntegrationEvent = VideoUploadedEvent')
+		expect(out).toContain('export type IntegrationEvent = Z.infer<typeof IntegrationEventSchema>')
```

- [ ] **Step 3: Run the test — confirm it fails for the RIGHT reason**

```bash
cd packages/contracts && bun test codegen/emit-wire-ts.test.ts
```

Expected: the `emitTsEnums` test now fails because the emitter still emits `VideoStatusSchema`. The two event tests still fail (stale emitter). All 4 tests should be RED at this point.

- [ ] **Step 4: Update the emitter template**

Edit `packages/contracts/codegen/emit-wire-ts.ts`:

**`emitTsEnums` function (lines 18–37)** — remove the `z` import and the `…Schema` line:

```diff
 	for (const e of enums) {
 		const file = `${kebab(e.name)}.ts`
 		const members = e.values.map((v) => `\t${v} = '${v}',`).join('\n')
 		const body =
 			HEADER +
-			`import { z } from 'zod'\n\n` +
 			(e.doc ? `/** ${e.doc} */\n` : '') +
-			`export enum ${e.name} {\n${members}\n}\n\n` +
-			`export const ${e.name}Schema = z.nativeEnum(${e.name})\n`
+			`export enum ${e.name} {\n${members}\n}\n`
 		files[file] = body
 		indexLines.push(`export * from './${kebab(e.name)}'`)
 	}
```

**`zodExpr` function (line 47)** — change the `enum-ref` branch:

```diff
 		case 'enum-ref':
-			return `${t.ref}Schema`
+			return `z.enum(${t.ref})`
```

**`emitTsEvents` function (lines 64–101)** — change the import-names construction for enum refs:

```diff
 		if (enumImports.length > 0) {
-			const names = enumImports.flatMap((n) => [n, `${n}Schema`]).join(', ')
+			const names = enumImports.join(', ')
 			importLines.push(`import { ${names} } from '../enums'`)
 		}
```

(The `z` import in event files stays — it's needed for `z.integrationEvent`, `z.string()`, etc.)

- [ ] **Step 5: Run the test — confirm all 4 tests pass**

```bash
cd packages/contracts && bun test codegen/emit-wire-ts.test.ts
```

Expected: 4 pass, 0 fail.

- [ ] **Step 6: Verify Go emitter is unaffected**

```bash
grep -n "nativeEnum\|Schema\b" packages/contracts/codegen/emit-wire-go.ts
```

Expected: zero matches. The Go emitter generates `type X string` + `ParseX(s)` — it never referenced `XSchema`. No change needed.

- [ ] **Step 7: Commit (Commit A)**

```bash
git add packages/contracts/codegen/emit-wire-ts.ts \
        packages/contracts/codegen/emit-wire-ts.test.ts
git commit -m "$(cat <<'EOF'
refactor(contracts): codegen stop emitting wire-enum XSchema + update tests (SPEC-02 Task 1)

Emit the enum only; event-payload codegen uses z.enum(Ref) instead of
RefSchema. Enum files no longer import or export anything zod-related.
Also fixes two pre-existing stale test assertions (z import path,
IntegrationEvent type alias).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Regenerate — generated output matches the new template

**Phase:** Wave 1, Stream B — regeneration commit
**Files:**
- Regenerate: `packages/contracts/generated/typescript/src/wire/enums/*.ts` (all 48 enum files + index)
- Regenerate: `packages/contracts/generated/typescript/src/wire/events/*.ts` (all 55 event files + index + _imports)
- Regenerate (downstream): SDK artifacts under `packages/client/` (if Kubb runs as part of `bun sdk`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema
**Depends on:** 1

- [ ] **Step 1: Regenerate wire bindings**

```bash
bun emit-openapi && bun sdk
```

Expected: completes without error. Do NOT hand-edit any generated file.

- [ ] **Step 2: Verify enums no longer contain `…Schema`**

```bash
grep -r "Schema = z\." packages/contracts/generated/typescript/src/wire/enums/
```

Expected: zero matches.

- [ ] **Step 3: Verify event files use `z.enum(...)` for enum-typed fields**

```bash
grep "z\.enum(" packages/contracts/generated/typescript/src/wire/events/ad-spend-recorded.ts
grep "z\.enum(" packages/contracts/generated/typescript/src/wire/events/fx-rate-captured.ts
```

Expected: each of the above prints one or more lines containing `z.enum(MarketingPlatform)`, `z.enum(CurrencyCode)` etc. (no `…Schema` references).

- [ ] **Step 4: Verify event files no longer import `…Schema` from enums**

```bash
grep -r "Schema.*from.*enums" packages/contracts/generated/typescript/src/wire/events/
```

Expected: zero matches.

- [ ] **Step 5: Verify the Go emitter output is unchanged structurally**

```bash
bun emit-openapi   # already ran above; confirm go bindings still present
grep "type CurrencyCode string" packages/contracts/generated/go/wire/enums.go
grep "func ParseCurrencyCode" packages/contracts/generated/go/wire/enums.go
```

Expected: both grep lines return a match (Go enum types unchanged).

- [ ] **Step 6: Run the codegen tests again to confirm still green**

```bash
cd packages/contracts && bun test codegen/emit-wire-ts.test.ts
```

Expected: 4 pass, 0 fail (same as Task 1 Step 5).

- [ ] **Step 7: Commit (Commit B)**

```bash
git add packages/contracts/generated/typescript/src/wire/ \
        packages/contracts/generated/go/wire/ \
        packages/client/
git commit -m "$(cat <<'EOF'
chore(contracts): regenerate wire enums (enum-only) + events (z.enum) (SPEC-02 Task 2)

Generated by `bun emit-openapi && bun sdk`. No hand edits.
wire/enums/*.ts: no more …Schema exports.
wire/events/*.ts: enum fields now use z.enum(Ref) instead of RefSchema.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Consumer sweep — replace `XSchema` with `z.enum(X)` across all bounded contexts

**Phase:** Wave 1, Stream B — mechanical sweep (11 bounded contexts, ~103 import lines in 103 files, 29 unique Schema names)
**Files (by bounded context, decreasing volume):**
- `packages/api/typescript/src/tenancy/**` (~21 import lines — biggest context)
- `packages/api/typescript/src/analytics/**` (~15 import lines)
- `packages/api/typescript/src/finance/**` (~14 import lines)
- `packages/api/typescript/src/marketing/**` (~12 import lines)
- `packages/api/typescript/src/billing/**` (~9 import lines)
- `packages/api/typescript/src/catalog/**` (~8 import lines)
- `packages/api/typescript/src/identity/**` (~7 import lines)
- `packages/api/typescript/src/sales/**` (~6 import lines)
- `packages/api/typescript/src/integration/**` (~5 import lines)
- `packages/api/typescript/src/notifications/**` (~4 import lines)
- `packages/api/typescript/src/tracking/**` (~2 import lines)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** 2

- [ ] **Step 1: Confirm baseline — count Schema imports to sweep**

```bash
grep -r "Schema.*from.*wire/enums\|Schema.*from.*contracts-typescript/wire'" \
  packages/api/typescript/src --include="*.ts" | grep -v "EventSchema" | wc -l
```

Expected: ~103. Record this number.

- [ ] **Step 2: Run `bun tsc` to confirm starting point (Task 2 broke it)**

```bash
cd packages/api/typescript && bun tsc --noEmit 2>&1 | head -40
```

Expected: many errors of the form `Property 'GoalTypeSchema' does not exist on type…` or `'GoalTypeSchema' is not exported from…`. This is the RED state that the consumer sweep fixes.

- [ ] **Step 3: Remove `…Schema` names from all `import { … }` lines**

For each bounded context run a multi-pass sed that:
1. Strips `XSchema` from existing import lines (keeping non-Schema names on the same import).
2. Removes import lines that are now empty.
3. Replaces field-level usages `XSchema` with `z.enum(X)`.

The canonical three-pass approach:

```bash
SRC=packages/api/typescript/src

# Pass A: strip XSchema from import specifier lists (keeps enum names, removes Schema twins)
# Pattern: ", FooSchema" or "FooSchema, " or "{ FooSchema }" — remove Schema names only
# Use perl for in-place multi-line-safe replacement
perl -i -0pe '
  s/import \{([^}]+)\} from (.+wire\/enums[^\n]*)/
    my ($names, $path) = ($1, $2);
    $names =~ s/,?\s*\b\w+Schema\b\s*,?/,/g;
    $names =~ s/,\s*,/,/g;
    $names =~ s/^\s*,\s*//;
    $names =~ s/\s*,\s*$//;
    $names =~ s/\s+/ /g;
    length($names) > 0 ? "import { $names } from $path" : ""
  /ge
' $(find $SRC -name "*.ts" -not -name "*.test.ts" -not -name "*.spec.ts")

# Also cover the bare wire import (sales/objects/OrderOverrideFields.ts uses '@template/contracts-typescript/wire')
perl -i -0pe '
  s/import \{([^}]+)\} from (.+contracts-typescript\/wire[^/\n][^\n]*)/
    my ($names, $path) = ($1, $2);
    $names =~ s/,?\s*\b\w+Schema\b\s*,?/,/g;
    $names =~ s/,\s*,/,/g;
    $names =~ s/^\s*,\s*//;
    $names =~ s/\s*,\s*$//;
    $names =~ s/\s+/ /g;
    length($names) > 0 ? "import { $names } from $path" : ""
  /ge
' $(find $SRC -name "*.ts" -not -name "*.test.ts" -not -name "*.spec.ts")

# Pass B: drop lines that became empty (import {} from ...) after Pass A
perl -i -ne 'print unless /^\s*import \{\s*\} from/' \
  $(find $SRC -name "*.ts" -not -name "*.test.ts" -not -name "*.spec.ts")
```

> **Note:** test files (`*.test.ts`) are excluded from the automated sweep — they use enum values, not Schema names, in most cases. Spot-check after Step 6.

- [ ] **Step 4: Replace field-level `XSchema` usages with `z.enum(X)`**

```bash
SRC=packages/api/typescript/src

# Pass C: replace XSchema as a field validator (bare, .optional(), .nullable(), .array())
# The Schema suffix is always the terminal word before punctuation / method chain.
# Pattern: word boundary + known-Schema-name + Schema + boundary
# We enumerate the 29 known names to be precise and avoid false positives.
SCHEMAS=(
  AdSpendGroupBySchema AdSpendTypeSchema AnalyticsFrequencySchema
  BillingPlatformSchema CampaignStatusSchema ChartTypeSchema
  CurrencyCodeSchema FcmPlatformSchema FxRateSourceSchema
  GoalTypeSchema MarketingPlatformSchema NotificationCategorySchema
  NotificationChannelSchema NotificationCurrencyModeSchema
  OperationalCostPaymentStatusSchema PaymentMethodSchema PaymentStatusSchema
  PixelEventTypeSchema PlanPeriodSchema PlanTierSchema
  ProductCostTypeSchema ProductStatusSchema QuantityModifierSchema
  RoleSchema SalesPlatformSchema StoreIntegrationTypeSchema
  TaxDeductionTypeSchema TaxTypeSchema TenancyRoleSchema
)

for SCHEMA in "${SCHEMAS[@]}"; do
  # Derive the enum name (strip 'Schema' suffix)
  ENUM="${SCHEMA%Schema}"
  # Replace bare usage and chained usage
  find $SRC -name "*.ts" | xargs perl -pi -e "
    s/\b${SCHEMA}\b/z.enum(${ENUM})/g
  "
done
```

- [ ] **Step 5: Handle aliased imports**

Several files import with an alias (e.g. `RoleSchema as TenancyRoleSchema`, `TenancyRoleSchema`). After Step 4, search for any remaining `TenancyRoleSchema` alias usages and replace manually:

```bash
grep -rn "TenancyRoleSchema\|as TenancyRoleSchema" packages/api/typescript/src --include="*.ts"
```

For each hit: the alias was pointing to `RoleSchema`; replace `TenancyRoleSchema` usage with `z.enum(Role)` (where `Role` is the already-imported enum, potentially aliased — check the import line and adjust accordingly).

Similarly check for any other schema alias patterns:

```bash
grep -rn "Schema as " packages/api/typescript/src --include="*.ts"
```

Fix each one by converting the alias import to just the enum import and updating usages.

- [ ] **Step 6: Run `bun tsc` — fix residual errors**

```bash
cd packages/api/typescript && bun tsc --noEmit 2>&1 | grep -v "node_modules" | head -60
```

Expected: a small number of residual errors from:
- Chained methods (`.nullable()`, `.optional()`) that need `z.enum(X).nullable()` — verify the automated Pass C handled these (the regex replaces the token, chaining survives).
- Any place the Schema was used as a type (e.g., `type T = z.infer<typeof XSchema>`) — replace with `z.infer<ReturnType<typeof z.enum<typeof X>>>` or, more idiomatically, `X` (if only the enum value type is needed, import the enum as a type and use `keyof typeof X` or cast directly).
- Any event or handler that passed `XSchema` as a runtime value (very rare — spot-check `billing` and `marketing`).

Fix each error in place. Rerun `bun tsc --noEmit` until 0 errors.

- [ ] **Step 7: Verify grep-to-zero**

```bash
# No XSchema imports from wire remain
grep -r "Schema.*from.*wire/enums\|Schema.*from.*contracts-typescript/wire'" \
  packages/api/typescript/src --include="*.ts" | grep -v "EventSchema"
```

Expected: zero lines.

```bash
# No nativeEnum anywhere in src
grep -r "nativeEnum" packages/api/typescript/src --include="*.ts"
```

Expected: zero lines.

```bash
# No XSchema bare-name field usages remain (sample spot-check)
grep -r "\bGoalTypeSchema\b\|\bCurrencyCodeSchema\b\|\bRoleSchema\b" \
  packages/api/typescript/src --include="*.ts"
```

Expected: zero lines.

- [ ] **Step 8: Run tests**

```bash
cd packages/api/typescript && bun run test 2>&1 | tail -20
```

Expected: same pass rate as before the sweep; no new failures. If a test fails because it was importing a `…Schema` name, update the test file: replace the schema import with the enum + `z.enum(X)` inline.

- [ ] **Step 9: Commit (Commit C)**

```bash
git add packages/api/typescript/src/
git commit -m "$(cat <<'EOF'
refactor(api-ts): sweep XSchema → z.enum(X) across all bounded contexts (SPEC-02 Task 3)

103 import lines across analytics/billing/catalog/finance/identity/
integration/marketing/notifications/sales/tenancy/tracking replaced.
29 Schema names eliminated. No XSchema export remains in wire/enums.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Acceptance criteria verification + Go emitter smoke

**Phase:** Wave 1, Stream B — final gate
**Files:** (none — read-only verification)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none)
**Depends on:** 3

- [ ] **Step 1: AC-1 — No generated enum file exports `…Schema`**

```bash
grep -r "Schema = z\.nativeEnum\|Schema = z\.enum" \
  packages/contracts/generated/typescript/src/wire/enums/
```

Expected: zero matches.

- [ ] **Step 2: AC-2 — Generated event files compile using `z.enum(...)`**

```bash
grep -r "Schema" packages/contracts/generated/typescript/src/wire/events/ | grep -v "EventSchema\|integrationEvent"
```

Expected: zero matches (the only `Schema` occurrences in event files are `…EventSchema`, which are the event schemas themselves — not enum schemas).

- [ ] **Step 3: AC-3 — Zero `import { …Schema }` from wire remain**

```bash
grep -r "Schema.*from.*wire/enums\|Schema.*from.*contracts-typescript/wire'" \
  packages/api/typescript/src --include="*.ts" | grep -v "EventSchema"
```

Expected: zero lines.

- [ ] **Step 4: AC-4 — `bun emit-openapi && bun sdk` regenerates cleanly**

```bash
bun emit-openapi && bun sdk
```

Expected: exits 0. OpenAPI JSON still lists enum values (confirm one sample):

```bash
grep -A5 '"GoalType"' packages/api/typescript/public/docs/openapi.json | head -10
```

Expected: the enum's values appear in the OpenAPI output.

- [ ] **Step 5: AC-5 — `bun tsc` clean across TS workspaces**

```bash
bun tsc 2>&1 | grep -v "node_modules" | head -20
```

Expected: zero errors.

- [ ] **Step 6: AC-5 (Go) — Go emitter/consumers unaffected**

```bash
cd packages/api/go && go build ./...
```

Expected: build 0 errors. The Go wire bindings (`generated/go/wire/`) use their own `type CurrencyCode string` — entirely independent of the TS `…Schema` exports.

- [ ] **Step 7: AC-6 — `bun run test` clean**

```bash
bun run test 2>&1 | tail -10
```

Expected: same pass/fail ratio as the baseline before this spec (0 new failures).

- [ ] **Step 8: Update spec status**

Edit `.specs/2026-05-25-refactor-batch-2/SPEC-02-wire-enums-enum-only.md`:

```diff
-**Status:** todo
+**Status:** done
```

Tick all ACs:

```diff
-- [ ] No generated `wire/enums/*.ts` file exports a `…Schema`
+- [x] No generated `wire/enums/*.ts` file exports a `…Schema`
 ...
```

Edit `.specs/2026-05-25-refactor-batch-2/README.md` — set `| 02 | … | todo |` → `done`.

- [ ] **Step 9: Commit (Commit D — housekeeping)**

```bash
git add .specs/2026-05-25-refactor-batch-2/
git commit -m "$(cat <<'EOF'
docs(spec): mark SPEC-02 done (wire-enums-enum-only)

All ACs green: no XSchema in wire/enums, events use z.enum, zero
consumer Schema imports, bun tsc + go build + bun run test clean.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
