// packages/app/react/src/routes/onboarding/-components/OnboardingWorkspaceStep/index.tsx — COMPLETE final file.
import { type ComponentProps, useEffect, useRef } from 'react'
import { useGetAttachThreadWizard } from '@codm/client-typescript/typescript'
import { AddWorkspaceForm } from '@/routes/(app)/workspaces/-components/AddWorkspaceForm'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'

/**
 * Adapter for the onboarding WORKSPACE step (spec Decision 4/11) — `AddWorkspaceForm` (ONB-4a) is
 * reused UNMODIFIED. It CREATES a workspace and calls `onDone` with no id back, and it cannot be
 * changed to hand one back (out of this front's scope). But the REVIEW step, three siblings later,
 * needs a `workspaceId` in its accumulated selection — the `/attach` `WorkspaceStep` (which SELECTS
 * from a list) is deliberately excluded from the onboarding wizard, precisely because THIS step just
 * created the workspace REVIEW should use (spec Decision 4).
 *
 * `AddWorkspaceForm` invalidates `getAttachThreadWizardQueryKey()` on success — the SAME read every
 * other onboarding setup-thread adapter already shares — so this watches that read for the row that
 * is NEW since this step mounted (a set-diff, not "most recently added"): correct even when the
 * operator re-enters onboarding with pre-existing workspaces, where "the newest one" could already be
 * stale by the time the diff resolves.
 */
export function OnboardingWorkspaceStep(props: ComponentProps<'div'>) {
	const setWorkspaceId = useOnboardingSetupStore(state => state.setWorkspaceId)
	const { data } = useGetAttachThreadWizard()

	const seededRef = useRef(false)
	const knownIdsRef = useRef<Set<string>>(new Set())
	useEffect(() => {
		if (seededRef.current || !data) return
		seededRef.current = true
		knownIdsRef.current = new Set((data.workspaces ?? []).map(w => w.workspaceId))
	}, [data])

	useEffect(() => {
		if (!data || !seededRef.current) return
		const created = (data.workspaces ?? []).find(w => !knownIdsRef.current.has(w.workspaceId))
		if (created) setWorkspaceId(created.workspaceId)
	}, [data, setWorkspaceId])

	return <AddWorkspaceForm {...props} />
}
