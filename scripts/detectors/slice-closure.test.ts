import { describe, expect, test } from 'bun:test'
import { type Finding, walk } from './slice-closure'

const SRC = 'packages/api/typescript/src/'
const WIRE = 'packages/contracts/generated/typescript/src/wire/events/'
const GO_WIRE = 'packages/contracts/generated/go/wire/events.go'
const MEDIATOR = 'packages/api/typescript/core/src/services/Mediator/EventEmitter2Mediator.ts'

// SCW-04 is armed by the mediator's register() semantics, sniffed from its source:
// the legacy delete-and-replace block makes collisions errors; multicast (HEAD) means
// >1 subscriber per event name is expected fan-out. One fixture per semantics.
const REPLACING_MEDIATOR: [string, string] = [
	MEDIATOR,
	[
		`export class EventEmitter2Mediator {`,
		`\tasync register(handler) {`,
		`\t\tif (this.registeredHandlers.has(name)) {`,
		`\t\t\tconsole.warn('Handler ' + name + ' already registered, replacing existing registration')`,
		`\t\t\tthis.eventEmitter.removeAllListeners(name)`,
		`\t\t}`,
		`\t}`,
		`}`,
	].join('\n'),
]

const MULTICAST_MEDIATOR: [string, string] = [
	MEDIATOR,
	`export class EventEmitter2Mediator {\n\tasync register(handler) {\n\t\tthis.handlerMap.get(name).push(handler)\n\t}\n}`,
]

// ─── Fixture builders (synthetic in-memory file map) ────────────────

function domainEvent(ctx: string, cls: string, name: string): [string, string] {
	return [
		`${SRC}${ctx}/events/${cls}.ts`,
		[
			`import { BaseDomainEvent, z } from '@codm/core-typescript'`,
			``,
			`export const ${cls}Schema = z.domainEvent({ id: z.uuid() })`,
			``,
			`export class ${cls} extends BaseDomainEvent<typeof ${cls}Schema> {`,
			`\tstatic override readonly name = '${name}' as const`,
			`\tstatic readonly schema = ${cls}Schema`,
			`}`,
		].join('\n'),
	]
}

function wireEvent(cls: string, name: string): [string, string] {
	const kebab = cls.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
	return [
		`${WIRE}${kebab}.ts`,
		[
			`import { z } from '@codm/core-typescript/schema'`,
			`import { BaseIntegrationEvent } from '@codm/core-typescript/events'`,
			``,
			`export const ${cls}Schema = z.integrationEvent('${name}', { id: z.string() })`,
			``,
			`export class ${cls} extends BaseIntegrationEvent<typeof ${cls}Schema> {`,
			`\tstatic override readonly name = '${name}' as const`,
			`\tstatic readonly schema = ${cls}Schema`,
			`}`,
		].join('\n'),
	]
}

function raiseSite(ctx: string, file: string, eventCls: string): [string, string] {
	return [
		`${SRC}${ctx}/usecases/${file}.ts`,
		[
			`import { ${eventCls} } from '../events'`,
			``,
			`export class ${file} {`,
			`\tasync execute(): Promise<void> {`,
			`\t\tconst event = new ${eventCls}({ ownerId: 'x', payload: { id: 'x' } })`,
			`\t\tvoid event`,
			`\t}`,
			`}`,
		].join('\n'),
	]
}

interface HandlerOpts {
	importLine: string
	eventExpr: string
	body?: string
}

function handlerFile(ctx: string, cls: string, opts: HandlerOpts): [string, string] {
	return [
		`${SRC}${ctx}/handlers/${cls}.ts`,
		[
			`import { EventHandler } from '@codm/core-typescript'`,
			opts.importLine,
			``,
			`export class ${cls} extends EventHandler<never> {`,
			`\treadonly event = ${opts.eventExpr}`,
			``,
			`\tasync handle(event: unknown): Promise<void> {`,
			`\t\t${opts.body ?? 'void event'}`,
			`\t}`,
			`}`,
		].join('\n'),
	]
}

