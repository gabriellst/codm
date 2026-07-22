// SEEDED — code under REVIEW (do NOT "fix" or rewrite this file; review it and report findings).
// A teammate opened a PR adding a /refunds listing screen. Review the diff (this file +
// RefundTableSection/index.tsx) against the route/react + component/react registries.
//
// Grounded against the real app's orders screen, but deliberately seeded with a mix of
// REAL canon violations and LEGITIMATE shapes that only LOOK like violations.
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@/lib/zod-validator'
import { z } from 'zod'
import { listOrdersQueryParamsSchema } from '@template/client-typescript/typescript'
import { useListOrders } from '@template/client-typescript/typescript'

import { RefundTableSection } from './-components/RefundTableSection'

// ─── Search schema ────────────────────────────────────────────────────────────
// VIOLATION (route bp-04): .extend() overwrites SDK field definitions; canon is .and().
const refundsSearchSchema = listOrdersQueryParamsSchema.extend({
	selectedRefundId: z.string().optional(),
})

export type RefundsSearch = z.infer<typeof refundsSearchSchema>

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/(app)/refunds/')({
	validateSearch: zodValidator(refundsSearchSchema),
	component: RouteComponent,
})

function RouteComponent() {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()

	// VIOLATION (route bp-02 / component bp-01): the route shell fetches list data and
	// prop-drills it (data + search + onSearchParamsChange) into the section. The section
	// must own its own query (CMP-P01) and read search via routeApi — the route is a thin shell.
	const { data } = useListOrders({ page: search.page, limit: search.limit })

	return (
		<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
			<RefundTableSection
				data={data}
				search={search}
				onSearchParamsChange={updates => navigate({ search: prev => ({ ...prev, ...updates }) })}
			/>
		</div>
	)
}
