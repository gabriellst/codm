import { ValueObject } from './ValueObject'
import { BaseError } from '../types/BaseError'
import type { BaseDomainErrors } from '../errors/codes'
import type { z, ZodObject, ZodRawShape, ZodType } from 'zod'

export abstract class BaseValueObject<T extends ZodObject = ZodObject<ZodRawShape>> extends ValueObject {
	static schema?: ZodType

	static transformed() {
		// biome-ignore lint/complexity/noThisInStatic: polymorphic this pattern — subclasses call BaseValueObject.transformed() and `this` must resolve to the subclass constructor at runtime
		const Cls = this as unknown as { schema: ZodObject; new (props: unknown): BaseValueObject }
		return Cls.schema.input().transform((v: unknown) => new Cls(v))
	}

	constructor(props: z.input<T>) {
		super()
		const schema = (this.constructor as typeof BaseValueObject).schema
		const result = schema?.safeParse(props)

		if (result && !result.success) {
			throw new BaseError<BaseDomainErrors>(result.error.issues[0]!.message as BaseDomainErrors)
		}

		Object.assign(this, result?.data ?? props)
	}
}
