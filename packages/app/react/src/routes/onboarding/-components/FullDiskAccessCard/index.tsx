// packages/app/react/src/routes/onboarding/-components/FullDiskAccessCard/index.tsx — COMPLETE final file.
// MANTENHA a forma do scaffold: export nomeado, props estendendo ComponentProps, `{ className, ...props }`, `cn(...)`.
import { IconShieldCheck } from '@tabler/icons-react'
import { type ComponentProps, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type RepairAvailability, useSystemPreconditions } from '@/services'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'

/**
 * A EXPLICAÇÃO e o BOTÃO de uma pré-condição — as duas responsabilidades que sobram para o console.
 *
 * O `actionHint` fica ACIMA do botão e não é decoração: a spec (AC-6) exige que o operador saiba as
 * duas coisas que vão acontecer antes de clicar. A ordem — limpar a negação, depois abrir os
 * Ajustes — é o que ninguém adivinha (conceder sem limpar não funciona quando a negação já foi
 * gravada), e por isso ela vive DENTRO da ação em vez de virar um passo a passo para o operador
 * executar. O texto diz o que o botão faz; o botão faz.
 *
 * O reparo é pedido à PORTA, nunca a `commands.*`: quais são os passos e em que ordem é decisão do
 * host, e um componente que soubesse disso teria que ser reescrito junto do host a cada mudança.
 *
 * O BOTÃO NÃO É SEMPRE OFERECIDO (spec Decision 11 / AC-12). Sob `tauri dev` o host não tem
 * identidade atribuível — o Mach-O cru não tem `.app` para o macOS anexar a concessão —, e um botão
 * (mesmo desabilitado) afirmaria que o reparo existe quando ele não tem efeito nenhum ali. O
 * despacho por `repairAvailability` é por MAPA (canon CMP-P18), nunca `if`/ternário: um terceiro
 * valor de `RepairAvailability` que não tivesse entrada aqui pararia de compilar.
 */
// O parâmetro tem default (`= {}`) porque este componente também é usado como entrada de
// `STEP_COMPONENTS` (`Record<StepId, ReactNode>` — instanciado como `<FullDiskAccessCard />`, sem
// props, em `step-components.tsx`). Sem o default, a assinatura exige 1 argumento e a instanciação
// não compila (tsc: "Expected 1 or more, but got 0"). `ComponentProps<'div'>` já é só campos
// opcionais, então `{}` é um valor válido.
export function FullDiskAccessCard({ className, ...props }: ComponentProps<'div'> = {}) {
	const { t } = useTranslation()
	const systemPreconditions = useSystemPreconditions()
	const [repairing, setRepairing] = useState(false)
	const pending = useSystemPreconditionsStore(state => state.pending)
	// Nada pendente ainda respondido (ou esta pré-condição não está entre as pendências) degrada
	// para AVAILABLE — o comportamento de hoje — em vez de deixar o cartão em branco.
	const repairAvailability: RepairAvailability = pending?.find(status => status.id === 'FULL_DISK_ACCESS')?.repair ?? 'AVAILABLE'

	const repair = async () => {
		setRepairing(true)
		try {
			await systemPreconditions.repair('FULL_DISK_ACCESS')
		} catch {
			toast.error(t('systemPreconditions.repairFailed'))
		} finally {
			setRepairing(false)
		}
	}

	// D3 (screen d4bKAl) — the button comes FIRST, `actionHint` (the two-step explanation) moves
	// BELOW it, and `afterHint` (the short "come back to this window" note) closes the card in
	// `caption-foreground` — reordered from the old actionHint-above-button layout to match the
	// design's card exactly. Same three pieces of copy, same `RepairAvailability` dispatch by map.
	const REPAIR_CONTENT: Record<RepairAvailability, ReactNode> = {
		AVAILABLE: (
			<>
				<Button onClick={repair} disabled={repairing} className="self-start">
					<IconShieldCheck data-icon="inline-start" />
					{t('systemPreconditions.fullDiskAccess.action')}
				</Button>
				<p className="text-sm text-muted-foreground">{t('systemPreconditions.fullDiskAccess.actionHint')}</p>
				<p className="text-xs text-caption-foreground">{t('systemPreconditions.fullDiskAccess.afterHint')}</p>
			</>
		),
		NO_APP_IDENTITY: <p className="text-sm text-muted-foreground">{t('systemPreconditions.noAppIdentity')}</p>,
	}

	return (
		<div className={cn('flex w-full flex-col gap-9', className)} {...props}>
			<header className="flex flex-col gap-2">
				<h1 className="heading-display text-4xl text-foreground">{t('systemPreconditions.slideTitle')}</h1>
				<p className="text-muted-foreground">{t('systemPreconditions.slideBody')}</p>
			</header>

			<div className="flex w-full flex-col gap-4 rounded-asymmetric-xl border border-border bg-background p-6.5">
				<h2 className="text-lg font-bold text-foreground">{t('systemPreconditions.fullDiskAccess.title')}</h2>
				<p className="text-sm text-muted-foreground">{t('systemPreconditions.fullDiskAccess.body')}</p>
				{REPAIR_CONTENT[repairAvailability]}
			</div>
		</div>
	)
}
