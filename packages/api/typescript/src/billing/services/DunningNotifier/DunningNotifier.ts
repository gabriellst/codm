import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@template/core-typescript'
import { MailSender } from '@template/core-typescript'
import { BillingProfileRepository } from '@billing/repositories'
import { DunningEmail } from '@billing/services/MailSender/DunningEmail'
import type { DunningStartedEvent } from '@billing/events/DunningStartedEvent'
import type { DunningAttemptFailedEvent } from '@billing/events/DunningAttemptFailedEvent'
import type { DunningSucceededEvent } from '@billing/events/DunningSucceededEvent'
import type { DunningFailedEvent } from '@billing/events/DunningFailedEvent'
import { LoggingService } from '@template/core-typescript'

type StartedPayload = InstanceType<typeof DunningStartedEvent>['payload']
type AttemptPayload = InstanceType<typeof DunningAttemptFailedEvent>['payload']
type SucceededPayload = InstanceType<typeof DunningSucceededEvent>['payload']
type FailedPayload = InstanceType<typeof DunningFailedEvent>['payload']

/**
 * Renders + sends the phase-appropriate dunning email (Decision 10). The sole consumer of
 * MailSender/BillingProfileRepository for the dunning lifecycle — each per-event handler
 * (DunningStartedHandler / DunningAttemptFailedHandler / DunningSucceededHandler /
 * DunningFailedHandler) claims its own idempotency key and then delegates here, so this service
 * stays free of dedup concerns (canon bp-03: handler = claim + delegate, logic lives in the
 * service).
 */
@injectable()
export class DunningNotifier {
	constructor(
		private mailSender: MailSender,
		private billingProfiles: BillingProfileRepository,
		private loggingService: LoggingService,
	) {}

	async notify(phase: 'started', payload: StartedPayload, tx?: Transaction): Promise<void>
	async notify(phase: 'attempt', payload: AttemptPayload, tx?: Transaction): Promise<void>
	async notify(phase: 'succeeded', payload: SucceededPayload, tx?: Transaction): Promise<void>
	async notify(phase: 'failed', payload: FailedPayload, tx?: Transaction): Promise<void>
	async notify(
		phase: 'started' | 'attempt' | 'succeeded' | 'failed',
		payload: StartedPayload | AttemptPayload | SucceededPayload | FailedPayload,
		tx?: Transaction,
	): Promise<void> {
		const owner = await this.billingProfiles.findByOwnerId(payload.ownerId, tx)
		if (!owner?.email) {
			// No resolvable email for this owner — nothing to notify. Don't throw: the caller's
			// idempotency claim already guarantees we won't retry-spam once the owner is created.
			this.loggingService.warn({
				content: {
					message: 'DunningNotifier: no email on file for owner — skipping dunning email',
					ownerId: payload.ownerId,
					invoiceId: payload.invoiceId,
					phase,
				},
			})
			return
		}

		const language = owner.language

		// Each branch narrows `payload` by the field unique to its phase (in addition to the
		// `phase` switch itself narrowing to the matching literal) so the discriminated union is
		// actually checked here — no `as DunningEmailProps` escape hatch. The `in` checks are the
		// phase's real, required, phase-unique field (never optional), so they always succeed for
		// a correctly-paired (phase, payload) call — which every call site guarantees via the
		// overloads above.
		switch (phase) {
			case 'started': {
				if (!('classification' in payload)) throw new TypeError(`DunningNotifier: payload does not match phase "${phase}"`)
				await this.send(owner.email, new DunningEmail({ phase, ...payload, language }))
				return
			}
			case 'attempt': {
				if (!('remainingAttempts' in payload)) throw new TypeError(`DunningNotifier: payload does not match phase "${phase}"`)
				await this.send(owner.email, new DunningEmail({ phase, ...payload, language }))
				return
			}
			case 'succeeded': {
				if (!('recoveredVia' in payload)) throw new TypeError(`DunningNotifier: payload does not match phase "${phase}"`)
				await this.send(owner.email, new DunningEmail({ phase, ...payload, language }))
				return
			}
			case 'failed': {
				if ('classification' in payload || 'remainingAttempts' in payload || 'recoveredVia' in payload) {
					throw new TypeError(`DunningNotifier: payload does not match phase "${phase}"`)
				}
				await this.send(owner.email, new DunningEmail({ phase, ...payload, language }))
				return
			}
		}
	}

	/** Render the phase's DunningEmail to a MailMessage and hand it to the converged MailSender. */
	private async send(to: string, email: DunningEmail): Promise<void> {
		await this.mailSender.sendMail({ to, subject: await email.getSubject(), body: await email.getBody() })
	}
}
