import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

/**
 * Serializes search params for URL, converting Date objects to ISO strings.
 * Use this when updating search params to ensure proper URL serialization.
 */
export function serializeSearchParams<T extends Record<string, unknown>>(updates: Partial<T>): Partial<T> {
	const serialized: Record<string, unknown> = {}

	for (const [key, value] of Object.entries(updates)) {
		if (value instanceof Date) {
			serialized[key] = value.toISOString()
		} else {
			serialized[key] = value
		}
	}

	return serialized as Partial<T>
}

/**
 * Creates a search params updater function that automatically serializes Date objects.
 * Use with TanStack Router's navigate function.
 */
export function createSearchParamsUpdater<T extends Record<string, unknown>>(navigate: (options: { search: (prev: T) => T }) => void) {
	return (updates: Partial<T>) => {
		const serialized = serializeSearchParams(updates)
		navigate({ search: prev => ({ ...prev, ...serialized }) })
	}
}

const isFilled = (val: unknown): boolean => {
	if (val === undefined || val === null || val === '') return false
	if (typeof val === 'boolean' || typeof val === 'number') return true
	if (typeof val === 'string') return true
	if (Array.isArray(val)) return val.length > 0
	if (typeof val === 'object') {
		const values = Object.values(val)
		return values.length > 0 && values.every(isFilled)
	}
	return true
}

/**
 * Checks if all required fields defined in a Zod schema are filled.
 * Only validates keys present in the schema's shape, skipping optional fields.
 */
export function validateFieldsFilledWithSchema<T extends { shape: Record<string, { isOptional(): boolean }>; _zod: { output: any } }>(
	value: Record<string, unknown>,
	schema: T,
): value is T['_zod']['output'] {
	for (const key of Object.keys(schema.shape)) {
		if (schema.shape[key].isOptional()) continue
		if (!isFilled(value[key])) return false
	}
	return true
}

/**
 * Generates initials from a name string.
 * Takes first letter of first two words, or first two characters if single word.
 */
export function getInitials(name: string): string {
	const trimmed = name.trim()
	if (!trimmed) return '?'
	return trimmed
		.split(' ')
		.filter(n => n.length > 0)
		.map(n => n[0])
		.join('')
		.toUpperCase()
		.slice(0, 2)
}

type TryCatchResult<T> = { success: true; data: T } | { success: false; error: Error }

export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<TryCatchResult<T>> {
	try {
		const data = await fn()
		return { success: true, data }
	} catch (error) {
		return { success: false, error: error as Error }
	}
}

export function tryCatch<T>(fn: () => T): TryCatchResult<T> {
	try {
		const data = fn()
		return { success: true, data }
	} catch (error) {
		return { success: false, error: error as Error }
	}
}

export function getAge(birthDate: string | Date): number {
	const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate
	const today = new Date()
	let age = today.getFullYear() - birth.getFullYear()
	const monthDiff = today.getMonth() - birth.getMonth()
	if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
		age--
	}
	return age
}

export function formatCpfForDisplay(cpf: string): string {
	const digits = cpf.replace(/\D/g, '')
	if (digits.length !== 11) return cpf
	return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}
