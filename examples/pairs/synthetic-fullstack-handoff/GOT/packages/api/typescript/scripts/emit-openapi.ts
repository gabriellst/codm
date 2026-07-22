/**
 * Generates `packages/api/typescript/public/docs/openapi.json` without booting the
 * full HTTP server. Sets EMIT_OPENAPI=true so openapi.generateSpecification()
 * writes the file, then exits.
 *
 * ref: dev:packages/api/src/shared/index.ts (openapi.generateSpecification pattern)
 */
process.env.EMIT_OPENAPI = 'true'
process.env.START_SERVER = 'false'

// reflect-metadata must be first
import 'reflect-metadata'

import { openapi } from '@template/core-typescript'

// Import context modules to trigger BoundedContext.create (builds routers, wires handlers).
// shared/index.ts must come first — it creates the root BoundedContext + applies registries.
import SharedRouter from '@shared/index'
import AuthRouter from '@auth/index'
import IdentityRouter from '@identity/index'
import TenancyRouter from '@tenancy/index'
import BillingRouter from '@billing/index'
import IntegrationRouter from '../src/integration/index'
import TrackingRouter from '../src/tracking/index'
import AnalyticsRouter from '../src/analytics/index'
import FinanceRouter from '../src/finance/index'
import CatalogRouter from '../src/catalog/index'
import MarketingRouter from '../src/marketing/index'
import NotificationsRouter from '@notifications/index'
import UiRouter from '../src/ui/index'
import ProcurementRouter from '../src/procurement/index'

const routers = [
	SharedRouter,
	AuthRouter,
	IdentityRouter,
	TenancyRouter,
	BillingRouter,
	IntegrationRouter,
	TrackingRouter,
	AnalyticsRouter,
	FinanceRouter,
	CatalogRouter,
	MarketingRouter,
	NotificationsRouter,
	UiRouter,
	ProcurementRouter,
]

await openapi.generateSpecification(routers)

console.log('✅ openapi.json emitted to public/docs/openapi.json')
process.exit(0)
