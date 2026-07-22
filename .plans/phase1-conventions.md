# Phase 1 Conventions — Mocked BFF Controllers (READ FIRST)

You are building **mocked full-vertical-slice** controllers in ONE bounded context. Phase 0 is committed and frozen. Follow these conventions EXACTLY — they were set in Phase 0 and every context must match.

## Environment
- Repo: `/Users/work/Desktop/Projetos/pessoal/template-fullstack`. Work in `packages/api/typescript`.
- Bun is at `~/.bun/bin/bun` — start commands with `export PATH="$HOME/.bun/bin:$PATH"`.
- Path alias: `@*` → `src/*` (so `@shared/...`, `@auth/...`). Within a context use relative `../usecases/X`.

## What exists to import
- **Shared UI schema vocabulary** (frozen): `import { MetricSchema, CurrencyMetricSchema, CurrencyAmountSchema, segmented, CostBreakdownSchema, AdsByPlatformSchema, AdsByTypeSchema, GatewayFeeSchema, ChargebackByStatusSchema, FeesBreakdownSchema, AdsBreakdownSchema, ChargebackBreakdownSchema, TaxesBreakdownSchema, ProductCostBreakdownSchema, KpisSchema, PerStoreKpisSchema, ConsolidatedKpisSchema, CurrencyCostBreakdownSchema, OperationalCostItemSchema, OperationalCostsSchema, ProfileAlertSchema, IncomeGraphBucketSchema, IncomeGraphSchema, SalesByDayOfWeekSchema, SalesByDayPeriodSchema, SalesByHourSchema, SalesByRegionSchema, RecommendedAppSchema, ListRecommendedAppsOutputSchema, GoalType, PixelEventType, TimeFrequency } from '@shared/schemas'`
- **Wire enums** (source of truth): `import { CurrencyCode, PaymentStatus, PaymentMethod, MarketingPlatform, GoalType, PixelEventType, AdAttribution, DisputeStatus, GatewayFeeKind, CostKind, DayOfWeek, DayPeriod, TimeFrequency, OperationalCostFlow, OperationalCostRecurrency, CampaignStatus, AdAccountStatus, ... } from '@template/contracts-typescript/wire/enums'`. Grep that folder for any enum you need before inventing one.
- **Mock helpers**: `import { faker, mockId, mockMoney, mockMetric, mockSeries, mockIsoDate, pick } from '@shared/testing/mock'`. `mockMetric()` → `{value, deltaPct}`. Use these so output is deterministic. faker v10 API: `faker.number.float({min,max,fractionDigits})`, `faker.number.int({min,max})`, `faker.datatype.boolean()`, `faker.helpers.arrayElement([...])`, `faker.string.uuid()`, `faker.company.name()`, `faker.commerce.productName()`, `faker.image.url()`, `faker.internet.url()`, `faker.person.fullName()`.
- Money helpers for `MonetaryAmount`: `import { SignedMonetaryAmountSchema } from '@shared/objects'`; `import { MonetaryByCurrencySchema } from '@shared/schemas'`.

## DO NOT
- Do NOT edit anything under `src/shared/**` (frozen), `src/index.ts`, `packages/contracts/**`, or any other context's folder.
- Do NOT run `bun sdk` / `bun contracts` (Phase 2, single writer).
- Do NOT add repositories, registry bindings, migrations, or middlewares. Mocks are repo-less.
- Do NOT add a new enum — if you think you need one, STOP and note it in your final report instead.

## Usecase template (`src/<ctx>/usecases/<Name>.ts`)
```ts
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import { /* schemas */ } from '@shared/schemas'
import { faker, mockId, mockMetric, mockSeries } from '@shared/testing/mock'

export const <Name>InputSchema = z.object({ /* primitives, or empty z.object({}) */ })
export const <Name>OutputSchema = z.object({ /* shape from the screen SPEC, built from @shared/schemas */ })

/** MOCK. <one-line purpose>. Faker fixtures. */
@injectable()
export class <Name> extends Handler<typeof <Name>InputSchema, typeof <Name>OutputSchema> {
	readonly name = '<snake_case_name>' as const
	readonly inputSchema = <Name>InputSchema
	readonly outputSchema = <Name>OutputSchema

	protected async handle(input: this['input']): Promise<this['output']> {
		return { /* faker fixture conforming to OutputSchema; ignore input or echo ids/page */ }
	}
}
```

