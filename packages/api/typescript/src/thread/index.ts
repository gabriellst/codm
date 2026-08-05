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
import { FireDueLoops, FIRE_DUE_LOOPS_INTERVAL_MS } from './usecases/FireDueLoops'

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
	// THE LOOP SWEEP (C25) — once a minute, fire every scheduled whisper whose hour has come.
	//
	// A repeatable JOB and not a `setInterval`, for the reason this whole feature exists: the alarm has
	// to survive the daemon being closed, and the desktop shell closes it every time the operator quits.
	// Registered here, next to the command handlers, so the one file that decides what this context RUNS
	// says both. Minute cadence because a loop's own resolution is a minute (`HH:MM`) — a coarser sweep
	// would make "09:00" mean "sometime after 09:00", which is not what the operator typed.
	jobs: [{ handler: FireDueLoops, repeat: { every: FIRE_DUE_LOOPS_INTERVAL_MS } }],
})

export default ctx.router
