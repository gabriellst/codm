import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import { Language } from '@codm/contracts-typescript/wire/enums'
import { OwnerDirectory, type OwnerTenancy } from '@shared/services'
import { OwnerRepository } from '@owner/repositories'
import { UserProfileRepository } from '@auth/repositories'

/**
 * The canonical adapter for the kernel tenancy port: one read on the tenant
 * aggregate, zero branching — the polymorphic ownerId finally has an aggregate
 * to answer for it. Port of medscall@f04e8a0f `DrizzleOwnerDirectory`.
 *
 * ### Por que o perfil é uma segunda leitura, e não um join
 * O idioma mora no `UserProfile` do contexto `auth`, e um join atravessaria a fronteira que a porta
 * existe para preservar. Ler o perfil pelo `responsibleUserId` que o owner já aponta é a forma
 * sancionada (leitura via repositório de outro contexto), e mantém o dono de cada campo onde ele está.
 */
@injectable()
export class DrizzleOwnerDirectory extends OwnerDirectory {
	constructor(
		private owners: OwnerRepository,
		private profiles: UserProfileRepository,
	) {
		super()
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
