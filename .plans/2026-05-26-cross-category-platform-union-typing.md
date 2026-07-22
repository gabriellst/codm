# Cross-Category Platform Union Typing — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each Task wraps one observable behavior in an outer RED→GREEN cycle.

**Goal:** Cross-category `platform` fields generate as a faithful `z.union` of the five platform
enums in the Go SDK client (instead of `z.string()`), sourced once from a TypeSpec `union Platform`,
with the Go worker validating incoming platform values against that same set.

**Architecture:** Two codegen pipelines cooperate. (1) The **contracts** pipeline (TypeSpec →
`contracts.openapi.yaml` → `emit-wire-go`/`emit-wire-ts`) defines `union Platform` and generates
`wire.Platform` (Go) + `PlatformSchema` (TS), with `emit-wire-go` writing a `// @oneof …` bridge
comment onto the Go type. (2) The **Go-service** OpenAPI emitter (`core/pkg/openapi`) reads that
`@oneof` annotation and registers a named `Platform` component shaped as `oneOf` of the five
already-registered enum `$ref`s; because `typeSchemaNamed` already `$ref`s any registered
component, fields typed `wire.Platform` then emit `$ref Platform` with no other emitter change.
Kubb turns `oneOf` into `z.union`. The `/sync` DTOs + activation handler retype to `wire.Platform`;
a custom go-playground `platform` validator (backed by `wire.Platform.Valid()`) replaces the wrong
`oneof=SHOPIFY NUVEM_SHOP` tag.

**Tech Stack:** TypeScript (Bun), TypeSpec, Go (fx, go-playground/validator), Kubb/oapi-codegen, Zod.

**Spec:** .specs/2026-05-26-cross-category-platform-union-typing-design.md
**Tasks:** 5
**Estimated minutes:** 245

**Phases & critical path:**
- T1 (commit prereq emitter fix) → **Phase A:** T2 (contracts codegen learns `Platform`) →
  **Phase B:** T3 (Go-service emitter `@oneof` capability) → T4 (DTOs + validator accept the union) →
  T5 (Contract Lock: regen SDK + verify client `z.union` + call sites).
- Critical path: T1 → T2 → T3 → T4 → T5 (strictly serial; each depends on the prior).

---

## Task 1: Commit the prerequisite cross-module enum-scan emitter fix

