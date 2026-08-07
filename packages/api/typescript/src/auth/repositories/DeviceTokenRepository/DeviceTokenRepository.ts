import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { DeviceToken } from '../../entities/DeviceToken'

/** What `consumeCode` hands back on a successful (first-and-only) claim. */
export interface ConsumedDeviceCode {
	userId: string
}

/**
 * DeviceToken's persistence boundary. It ALSO owns the `device_codes` ephemeral ledger — there is
 * no DeviceCode entity (spec T2: "tabela, sem entity — é um valor efêmero"), and this is the same
 * INFRA-ledger shape `ConsumedMessageRepository`/`MailboxRepository` already established in this
 * codebase (repository skill bp-12 case 1). It lives on THIS repository, not a standalone abstract
 * class, because the code exists for exactly one purpose — becoming a DeviceToken — so its lifecycle
 * is owned by the repository that will eventually mint one.
 */
export abstract class DeviceTokenRepository extends Repository<DeviceToken> {
	abstract findById(id: string, tx?: Transaction): Promise<DeviceToken | undefined>
	abstract findByHash(tokenHash: string, tx?: Transaction): Promise<DeviceToken | undefined>

	/** Mint a fresh one-time code for `userId`, expiring at `expiresAt`. */
	abstract issueCode(code: string, userId: string, expiresAt: Date, tx?: Transaction): Promise<void>

	/**
	 * Atomically claim `code`: an UPDATE ... WHERE consumed_at IS NULL AND expires_at > now RETURNING,
	 * not a check-then-act. A second call for the SAME code (already consumed, or expired) updates
	 * zero rows and resolves `undefined` — the same claimNext idiom MailboxRepository uses, applied
	 * to a single-shot exchange instead of a repeating queue.
	 */
	abstract consumeCode(code: string, now: Date, tx?: Transaction): Promise<ConsumedDeviceCode | undefined>
}
