// Para ValueObjects compostos (Phone, Holder, etc.)
export abstract class ValueObject {
	toJSON(): RecursiveValueObjectProps<this> {
		const objectsMap = Object.entries({ ...this })
		const objected = Object.fromEntries(
			objectsMap.map(([key, value]) => {
				// Check PrimitiveValueObject first (more specific)
				if (value instanceof PrimitiveValueObject) {
					return [key, value.toJSON()]
				}
				if (value instanceof ValueObject) {
					return [key, value.toJSON()]
				}
				if (Array.isArray(value)) {
					return [
						key,
						value.map(item => {
							if (item instanceof PrimitiveValueObject) return item.toJSON()
							if (item instanceof ValueObject) return item.toJSON()
							return item
						}),
					]
				}
				// ... rest
				return [key, value]
			}),
		)
		return objected as RecursiveValueObjectProps<this>
	}
}
// Para ValueObjects primitivos (Email, Id, etc.)
export abstract class PrimitiveValueObject<T> {
	abstract readonly value: T

	toJSON(): T {
		return this.value
	}

	toString(): string {
		return String(this.value)
	}
}

// Any callable — the safest "is a function" matcher (never params accept every signature),
// without reaching for the unsafe bare `Function` type.
type AnyFunction = (...args: never[]) => unknown

// Utility type to strip functions from a type
type StripFunctions<T> = {
	[K in keyof T as T[K] extends AnyFunction ? never : K]: T[K]
}

// Utility type to extract properties from a ValueObject instance (excluding methods)
type ValueObjectProps<T extends ValueObject> = StripFunctions<Omit<T, keyof ValueObject>>

// Built-in types that should be preserved as-is
type BuiltInObjects =
	| Date
	| RegExp
	| Error
	| Map<unknown, unknown>
	| Set<unknown>
	| WeakMap<object, unknown>
	| WeakSet<object>
	| AnyFunction
	| Promise<unknown>
	| ArrayBuffer
	| DataView
	| Int8Array
	| Uint8Array
	| Uint8ClampedArray
	| Int16Array
	| Uint16Array
	| Int32Array
	| Uint32Array
	| Float32Array
	| Float64Array
	| BigInt64Array
	| BigUint64Array

type TransformProperty<T> = T extends BuiltInObjects
	? T
	: T extends PrimitiveValueObject<infer V>
		? V
		: T extends ValueObject
			? RecursiveValueObjectProps<T>
			: T extends readonly (infer U)[]
				? TransformProperty<U>[]
				: T extends object
					? { [K in keyof T]: TransformProperty<T[K]> }
					: T

type RecursiveValueObjectProps<T> = T extends ValueObject
	? {
			[K in keyof ValueObjectProps<T>]: TransformProperty<ValueObjectProps<T>[K]>
		}
	: TransformProperty<T>

export type { ValueObjectProps, RecursiveValueObjectProps }
