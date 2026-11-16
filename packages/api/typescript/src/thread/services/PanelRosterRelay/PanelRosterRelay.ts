/** One person as the cloud panel may know them — opaque id, display name, the "pode liberar" grant. */
export interface PanelRosterMember {
	memberId: string
	name: string
	canRelease: boolean
}

export interface PanelRosterBatch {
	groups: { threadId: string; members: PanelRosterMember[] }[]
}

/** A code the cloud minted for a panel visitor — to be DMed to that member, then forgotten. */
export interface PanelCodeDelivery {
	requestId: string
	threadId: string
	memberId: string
	code: string
}

/**
 * The daemon's people-side pull from the CLOUD panel (fase 2, item 6a): push each group's roster, get
 * back the identification codes to deliver. The cloud cannot call the daemon, so this answer is the
 * only way a panel request reaches it.
 *
 * Abstract and bound per env (Cloud in `real`, a recorder elsewhere) — the S2S rule: no test may need
 * the cloud up. Same shape as `issue`'s `PanelPublisher`, owned here because people (roster, posture,
 * the WhatsApp DM) are this context's.
 */
export abstract class PanelRosterRelay {
	/** `undefined` when NOT sent — no cloud credential (not logged in). Network and cloud errors propagate. */
	abstract sync(batch: PanelRosterBatch): Promise<PanelCodeDelivery[] | undefined>
}
