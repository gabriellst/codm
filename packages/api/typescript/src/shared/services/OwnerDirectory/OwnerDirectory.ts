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
	 * fork de origem, onde `OwnerIdentity.language` é o que alimenta e-mails e checkout.
	 *
	 * OPCIONAL porque o operador pode nunca ter escolhido: `resolveLanguage` (`@shared/i18n`) colapsa a
	 * ausência em `DEFAULT_LANGUAGE`, então nenhum chamador ramifica sobre idioma.
	 */
	language?: Language
}

/**
 * Kernel port for resolving the tenancy behind an `ownerId` without any context
 * reaching into another. The REAL adapter lives in the owner context
 * (`LibSqlOwnerDirectory` — owner owns the tenant aggregate) and is bound by the
 * owner registry; consumers (billing's responsible-guard, ui) depend only on
 * this abstraction. Port of the origin-fork@f04e8a0f owner-context design.
 */
export abstract class OwnerDirectory {
	/** Returns null when no Owner aggregate backs the ownerId. */
	abstract getOwner(ownerId: string, tx?: Transaction): Promise<OwnerTenancy | null>

	/**
	 * O dono deste usuário — CRIANDO-O se ainda não existir. Devolve o `ownerId`.
	 *
	 * ── por que provisionar mora numa porta, e não no contexto que chama ─────────────────────────
	 * Quem precisa disso é o `auth`, no hook de criação de usuário do better-auth. Mas o Owner é
	 * agregado do `owner`, e o rail de mapa de contexto proíbe importar USE CASE ou ENTIDADE
	 * atravessando a fronteira — só repositórios e SERVIÇOS passam. Esta porta é o serviço: `auth`
	 * pede em vocabulário de tenancy e não conhece o agregado.
	 *
	 * ── IDEMPOTENTE, e é isso que a torna útil duas vezes ────────────────────────────────────────
	 * Ela é chamada no `user.create` (provisiona) E no `session.create` (encontra o que já existe).
	 * A segunda chamada não é redundância: contas criadas ANTES desta costura existir não têm dono e
	 * nunca teriam — o `user.create` não roda de novo para elas. Chamando no login, elas se curam
	 * sozinhas. Medido em 2026-08-15: havia usuários assim, e todo endpoint gateado lhes respondia
	 * 400 porque `ctx.ownerId` era nulo.
	 *
	 * `name` é sugestão, não requisito: no `session.create` não há nome à mão, e recusar por causa
	 * disso devolveria a conta ao estado quebrado que este método existe para encerrar.
	 */
	abstract ensureOwnerFor(input: { userId: string; name?: string | null }, tx?: Transaction): Promise<string>
}
