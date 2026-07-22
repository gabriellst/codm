import { BoundedContext } from '@codedm/core-typescript'
import * as controllers from './controllers'
import { INSTANCE_REGISTRY } from './registry'

const internalHandlers = {}
const externalHandlers = {}

const ctx = await BoundedContext.create({
	name: 'workspace',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
