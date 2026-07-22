// shared/index.ts — root BoundedContext for api-ts.
// Applies ALL_REGISTRIES to rootContainer, starts outbox dispatcher, starts the
// external mediator (concrete impls self-bootstrap inside .start()), and
// registers external handlers that span contexts.
// Must be imported (side-effect) before any child context module.
//
// Adapted from: dev:packages/api/src/shared/index.ts
// ref: .claude/skills/bounded-context/SKILL.md

import { BoundedContext, OutboxDispatcher, ExternalMediator, openapi } from '@template/core-typescript'
import { ALL_REGISTRIES } from './registry'
// Context-local (non-wire) enums: spread each context's enum barrel so any
// controller-facing enum is auto-registered. Adding an enum to a context's
// `enums/index.ts` is enough — no need to remember to list it here.
import * as wireEnums from '@template/contracts-typescript/wire/enums'
import * as authEnums from '@auth/enums'
import * as billingEnums from '@billing/enums'
import * as catalogEnums from '@catalog/enums'
import * as analyticsEnums from '@analytics/enums'
import * as sharedObjects from './objects'
// Generic, wire-facing BFF read atoms (Metric/Tally) — safe to register: no refinements,
// no entity coupling. The `segmented*` factory functions in this barrel are non-Zod and
// are silently skipped by registerSchemas. See shared/schemas/Metric.ts.
import * as sharedSchemas from './schemas'
// Recursive response DTOs — named here so each emits a DISTINCT OpenAPI component
// instead of collapsing into the same anonymous Schema0. The component name is the
// registration key minus the trailing `Schema` suffix (registerSchemas convention):
//   PageViewBlockNodeSchema → PageViewBlockNode  (id, type, content, order, children)
//   PageTreeNodeSchema      → PageTreeNode       (id, title, children)
import { BlockNodeSchema as PageViewBlockNodeSchema } from '@page/usecases/GetPageView'
import { PageTreeNodeSchema } from '@workspace/usecases/GetWorkspacePageTree'

const ctx = await BoundedContext.create({
	name: '',
	root: true,
	controllers: {}, // root has no controllers; child contexts supply them
	registry: ALL_REGISTRIES,
	setup: async container => {
		const externalMediator = container.resolve(ExternalMediator as any) as ExternalMediator
		const outboxDispatcher = container.resolve(OutboxDispatcher as any) as OutboxDispatcher
		await externalMediator.start()
		outboxDispatcher.start()
	},
})

// Register enums so controller schemas can resolve enum component names
// by matching sorted value lists (handleEnumSchema → resolveEnumName). Without this,
// enum components get generated names like `ReactionType2` whenever the path-based
// fallback collides with a sibling field. See cc-bp-13.
openapi.registerEnums({ ...wireEnums, ...authEnums, ...billingEnums, ...catalogEnums, ...analyticsEnums })

// Register the SHARED value objects + read atoms as named `$ref` components, so any
// controller body/response that embeds them emits a `$ref: '#/components/schemas/<Name>'`
// instead of inlining.
//
// SCOPE — shared/* ONLY. Context-owned objects (auth/finance/sales/catalog) are NOT
// blanket-registered. The SDK/OpenAPI is effectively public (it ships in the browser
// bundle), so a context's value objects are domain-internal by default — publishing them
// risks leaking sensitive shapes (cost basis, audit timelines, proprietary invariants).
// A context VO that genuinely belongs on the wire surfaces the moment a controller
// references it (it inlines at the use-site) — an explicit, per-endpoint decision rather
// than a blanket export. This also retires the former per-schema exclusion list
// (ShippingFee / OrderOverride / ProductCostOption*), which only existed to carve
// write-model VOs back out of an over-broad "register every objects/" rule.
//
// Non-schema exports in these barrels (factory functions, classes, plain types) carry no
// _zod / ~standard marker and are silently skipped by registerSchemas.
openapi.registerSchemas({
	...sharedObjects,
	...sharedSchemas,
	PageViewBlockNodeSchema,
	PageTreeNodeSchema,
})

export default ctx.router
