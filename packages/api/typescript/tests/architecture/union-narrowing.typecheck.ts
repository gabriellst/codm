/**
 * Union-slots narrowing parity — COMPILE-TIME regression (union-slots spec §2.4: "SDK do console
 * tem narrowing idêntico nas duas origens"). NOT a runtime suite: this file is load-bearing under
 * the authoritative type-check (`tsconfig.build.json` includes `tests/**\/*.ts` and only excludes
 * `*.test.ts`); union-narrowing.test.ts imports it for the runtime half. If either origin's
 * `name`-narrowing stops yielding the typed payload, the accesses below become TS2339/TS2322 and
 * the `tsc` gate goes red.
 *
 * The daemon-origin regression this pins: `ListenEvents200`'s passthrough arm once declared
 * `name: string`, which swallowed the typed frames' literal names — narrowing
 * `'integration.channel_message.received'` could not exclude the passthrough arm, so `payload`
 * stayed the loose `{ ownerId }` envelope. The declarative surface has NO open passthrough arm at
 * all: every union arm is a generated contract event schema with a baked-in literal `name`
 * (union-slot payloads materialized from the owner client), so literal-name narrowing is exact by
 * construction — and this pin keeps it that way. The gateway origin (`ServerEvent`) narrows through
 * its discriminated oneOf.
 */
import type { ServerEvent } from '@codedm/client-typescript/go'
import type { ListenEvents200 } from '@codedm/client-typescript/typescript'

export interface NarrowedInboundText {
	text: string | undefined
	pushName: string | undefined
}

/**
 * The typed frame arm, extracted by its literal name. The load-bearing assertion is the
 * `const typed: TypedInboundFrame = frame` assignment below: with the old open passthrough arm
 * (`name: string`), the narrowed union still contained the loose envelope arm (its `name`
 * narrows to the literal instead of the arm being excluded), so the assignment fails —
 * exactly the daemon-origin handler pattern (narrow, then hand the frame to a typed consumer).
 */
type TypedInboundFrame = Extract<ListenEvents200, { name: 'integration.channel_message.received' }>

/** DAEMON origin: narrowing the re-emitted frame yields the typed (platform, messageType) union. */
export function narrowDaemonOrigin(frame: ListenEvents200): NarrowedInboundText | undefined {
	if (frame.name !== 'integration.channel_message.received') return undefined
	// The typed frame arm — NOT the loose passthrough envelope. This assignment is the regression
	// pin: it only compiles when the passthrough arm is excluded by the literal-name narrowing.
	const typed: TypedInboundFrame = frame
	const payload = typed.payload
	if (payload.platform === 'WHATSAPP' && payload.messageType === 'TEXT') {
		// content narrows to the WhatsApp TEXT variant; platformData to the WhatsApp platform data.
		return { text: payload.content?.text, pushName: payload.platformData?.pushName }
	}
	return { text: undefined, pushName: undefined }
}

/** GATEWAY origin: identical narrowing through the go SDK's ServerEvent discriminated union. */
export function narrowGatewayOrigin(event: ServerEvent): NarrowedInboundText | undefined {
	if (event.name !== 'integration.channel_message.received') return undefined
	const payload = event.payload
	if (payload.platform === 'WHATSAPP' && payload.messageType === 'TEXT') {
		return { text: payload.content?.text, pushName: payload.platformData?.pushName }
	}
	return { text: undefined, pushName: undefined }
}
