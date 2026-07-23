import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Union-parity rail (union-slots spec §3) — three MECHANICAL checks over the @unionSlot/@variant
 * declarations, driven entirely by the generated union MANIFESTS (`<Event>Unions` exports in
 * `@codedm/contracts-typescript/wire/events`, emitted from the x-union-slots contract extensions).
 * Zero hand lists: declaring a new slot/variant in the contract auto-extends every check.
 *
 *   1. RESOLUTION IN THE OWNER — every `@variant` type name resolves to a real type in its owner
 *      workspace. Resolvers are plugable per workspace `lang` (REPO.workspaces — the detectLang
 *      pattern): `go` = a `type <Name> struct|=` declaration under the workspace srcRoot (the same
 *      source set the pkg/openapi AST walker loads); `typescript` = an exported zod schema named
 *      `<camel(name)>Schema`. A new language = a new resolver entry, never an if-chain.
 *
 *   2. COMPLETE EMISSION — every emitting surface whose response carries a union slot publishes the
 *      COMPLETE oneOf (all declared variants):
 *        - the Go gateway's emitted openapi (public/docs/openapi.json — pkg/openapi AST output):
 *          the payload component must be a oneOf covering every declared content variant, with no
 *          `x-union-variant-missing` marker anywhere in the spec. The artifact is build output
 *          (gitignored); when absent the check falls back to the committed /go SDK, which is
 *          generated FROM that spec — one variant zod schema per declared variant.
 *        - the TS daemon's emitted openapi (tracked): the response union of any endpoint that
 *          re-emits the event must carry every declared (discriminator-const) variant pair.
 *
 *   3. NO REDECLARATION — no non-owner workspace declares a type with a foreign variant name, and
 *      cross-service consumption of variant schemas goes through the generated client bindings
 *      (`@codedm/client-typescript/<service>`) — import-grep, not convention.
 *
 * Lives in `tests/architecture/` (the shared home for repo-wide mechanical detectors) AND is wired
 * into the root `test:tooling` sweep (spec §5.5 mandates both).
 */
import * as WireEvents from '@codedm/contracts-typescript/wire/events'

const ROOT = join(import.meta.dir, '..', '..', '..', '..', '..')

// Dynamic import (molde env-model.test.ts): template.config.ts lives OUTSIDE this package's
// tsconfig graph — a static import would make typed eslint build a program for it and die.
interface WorkspaceDecl {
	srcRoot: string
	lang: string
	kind: string
}
const { REPO } = (await import(join(ROOT, 'template.config.ts'))) as { REPO: { workspaces: Record<string, WorkspaceDecl> } }

interface VariantDecl {
	values: readonly string[]
	typeName: string
	owner: string
}
interface SlotDecl {
	discriminators: readonly string[]
	variants: readonly VariantDecl[]
}
interface EventUnions {
	eventModel: string
	wireName: string
	slots: Record<string, SlotDecl>
}

/** Every generated `<Event>Unions` manifest, paired with its event class's wire name. */
function collectManifests(): EventUnions[] {
	const out: EventUnions[] = []
	for (const [key, value] of Object.entries(WireEvents)) {
		if (!key.endsWith('Unions') || typeof value !== 'object' || value === null) continue
		const eventModel = `${key.slice(0, -'Unions'.length)}Event`
		const eventClass = (WireEvents as Record<string, unknown>)[eventModel] as { name?: string } | undefined
		if (typeof eventClass?.name !== 'string') {
			throw new Error(`manifest ${key} has no matching event class ${eventModel} in the wire barrel`)
		}
		out.push({ eventModel, wireName: eventClass.name, slots: value as Record<string, SlotDecl> })
	}
	return out
}

const MANIFESTS = collectManifests()

function walk(dir: string, ext: string, acc: string[] = []): string[] {
	if (!existsSync(dir)) return acc
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === 'node_modules' || e.name.startsWith('.')) continue
		const p = join(dir, e.name)
		if (e.isDirectory()) walk(p, ext, acc)
		else if (e.name.endsWith(ext)) acc.push(p)
	}
	return acc
}

const camel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