function byRule(findings: Finding[], ruleId: string): Finding[] {
	return findings.filter(f => f.ruleId === ruleId)
}

function makeFiles(entries: [string, string][]): Map<string, string> {
	return new Map(entries)
}

// ─── SCW-01a — declared-never-raised ────────────────────────────────

describe('SCW-01a declared-never-raised', () => {
	test('fires when a domain event is constructed only in tests', () => {
		const files = makeFiles([
			domainEvent('integration', 'ActiveToggledEvent', 'integration.store_integration.active_toggled'),
			[
				`${SRC}integration/events/events.test.ts`,
				`import { ActiveToggledEvent } from './ActiveToggledEvent'\nconst e = new ActiveToggledEvent({ ownerId: 'x', payload: { id: 'x' } })\nvoid e`,
			],
		])
		const findings = byRule(walk(files), 'SCW-01a')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.severity).toBe('error')
		expect(findings[0]?.message).toContain('integration.store_integration.active_toggled')
	})

	test('clean when raised in a non-test use case', () => {
		const files = makeFiles([
			domainEvent('sales', 'OrderOverriddenEvent', 'sales.order.overridden'),
			raiseSite('sales', 'OverrideOrder', 'OrderOverriddenEvent'),
		])
		expect(byRule(walk(files), 'SCW-01a')).toHaveLength(0)
	})

	test('alias-import: publishing the wire twin does NOT count as raising the domain event', () => {
		// recon falsePositiveRisks[0]: OrderOverriddenPublisher imports the WIRE class
		// under an alias — a naive class-name grep maps the publish to the wrong event.
		const files = makeFiles([
			domainEvent('sales', 'OrderOverriddenEvent', 'sales.order.overridden'),
			wireEvent('OrderOverriddenEvent', 'integration.shared.order.overridden'),
			handlerFile('sales', 'OrderOverriddenPublisherHandler', {
				importLine: [
					`import { OrderOverriddenEvent as OrderOverriddenIntegrationEvent } from '@codm/contracts-typescript/wire/events'`,
					`import { OrderOverriddenEvent } from '../events'`,
				].join('\n'),
				eventExpr: 'OrderOverriddenEvent',
				body: `await this.mediator.publish(new OrderOverriddenIntegrationEvent({ ownerId: 'x', payload: { id: 'x' } }))`,
			}),
			[`${SRC}sales/handlers/internal.ts`, `export { OrderOverriddenPublisherHandler } from './OrderOverriddenPublisherHandler'`],
		])
		const findings = walk(files)
		// domain event IS raised? No — only the wire twin is constructed. The domain event
		// has a subscriber but no raise site → SCW-01a fires for the DOMAIN event.
		const a = byRule(findings, 'SCW-01a')
		expect(a).toHaveLength(1)
		expect(a[0]?.file).toBe(`${SRC}sales/events/OrderOverriddenEvent.ts`)
		// and the wire publish is attributed to the WIRE event → SCW-01c (no consumer)
		const c = byRule(findings, 'SCW-01c')
		expect(c).toHaveLength(1)
		expect(c[0]?.message).toContain('integration.shared.order.overridden')
	})
})

// ─── SCW-01b — raised-but-no-subscriber (info only) ─────────────────

