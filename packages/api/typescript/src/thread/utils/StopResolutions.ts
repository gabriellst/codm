import { StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'

/**
 * The per-kind resolution vocabulary — which `StopResolution`s are applicable to which `StopKind`.
 * Drives both the `Thread.resolveStop` invariant (`RESOLUTION_NOT_APPLICABLE`) and the T14 Needs-You
 * panel's `availableResolutions`. TAKE_OVER (hand the conversation to the human, pausing the thread)
 * applies to every stop; APPROVE/DENY are exclusive to APPROVAL_NEEDED.
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
}

export function resolutionsForKind(kind: StopKind): StopResolution[] {
	return RESOLUTIONS_BY_KIND[kind] ?? [StopResolution.TAKE_OVER]
}

export function isResolutionApplicable(kind: StopKind, resolution: StopResolution): boolean {
	return resolutionsForKind(kind).includes(resolution)
}