// ── Per-lang variant resolvers (plugable — the detectLang pattern: workspace declares `lang`,
// the resolver is a lookup, never an if-chain over names/paths). ──────────────────────────────
type Resolver = (typeName: string, srcRoot: string) => boolean

const goDeclares: Resolver = (typeName, srcRoot) => {
	const re = new RegExp(`^type\\s+${typeName}\\s+(struct\\b|=)`, 'm')
	return walk(join(ROOT, srcRoot), '.go').some(f => re.test(readFileSync(f, 'utf-8')))
}

const tsDeclaresSchema: Resolver = (typeName, srcRoot) => {
	const re = new RegExp(`^export\\s+const\\s+${camel(typeName)}Schema\\b`, 'm')
	return walk(join(ROOT, srcRoot), '.ts').some(f => re.test(readFileSync(f, 'utf-8')))
}

const RESOLVERS: Record<string, Resolver> = {
	go: goDeclares,
	typescript: tsDeclaresSchema,
}

const workspaces: Record<string, WorkspaceDecl> = REPO.workspaces

describe('union-parity — the manifests exist (pilot floor)', () => {
	test('at least the channel_message.received pilot declares union slots', () => {
		const pilot = MANIFESTS.find(m => m.wireName === 'integration.channel_message.received')
		expect(pilot).toBeDefined()
		expect(Object.keys(pilot!.slots).sort()).toEqual(['content', 'platformData'])
		expect(pilot!.slots.content!.variants).toHaveLength(11)
		expect(pilot!.slots.platformData!.variants).toHaveLength(2)
	})
})

describe('union-parity check 1 — every @variant resolves to a real type in its OWNER workspace', () => {
	for (const m of MANIFESTS) {
		for (const [slotName, slot] of Object.entries(m.slots)) {
			for (const v of slot.variants) {
				test(`${m.eventModel}.${slotName} → ${v.typeName} resolves in ${v.owner}`, () => {
					const ws = workspaces[v.owner]
					expect(ws, `owner "${v.owner}" must be a WORKSPACES id`).toBeDefined()
					const resolver = RESOLVERS[ws!.lang]
					expect(resolver, `no variant resolver for lang "${ws!.lang}" — add one to RESOLVERS`).toBeDefined()
					expect(
						resolver!(v.typeName, ws!.srcRoot),
						`variant type "${v.typeName}" (slot ${slotName} of ${m.eventModel}) not declared in its owner workspace ` +
							`"${v.owner}" (${ws!.srcRoot}) — the contract names a shape the owner does not define`,
					).toBe(true)
				})
			}
		}
	}
})

