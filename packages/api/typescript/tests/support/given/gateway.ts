import { ChannelStatusEnum, connectChannel, createWhatsAppChannel, getChannel } from '@codm/client-typescript/go'

/** ms budget for the SDK `getChannel` poll below — mirrors `cross-service.spike.test.ts`'s own
 *  `CONNECT_DEADLINE_MS`, which polls the SAME scripted e2e scenario from the other side (DB read
 *  vs. this given's SDK read). Kept local rather than shared: the two polls read different sources
 *  on purpose (spec AC-6's whole claim is that BOTH sides converge), so a shared constant would
 *  imply a coupling that isn't there. */
const CONNECT_DEADLINE_MS = 15_000

export interface GatewayChannelSeed {
	channelId: string
	ownerId: string
}

/**
 * The narrow structural slice of `IntegrationBackend` (`../testing.ts`) this given actually reads:
 * the co-tenant Go gateway's base URL, keyed by workspace id. Declared locally — mirroring
 * `TestBedLike`'s interface-segregation rationale (`./types.ts`) — rather than importing
 * `IntegrationBackend` from `../testing`, because `testing.ts` imports the given catalog FROM this
 * directory (`./index.ts`); importing back would be a cycle. Any real `IntegrationBackend` (from
 * `startIntegrationBackend({ services: ['apiGo'] })`) satisfies this for free — it carries `services`
 * with strictly MORE keys than this type asks for.
 */
export interface GatewayBackendLike {
	readonly services: { readonly apiGo?: string }
	/** O dono que o boot semeou. Declarado aqui pelo mesmo motivo que `TestBedLike` o declara: este
	 *  given carimba `X-Owner-Id` no hop S2S, e a identidade tem que vir de quem a decidiu, não de
	 *  uma constante do produto que o maquinário importe (F3/T3). */
	readonly ownerId: string
}

/**
 * A CONNECTED row of `gateway_channels`, seeded through the Go gateway's OWN HTTP surface
 * (create → connect → poll) — never a direct DB insert.
 *
 * Contrast with `givenChannel` (`./channels.ts`): that one writes the `channels` row straight
 * through the TS side's Drizzle driver because the TS side owns no repository for that table at
 * all — the row's SHAPE is what's under test there, and any shape is legal to fabricate. Here the
 * row's PROVENANCE is the point: only the gateway's own use cases may legally produce
 * `status: CONNECTED` (the scripted e2e `ChannelFactory` is what drives create → outbox → handler →
 * repository — see `cross-service.spike.test.ts`'s docblock), so a direct insert would fabricate a
 * state the gateway process itself never produced. Reach for `givenConnectedGatewayChannel` whenever
 * the scenario needs "a channel the gateway itself paired", and `givenChannel` whenever it needs "a
 * row shaped like a channel" without caring who wrote it.
 *
 * Requires `startIntegrationBackend({ services: ['apiGo'] })` — this given calls the co-tenant
 * gateway subprocess over real HTTP, `X-Owner-Id` per call (S2S rule, CLAUDE.md — the gateway never
 * infers an owner). The gateway's OpenAPI spec omits its own `/api` mount (same reason
 * `GatewayChannelSender` and the spike suite's raw calls append it by hand).
 *
 * Resolves once the SDK's OWN `getChannel` reports `CONNECTED` — does NOT wait for the scripted
 * scenario's LATER frames (contacts, messages: `defaultE2eScenario()`). A caller whose scenario
 * depends on those polls for them itself, the same way `awaitChannelStatusFromTs` does in the spike
 * suite; this given's boundary stops at "the channel is paired".
 *
 * Overrides are limited to `name`/`ownerId` on purpose: everything else about the seeded channel
 * (platform, the QR/pairing script it plays) is BOOT-DECLARED by the gateway's `e2e` column
 * (`defaultE2eScenario()`), not a parameter a caller can steer — widening this would let a test
 * assert on a scenario shape this given does not actually control.
 */
export async function givenConnectedGatewayChannel(
	backend: GatewayBackendLike,
	overrides?: { name?: string; ownerId?: string },
): Promise<GatewayChannelSeed> {
	const gatewayUrl = backend.services.apiGo
	if (!gatewayUrl) throw new Error("givenConnectedGatewayChannel requer services: ['apiGo']")

	// The Go spec omits its own mount — same reason `GatewayChannelSender`
	// (src/thread/services/ChannelSender/GatewayChannelSender.ts) and the spike suite's raw fetch
	// calls both append it by hand.
	const baseURL = `${gatewayUrl}/api`
	const ownerId = overrides?.ownerId ?? backend.ownerId
	const headers = { 'X-Owner-Id': ownerId }
	const name = overrides?.name ?? 'gateway-channel'

	let channelId: string
	try {
		const created = await createWhatsAppChannel({ name }, { baseURL, headers })
		channelId = created.id
		await connectChannel(channelId, { baseURL, headers })
	} catch (error) {
		throw new Error(`givenConnectedGatewayChannel: create/connect against '${baseURL}' failed — ${String(error)}`)
	}

	const started = performance.now()
	for (;;) {
		const channel = await getChannel(channelId, { baseURL, headers }).catch(error => {
			throw new Error(`givenConnectedGatewayChannel: polling '${channelId}' against '${baseURL}' failed — ${String(error)}`)
		})
		if (channel.status === ChannelStatusEnum.CONNECTED) break
		if (performance.now() - started > CONNECT_DEADLINE_MS) {
			throw new Error(
				`givenConnectedGatewayChannel: '${channelId}' never reached CONNECTED within ${CONNECT_DEADLINE_MS}ms (last status: ${channel.status})`,
			)
		}
		await Bun.sleep(25)
	}

	return { channelId, ownerId }
}
