import { useTranslation } from 'react-i18next'
import { ERROR_CODES } from '@codm/client-typescript/errors'

/**
 * Error words on the panel. The console's `@/lib/errors` cannot come here — it imports the desktop's stores and
 * toasts (the fence rail would fail) — so the panel reads the same catalog (`errors.<CODE>`) through this leaf:
 * a code the backends registered gets its sentence, anything else the panel's generic one.
 */

export type ErrorCode = (typeof ERROR_CODES)[number]

const KNOWN: ReadonlySet<string> = new Set(ERROR_CODES)

function isErrorCode(value: unknown): value is ErrorCode {
	return typeof value === 'string' && KNOWN.has(value)
}

/** The registered code an SDK call failed with (the generated client puts it on the thrown error), if any. */
export function errorCodeOf(error: unknown): ErrorCode | undefined {
	if (error && typeof error === 'object' && 'code' in error && isErrorCode(error.code)) return error.code
	return undefined
}

/** The HTTP status an SDK call failed with, if it got an answer at all. */
export function errorStatusOf(error: unknown): number | undefined {
	if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') return error.status
	return undefined
}

/** `(code, fallback?) → sentence`: the catalog's `errors.<CODE>` for a registered code; otherwise the fallback,
 *  by default the panel's generic line. */
export function useErrorText(): (code: string | undefined, fallback?: string) => string {
	const { t, i18n } = useTranslation()
	return (code, fallback) =>
		isErrorCode(code) && i18n.exists(`errors.${code}`) ? t(`errors.${code}`) : (fallback ?? t('panel.errors.generic'))
}