describe('union-parity check 2 — every emitting surface publishes the COMPLETE oneOf', () => {
	const goSpecPath = join(ROOT, 'packages/api/go/public/docs/openapi.json')

	test('gateway (Go): payload component carries all declared content variants, no missing-variant markers', () => {
		const pilot = MANIFESTS.find(m => m.wireName === 'integration.channel_message.received')!
		const contentVariants = pilot.slots.content!.variants
		if (existsSync(goSpecPath)) {
			const spec = readFileSync(goSpecPath, 'utf-8')
			expect(spec.includes('x-union-variant-missing'), 'gateway spec contains x-union-variant-missing markers').toBe(false)
			const doc = JSON.parse(spec) as { components: { schemas: Record<string, unknown> } }
			const payloadName = `${pilot.eventModel.slice(0, -'Event'.length)}Payload`
			const payload = doc.components.schemas[payloadName] as { oneOf?: Array<{ $ref: string }> } | undefined
			expect(payload?.oneOf, `${payloadName} must be a oneOf in the gateway spec`).toBeDefined()
			expect(payload!.oneOf!.length).toBe(contentVariants.length)
			// Each declared variant maps to the scanner's synthesized component name: <Payload>_<Pascal(values)>.
			for (const v of contentVariants) {
				const suffix = v.values.map(x => x.charAt(0) + x.slice(1).toLowerCase()).join('_')
				const refName = `${payloadName}_${suffix}`
				expect(
					payload!.oneOf!.some(r => r.$ref.endsWith(`/${refName}`)),
					`gateway oneOf is missing declared variant ${refName}`,
				).toBe(true)
			}
		} else {
			// Build artifact absent (fresh clone): the committed /go SDK is generated FROM that spec —
			// one variant zod schema file per declared variant proves the emitted union was complete.
			const zodDir = join(ROOT, 'packages/client/dist/typescript/src/go/zod')
			const payloadCamel = camel(`${pilot.eventModel.slice(0, -'Event'.length)}Payload`)
			for (const v of contentVariants) {
				const suffix = v.values.map(x => x.charAt(0) + x.slice(1).toLowerCase()).join('')
				const file = join(zodDir, `${payloadCamel}${suffix}Schema.ts`)
				expect(existsSync(file), `committed /go SDK lacks variant schema ${file}`).toBe(true)
			}
		}
	})

	test('daemon (TS): the re-emitting SSE response carries every declared content variant pair', () => {
		const pilot = MANIFESTS.find(m => m.wireName === 'integration.channel_message.received')!
		const spec = readFileSync(join(ROOT, 'packages/api/typescript/public/docs/openapi.json'), 'utf-8')
		const doc = JSON.parse(spec) as { paths: Record<string, Record<string, unknown>> }
		const flat = JSON.stringify(doc.paths)
		// The daemon re-emits the event on its SSE surface: the frame with the wire-name const must
		// exist, and every declared (platform, messageType) const pair must appear in the spec.
		expect(flat.includes(`"${pilot.wireName}"`), 'daemon spec does not carry the re-emitted frame').toBe(true)
		for (const v of pilot.slots.content!.variants) {
			const [platform, messageType] = v.values
			const pair = `"platform":{"type":"string","const":"${platform}"`
			const typePair = `"messageType":{"type":"string","const":"${messageType}"`
			expect(flat.includes(pair), `daemon spec union lacks a platform const ${platform}`).toBe(true)
			expect(flat.includes(typePair), `daemon spec union lacks a messageType const ${messageType}`).toBe(true)
		}
	})
})

describe('union-parity check 3 — no redeclaration outside the owner; consumption only via generated bindings', () => {
	const backendWorkspaces = Object.entries(workspaces).filter(([, ws]) => ws.kind === 'backend')

	for (const m of MANIFESTS) {
		for (const slot of Object.values(m.slots)) {
			for (const v of slot.variants) {
				test(`${v.typeName} is declared ONLY in ${v.owner}`, () => {
					for (const [id, ws] of backendWorkspaces) {
						if (id === v.owner) continue
						const declRe =
							ws.lang === 'go'
								? new RegExp(`^type\\s+${v.typeName}\\s+(struct\\b|=)`, 'm')
								: new RegExp(
										`^export\\s+(type|interface|class|enum)\\s+${v.typeName}\\b|^export\\s+const\\s+${camel(v.typeName)}Schema\\b`,
										'm',
									)
						const ext = ws.lang === 'go' ? '.go' : '.ts'
						const offenders = walk(join(ROOT, ws.srcRoot), ext).filter(f => declRe.test(readFileSync(f, 'utf-8')))
						expect(
							offenders.map(f => f.replace(`${ROOT}/`, '')),
							`variant "${v.typeName}" (owner ${v.owner}) must not be redeclared in workspace ${id}`,
						).toEqual([])
					}
				})
			}
		}
	}

	test('non-owner TS sources referencing variant schemas import them from @codedm/client-typescript', () => {
		// Import-grep: any api-ts source line mentioning a generated variant schema identifier must be
		// backed by an import from the generated client subpath — never a local redeclaration/copy.
		const variantSchemaIds = new Set(
			MANIFESTS.flatMap(m => Object.values(m.slots).flatMap(s => s.variants.map(v => `${camel(v.typeName)}Schema`))),
		)
		const files = walk(join(ROOT, workspaces.apiTs!.srcRoot), '.ts').filter(f => !f.endsWith('.test.ts'))
		for (const f of files) {
			const src = readFileSync(f, 'utf-8')
			const used = [...variantSchemaIds].filter(id => new RegExp(`\\b${id}\\b`).test(src))
			if (used.length === 0) continue
			expect(
				/from '@codedm\/client-typescript\//.test(src),
				`${f.replace(`${ROOT}/`, '')} references ${used.join(', ')} but does not import from @codedm/client-typescript/*`,
			).toBe(true)
		}
	})
})
