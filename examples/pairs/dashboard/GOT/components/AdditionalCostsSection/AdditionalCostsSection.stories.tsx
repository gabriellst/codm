// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/AdditionalCostsSection.stories.tsx
// role:    Connected stories — DeepPartial GetDashboard mocks, single/national/multi/loading/error
// Corpus reference copy (purged product vocabulary renamed to neutral identifiers — product-residue rail) — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
// packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/AdditionalCostsSection.stories.tsx
// COMPLETE final file — migrated onto the connected-stories framework (@/storybook).
import type { Meta, StoryObj } from '@storybook/react'
import {
	CurrencyCodeEnum,
	getDashboardQueryOptions,
	OperationalCostFlowEnum,
	OperationalCostRecurrencyEnum,
} from '@template/client-typescript/typescript'
import type { GetDashboardQueryResponse } from '@template/client-typescript/typescript'

import { connected, errorQuery, loadingQuery, mockQuery } from '@/storybook'
import type { DeepPartial } from '@/lib'

import { dashboardSearchSchema } from '../../index'
import { AdditionalCostsSection } from '.'

// ---------------------------------------------------------------------------
// Mock GetDashboard responses (colocated, inline). Only the `additionalCost` paths the card reads
// are populated; mockQuery accepts a DeepPartial of GetDashboardQueryResponse, so these are
// type-checked against the SDK shape WITHOUT casts. Every money leaf is a MoneyMetric whose `value`
// is a Money { amountCents, currency } (single, already-converted currency, spec D1); counts stay
// plain NumberMetric.
// ---------------------------------------------------------------------------
const cents = (major: number) => Math.round(major * 100)
const money = (major: number, currency = CurrencyCodeEnum.BRL) => ({ value: { amountCents: cents(major), currency }, deltaPct: null })
const num = (value: number) => ({ value, deltaPct: null })

const operationalItems = [
	{
		id: '1',
		name: '123',
		flow: OperationalCostFlowEnum.DEBIT,
		frequency: OperationalCostRecurrencyEnum.ONCE,
		amountCents: 1000,
		currency: CurrencyCodeEnum.BRL,
		startDate: '2026-06-01T00:00:00Z',
		endDate: null,
	},
	{
		id: '2',
		name: 'Servidor',
		flow: OperationalCostFlowEnum.DEBIT,
		frequency: OperationalCostRecurrencyEnum.MONTHLY,
		amountCents: 12000,
		currency: CurrencyCodeEnum.BRL,
		startDate: '2026-06-01T00:00:00Z',
		endDate: null,
	},
]

function singleAdditionalCost(v: number, items: typeof operationalItems = []) {
	return {
		chargeback: {
			byStatus: {
				total: money(v * 3),
				segments: { OPEN: money(v), UNDER_REVIEW: money(0), WON: money(v), LOST: money(v), ACCEPTED: money(0) },
			},
			fees: money(v),
		},
		refund: money(v),
		taxes: { ads: money(v), others: money(v) },
		operational: { total: money(v * 2), items },
		warranty: money(v),
	}
}

// DeepPartial of GetDashboardQueryResponse — branch chosen by `kind`. No casts: tsc checks every leaf.
function singleResponse(v: number, items: typeof operationalItems = []) {
	return {
		kind: 'SINGLE_GLOBAL',
		viewScope: 'SINGLE',
		dashboardMode: 'GLOBAL',
		store: { id: 'store-1', currency: CurrencyCodeEnum.BRL },
		additionalCost: singleAdditionalCost(v, items),
	} satisfies DashboardMock
}

function nationalResponse(v: number, items: typeof operationalItems = []) {
	return {
		kind: 'SINGLE_NATIONAL',
		viewScope: 'SINGLE',
		dashboardMode: 'NATIONAL',
		store: { id: 'store-1', currency: CurrencyCodeEnum.BRL },
		additionalCost: { ...singleAdditionalCost(v, items), draftOrders: { count: num(7), value: money(350) } },
	} satisfies DashboardMock
}

function multiResponse() {
	// Multi-store consolidated: money already converted to a single reporting currency (spec D1).
	const a = money(120)
	return {
		kind: 'MULTI_GLOBAL',
		viewScope: 'MULTI',
		dashboardMode: 'GLOBAL',
		additionalCost: {
			chargeback: { byStatus: { total: money(360), segments: { OPEN: a, UNDER_REVIEW: a, WON: a, LOST: a, ACCEPTED: a } }, fees: a },
			refund: a,
			taxes: { ads: a, others: a },
			operational: { total: money(240), items: [] },
			warranty: a,
		},
	} satisfies DashboardMock
}

// DeepPartial alias keeps the builders honest against the SDK response without forcing full payloads.
type DashboardMock = DeepPartial<GetDashboardQueryResponse>

// The query options give mockQuery both the endpoint url and the response type (params value is
// irrelevant to url-path matching; startDate/endDate are required by the SDK type).
const dashboardOptions = getDashboardQueryOptions({ viewScope: 'SINGLE', startDate: '2026-01-01', endDate: '2026-12-31' })

const meta: Meta<typeof AdditionalCostsSection> = {
	title: 'Dashboard/AdditionalCostsCard',
	component: AdditionalCostsSection,
	parameters: connected({
		layout: 'centered',
		route: { id: '/(app)/dashboard/', validateSearch: search => dashboardSearchSchema.parse(search ?? {}) },
	}),
	decorators: [
		Story => (
			<div className="w-[420px]">
				<Story />
			</div>
		),
	],
}
export default meta
type Story = StoryObj<typeof AdditionalCostsSection>

/** Populated single-store costs — hover a row for its breakdown; operational has a titled tooltip. */
export const Default: Story = {
	parameters: { msw: { handlers: [mockQuery(dashboardOptions, singleResponse(150.5, operationalItems))] } },
}

/** All-zero period — mirrors the reference mockup ("R$ 0,00"). */
export const Zeroed: Story = {
	parameters: { msw: { handlers: [mockQuery(dashboardOptions, singleResponse(0))] } },
}

/** National mode — adds the `draftOrders` row; operational tooltip shows `name (1x)` + amount. */
export const National: Story = {
	parameters: { msw: { handlers: [mockQuery(dashboardOptions, nationalResponse(150.5, operationalItems))] } },
}

/** Consolidated (multi-store) — same rows; money already converted to a single reporting currency. */
export const Consolidated: Story = {
	parameters: {
		stores: { viewScope: 'MULTI' },
		msw: { handlers: [mockQuery(dashboardOptions, multiResponse())] },
	},
}

/** Pending query — header value + rows show skeletons. */
export const Loading: Story = {
	parameters: { msw: { handlers: [loadingQuery(dashboardOptions)] } },
}

/** Request fails (400 → no ky retry) — inline error message. */
export const ErrorState: Story = {
	parameters: { msw: { handlers: [errorQuery(dashboardOptions, 400)] } },
}
