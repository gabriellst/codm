import { StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'

/**
 * The per-kind resolution vocabulary — which `StopResolution`s are applicable to which `StopKind`.
 * Drives both the `Thread.resolveStop` invariant (`RESOLUTION_NOT_APPLICABLE`) and the T14 Needs-You
 * panel's `availableResolutions`. TAKE_OVER (hand the conversation to the human, pausing the thread)
 * applies to every stop; APPROVE/DENY are exclusive to the two kinds that ask for a permission.
 *
 * Lives in `thread/` since B4: the Stop is a child of the Thread aggregate, and the applicability rule
 * is an invariant `Thread.resolveStop` enforces — so the table has to sit inside the context that owns
 * the aggregate raising it, not in the one that used to own the table.
 */
export const RESOLUTIONS_BY_KIND: Record<StopKind, StopResolution[]> = {
	[StopKind.SERVER_ERROR]: [StopResolution.RETRY, StopResolution.TAKE_OVER],
	[StopKind.BLOCKED_BY_CLASSIFICATION]: [StopResolution.RETRY, StopResolution.REVIEW_AND_SEND, StopResolution.TAKE_OVER],
	[StopKind.HUMAN_REQUESTED]: [StopResolution.REVIEW_AND_SEND, StopResolution.TAKE_OVER],
	[StopKind.APPROVAL_NEEDED]: [StopResolution.APPROVE, StopResolution.DENY, StopResolution.TAKE_OVER],
	// AUTH_REQUIRED (phase-10 amendment): the provider CLI needs re-login. RETRY re-runs the issue
	// once the human has re-authed the CLI; TAKE_OVER hands the conversation to the human.
	[StopKind.AUTH_REQUIRED]: [StopResolution.RETRY, StopResolution.TAKE_OVER],
	// PERMISSION_DENIED (participant-permission-posture, Decision 9): the permission filter blocked an
	// action. It is a question of PERMISSION, so it is answered like APPROVAL_NEEDED — APPROVE resumes
	// with the resolver's posture, DENY resumes in AUTO.
	[StopKind.PERMISSION_DENIED]: [StopResolution.APPROVE, StopResolution.DENY, StopResolution.TAKE_OVER],
}

export function resolutionsForKind(kind: StopKind): StopResolution[] {
	return RESOLUTIONS_BY_KIND[kind] ?? [StopResolution.TAKE_OVER]
}

export function isResolutionApplicable(kind: StopKind, resolution: StopResolution): boolean {
	return resolutionsForKind(kind).includes(resolution)
}

/**
 * Whether the resume a resolution schedules runs with the RESOLVER's posture, or always in AUTO
 * (participant-permission-posture, Decision 7). A table, total over `StopResolution`, so a resolution
 * added to the contract fails compilation here until somebody decides whether it may elevate.
 *
 * DENY never elevates: "no" must not be the answer that lifts the filter. TAKE_OVER schedules no resume
 * at all (`ResumeIssueOnStopResolved` returns first), so its value is the safe one rather than a
 * meaningful one.
 */
export const RESUMES_WITH_RESOLVER_POSTURE: Record<StopResolution, boolean> = {
	[StopResolution.RETRY]: true,
	[StopResolution.REVIEW_AND_SEND]: true,
	[StopResolution.APPROVE]: true,
	[StopResolution.DENY]: false,
	[StopResolution.TAKE_OVER]: false,
}
