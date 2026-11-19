import { MailboxClaimClass, MailboxItemKind } from '@codm/contracts-typescript/wire/enums'

/**
 * The class a queue item gets FROM ITS KIND ALONE (fase 4, S0a) — total over `MailboxItemKind`.
 *
 * Two readers, both transitional by design:
 *  - migration 0037, whose hand-written `UPDATE` classifies every item that existed before the column (the
 *    migration test pins the SQL to this table);
 *  - `LibSqlMailboxRepository.enqueue`, until slice S0c makes `EnqueueMailboxItem.claimClass` a REQUIRED,
 *    producer-declared field. The kind cannot tell a decision's answer, an "agora" or the declaration reminder
 *    from an ordinary steer — only the producer knows that — so this table maps each kind to its plain class.
 */
export const CLAIM_CLASS_OF_KIND: Readonly<Record<MailboxItemKind, MailboxClaimClass>> = {
	[MailboxItemKind.WORK]: MailboxClaimClass.WORK,
	[MailboxItemKind.STEER]: MailboxClaimClass.STEER,
	[MailboxItemKind.ISSUE_RESULT]: MailboxClaimClass.RESULT,
	[MailboxItemKind.OPERATOR_MESSAGE]: MailboxClaimClass.OPERATOR,
}