describe('SCW-01b raised-but-no-subscriber', () => {
	test('emits info when a raised domain event has no registered subscriber', () => {
		const files = makeFiles([
			domainEvent('tenancy', 'StoreCreatedEvent', 'tenancy.store.created'),
			raiseSite('tenancy', 'CreateStore', 'StoreCreatedEvent'),
		])
		const findings = byRule(walk(files), 'SCW-01b')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.severity).toBe('info')
	})

	test('multi-event array handler subscribes every member (no SCW-01b for either)', () => {
		// recon falsePositiveRisks[4]: `readonly event = [A, B] as const` — single-capture regex misses the array form.
		const files = makeFiles([
			domainEvent('billing', 'SubscriptionCreatedEvent', 'billing.subscription.created'),
			domainEvent('billing', 'SubscriptionCancelledEvent', 'billing.subscription.cancelled'),
			raiseSite('billing', 'CreateSubscription', 'SubscriptionCreatedEvent'),
			raiseSite('billing', 'CancelSubscription', 'SubscriptionCancelledEvent'),
			handlerFile('billing', 'SubscriptionLifecycleHandler', {
				importLine: `import { SubscriptionCreatedEvent, SubscriptionCancelledEvent } from '../events'`,
				eventExpr: '[SubscriptionCreatedEvent, SubscriptionCancelledEvent] as const',
			}),
			[`${SRC}billing/handlers/internal.ts`, `export { SubscriptionLifecycleHandler } from './SubscriptionLifecycleHandler'`],
			// replacing mediator arms SCW-04 → proves the array form is ONE subscription, not a collision
			REPLACING_MEDIATOR,
		])
		const findings = walk(files)
		expect(byRule(findings, 'SCW-01b')).toHaveLength(0)
		expect(byRule(findings, 'SCW-04')).toHaveLength(0)
	})
})

// ─── SCW-01c / SCW-01d — integration-event closure ──────────────────

describe('SCW-01c published-without-consumer', () => {
	const goConsts = `package wire\n\nconst CartLinkedToOrderEventName = "integration.shared.cart.linked_to_order"\n`

	test('fires when TS publishes and neither TS nor Go consumes', () => {
		const files = makeFiles([
			wireEvent('CartLinkedToOrderEvent', 'integration.shared.cart.linked_to_order'),
			[
				`${SRC}sales/usecases/LinkCart.ts`,
				`import { CartLinkedToOrderEvent } from '@codm/contracts-typescript/wire/events'\nexport const e = new CartLinkedToOrderEvent({ ownerId: 'x', payload: { id: 'x' } })`,
			],
			[GO_WIRE, goConsts],
		])
		const findings = byRule(walk(files), 'SCW-01c')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.severity).toBe('warning')
	})

	test('clean when a Go handler consumes (EventName return on the next line)', () => {
		const files = makeFiles([
			wireEvent('CartLinkedToOrderEvent', 'integration.shared.cart.linked_to_order'),
			[
				`${SRC}sales/usecases/LinkCart.ts`,
				`import { CartLinkedToOrderEvent } from '@codm/contracts-typescript/wire/events'\nexport const e = new CartLinkedToOrderEvent({ ownerId: 'x', payload: { id: 'x' } })`,
			],
			[GO_WIRE, goConsts],
			[
				'packages/api/go/internal/sync/handlers/cart_linked_handler.go',
				`package handlers\n\nimport "template/contracts-go/wire"\n\nfunc (h *CartLinkedHandler) EventName() string {\n\treturn wire.CartLinkedToOrderEventName\n}\n`,
			],
		])
		expect(byRule(walk(files), 'SCW-01c')).toHaveLength(0)
	})

	test('phase-0 dormant (no publisher, no subscriber on either side) is skipped', () => {
		const files = makeFiles([wireEvent('CartAbandonedEvent', 'integration.shared.cart.abandoned'), [GO_WIRE, goConsts]])
		const findings = walk(files)
		expect(byRule(findings, 'SCW-01c')).toHaveLength(0)
		expect(byRule(findings, 'SCW-01d')).toHaveLength(0)
	})

	test('allowlist suppresses a documented-intentional gap', () => {
		const files = makeFiles([
			wireEvent('CartLinkedToOrderEvent', 'integration.shared.cart.linked_to_order'),
			[
				`${SRC}sales/usecases/LinkCart.ts`,
				`import { CartLinkedToOrderEvent } from '@codm/contracts-typescript/wire/events'\nexport const e = new CartLinkedToOrderEvent({ ownerId: 'x', payload: { id: 'x' } })`,
			],
		])
		const findings = walk(files, {
			allow: [{ event: 'integration.shared.cart.linked_to_order', rule: 'SCW-01c', reason: 'documented' }],
		})
		expect(byRule(findings, 'SCW-01c')).toHaveLength(0)
	})

	test('PENDING comment-ledger naming the event downgrades to info', () => {
		const files = makeFiles([
			wireEvent('ProgressUpdatedEvent', 'integration.shared.integration.progress_updated'),
			[
				`${SRC}integration/usecases/PublishProgress.ts`,
				`import { ProgressUpdatedEvent } from '@codm/contracts-typescript/wire/events'\nexport const e = new ProgressUpdatedEvent({ ownerId: 'x', payload: { id: 'x' } })`,
			],
			[
				`${SRC}integration/handlers/external.ts`,
				`// PENDING (register here once their read models exist):\n//   - integration.shared.integration.progress_updated (forward to UI SSE/WS)\nexport {}`,
			],
		])
		const findings = byRule(walk(files), 'SCW-01c')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.severity).toBe('info')
		expect(findings[0]?.message).toContain('documented-pending')
	})
})

