import { toast } from 'sonner'
import { ApiErrorsEnum } from '@template/client-typescript/typescript'
import i18n from './i18n'

// Frontend-only error codes that the API doesn't emit.
const frontendErrorsEnum = {
	NETWORK_ERROR: 'NETWORK_ERROR',
	UNKNOWN_ERROR: 'UNKNOWN_ERROR',
	SESSION_EXPIRED: 'SESSION_EXPIRED',
} as const

// Closed set of known error codes — anything else is treated as a free-form
// message (e.g. an already-translated zod default) and rendered as-is.
export const errorsEnum = {
	...ApiErrorsEnum,
	...frontendErrorsEnum,
} as const

export type ErrorCode = (typeof errorsEnum)[keyof typeof errorsEnum]

export function getErrorTranslation(code: ErrorCode): string {
	const t = i18n.getFixedT(i18n.language, 'translation') as (key: string) => string
	return t(`errors.${code}`) || code
}

export const errorTranslations: Record<ErrorCode, string> = new Proxy({} as Record<ErrorCode, string>, {
	get: (_, prop: string) => {
		if (prop in errorsEnum) {
			return getErrorTranslation(prop as ErrorCode)
		}
		return undefined
	},
})

export interface ErrorContext {
	code: ErrorCode
	message?: string
	originalError?: unknown
}

export type ErrorHandler = (ctx: ErrorContext) => void

const defaultErrorHandler: ErrorHandler = ctx => {
	const t = i18n.getFixedT(i18n.language, 'translation')
	const translatedMessage = getErrorTranslation(ctx.code) || ctx.message || getErrorTranslation('UNKNOWN_ERROR')
	toast.error(t('common.errorTitle'), {
		description: translatedMessage,
	})
}

// Custom handlers for specific errors (e.g. redirect on SESSION_EXPIRED).
const customErrorHandlers: Partial<Record<ErrorCode, ErrorHandler>> = {}

export function handleError(code: ErrorCode | (string & {}), message?: string, originalError?: unknown): void {
	const errorCode = isValidErrorCode(code) ? code : 'UNKNOWN_ERROR'
	const ctx: ErrorContext = {
		code: errorCode,
		message,
		originalError,
	}

	const handler = customErrorHandlers[errorCode] || defaultErrorHandler
	handler(ctx)
}

// Type guard: only true for codes registered in errorsEnum.
export function isValidErrorCode(code: string): code is ErrorCode {
	return code in errorsEnum
}

/**
 * Translate a message that may either be:
 *   - a known error code (looked up under `errors.<code>`), or
 *   - a free-form string (e.g. an already-translated zod default), in which
 *     case it's returned verbatim.
 */
export function translateError(message: string | undefined | null): string {
	if (!message) return getErrorTranslation('UNKNOWN_ERROR')
	if (isValidErrorCode(message)) {
		return getErrorTranslation(message)
	}
	return message
}

export function extractErrorCode(error: unknown): ErrorCode {
	if (error && typeof error === 'object') {
		if ('code' in error && typeof error.code === 'string' && isValidErrorCode(error.code)) {
			return error.code
		}
		if ('data' in error && error.data && typeof error.data === 'object') {
			const data = error.data as Record<string, unknown>
			if ('code' in data && typeof data.code === 'string' && isValidErrorCode(data.code)) {
				return data.code
			}
			if ('name' in data && typeof data.name === 'string' && isValidErrorCode(data.name)) {
				return data.name
			}
		}
		if ('name' in error && typeof error.name === 'string' && isValidErrorCode(error.name)) {
			return error.name
		}
		if (error instanceof TypeError && error.message.includes('fetch')) {
			return 'NETWORK_ERROR'
		}
	}
	return 'UNKNOWN_ERROR'
}

export function handleApiError(error: unknown, fallbackMessage?: string): void {
	const code = extractErrorCode(error)
	const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : fallbackMessage
	handleError(code, message, error)
}

export function useErrorHandler() {
	return {
		handleError,
		handleApiError,
		extractErrorCode,
		isValidErrorCode,
		translateError,
		getErrorTranslation,
		errorTranslations,
	}
}
