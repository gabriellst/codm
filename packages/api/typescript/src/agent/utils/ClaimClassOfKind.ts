import { MailboxClaimClass, MailboxItemKind } from '@codm/contracts-typescript/wire/enums'

/**
 * The class a queue item gets FROM ITS KIND ALONE (fase 4, S0a) — total over `MailboxItemKind`.
 *
 * ONE reader: migration 0037, whose hand-written `UPDATE` classified every item that existed before the column (the
 * migration test pins the SQL to this table). Since S0c the enqueue no longer reads it — `EnqueueMailboxItem.claimClass`
 * is required and declared by each producer, because the kind cannot tell a decision's answer, an "agora" or the
 * declaration reminder from an ordinary steer; only the producer knows that.
 */
export const CLAIM_CLASS_OF_KIND: Readonly<Record<MailboxItemKind, MailboxClaimClass>> = {
	[MailboxItemKind.WORK]: MailboxClaimClass.WORK,
	[MailboxItemKind.STEER]: MailboxClaimClass.STEER,
	[MailboxItemKind.ISSUE_RESULT]: MailboxClaimClass.RESULT,
	[MailboxItemKind.OPERATOR_MESSAGE]: MailboxClaimClass.OPERATOR,
}
