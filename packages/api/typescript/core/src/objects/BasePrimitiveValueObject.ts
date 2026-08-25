import { PrimitiveValueObject } from './ValueObject'
import { BaseError } from '../types/BaseError'
import type { BaseDomainErrors } from '../errors/codes'
import type { z, ZodString, ZodType } from 'zod'

export abstract class BasePrimitiveValueObject<T extends ZodType = ZodString> extends PrimitiveValueObject<z.output<T>> {
	static schema?: ZodType
	declare readonly value: z.output<T>

	static transformed() {
		// biome-ignore lint/complexity/noThisInStatic: polymorphic this pattern — subclasses call BasePrimitiveValueObject.transformed() and `this` must resolve to the subclass constructor at runtime
		const Cls = this as unknown as { schema: ZodType; new (props: unknown): BasePrimitiveValueObject }
		return Cls.schema.transform((v: unknown) => new Cls(v))
	}

	constructor(value: z.input<T>) {
		super()
		const schema = (this.constructor as typeof BasePrimitiveValueObject).schema
		const result = schema?.safeParse(value)

		if (result && !result.success) {
			throw new BaseError<BaseDomainErrors>(result.error.issues[0]!.message as BaseDomainErrors)
		}

		Object.assign(this, { value: result?.data ?? value })
	}
}
