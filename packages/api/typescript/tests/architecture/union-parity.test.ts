import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Union-parity rail (union-slots spec §3) — three MECHANICAL checks over the @unionSlot/@variant
 * declarations, driven entirely by the generated union MANIFESTS (`<Event>Unions` exports in
 * `@codm/contracts-typescript/wire/events`, emitted from the x-union-slots contract extensions).
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
 *      (`@codm/client-typescript/<service>`) — import-grep, not convention.
 *
 * Lives in `tests/architecture/` (the shared home for repo-wide mechanical detectors) AND is wired
 * into the root `test:tooling` sweep (spec §5.5 mandates both).
 */
import * as WireEvents from '@codm/contracts-typescript/wire/events'

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

	test('the daemon re-emits the pilot frame (floor for the conditional daemon check in check 2)', () => {
		// Check 2's daemon leg skips events the daemon does not carry (a surface that
		// never emits the frame is not an emitting surface for it). This floor pins
		// that the PILOT stays on the daemon surface, so that skip can never silently
		// swallow the original end-to-end guarantee.
		const spec = readFileSync(join(ROOT, 'packages/api/typescript/public/docs/openapi.json'), 'utf-8')
		expect(JSON.stringify((JSON.parse(spec) as { paths: unknown }).paths)).toContain('"integration.channel_message.received"')
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

describe('union-parity check 2 — every emitting surface publishes the COMPLETE oneOf for EVERY slot', () => {
	const goSpecPath = join(ROOT, 'packages/api/go/public/docs/openapi.json')

	/** Recursively collect every `$ref` component name reachable from a schema fragment. */
	function collectRefNames(node: unknown, acc = new Set<string>()): Set<string> {
		if (!node || typeof node !== 'object') return acc
		if (Array.isArray(node)) {
			for (const child of node) collectRefNames(child, acc)
			return acc
		}
		const obj = node as Record<string, unknown>
		if (typeof obj.$ref === 'string') acc.add(obj.$ref.split('/').at(-1)!)
		for (const value of Object.values(obj)) collectRefNames(value, acc)
		return acc
	}

	/** A slot field schema is materialized when it resolves to real shape(s) — never opaque. */
	function isMaterialized(schema: unknown): boolean {
		if (!schema || typeof schema !== 'object') return false
		const obj = schema as Record<string, unknown>
		if ('x-unknown' in obj) return false
		return (
			typeof obj.$ref === 'string' ||
			Array.isArray(obj.oneOf) ||
			Array.isArray(obj.allOf) ||
			(typeof obj.properties === 'object' && obj.properties !== null && Object.keys(obj.properties).length > 0)
		)
	}

	/** The single-value const of a property schema (`const` or 1-element `enum`), if any. */
	function constOf(prop: unknown): string | undefined {
		if (!prop || typeof prop !== 'object') return undefined
		const obj = prop as Record<string, unknown>
		if (typeof obj.const === 'string') return obj.const
		if (Array.isArray(obj.enum) && obj.enum.length === 1 && typeof obj.enum[0] === 'string') return obj.enum[0]
		return undefined
	}

	/** Every object schema (a node carrying `properties`) anywhere in the document. */
	function collectObjectSchemas(node: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
		if (!node || typeof node !== 'object') return acc
		if (Array.isArray(node)) {
			for (const child of node) collectObjectSchemas(child, acc)
			return acc
		}
		const obj = node as Record<string, unknown>
		if (typeof obj.properties === 'object' && obj.properties !== null) acc.push(obj)
		for (const value of Object.values(obj)) collectObjectSchemas(value, acc)
		return acc
	}

	for (const m of MANIFESTS) {
		const payloadName = `${m.eventModel.slice(0, -'Event'.length)}Payload`

		for (const [slotName, slot] of Object.entries(m.slots)) {
			const declared = slot.variants.map(v => v.typeName).sort()

			test(`gateway (Go): ${payloadName}.${slotName} materializes all ${slot.variants.length} declared variants`, () => {
				if (existsSync(goSpecPath)) {
					const spec = readFileSync(goSpecPath, 'utf-8')
					expect(spec.includes('x-union-variant-missing'), 'gateway spec contains x-union-variant-missing markers').toBe(false)
					const doc = JSON.parse(spec) as { components: { schemas: Record<string, unknown> } }
					const payload = doc.components.schemas[payloadName] as { oneOf?: Array<{ $ref: string }> } | undefined
					expect(payload?.oneOf, `${payloadName} must be a oneOf in the gateway spec`).toBeDefined()
					// Across the payload's variant components, the slot field must resolve — directly or
					// through a nested oneOf — to EXACTLY the declared variant types, and never be opaque.
					const seen = new Set<string>()
					for (const arm of payload!.oneOf!) {
						const armName = arm.$ref.split('/').at(-1)!
						const armSchema = doc.components.schemas[armName] as { properties?: Record<string, unknown> } | undefined
						expect(armSchema?.properties, `gateway component ${armName} missing properties`).toBeDefined()
						const slotField = armSchema!.properties![slotName]
						expect(isMaterialized(slotField), `gateway ${armName}.${slotName} is opaque (x-unknown or empty) — slot not materialized`).toBe(
							true,
						)
						for (const name of collectRefNames(slotField)) seen.add(name)
					}
					expect([...seen].sort(), `gateway ${payloadName}.${slotName} union does not cover the declared variants`).toEqual(declared)
				} else {
					// Build artifact absent (fresh clone): the committed /go SDK is generated FROM that spec —
					// every declared variant type has a zod schema, and some payload-variant schema wires the
					// slot field to it (proves the emitted union carried the slot, not just the type).
					const zodDir = join(ROOT, 'packages/client/dist/typescript/src/go/zod')
					const payloadCamel = camel(payloadName)
					const payloadVariantFiles = walk(zodDir, '.ts').filter(f => f.includes(`/${payloadCamel}`))
					for (const v of slot.variants) {
						const schemaId = `${camel(v.typeName)}Schema`
						expect(existsSync(join(zodDir, `${schemaId}.ts`)), `committed /go SDK lacks variant schema ${schemaId}.ts`).toBe(true)
						expect(
							payloadVariantFiles.some(f => {
								const src = readFileSync(f, 'utf-8')
								return src.includes(`${slotName}:`) && src.includes(schemaId)
							}),
							`no committed /go payload-variant schema wires slot "${slotName}" to ${schemaId}`,
						).toBe(true)
					}
				}
			})

			test(`daemon (TS): the re-emitting response materializes ${payloadName}.${slotName} for every declared variant`, () => {
				const spec = readFileSync(join(ROOT, 'packages/api/typescript/public/docs/openapi.json'), 'utf-8')
				const doc = JSON.parse(spec) as { paths: Record<string, Record<string, unknown>> }
				// The check binds to "every emitting surface WHOSE RESPONSE CARRIES the slot"
				// (docblock). The daemon deliberately does not re-emit every gateway event —
				// e.g. channel_special_platform_event.received rides the gateway's own /events
				// stream only (ListenEvents BROWSER_EVENTS decision). A surface that does not
				// carry the event at all is not an emitting surface for it: assert complete
				// ABSENCE (no half-carried frame) and stop; a carried frame must materialize
				// every declared variant.
				if (!JSON.stringify(doc.paths).includes(`"${m.wireName}"`)) return
				// Every object schema carrying the slot field AND all of its discriminators is a payload
				// arm; for each declared variant there must be an arm whose discriminator consts match the
				// variant's values and whose slot field is materialized (never `{}` / x-unknown).
				const arms = collectObjectSchemas(doc.paths).filter(o => {
					const props = o.properties as Record<string, unknown>
					return slotName in props && slot.discriminators.every(d => constOf(props[d]) !== undefined)
				})
				for (const v of slot.variants) {
					const matching = arms.filter(o => {
						const props = o.properties as Record<string, unknown>
						return slot.discriminators.every((d, i) => constOf(props[d]) === v.values[i])
					})
					expect(
						matching.length,
						`daemon spec has no payload arm pinning (${slot.discriminators.join(', ')}) = (${v.values.join(', ')}) for slot "${slotName}"`,
					).toBeGreaterThan(0)
					expect(
						matching.some(o => isMaterialized((o.properties as Record<string, unknown>)[slotName])),
						`daemon spec arm for (${v.values.join(', ')}) leaves slot "${slotName}" opaque — union not materialized on this surface`,
					).toBe(true)
				}
			})
		}
	}
})

describe('union-parity check 2.5 — the WIRE layer pre-materializes the union (founder 23-jul: never a controller)', () => {
	// The manifest×aggregate join lives in the GENERATED materialized surface
	// (contracts/generated/typescript/src/wire/events/materialized.ts) — re-emitting controllers
	// only compose. Manifest-driven: a new union-slot event auto-extends this check.
	const materializedSrc = readFileSync(join(ROOT, 'packages/contracts/generated/typescript/src/wire/events/materialized.ts'), 'utf-8')

	for (const m of MANIFESTS) {
		const model = m.eventModel.slice(0, -'Event'.length)
		test(`${m.eventModel}: materialized surface swaps the payload for the owner aggregate schema`, () => {
			const owners = new Set(Object.values(m.slots).flatMap(s => s.variants.map(v => v.owner)))
			expect(owners.size, `${m.eventModel} manifest must have exactly one owner`).toBe(1)
			const ownerAlias = (workspaces[[...owners][0]!] as unknown as { alias: string }).alias
			expect(materializedSrc).toContain(
				`export const ${m.eventModel}MaterializedSchema = ${m.eventModel}Schema.extend({ payload: ${camel(model)}PayloadSchema })`,
			)
			expect(materializedSrc).toContain(`from '@codm/client-typescript/${ownerAlias}'`)
		})
	}

	test('the daemon controller composes the PRE-materialized surface — it never joins manifests itself', () => {
		const listenEvents = readFileSync(join(ROOT, 'packages/api/typescript/src/ui/controllers/ListenEvents.ts'), 'utf-8')
		expect(listenEvents).toContain('materializedIntegrationEventSchemas')
		// The join primitives must not reappear at the controller layer.
		expect(listenEvents).not.toContain('PayloadSchema')
		expect(listenEvents).not.toContain("from '@codm/client-typescript")
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

	// ── Flat-events ratchet: binding consumption on every SWAPPED event ─────────
	// The union-slots pilot proved consumption for channel_message.received only;
	// the flat-events migration swapped every publishable gateway event onto its
	// generated binding. This check pins the end state mechanically:
	//   - SWAPPED: api-go must reference `wire.<Model>EventName` (publisher constructs
	//     the envelope from the binding) and must NOT redeclare `type <Model>Payload
	//     struct` (declaration lives in the generated binding only).
	//   - BLOCKED: the hand-rolled envelope must still exist in internal/channel/events
	//     (else the entry is stale — move it to SWAPPED when the enum harmonizes).
	describe('flat-events: every swapped event consumes its generated binding', () => {
		const SWAPPED_EVENT_MODELS = [
			'ChannelMessageReceived',
			'ChannelMessageDelivered',
			'ChannelMessageSeen',
			'ChannelPresenceUpdated',
			'ChannelChatPresenceUpdated',
			'ChannelRemoteDeleted',
			'ChannelRemotesSynced',
			'ChannelMessagesSynced',
			'ChannelMembershipAdded',
			'ChannelMembershipRemoved',
			'ChannelSyncStarted',
			'ChannelSyncProgress',
			'ChannelSyncCompleted',
			'ChannelConnected',
			'ChannelDisconnected',
			'ChannelLoggedOut',
			'ChannelSpecialPlatformEventReceived',
		] as const
		// BLOCKED (schema-handoff enum harmonization): RemoteType {USER,GROUP,BROADCAST}
		// vs ContactKind {CONTACT,GROUP,BROADCAST} — a swap would corrupt the wire.
		const BLOCKED_ENVELOPES = ['channel_remote_created.go', 'channel_remote_updated.go'] as const

		// apiGo srcRoot is packages/api/go/internal (the walker's source set).
		const goSrcRoot = join(ROOT, workspaces.apiGo!.srcRoot)
		const goFiles = walk(goSrcRoot, '.go').filter(f => !f.endsWith('_test.go'))
		const goSources = goFiles.map(f => ({ f, src: readFileSync(f, 'utf-8') }))

		// Domain-event payloads whose names coincidentally match a wire payload name —
		// they belong to DIFFERENT facts (the in-process channel.channel_connected /
		// channel.channel_disconnected domain events), not redeclarations of the
		// integration payload (whose local aliases are Gateway{Connected,Disconnected}Payload).
		const DOMAIN_HOMONYMS = new Set(['ChannelConnectedPayload', 'ChannelDisconnectedPayload'])

		for (const model of SWAPPED_EVENT_MODELS) {
			test(`${model}: publisher consumes wire.${model}EventName; payload struct not redeclared`, () => {
				expect(
					goSources.some(({ src }) => src.includes(`wire.${model}EventName`)),
					`no api-go source references wire.${model}EventName — the swapped event lost its binding consumption`,
				).toBe(true)
				const redeclared = DOMAIN_HOMONYMS.has(`${model}Payload`)
					? []
					: goSources.filter(({ src }) => new RegExp(`^type\\s+${model}Payload\\s+struct\\b`, 'm').test(src))
				expect(
					redeclared.map(({ f }) => f.replace(`${ROOT}/`, '')),
					`${model}Payload is redeclared as a struct in api-go — swapped payloads must be aliases to the generated binding`,
				).toEqual([])
			})
		}

		test('BLOCKED envelopes still exist (stale-entry guard)', () => {
			for (const file of BLOCKED_ENVELOPES) {
				expect(
					existsSync(join(goSrcRoot, 'channel/events', file)),
					`${file} no longer exists — its event was swapped; move it out of BLOCKED_ENVELOPES and into SWAPPED_EVENT_MODELS`,
				).toBe(true)
			}
		})
	})

	test('non-owner TS sources referencing variant schemas import them from @codm/client-typescript', () => {
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
				/from '@codm\/client-typescript\//.test(src),
				`${f.replace(`${ROOT}/`, '')} references ${used.join(', ')} but does not import from @codm/client-typescript/*`,
			).toBe(true)
		}
	})
})
