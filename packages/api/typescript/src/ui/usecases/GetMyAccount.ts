// TODO(stub): unblocked by an account-settings read-model. authentication.users + identity.user_profiles/user_preferences cover name/email/image/language/timezone, but the OutputSchema needs `profile.company`, `security.lastPasswordChangeAt`, `security.twoFactorEnabled` (better-auth two-factor table, not in schema) and a single `preferences.currency` (CurrencyCode) — none of which have a source column. A clean Drizzle map requires those columns/sources first.
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import { Language, CurrencyCode } from '@codm/contracts-typescript/wire/enums'
import { faker, mockIsoDate, pick } from '../../shared/testing/mock'

// ---------------------------------------------------------------------------
// Input — userId comes from the authenticated session (ctx.user.id).
// ---------------------------------------------------------------------------
export const GetMyAccountInputSchema = z.object({
	userId: z.string(),
})

// ---------------------------------------------------------------------------
// Output — three sections: profile (identity), preferences (locale/currency),
// security (password state, 2FA). No presentation fields.
// ---------------------------------------------------------------------------
export const GetMyAccountOutputSchema = z.object({
	profile: z.object({
		userId: z.string(),
		name: z.string(),
		email: z.string(),
		company: z.string().nullable(),
		pictureUrl: z.url().nullable(),
	}),
	preferences: z.object({
		language: z.enum(Language),
		currency: z.enum(CurrencyCode),
		timezone: z.string(),
	}),
	security: z.object({
		hasPassword: z.boolean(),
		lastPasswordChangeAt: z.iso.datetime({ offset: true }).nullable(),
		twoFactorEnabled: z.boolean(),
	}),
})

const seedFrom = (parts: string[]): number => {
	const s = parts.join('|')
	let h = 0
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
	return Math.abs(h) || 1
}

const TIMEZONES = [
	'America/Sao_Paulo',
	'America/New_York',
	'America/Los_Angeles',
	'Europe/London',
	'Europe/Berlin',
	'Asia/Tokyo',
	'Asia/Singapore',
	'Australia/Sydney',
]

/**
 * `GetMyAccount` — account settings read for the authenticated user.
 * FAKER body, REAL contract. Real swap: a Drizzle join of the user profile +
 * preferences row by userId (sourced from better-auth's user table).
 */
@injectable()
export class GetMyAccount extends Handler<typeof GetMyAccountInputSchema, typeof GetMyAccountOutputSchema> {
	readonly name = 'get_my_account' as const
	readonly inputSchema = GetMyAccountInputSchema
	readonly outputSchema = GetMyAccountOutputSchema

	protected async handle(input: this['input']): Promise<this['output']> {
		faker.seed(seedFrom([input.userId]))

		const hasPassword = faker.datatype.boolean({ probability: 0.85 })
		const twoFactorEnabled = faker.datatype.boolean({ probability: 0.3 })

		return {
			profile: {
				userId: input.userId,
				name: faker.person.fullName(),
				email: faker.internet.email(),
				company: faker.datatype.boolean() ? faker.company.name() : null,
				pictureUrl: faker.datatype.boolean({ probability: 0.6 }) ? faker.image.avatar() : null,
			},
			preferences: {
				language: pick(Object.values(Language)),
				currency: pick(Object.values(CurrencyCode)),
				timezone: pick(TIMEZONES),
			},
			security: {
				hasPassword,
				lastPasswordChangeAt: hasPassword && faker.datatype.boolean() ? mockIsoDate() : null,
				twoFactorEnabled,
			},
		}
	}
}
