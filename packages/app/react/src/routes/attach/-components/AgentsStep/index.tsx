import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { IconCheck } from '@tabler/icons-react'
import { attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { GetAttachThreadWizardQueryResponse, ProviderKind } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
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
}

export function AgentsStep({ providers, defaultValues, onSubmit, onBack, className, ...props }: AgentsStepProps) {
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
	 * ESCOLHER É RESPONDER, TAMBÉM AQUI — o clique define o agente E entrega o passo.
	 *
	 * ─── DÍVIDA CONHECIDA, ASSUMIDA DE OLHOS ABERTOS ─────────────────────────────────────────────────
	 *
	 * A MULTI-SELEÇÃO DEIXOU DE SER ALCANÇÁVEL PELA INTERFACE. `providers` continua sendo
	 * `z.array(providerKindSchema).min(1)` SEM máximo — o schema e o `AttachThread` aceitam dois agentes
	 * numa conversa —, mas não existe mais gesto nesta tela que produza uma lista de dois. Quem precisar
	 * disso hoje não consegue pela UI.
	 *
	 * Isso não foi descuido. A objeção foi levantada e o founder decidiu assim mesmo em 31/07, depois de
	 * ver a versão com o botão: "Na parte de escolha os agentes, ainda está o botão continuar". A versão
	 * anterior deste arquivo defendia o Continuar exatamente como a coisa que mantinha o segundo agente
	 * ao alcance; essa defesa perdeu, e este bloco existe para que ela não se perca junto.
	 *
	 * QUANDO REVISITAR: `comingSoon` deriva de `!drivable.includes(...)` sobre os AgentRunners
	 * REGISTRADOS (`GetAttachThreadWizard.ts`), de propósito, e não de uma lista literal. Hoje só
	 * CLAUDE_CODE é dirigível, então a tela PARECE de escolha única e a dívida não aparece. No dia em que
	 * um SEGUNDO runner registrar, dois provedores ficam disponíveis sozinhos e esta restrição vira uma
	 * trave visível — é esse o momento de trazer de volta uma forma de escolher mais de um (um botão
	 * explícito, um long-press, uma tela própria). Não espere um relatório de bug: procure aqui.
	 *
	 * ─── POR QUE DEFINIR, E NÃO ALTERNAR ─────────────────────────────────────────────────────────────
	 *
	 * Duas formas de "clicar e entregar" estavam na mesa. Alternar-e-entregar (manter o toggle e chamar
	 * o submit depois) deixaria a multi-seleção clunky-mas-possível — escolher A, avançar, Voltar,
	 * escolher B —, mas paga com duas arestas, e ambas violam "previsível, nunca esperto":
	 *
	 *   1. CLIQUE MORTO E DESTRUTIVO. Clicar numa linha JÁ escolhida a desmarcaria; a lista iria a zero,
	 *      o `.min(1)` barraria a entrega, e o operador levaria um clique que não avança E que apagou a
	 *      escolha dele. Pior: esse é justamente o caminho de "voltar e seguir sem reescolher" que
	 *      contato e workspace oferecem — clicar de novo na linha já marcada para seguir.
	 *   2. ACÚMULO INVISÍVEL. Depois de voltar, a escolha anterior continua no form sem estar em lugar
	 *      nenhum na cabeça de quem clica. Clicar em B entregaria `[A, B]` para alguém que acredita ter
	 *      escolhido B. O mesmo gesto, na mesma lista, com resultado diferente conforme um estado que
	 *      ninguém vê.
	 *
	 * Definir (`[provider]`) não tem nenhuma das duas: um clique, um significado, sempre — "este, e
	 * siga". Clicar no já escolhido reescreve o mesmo valor e entrega, idêntico aos outros dois passos.
	 * O preço é que a restrição fica dura em vez de clunky, e é por isso que a dívida acima está escrita
	 * em vez de escondida atrás de um gesto que quase funciona.
	 *
	 * Entrega por `handleSubmit()` e não chamando `onSubmit` direto: o clique atravessa o mesmo portão
	 * de validação (o `safeParse` acima) que os outros passos, nunca um caminho paralelo. Provedor sem
	 * runner não chega aqui — a linha é `disabled`, e o clique nela não dispara evento.
	 */
	const selectAndAdvance = (provider: ProviderKind) => {
		form.setFieldValue('providers', [provider])
		void form.handleSubmit()
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
									onClick={() => selectAndAdvance(entry.provider)}
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
		</form>
	)
}