describe('SCW-01d subscribed-without-publisher', () => {
	test('fires when a TS handler subscribes to a wire event no process emits', () => {
		const files = makeFiles([
			wireEvent('HandshakeFailedEvent', 'integration.shared.integration.handshake_failed'),
			handlerFile('notifications', 'HandshakeFailedNotifyHandler', {
				importLine: `import { HandshakeFailedEvent } from '@codm/contracts-typescript/wire/events'`,
				eventExpr: 'HandshakeFailedEvent',
			}),
			[`${SRC}notifications/handlers/external.ts`, `export { HandshakeFailedNotifyHandler } from './HandshakeFailedNotifyHandler'`],
		])
		const findings = byRule(walk(files), 'SCW-01d')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.severity).toBe('warning')
		expect(findings[0]?.message).toContain('HandshakeFailedNotifyHandler')
	})
})

// ─── SCW-02 — projection-without-projector ──────────────────────────

describe('SCW-02 projection closure', () => {
	const projection: [string, string] = [
		`${SRC}sales/projections/MessageProjection.ts`,
		`export class MessageProjection {\n\tconstructor(public props: MessageProjectionProps) {}\n}\ninterface MessageProjectionProps { id: string }`,
	]

	const projector = (events: string): [string, string] => [
		`${SRC}sales/projections/projectors/MessageProjector.ts`,
		[
			`import { Projector } from '@codm/core-typescript'`,
			`import { MessageProjection } from '../MessageProjection'`,
			``,
			`export class MessageProjector extends Projector<never> {`,
			`\treadonly events = [${events}]`,
			``,
			`\tasync handle(event: unknown): Promise<void> {`,
			`\t\tvoid MessageProjection`,
			`\t}`,
			`}`,
		].join('\n'),
	]

	const projectorBarrel: [string, string] = [
		`${SRC}sales/projections/projectors/index.ts`,
		`export { MessageProjector } from './MessageProjector'`,
	]

	const ctxIndexWithSlot: [string, string] = [
		`${SRC}sales/index.ts`,
		[
			`import type { ContextDescriptor } from '@shared/descriptor'`,
			`import * as projectors from './projections/projectors'`,
			``,
			`export default { name: 'sales', projectors } satisfies ContextDescriptor`,
		].join('\n'),
	]

	// Uma árvore que declara descritor DEVE ter raiz de composição — é o que a regra do
	// `manifest.ts` cobra, e é por isso que toda fixture com descritor carrega esta.
	const manifestFor = (ctx: string): [string, string] => [
		`${SRC}manifest.ts`,
		[`import ${ctx} from '@${ctx}/index'`, ``, `export const MANIFEST = {`, `\t${ctx},`, `}`].join('\n'),
	]

	test('projection without any projector is an error', () => {
		const findings = byRule(walk(makeFiles([projection])), 'SCW-02')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.severity).toBe('error')
		expect(findings[0]?.message).toContain('MessageProjection')
	})

	test('projection + registered projector on a known event is clean', () => {
		const files = makeFiles([
			projection,
			domainEvent('sales', 'OrderOverriddenEvent', 'sales.order.overridden'),
			raiseSite('sales', 'OverrideOrder', 'OrderOverriddenEvent'),
			projector(`'sales.order.overridden'`),
			projectorBarrel,
			ctxIndexWithSlot,
			manifestFor('sales'),
		])
		const findings = walk(files)
		expect(byRule(findings, 'SCW-02')).toHaveLength(0)
		expect(byRule(findings, 'SCW-03')).toHaveLength(0)
		// projector counts as the subscriber → no SCW-01b either
		expect(byRule(findings, 'SCW-01b')).toHaveLength(0)
	})

	test('projection maintained only via its ProjectionRepository downgrades to info (repo-ops edge case)', () => {
		const files = makeFiles([
			projection,
			[
				`${SRC}sales/handlers/MessageDeliveredHandler.ts`,
				`import { MessageProjectionRepository } from '../repositories/MessageProjectionRepository'\nexport const dep = MessageProjectionRepository`,
			],
		])
		const findings = byRule(walk(files), 'SCW-02')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.severity).toBe('info')
	})

	test('projector subscribed to an unknown event name (typo) is an error', () => {
		const files = makeFiles([
			projection,
			domainEvent('sales', 'OrderOverriddenEvent', 'sales.order.overridden'),
			raiseSite('sales', 'OverrideOrder', 'OrderOverriddenEvent'),
			projector(`'sales.order.overriden'`), // typo'd name never matches dispatch
			projectorBarrel,
			ctxIndexWithSlot,
			manifestFor('sales'),
		])
		const findings = byRule(walk(files), 'SCW-02')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.severity).toBe('error')
		expect(findings[0]?.message).toContain('sales.order.overriden')
	})

	test('projector present but slot is `projectors: {}` is an SCW-03 error; inline use exempts', () => {
		const emptySlotIndex: [string, string] = [
			`${SRC}sales/index.ts`,
			`import type { ContextDescriptor } from '@shared/descriptor'\nexport default { name: 'sales', projectors: {} } satisfies ContextDescriptor`,
		]
		const base: [string, string][] = [
			projection,
			domainEvent('sales', 'OrderOverriddenEvent', 'sales.order.overridden'),
			raiseSite('sales', 'OverrideOrder', 'OrderOverriddenEvent'),
			projector(`'sales.order.overridden'`),
			projectorBarrel,
			emptySlotIndex,
			manifestFor('sales'),
		]
		const fire = byRule(walk(makeFiles(base)), 'SCW-03')
		expect(fire).toHaveLength(1)
		expect(fire[0]?.message).toContain('MessageProjector')

		const inlineUse: [string, string] = [
			`${SRC}sales/usecases/RebuildMessages.ts`,
			`import { MessageProjector } from '../projections/projectors/MessageProjector'\nexport const p = container.resolve(MessageProjector)`,
		]
		expect(byRule(walk(makeFiles([...base, inlineUse])), 'SCW-03')).toHaveLength(0)
	})
})

