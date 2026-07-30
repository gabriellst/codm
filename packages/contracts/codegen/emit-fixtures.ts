/**
 * Shared wire fixtures — ONE deterministic JSON per event (+ a required-only variant),
 * consumed by the Go, TS and Rust binding tests (rust-wire spec §4.2). The same bytes
 * being parsed by all three languages is what turns "each language parses its own
 * envelope" into "the three parse the same thing" — the divergence class proven in the
 * spec (§2.1) cannot re-enter while this rail is green.
 *
 * Values are DERIVED (field name/type → value), never random — regeneration is
 * byte-stable and diffs only when the contract diffs.
 *
 * Shape: the canonical transport envelope `{id, ownerId, time, name, payload}`
 * (lib/envelope.ts TRANSPORT_ENVELOPE — what the Go gateway publishes).
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { payloadFieldsOf } from './lib/envelope'
import { parseContractsOpenapi, type FieldType, type ParsedContracts, type ParsedEvent } from './lib/parse-openapi'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const INPUT = join(ROOT, 'dist/contracts.openapi.yaml')
const OUTPUT = join(ROOT, 'fixtures/events')

/** Envelope constants — fixed, not derived: the envelope is the same for every event. */
const FIXTURE_ID = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'
const FIXTURE_OWNER = 'fixture-tenant'
const FIXTURE_TIME = '2026-07-30T12:00:00Z'

class FixtureError extends Error {}

function sampleOf(t: FieldType, field: string, parsed: ParsedContracts): unknown {
	switch (t.kind) {
		case 'string':
			return `${field}-sample`
		case 'uuid':
			return FIXTURE_ID
		case 'literal':
			return t.value
		case 'string-enum':
			return t.values[0]
		case 'enum-ref': {
			const e = parsed.enums.find(x => x.name === t.ref)
			if (!e) throw new FixtureError(`field ${field}: enum-ref ${t.ref} not found in contract enums`)
			return e.values[0]
		}
		case 'union-ref': {
			const u = parsed.unions.find(x => x.name === t.ref)
			if (!u) throw new FixtureError(`field ${field}: union-ref ${t.ref} not found in contract unions`)
			const first = parsed.enums.find(x => x.name === u.refs[0])
			if (!first) throw new FixtureError(`field ${field}: union ${t.ref} member ${u.refs[0]} not found`)
			return first.values[0]
		}
		case 'boolean':
			return true
		case 'integer':
			// int64 sample exceeds i32/u32 so a wrong-width mapping fails the roundtrip.
			return t.format === 'int64' ? 90071992547409 : 32
		case 'number':
			// Exactly representable in f32 AND f64 — roundtrip-stable through either width.
			return t.format === 'float' || t.format === 'float32' ? 0.5 : 0.25
		case 'date-time':
			return FIXTURE_TIME
		case 'url':
			return `https://example.com/${field}`
		case 'array':
			return [sampleOf(t.items, field, parsed)]
		case 'unknown':
			return { field, sample: true }
	}
}

function fixtureOf(ev: ParsedEvent, parsed: ParsedContracts, mode: 'full' | 'minimal'): Record<string, unknown> {
	const payload: Record<string, unknown> = {}
	for (const f of payloadFieldsOf(ev)) {
		if (mode === 'minimal' && !f.required) continue
		payload[f.name] = sampleOf(f.type, f.name, parsed)
	}
	return { id: FIXTURE_ID, ownerId: FIXTURE_OWNER, time: FIXTURE_TIME, name: ev.wireName, payload }
}

/** Meta fixture (underscore prefix): an event name NO binding knows. Every consumer must
 *  treat it as opaque passthrough — forward-compat (union-slots spec §2.5), never an error. */
const UNKNOWN_EVENT = {
	id: FIXTURE_ID,
	ownerId: FIXTURE_OWNER,
	time: FIXTURE_TIME,
	name: 'integration.fixture.unknown_probe',
	payload: { probe: true },
}

async function run() {
	const yamlText = await readFile(INPUT, 'utf-8')
	const parsed = parseContractsOpenapi(yamlText)
	await rm(OUTPUT, { recursive: true, force: true })
	await mkdir(OUTPUT, { recursive: true })
	for (const ev of parsed.events) {
		await writeFile(join(OUTPUT, `${ev.wireName}.json`), `${JSON.stringify(fixtureOf(ev, parsed, 'full'), null, '\t')}\n`)
		await writeFile(join(OUTPUT, `${ev.wireName}.minimal.json`), `${JSON.stringify(fixtureOf(ev, parsed, 'minimal'), null, '\t')}\n`)
	}
	await writeFile(join(OUTPUT, '_unknown-event.json'), `${JSON.stringify(UNKNOWN_EVENT, null, '\t')}\n`)
	console.log(`✔ emitted ${parsed.events.length * 2} event fixtures (+1 unknown-event probe)`)
}

if (import.meta.main) {
	await run()
}
