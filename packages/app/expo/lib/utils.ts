import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

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
