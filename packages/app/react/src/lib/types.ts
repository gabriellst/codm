/**
 * Generates all possible dot-notation field paths from an object type.
 * Useful for type-safe form field names, validation error paths, etc.
 *
 * @example
 * type User = { name: string; address: { city: string; zip: string } }
 * type Paths = FieldPaths<User>
 * // Result: 'name' | 'address' | 'address.city' | 'address.zip'
 */
export type FieldPaths<T, Prefix extends string = ''> = T extends object
	? {
			[K in keyof T & string]: T[K] extends object
				? T[K] extends unknown[]
					? // Arrays: include the array field itself but don't recurse into indices
						`${Prefix}${K}`
					: // Objects: include the field and recurse
						`${Prefix}${K}` | FieldPaths<T[K], `${Prefix}${K}.`>
				: // Primitives: just the field name
					`${Prefix}${K}`
		}[keyof T & string]
	: never

/** Makes all properties optional recursively — useful for form defaults where fields start empty */
export type DeepPartial<T> = T extends Date
	? T
	: T extends Array<infer U>
		? DeepPartial<U>[]
		: T extends object
			? { [K in keyof T]?: DeepPartial<T[K]> }
			: T
