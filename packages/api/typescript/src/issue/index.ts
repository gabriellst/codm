import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { AutoArchiveCompletedIssues } from './usecases/AutoArchiveCompletedIssues'

const ctx = await BoundedContext.create({
	name: 'issue',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
	// C28 — the 24h auto-archive sweep (template Job pattern). The WINDOW is 24h (completedAt cutoff);
	// the sweep runs hourly so completed issues archive promptly once they cross the window.
	jobs: [{ handler: AutoArchiveCompletedIssues, repeat: { every: 60 * 60 * 1000 } }],
})

export default ctx.router
