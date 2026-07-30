import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { ChannelRemotesSyncedEvent } from '@codm/contracts-typescript/wire/events'

/**
 * BC1 → console. Subscribes to the gateway's `integration.channel.remotes_synced` (a bootstrap
 * contact-sync pass finished inserting `gateway.remotes` rows).
 *
 * The subscription is load-bearing: the
 * RedisExternalMediator only opens a stream when a NAMED handler registers for it, and the
 * ListenEvents SSE relay is a catch-all that piggybacks on already-open streams. With this handler
 * registered — and `integration.channel.remotes_synced` listed in the ListenEvents BROWSER_EVENTS —
 * the raw envelope is fanned out to the operator's browser, where the attach wizard invalidates its
 * contacts read (`getAttachThreadWizardQueryKey`) so a freshly synced directory appears without a
 * manual refresh. No server-side side effect: the read model is already written by the Go projector;
 * this is pure stream-opening plumbing.
 */
@injectable()
export class ConsumeChannelRemotesSynced extends EventHandler<typeof ChannelRemotesSyncedEvent> {
	readonly event = ChannelRemotesSyncedEvent

	async handle(_event: this['input']): Promise<void> {
		// Intentionally empty — see the class docblock. The registration opens the upstream stream so
		// the SSE relay can deliver the envelope to the browser; the invalidation happens client-side.
	}
}
