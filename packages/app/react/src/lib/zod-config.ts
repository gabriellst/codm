import { z } from 'zod/v4'
import type { $ZodRawIssue } from 'zod/v4/core'
import i18n from './i18n'

function getEnumLabel(value: string): string | undefined {
	const resources = i18n.getResourceBundle(i18n.language, 'translation')
	const enums = resources?.enums
	if (!enums || typeof enums !== 'object') return undefined
	for (const enumMap of Object.values(enums)) {
		if (typeof enumMap === 'object' && enumMap !== null && value in (enumMap as Record<string, unknown>)) {
			return (enumMap as Record<string, string>)[value]
		}
	}
	return undefined
}

// i18n translations for Zod validation errors. Keys live under the `zod`
// subtree of the `translation` namespace — the third arg is the keyPrefix.
const zodErrorMap = (issue: $ZodRawIssue): string | undefined => {
	const t = i18n.getFixedT(i18n.language, 'translation', 'zod')

	// Handle specific issue codes
	switch (issue.code) {
		case 'invalid_type':
			if (!issue.received || issue.received === 'undefined' || issue.received === 'null') {
				return t('required')
			}
			return t('invalid_type', { expected: issue.expected, received: issue.received })

		case 'too_small':
			if (issue.origin === 'string') {
				if (issue.minimum === 1) {
					return t('required')
				}
				return t('too_small_string', { minimum: issue.minimum })
			}
			if (issue.origin === 'number') {
				return t('too_small_number', { minimum: issue.minimum })
			}
			if (issue.origin === 'array') {
				return t('too_small_array', { minimum: issue.minimum })
			}
			break

		case 'too_big':
			if (issue.origin === 'string') {
				return t('too_big_string', { maximum: issue.maximum })
			}
			if (issue.origin === 'number') {
				return t('too_big_number', { maximum: issue.maximum })
			}
			if (issue.origin === 'array') {
				return t('too_big_array', { maximum: issue.maximum })
			}
			break

		case 'invalid_value': {
			const values = (issue as { values?: unknown[] }).values ?? []
			const maxShown = 3
			const shown = values
				.slice(0, maxShown)
				.map(v => {
					const label = getEnumLabel(String(v))
					return `"${label ?? v}"`
				})
				.join(', ')
			const options = values.length > maxShown ? `${shown}, ...` : shown
			return t('invalid_enum_value', { options })
		}

		case 'invalid_format':
			if (issue.format === 'email') {
				return t('invalid_format_email')
			}
			if (issue.format === 'url') {
				return t('invalid_format_url')
			}
			if (issue.format === 'uuid') {
				return t('invalid_format_uuid')
			}
			if (issue.format === 'regex') {
				return t('invalid_format_regex')
			}
			if (issue.format === 'datetime') {
				return t('invalid_format_datetime')
			}
			break
	}

	// Return undefined to use Zod's default message
	// Custom errors (from .refine()) will keep their original message
	// which will be translated by FieldError if it's an error code
	return undefined
}

// Configure Zod with the i18n error map
export function configureZod() {
	z.config({ customError: zodErrorMap })
}
