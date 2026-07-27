import { BoundedContext } from '@codedm/core-typescript'
import { CONTEXT_NAMES } from '@shared/contexts'
import * as controllers from './controllers'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'

const ctx = await BoundedContext.create({
	name: CONTEXT_NAMES.ui,
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
