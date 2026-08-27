import { z } from '@codm/core-typescript'
import type Z from 'zod'
import { Language } from '@codm/contracts-typescript/wire/enums'

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
		/**
		 * O idioma do responsável — para as superfícies que o FRONTEND não traduz, o canal, onde quem
		 * renderiza é o WhatsApp e nenhum `t()` roda.
		 *
		 * OPCIONAL, e por dois motivos independentes: uma sessão emitida antes deste campo não o carrega,
		 * e `CloudSession.identity()` devolve `null` inteiro quando não há nuvem configurada, o daemon
		 * está offline ou a sessão foi revogada. A ausência já tem semântica — `resolveLanguage` colapsa
		 * em `DEFAULT_LANGUAGE` —, então nenhum consumidor precisa ramificar.
		 */
		language: z.enum(Language).optional(),
	}),
	session: z.object({
		id: z.string(),
		userId: z.uuid(),
		expiresAt: z.coerce.date(),
		ownerId: z.string().nullable(),
	}),
})

export type Session = Z.infer<typeof SessionSchema>
