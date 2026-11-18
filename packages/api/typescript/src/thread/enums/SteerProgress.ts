/**
 * How far a STEER routed from a channel message got into the issue's session (fase 2, item 5 —
 * "entregue/lido no WhatsApp"). Context-private: it only chooses which cue goes back on the message.
 *  - `DELIVERED` — the mailbox handed the steer to the session for the first time (`first_claimed_at`).
 *  - `READ` — the turn that carried it ended and the item was consumed.
 */
export enum SteerProgress {
	DELIVERED = 'DELIVERED',
	READ = 'READ',
}