// ─── SCW-03 — artifact-not-registered ───────────────────────────────

describe('SCW-03 controller registration', () => {
	const controller = (ctx: string, file: string, cls: string): [string, string] => [
		`${SRC}${ctx}/controllers/${file}.ts`,
		`import { Controller } from '@codm/core-typescript'\nexport class ${cls} extends Controller<never> {}`,
	]

	test('controller missing from the barrel is an error; multiline multi-class export block is clean', () => {
		const files = makeFiles([
			[
				`${SRC}billing/controllers/Subscriptions.ts`,
				[
					`import { Controller } from '@codm/core-typescript'`,
					`export class CreateSubscriptionController extends Controller<never> {}`,
					`export class CancelSubscriptionController extends Controller<never> {}`,
				].join('\n'),
			],
			controller('billing', 'GetInvoice', 'GetInvoiceController'),
			[
				`${SRC}billing/controllers/index.ts`,
				// multiline export block — both classes ride ONE module specifier
				`export {\n\tCreateSubscriptionController,\n\tCancelSubscriptionController,\n} from './Subscriptions'`,
			],
		])
		const findings = byRule(walk(files), 'SCW-03').filter(f => f.source === 'controller#SCW-03')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.message).toContain('GetInvoiceController')
	})
})

describe('SCW-03 handler registration', () => {
	const evt = domainEvent('sales', 'OrderOverriddenEvent', 'sales.order.overridden')
	const raise = raiseSite('sales', 'OverrideOrder', 'OrderOverriddenEvent')

	test('handler not exported from internal.ts/external.ts is an error', () => {
		const files = makeFiles([
			evt,
			raise,
			handlerFile('sales', 'OrphanHandler', {
				importLine: `import { OrderOverriddenEvent } from '../events'`,
				eventExpr: 'OrderOverriddenEvent',
			}),
			[`${SRC}sales/handlers/internal.ts`, `export {}`],
		])
		const findings = byRule(walk(files), 'SCW-03')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.message).toContain('OrphanHandler')
	})

	test('renamed re-export (export { X as Y }) registers the handler', () => {
		const files = makeFiles([
			evt,
			raise,
			handlerFile('sales', 'FooHandler', {
				importLine: `import { OrderOverriddenEvent } from '../events'`,
				eventExpr: 'OrderOverriddenEvent',
			}),
			[`${SRC}sales/handlers/internal.ts`, `export { FooHandler as RenamedFooHandler } from './FooHandler'`],
		])
		const findings = walk(files)
		expect(byRule(findings, 'SCW-03')).toHaveLength(0)
		// and the subscription is counted — no raised-without-subscriber info
		expect(byRule(findings, 'SCW-01b')).toHaveLength(0)
	})

	test('sub-handler composed by a parent handler is neither orphan nor subscriber', () => {
		const files = makeFiles([
			evt,
			raise,
			handlerFile('sales', 'ParentHandler', {
				importLine: `import { OrderOverriddenEvent } from '../events'\nimport { SubHandler } from './SubHandler'`,
				eventExpr: 'OrderOverriddenEvent',
				body: 'void SubHandler',
			}),
			handlerFile('sales', 'SubHandler', {
				importLine: `import { OrderOverriddenEvent } from '../events'`,
				eventExpr: 'OrderOverriddenEvent',
			}),
			[`${SRC}sales/handlers/internal.ts`, `export { ParentHandler } from './ParentHandler'`],
			// replacing mediator arms SCW-04 → proves the sub-handler is not a competing subscriber
			REPLACING_MEDIATOR,
		])
		const findings = walk(files)
		expect(byRule(findings, 'SCW-03')).toHaveLength(0) // sub-handler exempt
		expect(byRule(findings, 'SCW-04')).toHaveLength(0) // and NOT a competing subscriber
	})

	test('DEFERRED ledger naming the class in the barrel exempts it', () => {
		const files = makeFiles([
			evt,
			raise,
			handlerFile('sales', 'WipeHandler', {
				importLine: `import { OrderOverriddenEvent } from '../events'`,
				eventExpr: 'OrderOverriddenEvent',
			}),
			[
				`${SRC}sales/handlers/internal.ts`,
				`// DEFERRED (iter 272 audit closure):\n//   - WipeHandler → needs an aggregate-erasing repo surface; lands paired with that work.\nexport {}`,
			],
		])
		expect(byRule(walk(files), 'SCW-03')).toHaveLength(0)
	})

	test('vestigial export {} barrels with zero handler classes are clean', () => {
		const files = makeFiles([
			[`${SRC}identity/handlers/internal.ts`, `// No handlers yet — Notifications (P10) will subscribe later.\nexport {}`],
			[`${SRC}identity/handlers/external.ts`, `export {}`],
		])
		expect(walk(files)).toHaveLength(0)
	})

	test('direction rule: wire-event handler exported from internal.ts is an error', () => {
		const files = makeFiles([
			wireEvent('OrderUpdatedEvent', 'integration.shared.order.updated'),
			handlerFile('sales', 'OrderUpdatedHandler', {
				importLine: `import { OrderUpdatedEvent } from '@codm/contracts-typescript/wire/events'`,
				eventExpr: 'OrderUpdatedEvent',
			}),
			[`${SRC}sales/handlers/internal.ts`, `export { OrderUpdatedHandler } from './OrderUpdatedHandler'`],
			// a Go publisher so SCW-01c stays quiet and we isolate the direction finding
			[GO_WIRE, `package wire\n\nconst OrderUpdatedEventName = "integration.shared.order.updated"\n`],
			[
				'packages/api/go/internal/sync/storage/order/order_pg.go',
				`package order\n\nimport "template/contracts-go/wire"\n\nfunc publish() {\n\tpayload := wire.OrderUpdatedEvent{\n\t\tName: wire.OrderUpdatedEventName,\n\t}\n\tvoid(payload)\n}\n`,
			],
		])
		const findings = byRule(walk(files), 'SCW-03')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.message).toContain('move to external.ts')
	})
})

