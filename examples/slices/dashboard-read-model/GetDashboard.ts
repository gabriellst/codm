// CONTEXT-ORIGIN: template@feat/template-polyglot (2026-07-01) — Tier-3 exemplar, not live code
// ORIGIN-FILE: packages/api/typescript/src/ui/usecases/GetDashboard.ts

import { injectable } from 'tsyringe-neo'
import Z from 'zod'
import { Handler, z } from '@codedm/core-typescript'
import {
	ViewScope,
	DashboardMode,
	CurrencyCode,
	CostKind,
	MarketingPlatform,
	AdAttribution,
	DisputeStatus,
	PaymentMethod,
	PaymentStatus,
	OperationalCostFlow,
	OperationalCostRecurrency,
} from '@codedm/contracts-typescript/wire/enums'
import { NumberMetricSchema, MoneyMetricSchema, TallySchema } from '../../shared/schemas'
import {
	StatSchema,
	StatNationalSchema,
	ConsolidatedStatSchema,
	ConsolidatedStatNationalSchema,
	PerStoreStatSchema,
	AdditionalCostSchema,
	AdditionalCostNationalSchema,
	ConsolidatedAdditionalCostSchema,
	ConsolidatedAdditionalCostNationalSchema,
	OperationalCostItemSchema,
} from '../schemas'
import { faker, mockId, mockMetric, mockMoneyMetric, mockSeries, pick } from '../../shared/testing/mock'
import { StoreVisualizationRepository } from '../repositories/StoreVisualizationRepository'

// ---------------------------------------------------------------------------
// Input — `viewScope` selects the store set; `dashboardMode` is NOT a query
// param (read from the persisted StoreVisualization). storeId/storeIds come
// from ctx. productIds is an optional filter.
// ---------------------------------------------------------------------------
export const GetDashboardInputSchema = z.object({
	viewScope: z.enum(ViewScope),
	storeId: z.uuid(), // ← ctx.session.storeId      (SINGLE)
	storeIds: z.array(z.uuid()), // ← ctx.membership.storeIds  (MULTI)
	startDate: z.date(),
	endDate: z.date(),
	productIds: z.array(z.uuid()).optional(),
})

// ---------------------------------------------------------------------------
// Output — composition-first discriminated union. Section shape fragments +
// a `variant()` composer + a single `z.discriminatedUnion('kind', …)`.
// Both real enums are echoed for the frontend.
// ---------------------------------------------------------------------------
const variant = (kind: string, viewScope: ViewScope, dashboardMode: DashboardMode, ...shapes: Record<string, Z.ZodTypeAny>[]) =>
	z.object({
		kind: z.literal(kind),
		viewScope: z.literal(viewScope),
		dashboardMode: z.literal(dashboardMode),
		...Object.assign({}, ...shapes),
	})

const STORE = { store: z.object({ id: z.uuid(), currency: z.enum(CurrencyCode) }) }
const STAT = { stat: StatSchema }
const STAT_NATIONAL = { stat: StatNationalSchema }
const STAT_CONSOLIDATED = { stat: ConsolidatedStatSchema, perStore: PerStoreStatSchema }
const STAT_CONSOLIDATED_NATIONAL = { stat: ConsolidatedStatNationalSchema, perStore: PerStoreStatSchema }
const ADDITIONAL = { additionalCost: AdditionalCostSchema }
const ADDITIONAL_NATIONAL = { additionalCost: AdditionalCostNationalSchema }
const ADDITIONAL_CONSOLIDATED = { additionalCost: ConsolidatedAdditionalCostSchema }
const ADDITIONAL_CONSOLIDATED_NATIONAL = { additionalCost: ConsolidatedAdditionalCostNationalSchema }

