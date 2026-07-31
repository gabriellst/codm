import { BoundedContext } from '@codm/core-typescript'
import { CONTEXT_NAMES } from '@shared/contexts'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { DeliverChannelMessage } from './usecases/DeliverChannelMessage'
import { ReactToChannelMessage } from './usecases/ReactToChannelMessage'
import { StreamChannelReply } from './usecases/StreamChannelReply'
import { SustainTypingPresence } from './usecases/SustainTypingPresence'

const ctx = await BoundedContext.create({
	name: CONTEXT_NAMES.thread,
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
	// THE DELIVERY EXECUTOR (B3, decision 2). Without this line the whole path is inert in the way that
	// is hardest to notice: producers enqueue, tsc is green, every unit test passes, and no message ever
	// reaches the channel. Registering it also STARTS the queue's poller in this process.
	//
	// The two INSTANT CUES (streaming spec, decision 10) share that failure mode exactly: unregistered,
	// producers enqueue and nobody claims, so the emoji never appears and the indicator never lights —
	// with tsc green and every unit test passing.
	//
	// `StreamChannelReply` is the same story once more, with a twist that makes it QUIETER still: left
	// unregistered, the reply is delivered perfectly well by `DeliverChannelMessage` at the end of the
	// turn — so nothing is broken, no test fails, and the only symptom is that the streaming this whole
	// frente exists for silently does not happen.
	commandHandlers: { DeliverChannelMessage, ReactToChannelMessage, StreamChannelReply, SustainTypingPresence },
})

export default ctx.router
