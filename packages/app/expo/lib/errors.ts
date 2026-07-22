import { Alert } from 'react-native'
import { ApiErrorsEnum } from '@template/client-typescript/typescript'
import i18n from './i18n'

const frontendErrorsEnum = {
	NETWORK_ERROR: 'NETWORK_ERROR',
	UNKNOWN_ERROR: 'UNKNOWN_ERROR',
	SESSION_EXPIRED: 'SESSION_EXPIRED',
	UNAUTHORIZED: 'UNAUTHORIZED',
} as const

export const errorsEnum = { ...ApiErrorsEnum, ...frontendErrorsEnum } as const

export type ErrorCode = (typeof errorsEnum)[keyof typeof errorsEnum] | string

export interface ErrorContext {
	code: ErrorCode
	message?: string
	originalError?: unknown
}

export type ErrorHandler = (ctx: ErrorContext) => void

const defaultErrorHandler: ErrorHandler = ctx => {
	const t = i18n.t.bind(i18n)
	const message = t(`errors.${ctx.code}` as never, { defaultValue: ctx.message ?? t('errors.UNKNOWN_ERROR') })
	Alert.alert(t('errors.title'), message)
}

// Single operator, no login screen — auth error codes fall through to the default alert handler.
const customErrorHandlers: Partial<Record<string, ErrorHandler>> = {}

export function isValidErrorCode(code: string): code is ErrorCode {
	return code in errorsEnum
}

export function extractErrorCode(error: unknown): ErrorCode {
	if (error && typeof error === 'object') {
		if ('code' in error && typeof error.code === 'string') {
			return error.code
		}
		if ('data' in error && error.data && typeof error.data === 'object') {
			const data = error.data as Record<string, unknown>
			if ('code' in data && typeof data.code === 'string') return data.code
			if ('name' in data && typeof data.name === 'string') return data.name
		}
		if ('name' in error && typeof error.name === 'string') {
			return error.name
		}
		if (error instanceof TypeError && error.message.includes('fetch')) return 'NETWORK_ERROR'
	}
	return 'UNKNOWN_ERROR'
}

export function handleError(code: ErrorCode | string, message?: string, originalError?: unknown): void {
	const ctx: ErrorContext = { code, message, originalError }
	const handler = customErrorHandlers[code] ?? defaultErrorHandler
	handler(ctx)
}

export function handleApiError(error: unknown, fallbackMessage?: string): void {
	const code = extractErrorCode(error)
	const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : fallbackMessage
	handleError(code, message, error)
}

export function useErrorHandler() {
	return { handleError, handleApiError, extractErrorCode, isValidErrorCode }
}
