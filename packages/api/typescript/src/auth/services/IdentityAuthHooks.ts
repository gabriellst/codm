import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { DomainEventRepository, DrizzleClient, MailSender } from '@template/core-typescript'
import * as schema from '@template/contracts/db'
import { renderAccountCreatedEmail, renderResetPasswordEmail } from '@auth/services/MailSender'
import { UserProfile } from '../entities/UserProfile'
import { UserProfileRepository } from '../repositories/UserProfileRepository'
import {
	PasswordChangedEvent,
	PasswordResetEvent,
	PasswordResetRequestedEvent,
	UserRegisteredEvent,
	UserSignedInEvent,
	UserSignedOutEvent,
} from '../events'

/**
 * Identity-side adapter that translates BetterAuth lifecycle hooks into
 * the BC1 Identity domain events. Wired into BetterAuth's `databaseHooks`
 * in `auth/services/Authentication/BetterAuth.ts`.
 *
 * Per user direction: sign-in/sign-out/sign-up are NOT BC1 commands; they
 * happen inside BetterAuth's own endpoints. This service lets Identity
 * react to those auth events without owning the HTTP surface.
 *
 * NOT a Handler — these methods are called from infrastructure callbacks
 * (BetterAuth hooks) that don't carry a polyglot Transaction. We save
 * events + auxiliary rows without an explicit tx; the default DrizzleClient
 * handles the writes.
 *
 * ALL side-effect logic lives HERE (user direction): BetterAuth.ts is pure
 * wiring — every callback is a single `await this.identityHooks.<method>()`
 * with zero business logic in the options literal. Emails, conditionals and
 * session enrichment reads are this adapter's responsibility.
 */
@injectable()
export class IdentityAuthHooks {
	constructor(
		private readonly domainEventRepo: DomainEventRepository,
		private readonly profileRepo: UserProfileRepository,
		private readonly mailSender: MailSender,
		private readonly client: DrizzleClient,
	) {}

	/**
	 * Wired to `databaseHooks.user.create.after`. Creates the default
	 * `UserProfile` row ("created when the User is created") and emits the
	 * registration event. (The former UserPreferences aggregate was removed —
	 * its only template-worthy field, timezone, lives on UserProfile.)
	 */
	async onUserCreated(input: { userId: string; email: string; name?: string | null }): Promise<void> {
		const profile = UserProfile.create({ userId: input.userId })
		await this.profileRepo.save(profile)
		await this.domainEventRepo.save(
			new UserRegisteredEvent({
				entityId: input.userId,
				ownerId: input.userId,
				payload: { userId: input.userId, email: input.email },
			}),
		)
		const { subject, body } = await renderAccountCreatedEmail({ name: input.name ?? input.email })
		await this.mailSender.sendMail({ to: input.email, subject, body })
	}

	/** Wired to `databaseHooks.session.create.after`. */
	async onSessionCreated(input: { userId: string }): Promise<void> {
		await this.domainEventRepo.save(
			new UserSignedInEvent({
				entityId: input.userId,
				ownerId: input.userId,
				payload: { userId: input.userId, signedInAt: new Date().toISOString() },
			}),
		)
	}

	/** Wired to `databaseHooks.session.delete.after`. */
	async onSessionDeleted(input: { userId: string }): Promise<void> {
		await this.domainEventRepo.save(
			new UserSignedOutEvent({
				entityId: input.userId,
				ownerId: input.userId,
				payload: { userId: input.userId, signedOutAt: new Date().toISOString() },
			}),
		)
	}

	/**
	 * Wired to `emailAndPassword.sendResetPassword` — the REQUEST moment of the reset flow:
	 * persists the event and sends the reset email.
	 */
	async onPasswordResetRequested(input: { userId: string; email: string; name?: string | null; url: string }): Promise<void> {
		await this.domainEventRepo.save(
			new PasswordResetRequestedEvent({
				entityId: input.userId,
				ownerId: input.userId,
				payload: { userId: input.userId, requestedAt: new Date().toISOString() },
			}),
		)
		const { subject, body } = await renderResetPasswordEmail({ name: input.name ?? input.email, url: input.url })
		await this.mailSender.sendMail({ to: input.email, subject, body })
	}

	/** Wired to `emailAndPassword.onPasswordReset` — the reset COMPLETED with a new password. */
	async onPasswordReset(input: { userId: string }): Promise<void> {
		await this.domainEventRepo.save(
			new PasswordResetEvent({
				entityId: input.userId,
				ownerId: input.userId,
				payload: { userId: input.userId, resetAt: new Date().toISOString() },
			}),
		)
	}

	/**
	 * Wired to `databaseHooks.account.update.after`. The credential filter lives HERE (adapter
	 * logic, not hook logic): on a credential account the only mutable material is the password
	 * hash, so an update IS a password change (the reset flow also lands here — a reset is a
	 * change, the superset fact; the reset-specific event comes from onPasswordReset).
	 */
	async onAccountUpdated(input: { providerId: string; userId: string }): Promise<void> {
		if (input.providerId !== 'credential') return
		await this.domainEventRepo.save(
			new PasswordChangedEvent({
				entityId: input.userId,
				ownerId: input.userId,
				payload: { userId: input.userId, changedAt: new Date().toISOString() },
			}),
		)
	}

	/**
	 * Wired to the `customSession` plugin — DB read for the live active_owner_id
	 * (additionalFields alone doesn't auto-populate when the column is updated outside a
	 * sign-in hook, e.g. via SetActiveOwner).
	 */
	async sessionContext(sessionId: string): Promise<{ activeOwnerId: string | null }> {
		const row = await this.client
			.select({ activeOwnerId: schema.sessions.activeOwnerId })
			.from(schema.sessions)
			.where(eq(schema.sessions.id, sessionId))
			.limit(1)
			.then(rows => rows[0])
		return { activeOwnerId: row?.activeOwnerId ?? null }
	}
}