const SINGLE_GLOBAL = variant('SINGLE_GLOBAL', ViewScope.SINGLE, DashboardMode.GLOBAL, STORE, STAT, ADDITIONAL)
const SINGLE_NATIONAL = variant(
	'SINGLE_NATIONAL',
	ViewScope.SINGLE,
	DashboardMode.NATIONAL,
	STORE,
	STAT_NATIONAL,
	ADDITIONAL_NATIONAL,
)
const MULTI_GLOBAL = variant('MULTI_GLOBAL', ViewScope.MULTI, DashboardMode.GLOBAL, STAT_CONSOLIDATED, ADDITIONAL_CONSOLIDATED)
const MULTI_NATIONAL = variant(
	'MULTI_NATIONAL',
	ViewScope.MULTI,
	DashboardMode.NATIONAL,
	STAT_CONSOLIDATED_NATIONAL,
	ADDITIONAL_CONSOLIDATED_NATIONAL,
)

export const GetDashboardOutputSchema = z.discriminatedUnion('kind', [SINGLE_GLOBAL, SINGLE_NATIONAL, MULTI_GLOBAL, MULTI_NATIONAL])

// ---------------------------------------------------------------------------
// Faker builders (each typed by its schema so tsc verifies the shape).
// Swap the use-case body for a real cross-context aggregation later; the
// contract above is final.
// ---------------------------------------------------------------------------
type NumberMetric = Z.infer<typeof NumberMetricSchema>
type MoneyMetric = Z.infer<typeof MoneyMetricSchema>

const fakeMetric = (): NumberMetric => mockMetric()
const fakeMoneyMetric = (): MoneyMetric => mockMoneyMetric()

const recordOf = <T extends Record<string, string>, V>(enumObject: T, fn: () => V): Record<T[keyof T], V> =>
	Object.fromEntries(Object.values(enumObject).map(v => [v, fn()])) as Record<T[keyof T], V>

const segmentedMoney = <T extends Record<string, string>>(enumObject: T) => ({
	total: fakeMoneyMetric(),
	segments: recordOf(enumObject, fakeMoneyMetric),
})

const fakeTally = (): Z.infer<typeof TallySchema> => ({ count: fakeMetric(), value: fakeMoneyMetric() })

const fakeOperationalItem = (): Z.infer<typeof OperationalCostItemSchema> => ({
	id: mockId(),
	name: faker.commerce.productName(),
	flow: pick(Object.values(OperationalCostFlow)),
	frequency: pick(Object.values(OperationalCostRecurrency)),
	amountCents: faker.number.int({ min: 0, max: 500_000 }),
	currency: pick(Object.values(CurrencyCode)),
	startDate: faker.date.recent({ days: 30 }).toISOString(),
	endDate: null,
})

// ----- Stat -----
const fakeStatBase = () => ({
	revenue: { metric: fakeMoneyMetric() },
	profit: { metric: fakeMoneyMetric() },
	margin: { metric: fakeMetric() },
	averageTicket: { metric: fakeMoneyMetric() },
	unitsSold: { metric: fakeMetric() },
	roi: { metric: fakeMetric() },
	roas: { metric: fakeMetric() },
	costs: { metric: fakeMoneyMetric(), details: segmentedMoney(CostKind) },
	productCost: { metric: fakeMoneyMetric(), details: { product: fakeMoneyMetric(), shipping: fakeMoneyMetric() } },
	fees: { metric: fakeMoneyMetric(), details: { gateway: fakeMoneyMetric(), checkout: fakeMoneyMetric(), chargeback: fakeMoneyMetric() } },
	ads: {
		metric: fakeMoneyMetric(),
		details: {
			byPlatform: segmentedMoney(MarketingPlatform),
			byType: segmentedMoney(AdAttribution),
			tax: fakeMoneyMetric(),
			cpa: fakeMetric(),
		},
	},
	orders: { metric: fakeTally(), details: { generated: fakeTally(), paid: fakeTally() } },
})

const fakePaymentMethodsStat = () => ({
	metric: fakeTally(),
	details: { byMethod: recordOf(PaymentMethod, () => ({ total: fakeTally(), byStatus: recordOf(PaymentStatus, fakeTally) })) },
})

const fakeStat = (): Z.infer<typeof StatSchema> => fakeStatBase()
const fakeStatNational = (): Z.infer<typeof StatNationalSchema> => ({ ...fakeStatBase(), paymentMethods: fakePaymentMethodsStat() })

