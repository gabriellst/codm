import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { IconRefresh } from '@tabler/icons-react'
import {
	detectProvidersQueryKey,
	detectProvidersQueryOptions,
	getAttachThreadWizardQueryKey,
	useDetectProviders,
} from '@codm/client-typescript/typescript'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { providerGlyph, providerLabel } from '@/components/console/glyphs'
import { surface } from '@codm/app-ui/surfaces'
import { Badge } from '@codm/app-ui/badge'
import { Button } from '@codm/app-ui/button'
import { Skeleton } from '@codm/app-ui/skeleton'
import { Spinner } from '@codm/app-ui/spinner'

/** Detected agent-provider CLIs with binary path, version and install status. */
export function ProvidersSection({ className, ...props }: ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useDetectProviders()
	const providers = data?.providers ?? []
	const [isRescanning, setIsRescanning] = useState(false)

	/**
	 * RE-SONDAR A MÁQUINA, não apenas repetir a leitura.
	 *
	 * O cache do `ProviderDetector` é por PROCESSO — sem TTL, sem watch de filesystem — então o GET
	 * comum devolve para sempre o catálogo montado no boot do daemon. Instalar um CLI com o app aberto
	 * era, até aqui, invisível até reiniciar. Só `refresh=true` re-sonda PATH + diretórios de
	 * instalação (~700ms, 6 spawns), e é por isso que este botão existe: a capacidade estava no
	 * endpoint desde o C07 e nenhum consumidor do console a alcançava.
	 *
	 * `fetchQuery` com o parâmetro e `setQueryData` na chave SEM parâmetro: uma ida ao servidor, e a
	 * lista já renderizada (que observa a chave sem parâmetro) recebe o resultado. Invalidar a chave
	 * base em vez disso custaria um segundo GET para buscar o que esta resposta já trouxe.
	 */
	const rescan = async () => {
		setIsRescanning(true)
		try {
			const fresh = await queryClient.fetchQuery(detectProvidersQueryOptions({ refresh: true }))
			queryClient.setQueryData(detectProvidersQueryKey(), fresh)
			// O wizard de anexar compõe o MESMO catálogo num read próprio (`GetAttachThreadWizard`), com
			// sua própria entrada de cache. Sem esta invalidação o operador reescaneia aqui, vai anexar
			// uma conversa e escolhe agentes a partir da lista velha. Por PREFIXO: a chave do wizard
			// ganha params (busca, cursor) nas páginas seguintes.
			await queryClient.invalidateQueries({ queryKey: getAttachThreadWizardQueryKey() })
		} catch {
			// O erro já virou toast no `queryCache.onError` global (`router.tsx`); engolir aqui só evita
			// a promise rejeitada sem tratamento. O `finally` é quem devolve o botão ao estado normal.
		} finally {
			setIsRescanning(false)
		}
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-sm font-bold text-foreground">{t('settings.agentProviders')}</h2>
				{/*
				 * O RÓTULO NÃO MUDA enquanto sonda — só o ícone vira spinner e o botão desabilita. Trocar o
				 * texto por "Reescaneando…" mexeria na largura do botão bem no momento em que o operador
				 * acabou de mirar nele, e o estado já está dito pelo spinner + disabled.
				 */}
				<Button type="button" variant="ghost" size="sm" onClick={rescan} disabled={isRescanning}>
					{isRescanning ? <Spinner data-icon="inline-start" /> : <IconRefresh data-icon="inline-start" />}
					{t('settings.rescanProviders')}
				</Button>
			</div>
			{isLoading ? (
				<div className="flex flex-col gap-2.5">
					<Skeleton className="h-16 rounded-asymmetric-sm" />
					<Skeleton className="h-16 rounded-asymmetric-sm" />
					<Skeleton className="h-16 rounded-asymmetric-sm" />
				</div>
			) : (
				<div className="flex flex-col gap-2.5">
					{providers.map(provider => {
						const Glyph = providerGlyph[provider.name]
						const detected = provider.status === 'DETECTED'
						const path = provider.binaryPath ?? t('settings.providerNotFound')
						return (
							<div key={provider.name} className={cn('flex items-center gap-3.5 rounded-asymmetric-sm px-4 py-3.5', surface)}>
								<span className="flex size-8 shrink-0 items-center justify-center rounded-asymmetric-xs bg-secondary text-secondary-foreground">
									<Glyph className="size-4" />
								</span>
								<div className="flex min-w-0 flex-1 flex-col gap-1.5">
									<span className="font-bold text-foreground">{providerLabel[provider.name]}</span>
									<span className="truncate font-mono text-xs text-muted-foreground">
										{path}
										{provider.version ? ` · v${provider.version}` : ''}
									</span>
								</div>
								{/*
								 * Mesmo eixo duplo do passo de agentes do wizard: `comingSoon` ganha do status, porque
								 * nenhum valor de `ProviderStatus` consegue dizer "o binário está aqui, mas ainda não
								 * sabemos dirigi-lo". D3 (cixrK) — a variante "off" mede bg-muted/text-muted-foreground
								 * (o `default` do Badge, com o texto sobrescrito — o `default` de fábrica é
								 * text-foreground), não mais `outline`.
								 */}
								<Badge
									variant={detected && !provider.comingSoon ? 'secondary' : 'default'}
									className={!detected || provider.comingSoon ? 'text-muted-foreground' : undefined}
								>
									{provider.comingSoon ? t('common.comingSoon') : enumLabel('ProviderStatus', provider.status)}
								</Badge>
							</div>
						)
					})}
				</div>
			)}
		</section>
	)
}
