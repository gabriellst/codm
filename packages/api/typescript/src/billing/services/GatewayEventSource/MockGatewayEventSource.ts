import { BillingWebhookSource } from '@billing/enums'
import { GatewayEventSource, type GatewayCollectInput, type GatewayCollectResult } from './GatewayEventSource'

/**
 * Test double for GatewayEventSource. The registry (mock/integration profiles) binds EACH of the
 * 8 platform tokens the factory injects to its own `new MockGatewayEventSource(<source>)` — same
 * posture as MockPaymentProvider standing in for PaymentProvider. Per-platform results are driven
 * through the STATIC `setResult`/`collectFor` map (keyed by BillingWebhookSource) rather than
 * instance state, since the factory's 8 constructor slots each resolve to a distinct instance —
 * a static map is what lets a test drive `WindowReconcileJob` per-platform behavior with a single
 * `MockGatewayEventSource.setResult(source, result)` call, without reaching into the factory.
 */
export class MockGatewayEventSource extends GatewayEventSource {
	private static results = new Map<BillingWebhookSource, GatewayCollectResult>()

	// requiresOpenInvoices defaults false (mirrors the WINDOW-source default) — pass `true` to drive
	// a PROBE-source double directly in a test (Task T3), without touching the real PagBankEventSource.
	constructor(
		readonly source: BillingWebhookSource,
		override readonly requiresOpenInvoices = false,
	) {
		super()
	}

	static setResult(source: BillingWebhookSource, result: GatewayCollectResult): void {
		MockGatewayEventSource.results.set(source, result)
	}

	static collectFor(source: BillingWebhookSource): GatewayCollectResult {
		return MockGatewayEventSource.results.get(source) ?? { listed: 0, events: [] }
	}

	static reset(): void {
		MockGatewayEventSource.results.clear()
	}

	override async collectMissedEvents(_input: GatewayCollectInput): Promise<GatewayCollectResult> {
		return MockGatewayEventSource.collectFor(this.source)
	}
}
