import { BoundedContext } from '@codm/core-typescript'
import { CONTEXT_NAMES } from '@shared/contexts'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { DeliverChannelMessage } from './usecases/DeliverChannelMessage'

const ctx = await BoundedContext.create({
	name: CONTEXT_NAMES.thread,
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
	// THE DELIVERY EXECUTOR (B3, decision 2). Without this line the whole path is inert in the way that
	// is hardest to notice: producers enqueue, tsc is green, every unit test passes, and no message ever
	// reaches the channel. Registering it also STARTS the queue's poller in this process.
	commandHandlers: { DeliverChannelMessage },
})

export default ctx.router
