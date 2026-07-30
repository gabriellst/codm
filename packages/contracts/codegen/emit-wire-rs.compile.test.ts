/**
 * Compile + runtime probe for the Rust emitter — REAL cargo, synthetic contract.
 *
 * The unit suite asserts emitted STRINGS; this rail proves they COMPILE and behave:
 * the live contract has zero closed unions, so emitRsUnions' output would otherwise
 * ship unverified (exactly how the template's float→String defect survived). The
 * probe emits a synthetic surface exercising the paths the live contract misses
 * (union-ref, f32, keyword idents, string-enum) and runs `cargo test` on it.
 *
 * Cost control: the probe reuses the real crate's target dir, so dependency builds
 * are shared — the marginal cost is compiling the probe crate itself.
 */
import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emitRsEnums, emitRsEnvelope, emitRsEvents, emitRsSlots, emitRsUnions } from './emit-wire-rs'
import type { ParsedEnum, ParsedEvent, ParsedUnion } from './lib/parse-openapi'

const HERE = dirname(fileURLToPath(import.meta.url))
const RUST_CRATE = join(HERE, '../generated/rust')
const PROBE = join(RUST_CRATE, 'target/compile-probe')

const enums: ParsedEnum[] = [
	{ name: 'ChannelKind', values: ['WHATSAPP', 'INTERNAL'] },
	{ name: 'SalesKind', values: ['SHOPIFY'] },
]
const unions: ParsedUnion[] = [{ name: 'AnyPlatform', refs: ['ChannelKind', 'SalesKind'], doc: 'Cross-category.' }]
const events: ParsedEvent[] = [
	{
		modelName: 'ProbeHappenedEvent',
		wireName: 'integration.probe.happened',
		fields: [],
		ownFields: [
			{ name: 'name', type: { kind: 'literal', value: 'integration.probe.happened' }, required: true },
			{ name: 'platform', type: { kind: 'union-ref', ref: 'AnyPlatform' }, required: true },
			{ name: 'ratio', type: { kind: 'number', format: 'float' }, required: true },
			{ name: 'type', type: { kind: 'string' }, required: true },
			{ name: 'kinds', type: { kind: 'array', items: { kind: 'enum-ref', ref: 'ChannelKind' } }, required: false },
			{ name: 'mode', type: { kind: 'string-enum', values: ['25', 'FAST'] }, required: true },
		],
		unionSlots: [],
	},
]

const PROBE_TEST = `use compile_probe::wire::envelope::WireEvent;
use compile_probe::wire::unions::AnyPlatform;

#[test]
fn union_parses_members_and_unknown_lands_in_unknown() {
    let a: AnyPlatform = serde_json::from_str("\\"WHATSAPP\\"").unwrap();
    assert!(a.is_known());
    assert_eq!(a.as_str(), "WHATSAPP");
    let b: AnyPlatform = serde_json::from_str("\\"SHOPIFY\\"").unwrap();
    assert!(b.is_known());
    // Forward-compat: a platform this consumer does not know yet must NOT fail the parse.
    let u: AnyPlatform = serde_json::from_str("\\"TIKTOK\\"").unwrap();
    assert!(!u.is_known());
    assert_eq!(u.as_str(), "TIKTOK");
}

#[test]
fn probe_event_roundtrips_through_the_envelope() {
    let raw = r#"{
        "id": "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
        "ownerId": "t",
        "time": "2026-07-30T12:00:00Z",
        "name": "integration.probe.happened",
        "payload": { "platform": "WHATSAPP", "ratio": 0.5, "type": "x", "mode": "25" }
    }"#;
    let ev: WireEvent = serde_json::from_str(raw).expect("parse");
    assert!(matches!(ev, WireEvent::Known(_)));
    let back = serde_json::to_value(&ev).unwrap();
    let orig: serde_json::Value = serde_json::from_str(raw).unwrap();
    assert_eq!(orig, back);
}
`

describe('rust emitter — compile probe (real cargo over a synthetic contract)', () => {
	test(
		'union-ref + f32 + keyword ident + string-enum compile and behave',
		() => {
			mkdirSync(join(PROBE, 'src/wire'), { recursive: true })
			mkdirSync(join(PROBE, 'tests'), { recursive: true })
			writeFileSync(
				join(PROBE, 'Cargo.toml'),
				`[package]\nname = "compile-probe"\nversion = "0.0.1"\nedition = "2021"\npublish = false\n\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\nchrono = { version = "0.4", features = ["serde"] }\nuuid = { version = "1", features = ["serde"] }\nstrum = { version = "0.27", features = ["derive"] }\n`,
			)
			writeFileSync(join(PROBE, 'src/lib.rs'), 'pub mod wire;\n')
			writeFileSync(join(PROBE, 'src/wire/mod.rs'), 'pub mod enums;\npub mod unions;\npub mod events;\npub mod envelope;\npub mod slots;\n')
			writeFileSync(join(PROBE, 'src/wire/enums.rs'), emitRsEnums(enums))
			writeFileSync(join(PROBE, 'src/wire/unions.rs'), emitRsUnions(unions))
			writeFileSync(join(PROBE, 'src/wire/events.rs'), emitRsEvents(events))
			writeFileSync(join(PROBE, 'src/wire/envelope.rs'), emitRsEnvelope(events))
			writeFileSync(join(PROBE, 'src/wire/slots.rs'), emitRsSlots(events))
			writeFileSync(join(PROBE, 'tests/probe.rs'), PROBE_TEST)

			const proc = Bun.spawnSync(['cargo', 'test', '--quiet', '--manifest-path', join(PROBE, 'Cargo.toml')], {
				env: { ...process.env, CARGO_TARGET_DIR: join(RUST_CRATE, 'target') },
				stdout: 'pipe',
				stderr: 'pipe',
			})
			const out = `${proc.stdout?.toString() ?? ''}\n${proc.stderr?.toString() ?? ''}`
			expect(out).not.toContain('error[')
			expect(proc.exitCode).toBe(0)
		},
		{ timeout: 300_000 },
	)
})
