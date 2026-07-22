// BCP-47 language tag value object — an invalid tag never exists (SRP: the grammar lives HERE,
// not as a loose regex inside an entity). Primitive VO: it IS a single string, so it serializes
// as the bare string on events/rows. Covers the common forms ('en', 'pt-BR', 'zh-Hans-CN');
// rejects free-form strings. INVALID_LANGUAGE is registered with the runtime error registry in
// @auth/errors (the consumer context); LanguageTag lives in shared/, so the code is cast to the
// core base type for the compile-time signature.
import { BasePrimitiveValueObject, tryCatch, z } from '@codedm/core-typescript'
import type { BaseDomainErrors } from '@codedm/core-typescript'

const INVALID_LANGUAGE = 'INVALID_LANGUAGE' as BaseDomainErrors

// language subtag (2-3 ASCII letters), optional script (4 letters), optional region
// (2 letters or 3 digits), optional variant (5-8 alphanumerics).
const BCP47_RE = /^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-[A-Za-z0-9]{5,8})?$/

const isValidBcp47 = (lang: string): boolean => {
	if (!BCP47_RE.test(lang)) return false
	return tryCatch(() => new Intl.Locale(lang)).success
}

export const LanguageTagSchema = z.string().refine(isValidBcp47, { error: INVALID_LANGUAGE })

export class LanguageTag extends BasePrimitiveValueObject<typeof LanguageTagSchema> {
	static override schema = LanguageTagSchema

	static isValid(lang: string): boolean {
		return isValidBcp47(lang)
	}

	override toString(): string {
		return this.value
	}
}
