import { z } from '@template/core-typescript'
import { Language } from '@template/contracts-typescript/wire/enums'
import type { InterfaceErrors } from '@billing/errors'

/**
 * PATCH /profile body — every field optional, but an empty patch is meaningless: at least one
 * of name/email/document/language must be present. The cross-field refine lives HERE (schema
 * layer) so the controller stays a plain composition and the SDK carries the typed error code.
 */
export const UpdateBillingProfileBodySchema = z
	.object({
		name: z.string().min(1).optional(),
		email: z.email().optional(),
		document: z.string().min(1).optional(),
		language: z.enum(Language).optional(),
	})
	.refine(b => b.name !== undefined || b.email !== undefined || b.document !== undefined || b.language !== undefined, {
		error: 'VALIDATION_ERROR' as InterfaceErrors,
	})
