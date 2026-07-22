import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import * as internalHandlers from './handlers/internal'
import * as projectors from './projections/projectors'
import { INSTANCE_REGISTRY } from './registry'

const ctx = await BoundedContext.create({
	name: 'task',
	controllers,
	internalHandlers,
	externalHandlers: {},
	projectors,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