## Controller template (`src/<ctx>/controllers/<Name>Controller.ts`)
```ts
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { <Name>, <Name>OutputSchema } from '../usecases/<Name>'

export const <Name>ControllerInputSchema = z.object({
	// ONLY these keys allowed: body / query / params / ctx. Omit unused.
	// query: z.paginatedQuery({ search: z.string().optional() }),
	// params: z.object({ id: z.uuid() }),
	// body: z.object({ ... }),
})
export const <Name>ControllerOutputSchema = <Name>OutputSchema

@injectable()
export class <Name>Controller extends Controller<typeof <Name>ControllerInputSchema, typeof <Name>ControllerOutputSchema> {
	readonly path = '/<ctx>/<kebab-resource>'   // e.g. '/sales/orders', '/analytics/single-store-dashboard'
	readonly method = 'get' as const             // get | post | patch | delete | put
	readonly description = 'MOCK. <purpose>'
	readonly inputSchema = <Name>ControllerInputSchema
	readonly outputSchema = <Name>ControllerOutputSchema

	constructor(private query: <Name>) { super() }

	async handle(request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: await this.query.execute(/* map request → input, or {} */) }
	}
}
```
- Commands (POST/PATCH/PUT/DELETE): same shape, `method = 'post'` etc., `body`/`params` input, return a static success payload conforming to OutputSchema (e.g. `{ id: mockId() }`, `{ success: true }`, the echoed/updated entity). Multipart (file upload / CSV import-export): accept-and-echo — return `{ pictureUrl: faker.image.url() }`, `{ imported: faker.number.int(...) }`, or a tiny static CSV string; don't actually parse files.
- No `middlewares` override (leave mocks unauthenticated so the frontend can call them freely).

## Name collisions with existing controllers (IMPORTANT)
These mocks are spec-named and distributed into contexts that ALREADY contain real controllers. Before writing each controller, check your context's existing `controllers/index.ts`. If the spec name already exists as a class (e.g. analytics already has `CreateGoalController`, finance has `CreateOperationalCostController`, catalog has `CreateProductCostController`, integration has `ConnectIntegrationController`, identity has `UpdateProfileController`):
- Suffix BOTH the usecase and controller with `Bff`: class `CreateGoalBff` / `CreateGoalBffController`, files `CreateGoalBff.ts` / `CreateGoalBffController.ts`, usecase `name = 'create_goal_bff'`. Keep the clean spec PATH (`/analytics/goals`) — paths won't collide because the existing controllers use different paths (`/goals`).
- Non-colliding names keep the clean spec name (no suffix).
- List every collision you hit in your final report.

## Barrels (the ONLY shared files in your context — append, don't reorder)
- `src/<ctx>/controllers/index.ts`: `export { <Name>Controller } from './<Name>Controller'`
- `src/<ctx>/usecases/index.ts`: `export { <Name>, <Name>InputSchema, <Name>OutputSchema } from './<Name>'`

## Efficiency
Create files with **batched bash heredocs** (multiple files per `cat <<'EOF'` block in one Bash call), not one Write per file. Append barrel exports with `printf >>`. Keep tool calls low.

## Done criteria
1. All your controllers + usecases written, both barrels updated.
2. `export PATH="$HOME/.bun/bin:$PATH"; cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit 2>&1 | grep "src/<ctx>/"` → **zero errors in your context's files**. (Other contexts may show transient errors from sibling agents — IGNORE those; only fix files under your own `src/<ctx>/`.)
3. Final report: list files created, the controllers' paths+methods, and any place you needed a schema/enum that didn't exist (do NOT create it — report it).
