import { BoundedContext } from '@codedm/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'

const ctx = await BoundedContext.create({
	name: 'board',
	controllers,
	internalHandlers: {},
	externalHandlers: {},
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
