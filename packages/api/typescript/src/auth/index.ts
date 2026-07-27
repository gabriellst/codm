import { BoundedContext } from '@codedm/core-typescript'
import { CONTEXT_NAMES } from '@shared/contexts'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'

const ctx = await BoundedContext.create({
	name: CONTEXT_NAMES.auth,
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
