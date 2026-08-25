// packages/app/react/src/routes/onboarding/-components/OnboardingReviewStep/index.tsx — COMPLETE final file.
import { type ComponentProps, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ChannelKind } from '@codm/client-typescript/typescript'
import {
	attachThreadMutationRequestSchema,
	getOnboardingQueryKey,
	useAttachThread,
	useGetAttachThreadWizard,
} from '@codm/client-typescript/typescript'
import { useErrorHandler } from '@/lib/errors'
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
 *
 * REWRITTEN for the 2026-08-24 onboarding-attach-ux audit (item 2, "Próximo confirma e avança"). This
 * adapter no longer passes `onFinish`/`isSubmitting` to `ReviewStep` — per that component's own
 * docblock, omitting them makes it "pure read + edit links, nothing else", which is exactly what
 * removes the double-click ("Vincular conversa" inside the step, THEN "Próximo" in the footer). The
 * commit action moves to `confirmStep` on `useOnboardingSetupStore`, which `OnboardingFlow`'s footer
 * calls on "Próximo" and awaits before advancing. `confirmStep` is registered ONLY when the
 * accumulated selection is complete AND not already attached (`canFinish && !threadAttached`) — an
 * incomplete REVIEW (WORKSPACE/CONTACT/AGENTS never touched; all DEFERRABLE, not REQUIRED) leaves it
 * `undefined`, so "Próximo" is a synchronous no-op advance, same as before this audit.
 * `threadAttached` (same store) guards against re-firing `useAttachThread` if the operator goes
 * "Voltar" back into REVIEW after already attaching once.
 */
export function OnboardingReviewStep(props: ComponentProps<'div'>) {
	const queryClient = useQueryClient()
	const contactRef = useOnboardingSetupStore(state => state.contactRef)
	const providers = useOnboardingSetupStore(state => state.providers)
	const workspaceId = useOnboardingSetupStore(state => state.workspaceId)
	const threadAttached = useOnboardingSetupStore(state => state.threadAttached)
	const setThreadAttached = useOnboardingSetupStore(state => state.setThreadAttached)
	const setAttachedThreadId = useOnboardingSetupStore(state => state.setAttachedThreadId)
	const setConfirmStep = useOnboardingSetupStore(state => state.setConfirmStep)
	const setStepError = useOnboardingSetupStore(state => state.setStepError)
	const { extractErrorCode, getErrorTranslation } = useErrorHandler()

	const { data } = useGetAttachThreadWizard()
	// `meta: { suppressToast: true }` — 2026-08-24 audit item 6: no global toast for this mutation's
	// failure; the effect below mirrors `attach.error` into `stepError` instead (no local `onError`/
	// try-catch — component bp-22, same canon `isPending` already follows).
	const attach = useAttachThread({
		mutation: {
			meta: { suppressToast: true },
			onSuccess: () => queryClient.invalidateQueries({ queryKey: getOnboardingQueryKey() }),
		},
	})
	const channelKindById = useMemo(() => new Map<string, ChannelKind>((data?.channels ?? []).map(c => [c.channelId, c.kind])), [data])

	const canFinish = attachThreadMutationRequestSchema.safeParse({ contactRef, workspaceId, providers }).success

	useEffect(() => {
		if (!canFinish || threadAttached) {
			setConfirmStep(undefined)
			return
		}
		setConfirmStep(async () => {
			const result = attachThreadMutationRequestSchema.safeParse({ contactRef, workspaceId, providers })
			if (!result.success) return
			const res = await attach.mutateAsync({ data: result.data })
			setThreadAttached(true)
			// Item 7 (same audit) — `OnboardingFinalStep` needs this thread's `threadId` to look up its
			// mention tag; this response is the only place that id exists.
			setAttachedThreadId(res.threadId)
		})
		return () => setConfirmStep(undefined)
	}, [canFinish, threadAttached, contactRef, workspaceId, providers, attach, setThreadAttached, setAttachedThreadId, setConfirmStep])

	// Mirrors the mutation's OWN error state into the shared `stepError` (item 6). Cleared on unmount
	// (the step remounts fresh on every navigation) so a stale message never bleeds into a different
	// step.
	useEffect(() => {
		setStepError(attach.error ? getErrorTranslation(extractErrorCode(attach.error)) : undefined)
		return () => setStepError(undefined)
	}, [attach.error, setStepError, extractErrorCode, getErrorTranslation])

	return (
		<ReviewStep
			contactRef={contactRef}
			workspaceId={workspaceId}
			providers={providers}
			channelKindById={channelKindById}
			workspaces={data?.workspaces ?? []}
			{...props}
		/>
	)
}