describe('SCW-03 context wiring', () => {
	// AS DUAS CHECAGENS DE CHAVE DO REGISTRY SAÍRAM AQUI (F2, gate humano 8a). O mapa deixou de ser
	// escrito à mão — ele é DERIVADO, em `src/registries.generated.ts` — e no gerador a chave, o alias
	// e o especificador de módulo interpolam o MESMO binding, na mesma iteração. O defeito que estes
	// casos protegiam subiu de "detectado" para "impossível".
	//
	// A prova disso NÃO sumiu, mudou de lugar: `scripts/contexts/sync.test.ts` CTX-05 assere que os
	// três lados concordam para TODO contexto do repo, e o `contexts:check` reprova qualquer edição
	// à mão do gerado (medido: trocar `auth: authRegistry` por `auth: ownerRegistry` derruba o gate).
	//
	// No TEMPLATE elas ficam: lá o mapa continua sendo escrito à mão, sem gerador, então o defeito
	// ainda pode existir. O template tem cópia própria e independente deste detector.

	test("registry missing the side-effect import './errors' is an error", () => {
		const files = makeFiles([
			[`${SRC}sales/registry.ts`, `export const INSTANCE_REGISTRY = { mock: [], integration: [], real: [] }`],
			[`${SRC}sales/errors/index.ts`, `export const X = 1`],
		])
		const findings = byRule(walk(files), 'SCW-03')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.message).toContain('./errors')
	})

	test('context router imported but not mapped under its own key in the MANIFEST literal is an error', () => {
		const files = makeFiles([
			[
				`${SRC}sales/index.ts`,
				`import type { ContextDescriptor } from '@shared/descriptor'\nexport default { name: 'sales' } satisfies ContextDescriptor`,
			],
			[
				`${SRC}manifest.ts`,
				[`import SalesRouter from '@sales/index'`, ``, `const MANIFEST = {`, `}`, `export const MOUNTED = Object.keys(MANIFEST)`].join(
					'\n',
				),
			],
		])
		const findings = byRule(walk(files), 'SCW-03')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.message).toContain('SalesRouter')
	})

	test('context router mapped under its own key in MANIFEST is clean', () => {
		const files = makeFiles([
			[
				`${SRC}sales/index.ts`,
				`import type { ContextDescriptor } from '@shared/descriptor'\nexport default { name: 'sales' } satisfies ContextDescriptor`,
			],
			[
				`${SRC}manifest.ts`,
				[
					`import SalesRouter from '@sales/index'`,
					``,
					`const MANIFEST = {`,
					`\tsales: SalesRouter,`,
					`}`,
					`export const MOUNTED = Object.keys(MANIFEST)`,
				].join('\n'),
			],
		])
		expect(byRule(walk(files), 'SCW-03')).toHaveLength(0)
	})
})

