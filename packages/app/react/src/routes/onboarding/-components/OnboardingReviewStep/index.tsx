// packages/app/react/src/routes/onboarding/-components/OnboardingReviewStep/index.tsx — COMPLETE final file.
import { type ComponentProps, useMemo } from 'react'
import type { ChannelKind, GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import { useGetAttachThreadWizard } from '@codm/client-typescript/typescript'
import { ReviewStep } from '@/routes/(app)/attach/-components/ReviewStep'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'

/** Sentinel key for a NEW workspace path the operator picked/typed but that is not yet a real
 *  `Workspace` (only `CompleteOnboarding` materializes it). `ReviewStep` (shared, frozen — see its own
 *  docblock) looks up the row's display path by matching `workspaceId` against the `workspaces` array
 *  it's handed; this lets that unmodified lookup render a pending path correctly without either
 *  fabricating a UUID or teaching the shared component about drafts. Never sent over the wire — it
 *  only ever exists in this adapter's own props to `ReviewStep`. */
const PENDING_WORKSPACE_ID = 'pending-workspace'

/**
 * Adapter for the onboarding REVIEW step (spec Decision 11) — `ReviewStep` is `/attach`'s, reused
 * UNMODIFIED. D3 (founder review 12/08) changed `ReviewStep`'s contract from a `form: AttachForm`
 * instance to PLAIN props (`contactRef`/`workspaceId`/`providers`) — this adapter hands the store's
 * own fields straight through, the same way `OnboardingContactStep`/`OnboardingAgentsStep` already
 * read/write this store directly.
 *
 * `onFinish`/`isSubmitting` are NOT passed — same as before this rewrite: `OnboardingFlow`'s footer
 * owns the wizard's only forward action, so this step is pure read + edit links. `onFinish` deliberately
 * never navigates out of `/onboarding` either way (AC-14).
 *
 * ### 2026-08-26 — draft/atomic-commit rewrite: REVIEW no longer attaches anything
 * This step used to register its OWN `confirmStep` here, calling `useAttachThread` the instant
 * "Próximo" confirmed a complete selection — REVIEW was the ONE step that materialized the thread,
 * atomically-per-itself. That is gone: `CompleteOnboarding` is now the SOLE place that calls
 * `AttachThread` (composed with `AddWorkspace`, one transaction), and it only runs at "Concluir".
 * REVIEW's own "Próximo" is therefore a plain, synchronous advance — the exact same shape CONTACT/
 * AGENTS already have (their row click already recorded+persisted everything there is to submit) —
 * so this adapter registers no `confirmStep` at all; whatever the previous step's cleanup left behind
 * (always `undefined` — `key={stepId}` fully unmounts on every navigation) is exactly what "nothing
 * to confirm" needs. `OnboardingFlow`'s `CAN_CONTINUE.REVIEW` gate reads the SAME three store fields
 * this component renders, so "Próximo" only unlocks once the summary below is actually complete.
 *
 * A pending (not-yet-materialized) new workspace path shows up here via `PENDING_WORKSPACE_ID` — see
 * its own docblock above.
 */
export function OnboardingReviewStep(props: ComponentProps<'div'>) {
	const contactRef = useOnboardingSetupStore(state => state.contactRef)
	const providers = useOnboardingSetupStore(state => state.providers)
	const workspaceId = useOnboardingSetupStore(state => state.workspaceId)
	const workspacePath = useOnboardingSetupStore(state => state.workspacePath)

	const { data } = useGetAttachThreadWizard()
	const channelKindById = useMemo(() => new Map<string, ChannelKind>((data?.channels ?? []).map(c => [c.channelId, c.kind])), [data])

	const workspaces = useMemo<GetAttachThreadWizardQueryResponse['workspaces']>(() => {
		const registered = data?.workspaces ?? []
		if (workspaceId || !workspacePath) return registered
		return [...registered, { workspaceId: PENDING_WORKSPACE_ID, path: workspacePath, badges: [] }]
	}, [data, workspaceId, workspacePath])

	return (
		<ReviewStep
			contactRef={contactRef}
			workspaceId={workspaceId ?? (workspacePath ? PENDING_WORKSPACE_ID : undefined)}
			providers={providers}
			channelKindById={channelKindById}
			workspaces={workspaces}
			{...props}
		/>
	)
}
