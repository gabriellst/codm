import { Id } from '../objects/Id'
import { z, type ZodTypeAny } from 'zod'

export const BaseEventSchema = z.object({
	name: z.string(),
	id: z.string(),
	time: z.iso.datetime(),
	payload: z.object(),
})

export abstract class BaseEvent<Payload extends ZodTypeAny = ZodTypeAny> {
	declare static readonly name: string
	readonly name: string
	readonly id: string
	readonly time: string
	readonly payload: z.infer<Payload>

	constructor(payload: z.infer<Payload>) {
		this.name = (this.constructor as { name: string }).name
		this.payload = payload
		this.time = new Date().toISOString()
		this.id = Id.fromSeed(this.serialize()).value
	}

	toJSON() {
		return Object.assign({ name: this.name }, this)
	}

	serialize(): string {
		return JSON.stringify(this)
	}
}
