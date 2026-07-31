import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { IconArrowRight, IconCheck } from '@tabler/icons-react'
import { attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { GetAttachThreadWizardQueryResponse, ProviderKind } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { enumLabel, type DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { providerGlyph, providerLabel } from '@/components/console/glyphs'
import { StepHeading } from '../StepHeading'

export const AgentsStepSchema = attachThreadMutationRequestSchema.pick({ providers: true })
export type AgentsStepData = (typeof AgentsStepSchema)['_zod']['output']

type AgentsStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	providers: GetAttachThreadWizardQueryResponse['providers']
	defaultValues?: DeepPartial<AgentsStepData>
	onSubmit: (data: AgentsStepData) => void
	onBack?: () => void
	isSubmitting?: boolean
}

export function AgentsStep({ providers, defaultValues, onSubmit, onBack, isSubmitting, className, ...props }: AgentsStepProps) {
	const { t } = useTranslation()

	const form = useForm({
		defaultValues,
		validators: { onChange: AgentsStepSchema },
		onSubmit: async form => {
			const result = AgentsStepSchema.safeParse(form.value)
			if (!result.success) return
			onSubmit(result.data)
		},
	})

	/**
	 * SEM AUTO-AVANÇO AQUI — e é o TIPO da seleção que decide, não a contagem de hoje.
	 *
	 * Os passos de contato e workspace entregam no clique (lá o campo é escalar: escolher de novo
	 * substitui, e o primeiro clique já é a resposta inteira). Este é o passo MULTI: `providers` é
	 * `z.array(providerKindSchema).min(1)`, sem máximo, e a linha faz toggle. Entregar no primeiro
	 * clique tornaria o segundo provedor inalcançável pelo gesto principal — para escolher dois seria
	 * preciso escolher um, ser levado embora e voltar.
	 *
	 * Isso não é um problema adiado: `comingSoon` vem de `!drivable.includes(...)`, derivado dos
	 * AgentRunners REGISTRADOS (`GetAttachThreadWizard.ts`) de propósito, e não de uma lista literal.
	 * Hoje só CLAUDE_CODE é dirigível, então o passo PARECE de escolha única; no dia em que o segundo
	 * runner registrar, ele deixa de ser — sem que ninguém volte aqui. Um auto-avanço instalado agora
	 * viraria uma trave escondida naquele dia.
	 *
	 * Alternativa considerada e recusada: avançar apenas quando a seleção vai de vazia para um. O mesmo
	 * gesto, na mesma lista, avançaria ou não conforme um estado invisível — afordância pior do que um
	 * botão honesto. Aqui o Continuar continua sendo a resposta, porque aqui a pergunta admite mais de
	 * um sim.
	 *
	 * ─── POR QUE A AÇÃO PRIMÁRIA SOBREVIVEU AQUI, QUANDO AS OUTRAS SUMIRAM ───────────────────────────
	 *
	 * O founder mandou tirar o rodapé da criação da thread: "continuar é inferido pelo clique". Em
	 * contato e workspace isso se cumpre literalmente — o campo é escalar, o clique É a resposta, e o
	 * rodapé sumiu por inteiro. Aqui a mesma frase pede o contrário: se o clique fosse o continuar,
	 * `providers` nunca poderia receber o segundo item, porque o primeiro já teria levado o operador
	 * embora. O gesto que INFERE o avanço e o gesto que ACRESCENTA à resposta são o mesmo gesto nesta
	 * lista, e só um deles pode ganhar.
	 *
	 * Isto não é opinião: enxertar o auto-avanço aqui derruba 3 dos 6 casos da suíte deste passo,
	 * incluindo "dois provedores cabem na mesma resposta". O botão é o que torna a multi-seleção
	 * alcançável — enquanto ele existir, escolher dois agentes é possível.
	 *
	 * O Voltar, esse, foi embora daqui como nos demais: subiu para o `StepHeading`. Ele nunca respondeu
	 * ao passo — é navegação, e o rodapé agora carrega só o que fecha a pergunta.
	 */
	const toggle = (provider: ProviderKind) => {
		const current = (form.getFieldValue('providers') as ProviderKind[] | undefined) ?? []
		const next = current.includes(provider) ? current.filter(p => p !== provider) : [...current, provider]
		form.setFieldValue('providers', next)
	}

	return (
		<form
			className={cn('flex flex-col gap-5', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<StepHeading title={t('attach.stepAgentsTitle')} subtitle={t('attach.stepAgentsSubtitle')} onBack={onBack} />

			<form.Subscribe selector={state => (state.values.providers as ProviderKind[] | undefined) ?? []}>
				{selected => (
					<div className="flex flex-col gap-2">
						{providers.map(entry => {
							const Glyph = providerGlyph[entry.provider]
							const available = entry.available
							const isSelected = selected.includes(entry.provider)
							return (
								<Button
									variant={'ghost'}
									size={'none'}
									key={entry.provider}
									type="button"
									disabled={!available}
									onClick={() => toggle(entry.provider)}
									className={cn(
										'flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
										available ? 'hover:bg-muted' : 'cursor-not-allowed opacity-50',
										isSelected ? 'border-foreground bg-muted' : 'border-border',
									)}
								>
									<span className="flex size-10 items-center justify-center rounded-full bg-secondary text-foreground">
										<Glyph className="size-5" />
									</span>
									<div className="flex flex-1 flex-col">
										<span className="font-semibold text-foreground">{providerLabel[entry.provider]}</span>
										{/*
										 * `comingSoon` GANHA do status, com binário ou sem. São dois eixos: `status` responde
										 * "o CLI está nesta máquina?" e `comingSoon` responde "existe um runner que sabe
										 * dirigi-lo?" — nenhum valor de `ProviderStatus` diz o segundo. Era "Detectado" aqui
										 * que fazia o operador escolher um agente cuja run morreria com NOT_IMPLEMENTED; e
										 * "Não instalado" mandaria instalar um binário que não adiantaria ter.
										 */}
										<span className="text-sm text-muted-foreground">
											{entry.comingSoon ? t('common.comingSoon') : enumLabel('ProviderStatus', entry.status)}
										</span>
									</div>
									<span
										className={cn(
											'flex size-6 items-center justify-center rounded-full border',
											isSelected ? 'border-transparent bg-primary text-primary-foreground' : 'border-border',
										)}
									>
										{isSelected && <IconCheck className="size-3.5" />}
									</span>
								</Button>
							)
						})}
					</div>
				)}
			</form.Subscribe>

			<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, values: state.values })}>
				{({ canSubmit, values }) => {
					const isDisabled = isSubmitting || !canSubmit || !AgentsStepSchema.safeParse(values).success
					return (
						// Só a ação. O Voltar subiu para o `StepHeading` como nos outros passos — ele nunca foi
						// uma resposta a esta pergunta, e navegação não divide barra com o botão que a fecha.
						<div className="flex justify-end">
							<Button type="submit" disabled={isDisabled}>
								{isSubmitting && <Spinner className="mr-2" />}
								{t('attach.continue')} <IconArrowRight data-icon="inline-end" />
							</Button>
						</div>
					)
				}}
			</form.Subscribe>
		</form>
	)
}
