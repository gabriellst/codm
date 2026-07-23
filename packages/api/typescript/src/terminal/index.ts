import { BoundedContext } from '@codedm/core-typescript'
import * as controllers from './controllers'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'
import { SessionPrewarmService } from './services/SessionPrewarm'

const ctx = await BoundedContext.create({
	name: 'terminal',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
	// Phase-10: fire-and-forget prewarm of the most recently used issue sessions (recency from
	// terminal_llm_sessions.last_turn_at). Stub/mock runners no-op `prewarm`, so this only spawns
	// real claude REPLs in the production daemon. Skipped during spec emission (no runtime infra).
	setup: container => {
		if (process.env.EMIT_OPENAPI === 'true') return
		// Failures are already absorbed + logged inside the sweep; this catch only guards the
		// resolution/start call itself (fire-and-forget must never take the boot down).
		void container
			.resolve(SessionPrewarmService)
			.start()
			.catch(() => {})
	},
})

export default ctx.router