// Consolidated variants use the same shapes (converted single currency, spec D7)
const fakeConsolidatedStat = (): Z.infer<typeof ConsolidatedStatSchema> => fakeStatBase()
const fakeConsolidatedStatNational = (): Z.infer<typeof ConsolidatedStatNationalSchema> => ({
	...fakeStatBase(),
	paymentMethods: fakePaymentMethodsStat(),
})

// ----- AdditionalCost -----
const fakeAdditionalCostBase = () => ({
	chargeback: { byStatus: segmentedMoney(DisputeStatus), fees: fakeMoneyMetric() },
	refund: fakeMoneyMetric(),
	taxes: { ads: fakeMoneyMetric(), others: fakeMoneyMetric() },
	operational: { total: fakeMoneyMetric(), items: mockSeries(3, fakeOperationalItem) },
	warranty: fakeMoneyMetric(),
})
const fakeAdditionalCost = (): Z.infer<typeof AdditionalCostSchema> => fakeAdditionalCostBase()
const fakeAdditionalCostNational = (): Z.infer<typeof AdditionalCostNationalSchema> => ({
	...fakeAdditionalCostBase(),
	draftOrders: fakeTally(),
})

const fakeConsolidatedAdditionalCost = (): Z.infer<typeof ConsolidatedAdditionalCostSchema> => fakeAdditionalCostBase()
const fakeConsolidatedAdditionalCostNational = (): Z.infer<typeof ConsolidatedAdditionalCostNationalSchema> => ({
	...fakeAdditionalCostBase(),
	draftOrders: fakeTally(),
})

const fakePerStore = (storeIds: string[]): Z.infer<typeof PerStoreStatSchema> => Object.fromEntries(storeIds.map(id => [id, fakeStat()]))

/** Deterministic seed from the request so refetches return stable fixtures. */
const seedFrom = (parts: string[]): number => {
	const s = parts.join('|')
	let h = 0
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
	return Math.abs(h) || 1
}

/**
 * `GetDashboard` — composition-first discriminated dashboard read.
 *
 * FAKER body, REAL contract: `viewScope` (query) selects SINGLE vs MULTI
 * store shape; `dashboardMode` is read from the persisted `StoreVisualization`
 * (default GLOBAL) and toggles the NATIONAL extensions (`stat.paymentMethods`,
 * `additionalCost.draftOrders`). Real cross-context aggregation is a later swap.
 */
@injectable()
export class GetDashboard extends Handler<typeof GetDashboardInputSchema, typeof GetDashboardOutputSchema> {
	readonly name = 'get_dashboard' as const
	readonly inputSchema = GetDashboardInputSchema
	readonly outputSchema = GetDashboardOutputSchema

	constructor(private readonly visualizations: StoreVisualizationRepository) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		faker.seed(seedFrom([input.storeId, input.startDate.toISOString(), input.endDate.toISOString(), ...(input.productIds ?? [])]))

		const visualization = await this.visualizations.findByStoreId(input.storeId)
		const dashboardMode = visualization?.dashboardMode ?? DashboardMode.GLOBAL
		const isMulti = input.viewScope === ViewScope.MULTI
		const isNational = dashboardMode === DashboardMode.NATIONAL
		const kind = `${isMulti ? 'MULTI' : 'SINGLE'}_${dashboardMode}`

		const result = isMulti
			? {
					kind,
					viewScope: ViewScope.MULTI,
					dashboardMode,
					stat: isNational ? fakeConsolidatedStatNational() : fakeConsolidatedStat(),
					perStore: fakePerStore(input.storeIds),
					additionalCost: isNational ? fakeConsolidatedAdditionalCostNational() : fakeConsolidatedAdditionalCost(),
				}
			: {
					kind,
					viewScope: ViewScope.SINGLE,
					dashboardMode,
					store: { id: input.storeId, currency: pick(Object.values(CurrencyCode)) },
					stat: isNational ? fakeStatNational() : fakeStat(),
					additionalCost: isNational ? fakeAdditionalCostNational() : fakeAdditionalCost(),
				}

		return result as this['output']
	}
}
