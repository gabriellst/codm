import { BoundedContext } from '@codedm/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'
import * as internalHandlers from './handlers/internal'

const externalHandlers = {}

const ctx = await BoundedContext.create({
	name: 'procurement',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