// ─── SCW-04 — duplicate-subscriber collision ────────────────────────

describe('SCW-04 duplicate-subscriber collision', () => {
	const evt = domainEvent('billing', 'SubscriptionCreatedEvent', 'billing.subscription.created')
	const raise = raiseSite('billing', 'CreateSubscription', 'SubscriptionCreatedEvent')
	const handlerA = handlerFile('billing', 'SubscriptionCreatedHandler', {
		importLine: `import { SubscriptionCreatedEvent } from '../events'`,
		eventExpr: 'SubscriptionCreatedEvent',
	})
	const handlerB = handlerFile('billing', 'SubscriptionCreatedQuotaHandler', {
		importLine: `import { SubscriptionCreatedEvent } from '../events'`,
		eventExpr: 'SubscriptionCreatedEvent',
	})
	const barrel: [string, string] = [
		`${SRC}billing/handlers/internal.ts`,
		`export { SubscriptionCreatedHandler } from './SubscriptionCreatedHandler'\nexport { SubscriptionCreatedQuotaHandler } from './SubscriptionCreatedQuotaHandler'`,
	]

	test('two barrel-registered handlers on one event name collide under the last-write-wins mediator', () => {
		const findings = byRule(walk(makeFiles([evt, raise, handlerA, handlerB, barrel, REPLACING_MEDIATOR])), 'SCW-04')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.severity).toBe('error')
		expect(findings[0]?.message).toContain('SubscriptionCreatedHandler')
		expect(findings[0]?.message).toContain('SubscriptionCreatedQuotaHandler')
	})

	test('one subscriber per side does not collide (last-write-wins mediator)', () => {
		const files = makeFiles([
			evt,
			raise,
			handlerA,
			[`${SRC}billing/handlers/internal.ts`, `export { SubscriptionCreatedHandler } from './SubscriptionCreatedHandler'`],
			wireEvent('OrderUpdatedEvent', 'integration.shared.order.updated'),
			handlerFile('billing', 'OrderUpdatedHandler', {
				importLine: `import { OrderUpdatedEvent } from '@codm/contracts-typescript/wire/events'`,
				eventExpr: 'OrderUpdatedEvent',
			}),
			[`${SRC}billing/handlers/external.ts`, `export { OrderUpdatedHandler } from './OrderUpdatedHandler'`],
			REPLACING_MEDIATOR,
		])
		expect(byRule(walk(files), 'SCW-04')).toHaveLength(0)
	})

	test('a registered projector pseudo-handler collides with a handler under the last-write-wins mediator', () => {
		const files = makeFiles([
			evt,
			raise,
			handlerA,
			[`${SRC}billing/handlers/internal.ts`, `export { SubscriptionCreatedHandler } from './SubscriptionCreatedHandler'`],
			[
				`${SRC}billing/projections/projectors/QuotaProjector.ts`,
				`import { Projector } from '@codm/core-typescript'\nexport class QuotaProjector extends Projector<never> {\n\treadonly events = ['billing.subscription.created']\n\tasync handle(event: unknown): Promise<void> { void event }\n}`,
			],
			[`${SRC}billing/projections/projectors/index.ts`, `export { QuotaProjector } from './QuotaProjector'`],
			[
				`${SRC}billing/index.ts`,
				`import type { ContextDescriptor } from '@shared/descriptor'\nimport * as projectors from './projections/projectors'\nexport default { name: 'billing', projectors } satisfies ContextDescriptor`,
			],
			REPLACING_MEDIATOR,
		])
		const findings = byRule(walk(files), 'SCW-04')
		expect(findings).toHaveLength(1)
		expect(findings[0]?.message).toContain('QuotaProjector')
	})

	test('multicast mediator: >1 subscriber per event name is expected fan-out, no finding', () => {
		const files = makeFiles([evt, raise, handlerA, handlerB, barrel, MULTICAST_MEDIATOR])
		expect(byRule(walk(files), 'SCW-04')).toHaveLength(0)
	})

	test('without mediator source the check stays off — multicast is the HEAD default', () => {
		const files = makeFiles([evt, raise, handlerA, handlerB, barrel])
		expect(byRule(walk(files), 'SCW-04')).toHaveLength(0)
	})
})
