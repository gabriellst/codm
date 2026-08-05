import type { Transaction } from '@codm/core-typescript'
import type { Language, OwnerKind } from '@codm/contracts-typescript/wire/enums'

/**
 * TENANCY facts behind an ownerId — what kind of tenant it is and which user
 * answers for it. This is all the kernel knows about an owner; rich identity
 * (billing name/email/document, product profile) lives in the owning context's
 * own aggregate, read internally there.
 */
export interface OwnerTenancy {
	kind: OwnerKind
	responsibleUserId: string
	/**
	 * O idioma do responsável, para as superfícies que o FRONTEND não traduz — o canal, onde quem
	 * renderiza é o WhatsApp e nenhum `t()` roda.
	 *
	 * Viaja aqui e não é buscado no ponto de emissão de propósito: quem resolve um owner já pagou a
	 * leitura, e a alternativa seria cada emissor conhecer o perfil de outro contexto. Segue a forma do
	 * medscall, onde `OwnerIdentity.language` é o que alimenta e-mails e checkout.
	 *
	 * OPCIONAL porque o operador pode nunca ter escolhido: `resolveLanguage` (`@shared/i18n`) colapsa a
	 * ausência em `DEFAULT_LANGUAGE`, então nenhum chamador ramifica sobre idioma.
	 */
	language?: Language
}

/**
 * Kernel port for resolving the tenancy behind an `ownerId` without any context
 * reaching into another. The REAL adapter lives in the owner context
 * (`DrizzleOwnerDirectory` — owner owns the tenant aggregate) and is bound by the
 * owner registry; consumers (billing's responsible-guard, ui) depend only on
 * this abstraction. Port of the medscall@f04e8a0f owner-context design.
 */
export abstract class OwnerDirectory {
	/** Returns null when no Owner aggregate backs the ownerId. */
	abstract getOwner(ownerId: string, tx?: Transaction): Promise<OwnerTenancy | null>
}
