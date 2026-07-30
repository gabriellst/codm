// Recipe: dev:packages/api/src/auth/entities/User.ts
import { AggregateRoot } from '@codm/core-typescript'
import { z } from '@codm/core-typescript'
import Z from 'zod'

const UserSchema = z.object({
	email: z.email(),
	name: z.string().nullable().optional(),
	image: z.string().nullable().optional(),
	emailVerified: z.boolean().optional().default(false),
})

export type UserProps = Z.infer<typeof UserSchema>

export class User extends AggregateRoot<typeof UserSchema> {
	static override schema = UserSchema

	static create(data: { name?: string | null; email: string; emailVerified?: boolean; image?: string | null }): User {
		return new User({
			name: data.name ?? null,
			email: data.email,
			emailVerified: data.emailVerified ?? false,
			image: data.image ?? null,
		})
	}
}

export interface User extends UserProps {}
