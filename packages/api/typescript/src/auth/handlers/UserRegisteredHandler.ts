import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codedm/core-typescript'
import { UserRegisteredEvent } from '@auth/events'

@injectable()
export class UserRegisteredHandler extends EventHandler<typeof UserRegisteredEvent> {
	readonly event = UserRegisteredEvent

	async handle(event: this['input']): Promise<this['output']> {
		console.log('[auth] user registered', { userId: event.payload.userId, email: event.payload.email })
		return
	}
}
