import { BoundedContext } from '@codedm/core-typescript'
import * as controllers from './controllers'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'

const internalHandlers = {}

const ctx = await BoundedContext.create({
	name: 'ui',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
