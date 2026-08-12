// packages/app/react/src/routes/onboarding/-components/OnboardingReviewStep/index.tsx — COMPLETE final file.
import { type ComponentProps, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ChannelKind } from '@codm/client-typescript/typescript'
import {
	attachThreadMutationRequestSchema,
	getOnboardingQueryKey,
	useAttachThread,
	useGetAttachThreadWizard,
} from '@codm/client-typescript/typescript'
import { ReviewStep } from '@/routes/(app)/attach/-components/ReviewStep'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'

/**
 * Adapter for the onboarding REVIEW step (spec Decision 11) — `ReviewStep` is `/attach`'s, reused
 * UNMODIFIED. D3 (founder review 12/08) changed `ReviewStep`'s contract from a `form: AttachForm`
 * instance to PLAIN props (`contactRef`/`workspaceId`/`providers`) — this adapter no longer builds a
 * local `useForm()` to satisfy it; it just hands the store's own fields straight through, the same way
 * `OnboardingContactStep`/`OnboardingAgentsStep` already read/write this store directly.
 *
 * `onFinish` deliberately does NOT navigate to `/threads/$threadId` the way `AttachThreadWizard`'s
 * does — AC-14 forbids the onboarding wizard from ever navigating out of `/onboarding`. It only fires
 * the mutation and invalidates the onboarding read, so `threadDone` flips once that read is consulted
 * again (`OnboardingFlow`'s "Concluir" gate, the dashboard panel, or a future visit to this step).
 * `ReviewStep` still renders its own inline commit button for this caller (`onFinish` stays REQUIRED
 * here, in spirit): `OnboardingFlow`'s footer only advances slides — it has no idea an attach mutation
 * exists — so the commit action has nowhere else to live.
 */
export function OnboardingReviewStep(props: ComponentProps<'div'>) {
	const queryClient = useQueryClient()
	const { contactRef, providers, workspaceId } = useOnboardingSetupStore()

	const { data } = useGetAttachThreadWizard()
	const attach = useAttachThread({
		mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getOnboardingQueryKey() }) },
	})
	const channelKindById = useMemo(() => new Map<string, ChannelKind>((data?.channels ?? []).map(c => [c.channelId, c.kind])), [data])

	const handleFinish = () => {
		const result = attachThreadMutationRequestSchema.safeParse({ contactRef, workspaceId, providers })
		if (!result.success) return
		attach.mutate({ data: result.data })
	}

	return (
		<ReviewStep
			contactRef={contactRef}
			workspaceId={workspaceId}
			providers={providers}
			channelKindById={channelKindById}
			workspaces={data?.workspaces ?? []}
			onFinish={handleFinish}
			isSubmitting={attach.isPending}
			{...props}
		/>
	)
}
