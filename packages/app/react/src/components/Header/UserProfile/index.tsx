import { type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetOperatorIdentity } from '@codm/client-typescript/typescript'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { contactAvatarUrl } from '@/components/console/ThreadAvatar'
import { useSession } from '@/hooks'
import { cn, getInitials } from '@/lib/utils'

/**
 * O NOME E A CARA DO OPERADOR — emprestados do canal conectado.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ### A decisão, e por que ela tem prazo de validade (founder, 07/08/2026)
 * O CODM não tem contas: a sessão é uma CONSTANTE (`@/lib/auth` → `"Operator"`, `image: null`), e o
 * `SessionSchema` do backend não tem sequer um campo de foto. Ou seja: o avatar do cabeçalho era
 * vazio por construção — não havia o que preencher.
 *
 * O que o produto tem é uma conta de WhatsApp pareada. `GET /ui/operator`
 * (`ui/usecases/GetOperatorIdentity.ts`) resolve `gateway_channels.owner_remote_id` — o JID da própria
 * conta logada — contra a agenda do gateway, e devolve as MESMAS quatro informações que qualquer
 * outro rosto deste console carrega. Por isso a foto sai de `contactAvatarUrl`, exatamente como a
 * dos contatos: um só endpoint, um só cache, uma só CSP.
 *
 * **É um EMPRÉSTIMO, e estes são os termos:**
 * 1. **Canal desconectado ⇒ o operador perde nome e foto.** É o desenho: a identidade nunca foi do
 *    app. `identity` volta ausente e este componente cai na sessão constante (`"Operator"` + iniciais)
 *    — o comportamento de hoje, sem quebrar nada.
 * 2. **Dois canais conectados ⇒ "o dono" deixa de ter resposta única.** O read escolhe o mais
 *    recentemente atualizado, o que com duas contas é um vencedor arbitrário. Esse é o GATILHO DE
 *    REVISÃO: quando multi-canal existir, ou o cabeçalho passa a alternar identidades, ou este
 *    caminho é aposentado em favor de (3).
 * 3. **A saída já existe pela metade:** `owner_owners.picture_url` (coluna real, nula em toda linha
 *    hoje) e o `AvatarUploader` em `routes/(app)/settings/account/-components/AvatarUploader/`.
 *    Quando o operador puder subir a própria foto, o canal deixa de ser a fonte e vira, no máximo,
 *    um padrão inicial.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Sem props de dado: o componente é único na tela (não é folha de um `.map()`), então ele mesmo lê o
 * que precisa — a sessão constante e o read do canal.
 */
export function UserProfile({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const session = useSession()
	const { data } = useGetOperatorIdentity()
	const identity = data?.identity

	// A ordem é a do empréstimo: o canal quando há canal, a sessão constante quando não há. O terceiro
	// degrau só existe porque `name` é opcional na forma da sessão — nunca é atingido hoje.
	const name = identity?.displayName || session?.user.name || t('common.anonymous')
	// `hasAvatar` é o discriminante: sem ele a url apontaria para um 404 e o `AvatarImage` (Base UI) só
	// se revela quando a imagem CARREGA — funcionaria, mas pedindo um request por render para nada.
	const picture = identity?.hasAvatar ? contactAvatarUrl(identity.channelId, identity.externalId) : null

	return (
		<div className={cn('flex items-center gap-3', className)} data-slot="user-profile" {...props}>
			<div className="text-right hidden sm:block">
				<p className="text-sm font-medium text-foreground leading-tight">{name}</p>
			</div>
			<Avatar size="lg" className="border border-border">
				{picture && <AvatarImage src={picture} alt={name} />}
				<AvatarFallback>{getInitials(name)}</AvatarFallback>
			</Avatar>
		</div>
	)
}
