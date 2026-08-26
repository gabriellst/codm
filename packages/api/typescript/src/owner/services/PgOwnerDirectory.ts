import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { Language } from '@codm/contracts-typescript/wire/enums'
import { OwnerDirectory, type OwnerTenancy } from '@shared/services/OwnerDirectory'
import { OwnerRepository } from '@owner/repositories/OwnerRepository'
import { DomainEventRepository } from '@codm/core-typescript'
import { OwnerKind } from '@codm/contracts-typescript/wire/enums'
import { Owner } from '@owner/entities/Owner'
import { OwnerCreatedEvent } from '@owner/events/OwnerCreatedEvent'
import { UserProfileRepository } from '@auth/repositories/UserProfileRepository'

/**
 * The canonical adapter for the kernel tenancy port: one read on the tenant
 * aggregate, zero branching — the polymorphic ownerId finally has an aggregate
 * to answer for it. Port of origin-fork@f04e8a0f `PgOwnerDirectory`.
 *
 * ### Por que o perfil é uma segunda leitura, e não um join
 * O idioma mora no `UserProfile` do contexto `auth`, e um join atravessaria a fronteira que a porta
 * existe para preservar. Ler o perfil pelo `responsibleUserId` que o owner já aponta é a forma
 * sancionada (leitura via repositório de outro contexto), e mantém o dono de cada campo onde ele está.
 */
@injectable()
export class PgOwnerDirectory extends OwnerDirectory {
	constructor(
		private owners: OwnerRepository,
		private profiles: UserProfileRepository,
		private events: DomainEventRepository,
	) {
		super()
	}

	/**
	 * ── por que escreve AQUI, e não chamando o `CreateOwner` ────────────────────────────────────────
	 * Porque um use case alcançado a partir de um SERVIÇO nunca é bindado. O `bindContainer` do
	 * `Handler` só é aplicado nas fronteiras da pipeline — controller, mediator, job —, e a cadeia
	 * daqui vem de `BetterAuth` → `IdentityAuthHooks` → esta porta, que é toda de serviços. Chamar
	 * `CreateOwner.execute` estourava com `HANDLER_NOT_BOUND` no primeiro login de verdade.
	 *
	 * Há um padrão SANCIONADO para um serviço chamar use case, e não usá-lo é escolha: o
	 * `LibSqlMailboxDispatcher` recebe `bind(container)` e resolve+binda o handler ele mesmo. Ele pode
	 * porque a composição do boot o alcança para chamar `bind`. Esta porta não: ela é resolvida no
	 * fundo do grafo do better-auth (`BetterAuth` → `IdentityAuthHooks` → aqui), e dar-lhe um `bind`
	 * exigiria fiar o container até um ponto que a composição não visita.
	 *
	 * O preço desta escolha é repetir as sete linhas de escrita do `CreateOwner`. O preço da outra
	 * seria fiação de boot para um serviço que ninguém mais precisa alcançar.
	 */
	async ensureOwnerFor(input: { userId: string; name?: string | null }, tx?: Transaction): Promise<string> {
		const existing = await this.owners.findByResponsibleUserId(input.userId, tx)
		if (existing[0]) return existing[0].id.value

		// Nome vazio reprovaria na invariante da entidade (`min(1)`), e recusar o provisionamento por
		// causa de um perfil social sem `name` deixaria a conta inutilizável — o estado que esta
		// costura encerra.
		const owner = Owner.create({
			name: input.name?.trim() || 'Meu espaço',
			kind: OwnerKind.ORGANIZATION,
			responsibleUserId: input.userId,
		})
		await this.owners.save(owner, tx)
		await this.events.save(
			new OwnerCreatedEvent({
				entityId: owner.id.value,
				ownerId: input.userId,
				payload: { ownerId: owner.id.value, name: owner.name },
			}),
		)
		return owner.id.value
	}

	async getOwner(ownerId: string, tx?: Transaction): Promise<OwnerTenancy | null> {
		const owner = await this.owners.findByOwnerId(ownerId, tx)
		if (!owner) return null
		const profile = await this.profiles.findByUserId(owner.responsibleUserId, tx)
		return { kind: owner.kind, responsibleUserId: owner.responsibleUserId, language: toLanguage(profile?.language?.value) }
	}
}

/**
 * `LanguageTag` é BCP-47 (aceita `fr-CH`), o enum `Language` ship só o que o app traduz — e os VALORES
 * do enum SÃO tags BCP-47 (`"pt-BR"`, `"en-US"`). Então não existe tabela de-para: a tag ou é um membro
 * do enum, ou não é um idioma que catálogo algum ship. Devolver `undefined` no segundo caso deixa
 * `resolveLanguage` fazer o colapso em um lugar só.
 */
function toLanguage(tag?: string): Language | undefined {
	if (!tag) return undefined
	const shipped = Object.values(Language) as string[]
	return shipped.includes(tag) ? (tag as Language) : undefined
}
