import { z } from '@template/core-typescript'
import type Z from 'zod'

/**
 * Canonical session shape — owned by the auth context (an application context),
 * NOT core. It models what this template's better-auth instance
 * (`auth/services/Authentication/BetterAuth.ts`) exposes, trimmed to the fields
 * the application consumes. `session.ownerId` is the active owner, mapped from
 * better-auth's `activeOwnerId` additionalField by AuthAccountMiddleware.
 *
 * Consumers:
 *  - GetSession controller — returned as the output shape.
 *  - AuthAccountMiddleware — parses the better-auth response into this and
 *    attaches it to `request.ctx`.
 *  - RequireOwner — reads it off `request.ctx` to gate owner-scoped controllers.
 */
export const SessionSchema = z.object({
	user: z.object({
		id: z.string(),
		email: z.string(),
		name: z.string().nullable(),
		emailVerified: z.boolean(),
	}),
	session: z.object({
		id: z.string(),
		userId: z.uuid(),
		expiresAt: z.coerce.date(),
		ownerId: z.string().nullable(),
	}),
})

export type Session = Z.infer<typeof SessionSchema>
