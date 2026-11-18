import type { PanelActionDelivery, PanelActionOutcome, PanelOpenStop } from '@shared/schemas'

/** One person as the cloud panel may know them — opaque id, display name, the "pode liberar" grant. */
export interface PanelRosterMember {
	memberId: string
	name: string
	canRelease: boolean
}

export interface PanelRosterBatch {
	groups: { threadId: string; members: PanelRosterMember[]; openStops: PanelOpenStop[] }[]
	/** Outcomes of panel actions executed since the last successful pull (fase 2, item 6b). */
	outcomes: PanelActionOutcome[]
}

/** A code the cloud minted for a panel visitor — to be DMed to that member, then forgotten. */
export interface PanelCodeDelivery {
	requestId: string
	threadId: string
	memberId: string
	code: string
}

/** What the cloud hands back on a pull: codes to DM, and panel actions to execute (fase 2, item 6b). */
export interface PanelRosterReply {
	deliveries: PanelCodeDelivery[]
	actions: PanelActionDelivery[]
}

/**
 * The daemon's people-side pull from the CLOUD panel (fase 2, items 6a/6b): push each group's roster
 * (and open stops, and the outcomes of actions already executed), get back the identification codes to
 * deliver and the actions people asked for. The cloud cannot call the daemon, so this answer is the only
 * way a panel request reaches it.
 *
 * Abstract and bound per env (Cloud in `real`, a recorder elsewhere) — the S2S rule: no test may need
 * the cloud up. Same shape as `issue`'s `PanelPublisher`, owned here because people (roster, posture,
 * the WhatsApp DM) are this context's.
 */
export abstract class PanelRosterRelay {
	/** `undefined` when NOT sent — no cloud credential (not logged in). Network and cloud errors propagate. */
	abstract sync(batch: PanelRosterBatch): Promise<PanelRosterReply | undefined>
}
