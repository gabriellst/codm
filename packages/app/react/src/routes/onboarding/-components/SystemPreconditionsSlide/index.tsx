// packages/app/react/src/routes/onboarding/-components/SystemPreconditionsSlide/index.tsx — COMPLETE final file.
// MANTENHA a forma do scaffold: export nomeado, props estendendo ComponentProps, `{ className, ...props }`, `cn(...)`.
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { SystemPreconditionList } from '../SystemPreconditionList'
import { SYSTEM_PRECONDITION_MODULES } from '../system-preconditions'

/**
 * O slide das pendências — dono do próprio dado, como todo componente aqui: lê o store que o
 * `SystemPreconditionsGate` alimenta em vez de receber a lista por prop de cima.
 *
 * `pending ?? []` cobre o "ainda não sondado": o slide só é montado quando já há pendência (o fluxo
 * decide isso), mas um render antes da primeira resposta não pode explodir no acesso ao mapa.
 *
 * `SystemPreconditionList` continua genérica sobre IDS (não sobre status inteiros — sua genericidade é o
 * que prova a extensibilidade da AC-8), então o mapeamento para `.id` acontece aqui, na borda entre
 * o store (que guarda o status inteiro, repair incluso, para o cartão) e a lista (que só precisa do id).
 */
export function SystemPreconditionsSlide({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const pending = useSystemPreconditionsStore(state => state.pending)

	return (
		<div className={cn('flex flex-col items-center gap-6', className)} {...props}>
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t('systemPreconditions.slideTitle')}</h1>
			<p className="text-muted-foreground">{t('systemPreconditions.slideBody')}</p>
			<SystemPreconditionList pending={(pending ?? []).map(status => status.id)} modules={SYSTEM_PRECONDITION_MODULES} />
		</div>
	)
}