> This work is **already applied** in the working tree from the design session and is a hard
> prerequisite (Task 3's `Platform` `oneOf` reuses the enum components this fix registers). It is
> a chore commit of verified work — no RED/GREEN cycle. `go build`, `go vet`, and `bun tsc` were
> already confirmed green this session.

**Files:**
- Modify: `packages/api/go/core/pkg/openapi/walker.go` — adds `ownsSchemaSource` predicate (`template/*` minus `template/client-go`)
- Modify: `packages/api/go/core/pkg/openapi/enums.go` — scan uses `ownsSchemaSource`
- Modify: `packages/api/go/core/pkg/openapi/schema.go` — `findTypeByName` uses `ownsSchemaSource`
- Delete: `packages/client/dist/typescript/src/go/zod/platformSchema.ts`, `packages/client/dist/typescript/src/go/types/Platform.ts` — stale orphans
- Regen (already applied): `packages/api/go/public/openapi.json`, `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** (none — chore commit)
**Depends on:** (none)

- [ ] **Step 1: Confirm the working tree carries the applied fix**

Run: `git status --short packages/api/go/core/pkg/openapi`
Expected: `walker.go`, `enums.go`, `schema.go` listed as modified. If they are NOT modified
(clean), the fix was lost — STOP and report; do not hand-rewrite it here.

- [ ] **Step 2: Confirm baseline is green**

```bash
cd packages/api/go && (cd core && go build ./...) && go build ./... && go vet ./... && cd ../../..
bun x nx run api-typescript:tsc --skip-nx-cache
```
Expected: builds + vet clean; `api-typescript` tsc clean (0 errors).

- [ ] **Step 3: Stage the exact files and commit**

```bash
git add packages/api/go/core/pkg/openapi/walker.go \
        packages/api/go/core/pkg/openapi/enums.go \
        packages/api/go/core/pkg/openapi/schema.go \
        packages/api/go/public/openapi.json \
        packages/client/dist
git commit -m "fix(openapi): scan all template/* source modules for enums, exclude generated client-go (Task 1)"
```

Expected: the two orphan `dist` files (`platformSchema.ts`, `types/Platform.ts`) are recorded as
deletions in the commit (they were `rm`-ed this session and are staged via `git add packages/client/dist`).

---

## Task 2: The `Platform` union flows through the contracts codegen to Go + TS bindings

One behavior: declaring `union Platform` in TypeSpec produces a `wire.Platform` Go type (carrying
the `@oneof` bridge comment + a `Valid()` membership check) and a `PlatformSchema` TS union, and
the `integration.activated` event's `platform` field is typed as that union on both sides.

**Files:**
- Modify: `packages/contracts/wire/main.tsp` — add `union Platform { … }` (the five platform enums)
- Modify: `packages/contracts/wire/events/integration-activated.tsp` — `platform: string` → `platform: Platform`; rewrite the doc rationale
- Modify: `packages/contracts/codegen/lib/parse-openapi.ts` — parse `oneOf`/`anyOf`-of-`$ref` components into `unions`; remap event fields that ref a union to `union-ref`
- Modify: `packages/contracts/codegen/emit-wire-go.ts` — `emitGoUnions`; emit `unions.go`
- Modify: `packages/contracts/codegen/emit-wire-ts.ts` — `emitTsUnions`; `union-ref` → `<Name>Schema`; emit `unions/` dir + wire index re-export
- Test: `packages/contracts/codegen/lib/parse-openapi.test.ts` — NEW; union detection + event remap
- Test: `packages/contracts/codegen/emit-wire-go.test.ts` — NEW; `Platform` type + `@oneof` + `Valid()`
- Test: `packages/contracts/codegen/emit-wire-ts.test.ts` — EXTEND; `PlatformSchema = z.union([...])`
- Regen: `packages/contracts/generated/{go/wire,typescript/src/wire}/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /sdk
**Depends on:** 1

- [ ] **Step 1: Verify the TypeSpec union emit shape (read-only spike)**

Add the union to `packages/contracts/wire/main.tsp` (after the existing namespace declaration —
place near the enum imports/declarations):

```tsp
@doc("A platform identifier that may belong to any integration category — used by cross-category surfaces (sync trigger, integration activation) where the specific category is not fixed.")
union Platform {
  SalesPlatform,
  CheckoutPlatform,
  PaymentGatewayPlatform,
  MarketingPlatform,
  InfoproductPlatform,
}
```

Change `packages/contracts/wire/events/integration-activated.tsp` line 19–20 from:

```tsp
  @doc("Platform identifier (Sales/Checkout/PaymentGateway/Marketing). Open string here so the contract doesn't have to evolve when new platforms join — the Go worker validates against its registry of supported pipelines.")
  platform: string;
```

to:

```tsp
  @doc("Platform identifier — the cross-category Platform union (Sales/Checkout/PaymentGateway/Marketing/Infoproduct). Typed against the shared union so callers and the Go worker share one source of truth; adding a platform category now means extending the union.")
  platform: Platform;
```

Then compile and inspect the emitted shape:

```bash
cd packages/contracts && bun run tsp:compile && cd ../..
grep -A8 '"Platform"\|Platform:' packages/contracts/dist/contracts.openapi.yaml | head -20
```

Expected: a `Platform` schema whose body is `anyOf:` (TypeSpec's default for named unions) OR
`oneOf:` — a list of `{$ref: '#/components/schemas/SalesPlatform'}` etc. Note which keyword it is;
Step 3's parser handles **both**. (If `Platform` is absent, the union wasn't referenced — confirm
the `integration-activated.tsp` edit landed.)

- [ ] **Step 2: Write the failing parser test**

Create `packages/contracts/codegen/lib/parse-openapi.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { parseContractsOpenapi } from './parse-openapi'

const yaml = `
components:
  schemas:
    SalesPlatform: { type: string, enum: [SHOPIFY, NUVEM_SHOP] }
    MarketingPlatform: { type: string, enum: [META, GOOGLE_ADS] }
    Platform:
      anyOf:
        - $ref: '#/components/schemas/SalesPlatform'
        - $ref: '#/components/schemas/MarketingPlatform'
      description: A cross-category platform.
    IntegrationEvent:
      type: object
      properties:
        name: { type: string }
      required: [name]
    StoreActivated:
      allOf:
        - $ref: '#/components/schemas/IntegrationEvent'
      properties:
        name: { type: string, enum: ['integration.activated'] }
        platform: { $ref: '#/components/schemas/Platform' }
      required: [platform]
`

describe('parseContractsOpenapi — unions', () => {
  test('collects a oneOf/anyOf-of-$ref component as a union, not an enum or event', () => {
    const { enums, unions, events } = parseContractsOpenapi(yaml)
    expect(unions).toEqual([{ name: 'Platform', refs: ['SalesPlatform', 'MarketingPlatform'], doc: 'A cross-category platform.' }])
    expect(enums.map(e => e.name)).not.toContain('Platform')
    expect(events.map(e => e.modelName)).not.toContain('Platform')
  })

  test('remaps an event field that refs a union to union-ref (not enum-ref)', () => {
    const { events } = parseContractsOpenapi(yaml)
    const platformField = events[0]!.fields.find(f => f.name === 'platform')!
    expect(platformField.type).toEqual({ kind: 'union-ref', ref: 'Platform' })
  })
})
```

- [ ] **Step 3: Run it — verify it fails**

Run: `cd packages/contracts && bun test codegen/lib/parse-openapi.test.ts`
Expected: FAIL — `unions` is undefined on the result; `platformField.type` is `enum-ref`.

- [ ] **Step 4: Implement union parsing in `parse-openapi.ts`**

Add to the `FieldType` union (after the `enum-ref` line):

```typescript
	| { kind: 'union-ref'; ref: string }
```

Add the union type + extend `ParsedContracts`:

```typescript
export type ParsedUnion = { name: string; refs: string[]; doc?: string }

export type ParsedContracts = {
	enums: ParsedEnum[]
	unions: ParsedUnion[]
	events: ParsedEvent[]
}
```

Extend the `OASchema` interface with:

```typescript
	oneOf?: Array<{ $ref?: string }>
	anyOf?: Array<{ $ref?: string }>
```

Rewrite `parseContractsOpenapi` so unions are collected first, then events remap union refs:

```typescript
export function parseContractsOpenapi(yamlText: string): ParsedContracts {
	const doc = parseYaml(yamlText) as OADoc
	const schemas = doc.components?.schemas ?? {}

	const enums: ParsedEnum[] = []
	const unions: ParsedUnion[] = []
	const events: ParsedEvent[] = []

	// First pass: enums + unions (so event parsing can distinguish union refs).
	for (const [name, schema] of Object.entries(schemas)) {
		if (schema.type === 'string' && Array.isArray(schema.enum)) {
			enums.push({ name, values: schema.enum, doc: schema.description })
			continue
		}
		const variants = schema.oneOf ?? schema.anyOf
		if (Array.isArray(variants) && variants.length > 0 && variants.every(v => typeof v.$ref === 'string')) {
			unions.push({ name, refs: variants.map(v => v.$ref!.split('/').pop()!), doc: schema.description })
		}
	}

	const unionNames = new Set(unions.map(u => u.name))

	// Second pass: events, remapping any enum-ref that targets a union.
	for (const [name, schema] of Object.entries(schemas)) {
		const ev = tryParseEvent(name, schema, schemas)
		if (!ev) continue
		for (const f of ev.fields) {
			if (f.type.kind === 'enum-ref' && unionNames.has(f.type.ref)) {
				f.type = { kind: 'union-ref', ref: f.type.ref }
			}
		}
		events.push(ev)
	}

	return { enums, unions, events }
}
```

- [ ] **Step 5: Run the parser test — verify it passes**

Run: `cd packages/contracts && bun test codegen/lib/parse-openapi.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Write the failing Go-emitter test**

Create `packages/contracts/codegen/emit-wire-go.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { emitGoUnions } from './emit-wire-go'
import type { ParsedUnion } from './lib/parse-openapi'

describe('emitGoUnions', () => {
  const platform: ParsedUnion = { name: 'Platform', refs: ['SalesPlatform', 'MarketingPlatform'], doc: 'Cross-category.' }

  test('emits a typed-string with a @oneof bridge comment and a Valid() membership check', () => {
    const out = emitGoUnions([platform])
    expect(out).toContain('// @oneof SalesPlatform MarketingPlatform')
    expect(out).toContain('type Platform string')
    expect(out).toContain('func (p Platform) Valid() bool {')
    expect(out).toContain('if _, err := ParseSalesPlatform(string(p)); err == nil {')
    expect(out).toContain('if _, err := ParseMarketingPlatform(string(p)); err == nil {')
    expect(out).toContain('package wire')
  })
})
```

- [ ] **Step 7: Run it — verify it fails**

Run: `cd packages/contracts && bun test codegen/emit-wire-go.test.ts`
Expected: FAIL — `emitGoUnions` is not exported.

- [ ] **Step 8: Implement `emitGoUnions` in `emit-wire-go.ts`**

Update the import to include `ParsedUnion`:

```diff
-import { parseContractsOpenapi, type ParsedEnum, type ParsedEvent, type FieldType } from './lib/parse-openapi'
+import { parseContractsOpenapi, type ParsedEnum, type ParsedUnion, type ParsedEvent, type FieldType } from './lib/parse-openapi'
```

`goType` needs no change — `union-ref` is handled by adding a case that mirrors `enum-ref`:

```diff
 		case 'enum-ref':
 			return t.ref
+		case 'union-ref':
+			return t.ref
```

Add the emitter function (after `emitGoEnums`):

```typescript
export function emitGoUnions(unions: ParsedUnion[]): string {
	const lines: string[] = [HEADER, 'package wire', '']
	for (const u of unions) {
		lines.push(`// ${u.name} is a cross-category union of platform enums.`)
		if (u.doc) lines.push(`// ${u.doc}`)
		// Bridge annotation: read by core/pkg/openapi to emit a oneOf component.
		lines.push(`// @oneof ${u.refs.join(' ')}`)
		lines.push(`type ${u.name} string`)
		lines.push('')
		lines.push(`// Valid reports whether the value is a member of any variant enum.`)
		lines.push(`func (p ${u.name}) Valid() bool {`)
		for (const r of u.refs) {
			lines.push(`\tif _, err := Parse${r}(string(p)); err == nil {`)
			lines.push(`\t\treturn true`)
			lines.push(`\t}`)
		}
		lines.push(`\treturn false`)
		lines.push(`}`)
		lines.push('')
	}
	return lines.join('\n')
}
```

In `run()`, write the unions file after enums:

```diff
 	await writeFile(join(OUTPUT, 'enums.go'), emitGoEnums(parsed.enums))
+	if (parsed.unions.length > 0) {
+		await writeFile(join(OUTPUT, 'unions.go'), emitGoUnions(parsed.unions))
+	}
 	await writeFile(join(OUTPUT, 'events.go'), emitGoEvents(parsed.events))
```

- [ ] **Step 9: Run the Go-emitter test — verify it passes**

Run: `cd packages/contracts && bun test codegen/emit-wire-go.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 10: Write the failing TS-emitter test**

Append to `packages/contracts/codegen/emit-wire-ts.test.ts`:

```typescript
import { emitTsUnions } from './emit-wire-ts'
import type { ParsedUnion } from './lib/parse-openapi'

describe('emitTsUnions', () => {
  const platform: ParsedUnion = { name: 'Platform', refs: ['SalesPlatform', 'MarketingPlatform'], doc: 'Cross-category.' }

  test('emits PlatformSchema as a z.union of the member enum schemas', () => {
    const out = emitTsUnions([platform])
    const f = out['platform.ts']!
    expect(f).toContain(`import { z } from '@template/core-typescript/schema'`)
    expect(f).toContain(`import { SalesPlatform, MarketingPlatform } from '../enums'`)
    expect(f).toContain('export const PlatformSchema = z.union([z.enum(SalesPlatform), z.enum(MarketingPlatform)])')
    expect(out['index.ts']).toContain("export * from './platform'")
  })
})
```

Also extend the existing `emitTsEvents` describe with a union-ref assertion (add inside the
existing `sample` event, append a field, and one expectation):

```typescript
  test('a union-ref field uses <Name>Schema imported from ../unions', () => {
    const ev = { ...sample, fields: [...sample.fields, { name: 'platform', type: { kind: 'union-ref' as const, ref: 'Platform' }, required: true }] }
    const f = emitTsEvents([ev])['video-uploaded.ts']!
    expect(f).toContain('platform: PlatformSchema,')
    expect(f).toContain(`import { PlatformSchema } from '../unions'`)
  })
```

- [ ] **Step 11: Run it — verify it fails**

Run: `cd packages/contracts && bun test codegen/emit-wire-ts.test.ts`
Expected: FAIL — `emitTsUnions` not exported; `union-ref` not handled in `zodExpr`.

- [ ] **Step 12: Implement union emission in `emit-wire-ts.ts`**

Update the import:

```diff
-import { parseContractsOpenapi, type ParsedEnum, type ParsedEvent, type FieldType } from './lib/parse-openapi'
+import { parseContractsOpenapi, type ParsedEnum, type ParsedUnion, type ParsedEvent, type FieldType } from './lib/parse-openapi'
```

Handle `union-ref` in `zodExpr` (after the `enum-ref` case):

```diff
 		case 'enum-ref':
 			return `z.enum(${t.ref})`
+		case 'union-ref':
+			return `${t.ref}Schema`
```

Add the union emitter (after `emitTsEnums`):

```typescript
export function emitTsUnions(unions: ParsedUnion[]): Record<string, string> {
	const files: Record<string, string> = {}
	const indexLines: string[] = []
	for (const u of unions) {
		const members = u.refs.map(r => `z.enum(${r})`).join(', ')
		const body =
			HEADER +
			`import { z } from '@template/core-typescript/schema'\n` +
			`import { ${u.refs.join(', ')} } from '../enums'\n\n` +
			(u.doc ? `/** ${u.doc} */\n` : '') +
			`export const ${u.name}Schema = z.union([${members}])\n`
		files[`${kebab(u.name)}.ts`] = body
		indexLines.push(`export * from './${kebab(u.name)}'`)
	}
	files['index.ts'] = `${HEADER + indexLines.sort().join('\n')}\n`
	return files
}
```

In `emitTsEvents`, collect union-ref imports from `../unions` alongside the enum imports. After the
existing `enumImports` block, add:

```typescript
		const unionRefs = payloadFields.filter(f => f.type.kind === 'union-ref').map(f => (f.type as { ref: string }).ref)
		const unionImports = [...new Set(unionRefs)].sort()
		if (unionImports.length > 0) {
			importLines.push(`import { ${unionImports.map(r => `${r}Schema`).join(', ')} } from '../unions'`)
		}
```

In `run()`, emit the unions dir + add to the wire index:

```diff
 	const enumDir = join(OUTPUT, 'enums')
+	const unionDir = join(OUTPUT, 'unions')
 	const eventDir = join(OUTPUT, 'events')
```

```diff
 	const enumFiles = emitTsEnums(parsed.enums)
 	for (const [name, contents] of Object.entries(enumFiles)) {
 		await writeFile(join(enumDir, name), contents)
 	}
+	if (parsed.unions.length > 0) {
+		await rm(unionDir, { recursive: true, force: true })
+		await mkdir(unionDir, { recursive: true })
+		const unionFiles = emitTsUnions(parsed.unions)
+		for (const [name, contents] of Object.entries(unionFiles)) {
+			await writeFile(join(unionDir, name), contents)
+		}
+	}
```

```diff
-	const wireIndex = `${HEADER}export * from './enums'\nexport * from './events'\n`
+	const unionExport = parsed.unions.length > 0 ? `export * from './unions'\n` : ''
+	const wireIndex = `${HEADER}export * from './enums'\n${unionExport}export * from './events'\n`
```

- [ ] **Step 13: Run the TS-emitter test — verify it passes**

Run: `cd packages/contracts && bun test codegen/emit-wire-ts.test.ts`
Expected: PASS — existing tests + 2 new.

- [ ] **Step 14: Regenerate the wire bindings and compile-check generated Go**

```bash
cd packages/contracts && bun run codegen:wire && cd ../..
# Generated Go must compile (Valid() calls the generated ParseX funcs):
cd packages/api/go && (cd ../../contracts/generated/go && go build ./...) ; go build ./... && cd ../../..
```

Expected:
- `packages/contracts/generated/go/wire/unions.go` exists with `type Platform string`, `// @oneof SalesPlatform CheckoutPlatform PaymentGatewayPlatform MarketingPlatform InfoproductPlatform`, and `func (p Platform) Valid() bool`.
- `packages/contracts/generated/typescript/src/wire/unions/platform.ts` exists with `export const PlatformSchema = z.union([...])`.
- The generated `IntegrationActivated` Go event struct's `Platform` field is now `Platform` (the union type); the TS event schema's `platform` is `PlatformSchema`.
- `go build` clean across api-go + contracts-go.

- [ ] **Step 15: Full type-check + lint**

Run: `bun tsc && bun lint`
Expected: 0 errors. (No client/SDK regen yet — that is Task 5. `api-typescript` only consumes wire
bindings here, which stay structurally compatible.)

- [ ] **Step 16: Commit**

```bash
git add packages/contracts/wire packages/contracts/codegen packages/contracts/generated
git commit -m "feat(contracts): Platform union — TypeSpec source + codegen (Go @oneof+Valid, TS z.union) (Task 2)"
```

---

## Task 3: The Go-service emitter renders `@oneof`-annotated types as a `oneOf` component

One behavior: a Go type carrying `// @oneof A B C` becomes a named `oneOf`-of-enum-`$ref`s component
in the service OpenAPI, and a struct field typed as that type emits `$ref` to it.

**Files:**
- Create: `packages/api/go/core/pkg/openapi/oneof.go` — `registerOneofUnions(spec, w)` + `@oneof` parse
- Modify: `packages/api/go/core/pkg/openapi/emit.go` — call `registerOneofUnions` right after `registerEnums`
- Test: `packages/api/go/core/pkg/openapi/oneof_test.go` — NEW (first test in this package)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /sdk
**Depends on:** 2

- [ ] **Step 1: Write the failing parse test**

Create `packages/api/go/core/pkg/openapi/oneof_test.go`:

```go
package openapi

import "testing"

func TestParseOneofAnnotation(t *testing.T) {
	cases := []struct {
		name string
		text string
		want []string
	}{
		{"basic", "Platform is a union.\n@oneof SalesPlatform CheckoutPlatform MarketingPlatform\n", []string{"SalesPlatform", "CheckoutPlatform", "MarketingPlatform"}},
		{"none", "Just a normal doc comment.\n", nil},
		{"single", "@oneof SalesPlatform\n", []string{"SalesPlatform"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseOneofAnnotation(tc.text)
			if len(got) != len(tc.want) {
				t.Fatalf("parseOneofAnnotation(%q) = %v, want %v", tc.text, got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("member %d = %q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestRegisterOneofUnionsEmitsOneofComponent(t *testing.T) {
	spec := newSpec()
	// Pre-register the member enums (registerEnums runs before registerOneofUnions in Generate).
	spec.putSchema("SalesPlatform", map[string]any{"type": "string", "enum": []any{"SHOPIFY"}})
	spec.putSchema("MarketingPlatform", map[string]any{"type": "string", "enum": []any{"META"}})

	emitOneofComponent(spec, "Platform", []string{"SalesPlatform", "MarketingPlatform"})

	got, ok := spec.schemas()["Platform"].(map[string]any)
	if !ok {
		t.Fatal("Platform component not registered")
	}
	variants, ok := got["oneOf"].([]map[string]any)
	if !ok || len(variants) != 2 {
		t.Fatalf("Platform.oneOf = %v, want 2 $ref variants", got["oneOf"])
	}
	if variants[0]["$ref"] != "#/components/schemas/SalesPlatform" {
		t.Fatalf("variant[0] = %v", variants[0])
	}
}
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd packages/api/go/core && go test ./pkg/openapi/ -run 'Oneof'`
Expected: FAIL — `parseOneofAnnotation` / `emitOneofComponent` undefined.

- [ ] **Step 3: Implement `oneof.go`**

Create `packages/api/go/core/pkg/openapi/oneof.go`:

```go
package openapi

import (
	"go/types"
	"regexp"
	"strings"
)

var oneofLineRE = regexp.MustCompile(`@oneof\s+(.+)`)

// parseOneofAnnotation extracts the member type names from a `@oneof A B C` line
// in a type's doc comment. Returns nil when no annotation is present.
func parseOneofAnnotation(text string) []string {
	for _, line := range strings.Split(text, "\n") {
		if m := oneofLineRE.FindStringSubmatch(line); m != nil {
			return strings.Fields(m[1])
		}
	}
	return nil
}

// emitOneofComponent registers a named oneOf component referencing each member by $ref.
func emitOneofComponent(spec *Spec, name string, members []string) {
	variants := make([]map[string]any, 0, len(members))
	for _, m := range members {
		variants = append(variants, ref(m))
	}
	spec.putSchema(name, map[string]any{"oneOf": variants})
}

// registerOneofUnions scans owned source packages for type declarations carrying a
// `@oneof` doc-comment annotation and registers each as a named oneOf component.
// Member enum components are expected to already be registered by registerEnums.
func registerOneofUnions(spec *Spec, w *walker) error {
	for _, ppath := range w.sortedPkgPaths() {
		if !ownsSchemaSource(ppath) {
			continue
		}
		pkg := w.byPath[ppath]
		if pkg.Types == nil {
			continue
		}
		scope := pkg.Types.Scope()
		for _, name := range scope.Names() {
			obj := scope.Lookup(name)
			tn, ok := obj.(*types.TypeName)
			if !ok {
				continue
			}
			if _, ok := tn.Type().(*types.Named); !ok {
				continue
			}
			cg := w.findTypeDeclComment(pkg, name)
			if cg == nil {
				continue
			}
			members := parseOneofAnnotation(cg.Text())
			if len(members) == 0 {
				continue
			}
			emitOneofComponent(spec, name, members)
		}
	}
	return nil
}
```

- [ ] **Step 4: Wire it into `emit.go`**

Modify `packages/api/go/core/pkg/openapi/emit.go` — after the `registerEnums` block (before
`collectUnions`), add:

```go
	// Scalar enum-union annotations (@oneof) across owned modules — must run
	// after registerEnums so member enum components already exist for the $refs.
	if err := registerOneofUnions(spec, w); err != nil {
		return fmt.Errorf("oneof unions: %w", err)
	}
```

- [ ] **Step 5: Run the package tests — verify they pass**

Run: `cd packages/api/go/core && go test ./pkg/openapi/ -run 'Oneof'`
Expected: PASS — both tests.

- [ ] **Step 6: Build + vet the core module**

Run: `cd packages/api/go/core && go build ./... && go vet ./...`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/api/go/core/pkg/openapi/oneof.go \
        packages/api/go/core/pkg/openapi/oneof_test.go \
        packages/api/go/core/pkg/openapi/emit.go
git commit -m "feat(openapi): @oneof scalar enum-union capability — named oneOf component (Task 3)"
```

---

## Task 4: `/sync` endpoints + activation handler accept any platform category and reject non-platforms

One behavior: a `POST /sync` (and `/sync/jobs`) body carrying a `MarketingPlatform` value passes
validation and is typed `wire.Platform`; a non-platform string is rejected.

**Files:**
- Modify: `packages/api/go/core/pkg/validation/validation.go` — expose a `RegisterValidation` passthrough (keeps `core` free of `contracts-go`; `core/go.mod` does NOT require `contracts-go`, confirmed)
- Create: `packages/api/go/internal/sync/controllers/validators.go` — `init()` registers the `platform` tag backed by `wire.Platform.Valid()`
- Modify: `packages/api/go/internal/sync/controllers/sync_controller.go` — `Platform string` → `wire.Platform`; tag `validate:"required,platform"`; `string(req.Platform)` at the use-case boundary
- Modify: `packages/api/go/internal/sync/controllers/start_sync.go` — same three changes
- Modify: `packages/api/go/internal/sync/handlers/integration_activated_handler.go` — `StartSyncArgs.Platform` → `wire.Platform`; cast where it flows to the use case
- Test: extend `packages/api/go/internal/sync/controllers/sync_controller_test.go` — accepts a MarketingPlatform; rejects a bogus value

> **Validator placement (resolved):** `core/go.mod` does not import `template/contracts-go`, so the
> `platform` rule cannot call `wire.Platform.Valid()` from inside `core`. Instead `core/pkg/validation`
> exposes a generic `RegisterValidation` passthrough, and api-go registers the domain-specific
> `platform` tag from an `init()` in the sync `controllers` package (which already imports both `wire`
> and the validator, and is loaded by fx at startup and by the test binary). Core stays generic.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /test
**Depends on:** 3

- [ ] **Step 1: Write the failing validator test**

Add to `packages/api/go/internal/sync/controllers/sync_controller_test.go` using the file's existing
harness verbatim: `newSyncController(...)` + `httptest.NewRequest` + `c.Handle(rec, req)` +
`objects.NewID().String()` (all already imported in this file). The `validators.go` `init()` (Step 3)
registers the `platform` tag for both the binary and the test.

```go
func TestSyncController_AcceptsMarketingPlatform(t *testing.T) {
	// MarketingPlatform values must pass body validation (regression: the old
	// oneof=SHOPIFY NUVEM_SHOP tag rejected META). Downstream may return 200-with-details
	// (no META pipeline registered), but it must NOT be a 400 carrying a Platform field error.
	c := newSyncController(nil)
	body := `{"platform":"META","storeIntegrationId":"` + objects.NewID().String() + `"}`
	req := httptest.NewRequest(http.MethodPost, "/sync", strings.NewReader(body))
	rec := httptest.NewRecorder()

	c.Handle(rec, req)

	if rec.Code == http.StatusBadRequest && strings.Contains(rec.Body.String(), `"field":"Platform"`) {
		t.Fatalf("META wrongly rejected by platform validation: %s", rec.Body.String())
	}
}

func TestSyncController_RejectsNonPlatform(t *testing.T) {
	c := newSyncController(nil)
	body := `{"platform":"NOT_A_PLATFORM","storeIntegrationId":"` + objects.NewID().String() + `"}`
	req := httptest.NewRequest(http.MethodPost, "/sync", strings.NewReader(body))
	rec := httptest.NewRecorder()

	c.Handle(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-platform value, got %d: %s", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd packages/api/go && go test ./internal/sync/controllers/ -run 'Platform'`
Expected: FAIL — `META` rejected by the current `oneof=SHOPIFY NUVEM_SHOP` tag (and/or compile
error once the validator tag is changed in Step 3).

- [ ] **Step 3: Expose `RegisterValidation` from core, register `platform` from api-go**

Modify `packages/api/go/core/pkg/validation/validation.go` — add a passthrough (keeps core generic;
do NOT import `contracts-go` here). After the `validate` var:

```go
// RegisterValidation registers a custom validation tag on the shared validator.
// Downstream modules call this at startup to add domain-specific rules.
func RegisterValidation(tag string, fn validator.Func) error {
	return validate.RegisterValidation(tag, fn)
}
```

Create `packages/api/go/internal/sync/controllers/validators.go`:

```go
package controllers

import (
	wire "template/contracts-go/wire"
	validation "template/core-go/pkg/validation"

	"github.com/go-playground/validator/v10"
)

// Register the `platform` tag: a value is valid iff it is a member of the
// cross-category Platform union. Lives in api-go (not core) because core does
// not depend on contracts-go. Runs at package init — fx imports this package
// at startup, and the test binary imports it too.
func init() {
	_ = validation.RegisterValidation("platform", func(fl validator.FieldLevel) bool {
		return wire.Platform(fl.Field().String()).Valid()
	})
}
```

- [ ] **Step 4: Retype the DTO fields + boundary casts**

Modify `packages/api/go/internal/sync/controllers/sync_controller.go`:
- Add import `wire "template/contracts-go/wire"`.
- Change the `Platform` field:

```diff
-	Platform                   string                   `from:"body" json:"platform"                   validate:"required,oneof=SHOPIFY NUVEM_SHOP"`
+	Platform                   wire.Platform            `from:"body" json:"platform"                   validate:"required,platform"`
```

- At the `StartSyncInput` construction, cast: `Platform: string(req.Platform),`

Apply the identical three changes to `packages/api/go/internal/sync/controllers/start_sync.go`.

Modify `packages/api/go/internal/sync/handlers/integration_activated_handler.go`:
- Change `StartSyncArgs.Platform` from `string` to `wire.Platform`.
- `decoded.Platform` is now `wire.Platform` (cascaded from Task 2's wire regen), so
  `Platform: decoded.Platform` type-checks. Where `StartSyncArgs.Platform` flows into the
  `usecases.StartSyncInput` (string), cast with `string(in.Platform)` at that adapter boundary.

> The `usecases.StartSyncInput.Platform` field stays `string` — the union is a wire/transport
> concern; the use case keeps its primitive input. Cast at every boundary, do not thread the
> type into the use case.

- [ ] **Step 5: Run the controller tests — verify they pass**

Run: `cd packages/api/go && go test ./internal/sync/...`
Expected: PASS — new platform tests green; existing sync tests still green.

- [ ] **Step 6: Build + vet api-go**

Run: `cd packages/api/go && go build ./... && go vet ./...`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/api/go/core/pkg/validation/validation.go \
        packages/api/go/internal/sync/controllers/validators.go \
        packages/api/go/internal/sync/controllers/sync_controller.go \
        packages/api/go/internal/sync/controllers/start_sync.go \
        packages/api/go/internal/sync/handlers/integration_activated_handler.go \
        packages/api/go/internal/sync/controllers/sync_controller_test.go
git commit -m "feat(sync): platform fields accept the cross-category Platform union (Task 4)"
```

---

## Task 5: Contract Lock — regenerate the service OpenAPI + SDK; client `platform` is `z.union`

**Files:**
- Regen: `packages/api/go/public/openapi.json`
- Regen: `packages/client/dist/**`
- Verify/Modify: `packages/api/typescript/src/integration/usecases/TriggerReintegration.ts`, `packages/api/typescript/src/marketing/usecases/ReconcileMarketingAccounts.ts` (call sites — only if tsc flags them)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** 4

- [ ] **Step 1: Regenerate the Go service OpenAPI + the SDK**

```bash
cd packages/api/go && go run ./cmd/emit-openapi && cd ../../..
bun sdk
```

- [ ] **Step 2: Verify the service OpenAPI carries the `Platform` oneOf + `$ref` fields**

```bash
python3 -c "import json; d=json.load(open('packages/api/go/public/openapi.json')); s=d['paths']['/sync/sync']['post']['requestBody']['content']['application/json']['schema']; print('platform =>', json.dumps(s['properties']['platform'])); print('Platform component =>', json.dumps(d['components']['schemas'].get('Platform')))"
```

Expected: `platform => {"$ref": "#/components/schemas/Platform"}` and a `Platform` component
shaped `{"oneOf": [{"$ref": ".../SalesPlatform"}, … five refs]}`.

- [ ] **Step 3: Verify the generated client types `platform` as a union (not `z.string()`)**

```bash
grep -n "platform\|Platform" packages/client/dist/typescript/src/go/zod/syncSchema.ts
```

Expected: `platform` references a `platformSchema` (or inline `z.union([...])`) of the five
member enum schemas — NOT `z.string()`.

- [ ] **Step 4: Full type-check (forced, no cache) + lint**

```bash
bun x nx run api-typescript:tsc --skip-nx-cache
bun tsc && bun lint
```

Expected: 0 errors. If `TriggerReintegration.ts` / `ReconcileMarketingAccounts.ts` flag a type
mismatch, the call site passes a value outside the union — fix by passing the correctly-typed
platform (these already pass `integration.platform` / a `MarketingPlatform`, both union members,
so no change is the expected outcome).

- [ ] **Step 5: Run affected tests**

```bash
bun x nx affected -t test --base=dev
cd packages/api/go && go test ./... && cd ../../..
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/api/go/public/openapi.json packages/client/dist packages/api/typescript
git commit -m "chore(sdk): regenerate openapi+sdk — client.go.sync platform is z.union (Task 5)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean (including `api-typescript --skip-nx-cache`)
- [ ] `bun lint` — lint clean
- [ ] `bun x nx affected -t test --base=dev` — affected TS tests pass
- [ ] `cd packages/api/go && go test ./... && go vet ./...` — Go tests + vet pass (api-go + core)
- [ ] `cd packages/contracts && bun test codegen/` — contracts codegen tests pass
- [ ] AC mapping (every spec AC → ≥1 test/verification path):
  - AC-1 → `packages/contracts/wire/{main,events/integration-activated}.tsp` (Task 2 Step 1) + manual review of doc text
  - AC-2 → `packages/contracts/codegen/emit-wire-go.test.ts:"emits a typed-string with a @oneof bridge comment and a Valid() membership check"` + Task 2 Step 14 (generated `unions.go` compiles)
  - AC-3 → `packages/contracts/codegen/emit-wire-ts.test.ts:"emits PlatformSchema as a z.union of the member enum schemas"`
  - AC-4 → Task 5 Step 2 (service `openapi.json` has `Platform` oneOf + `$ref` on `/sync` bodies)
  - AC-5 → Task 5 Step 3 (`syncSchema.ts` platform is the union, not `z.string()`)
  - AC-6 → `packages/api/go/internal/sync/controllers/sync_controller_test.go:"TestSyncController_AcceptsMarketingPlatform"` + `":TestSyncController_RejectsNonPlatform"`
  - AC-7 → Final Validation block (tsc/vet/test all clean post-regen)
  - AC-8 → review diff: `handshake.go` + single-category fields untouched; only the fields in Decision 5 changed

## Notes

- **Two Go modules:** `core/pkg/openapi` lives in module `template/core-go`; the sync code lives in
  `template/api-go`. Build/test each from its own module root (`cd packages/api/go/core` vs
  `cd packages/api/go`).
- **TypeSpec union keyword:** TypeSpec's OAS3 emitter may render a named union as `anyOf` (its
  default) rather than `oneOf`. Task 2 Step 1 confirms the actual keyword; the parser (Step 4)
  accepts both. The Go-service emitter always emits `oneOf` regardless (it controls that shape),
  and Kubb maps both `anyOf`/`oneOf` to `z.union`.
- **core → contracts-go (resolved):** `core/go.mod` does NOT require `template/contracts-go`
  (confirmed during planning), so the `platform` validator is NOT registered in core. Core exposes
  a generic `RegisterValidation` passthrough; api-go registers the `platform` rule via an `init()`
  in `internal/sync/controllers/validators.go`. Do not add `contracts-go` to `core/go.mod`.
- **No new commands.** All `bun`/`go` invocations above already exist (`bun sdk`, `bun tsc`,
  `bun lint`, `codegen:wire`, `tsp:compile`, `cmd/emit-openapi`).
