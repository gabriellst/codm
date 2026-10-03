import { type ComponentProps, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { IconCheck } from '@tabler/icons-react'
import { AgentModelIdEnum, attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { AgentModelId, GetAttachThreadWizardQueryResponse, ProviderKind } from '@codm/client-typescript/typescript'
import { Select } from '@codm/app-ui/select'
import { enumLabel, type DeepPartial } from '@/lib'
import { cn } from '@/lib/utils'
import { rowBorder, rowHover } from '@codm/app-ui/surfaces'
import { providerGlyph, providerLabel } from '@/components/console/glyphs'
import { StepHeading } from '../StepHeading'

export const AgentsStepSchema = attachThreadMutationRequestSchema.pick({ providers: true })
export type AgentsStepData = (typeof AgentsStepSchema)['_zod']['output']

// No `onBack` — the wizard's persistent footer (`AttachThreadWizard`) owns Voltar for every step now
// (D3, founder review 12/08); `StepHeading` no longer renders a back button for any step to opt into.
type AgentsStepProps = Omit<ComponentProps<'form'>, 'onSubmit'> & {
	providers: GetAttachThreadWizardQueryResponse['providers']
	defaultValues?: DeepPartial<AgentsStepData>
	onSubmit: (data: AgentsStepData) => void
}

export function AgentsStep({ providers, defaultValues, onSubmit, className, ...props }: AgentsStepProps) {
	const { t } = useTranslation()

	/**
	 * O SELECT DE MODELO É LOCAL, DE PROPÓSITO (D3, screen ZbVfW). O desenho mostra um seletor de
	 * modelo inline na linha do agente disponível — mas `attachThreadMutationRequestSchema` (o
	 * contrato que este passo grava, `providers: ProviderKind[]`) não carrega modelo nenhum. Escolher
	 * o modelo aqui, antes de existir thread, não tem onde pousar no fio. Este estado fica LOCAL ao
	 * passo (nunca submetido, nunca cruza o `onSubmit`): fidelidade visual ao desenho sem inventar
	 * campo de contrato. Ajustar o modelo de verdade continua sendo o trabalho do
	 * `ThreadSettingsDialog`, depois que a conversa existe.
	 *
	 * O QUE MUDOU, E POR QUE ERA UM BUG E NÃO UMA SIMPLIFICAÇÃO. A versão anterior deste docblock
	 * também justificava renderizar o `AgentModelIdEnum` INTEIRO, alegando que o wizard não expunha
	 * catálogo por provider. A alegação era verdadeira e a conclusão não: o efeito visível era o
	 * seletor do claude oferecendo TERRA e LUNA (codinomes do codex) e o do codex oferecendo HAIKU,
	 * SONNET e OPUS — uma escolha que o `AgentRunnerFactory` responderia com 400 se um dia chegasse ao
	 * fio. A ausência do campo era o defeito a corrigir, não um fato a acomodar: `ProviderOptionSchema`
	 * agora carrega `models` (de `PROVIDER_MODELS`, a mesma relação declarada que o
	 * `ThreadSettingsDialog` já lia), e cada linha filtra pelo catálogo do SEU provider.
	 *
	 * E o estado é POR PROVIDER, não um só compartilhado. Com listas diferentes por linha, um único
	 * `model` guardaria SONNET escolhido no claude e o entregaria ao seletor do codex, que não o
	 * oferece — o valor cairia fora da lista e o `Select` mostraria vazio.
	 */
	const [modelByProvider, setModelByProvider] = useState<Partial<Record<ProviderKind, AgentModelId>>>({})

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
	 * O CLIQUE GRAVA A ESCOLHA — NÃO AVANÇA MAIS O PASSO (D3, founder review 12/08). A versão anterior
	 * deste docblock defendia o clique entregando o passo inteiro no mesmo gesto; o founder testou essa
	 * versão no desktop e revogou — o rodapé do wizard (Voltar/Continuar) voltou, persistente, e é ele
	 * quem decide quando o passo muda. O que sobrevive integralmente é a DECISÃO por trás do gesto:
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
	 * ao alcance; essa defesa perdeu, e este bloco existe para que ela não se perca junto. O rodapé
	 * VOLTOU em 12/08, mas para o WIZARD inteiro, não como uma segunda forma de acumular agentes aqui —
	 * o clique na linha ainda DEFINE, nunca acumula (ver abaixo).
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
	 * Duas formas de "clicar e gravar" estavam na mesa. Alternar (manter o toggle) deixaria a
	 * multi-seleção clunky-mas-possível — escolher A, voltar, escolher B —, mas paga com duas arestas:
	 *
	 *   1. CLIQUE MORTO E DESTRUTIVO. Clicar numa linha JÁ escolhida a desmarcaria; a lista iria a zero,
	 *      o `.min(1)` barraria a entrega no fim do wizard, e o operador levaria um clique que apagou a
	 *      escolha dele sem nenhum sinal.
	 *   2. ACÚMULO INVISÍVEL. Clicar em B depois de já ter A gravado entregaria `[A, B]` para alguém que
	 *      acredita ter escolhido só B.
	 *
	 * Definir (`[provider]`) não tem nenhuma das duas: um clique, um significado, sempre — "este". Clicar
	 * no já escolhido regrava o mesmo valor, idêntico aos outros dois passos.
	 *
	 * Entrega por `handleSubmit()` e não chamando `onSubmit` direto: o clique atravessa o mesmo portão
	 * de validação (o `safeParse` acima) que os outros passos, nunca um caminho paralelo. Provedor sem
	 * runner não chega aqui — a linha é `disabled`, e o clique nela não dispara evento.
	 */
	const selectProvider = (provider: ProviderKind) => {
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
			<StepHeading title={t('attach.stepAgentsTitle')} subtitle={t('attach.stepAgentsSubtitle')} />

			<form.Subscribe selector={state => (state.values.providers as ProviderKind[] | undefined) ?? []}>
				{selected => (
					<div className="flex flex-col gap-3">
						{providers.map(entry => {
							const Glyph = providerGlyph[entry.provider]
							const available = entry.available
							const isSelected = selected.includes(entry.provider)
							return (
								// D3 (screen ZbVfW) — the row is a plain `div[role=button]`, NOT a `<button>`: the
								// available row nests an interactive model `Select`, and a real `<button>` cannot
								// contain another interactive control (invalid HTML, and the Select's own click
								// would also fire the row's). Keyboard parity comes from `tabIndex`+`onKeyDown`.
								<div
									key={entry.provider}
									role="button"
									tabIndex={available ? 0 : -1}
									aria-disabled={!available}
									aria-pressed={isSelected}
									onClick={() => available && selectProvider(entry.provider)}
									onKeyDown={e => {
										if (!available || (e.key !== 'Enter' && e.key !== ' ')) return
										e.preventDefault()
										selectProvider(entry.provider)
									}}
									// D3 mede o card em 18/18/18/6 (`asymmetric-md`) — o mesmo raio das linhas de
									// contato e projeto, não o `-lg` que este passo usava antes. "Em breve" reduz a
									// opacidade do CARD inteiro (0.55 no desenho; `opacity-50` reaproveita o degrau já
									// usado pelo contato já-anexado, em vez de introduzir um valor novo).
									className={cn(
										'group flex items-center gap-3.5 rounded-asymmetric-md bg-background p-4 transition-colors',
										rowBorder,
										available ? cn('cursor-pointer', rowHover) : 'cursor-not-allowed opacity-50',
										isSelected && 'border-primary bg-hover-accent',
									)}
								>
									<span className="flex size-10 shrink-0 items-center justify-center rounded-asymmetric-xs bg-secondary text-secondary-foreground">
										<Glyph className="size-4.5" />
									</span>
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="font-semibold text-foreground text-[15px]">{providerLabel[entry.provider]}</span>
										{/*
										 * `comingSoon` GANHA do status, com binário ou sem. São dois eixos: `status` responde
										 * "o CLI está nesta máquina?" e `comingSoon` responde "existe um runner que sabe
										 * dirigi-lo?" — nenhum valor de `ProviderStatus` diz o segundo.
										 */}
										<span className="text-muted-foreground text-sm">
											{entry.comingSoon ? t('common.comingSoon') : enumLabel('ProviderStatus', entry.status)}
										</span>
									</div>
									{/* D3 — o select de modelo SÓ aparece na linha disponível; ver o docblock do
									    estado `model` acima para o porquê de ele ser puramente local. `onClick` E
									    `onKeyDown` param a propagação: sem os dois, um Enter/Espaço dado NO SELECT
									    (para abrir o dropdown) também borbulharia para o `onKeyDown` da linha e
									    gravaria a escolha do provider — o mouse já era coberto, o teclado não. */}
									{available && entry.models.length > 0 && (
										<Select
											enum={AgentModelIdEnum}
											i18nPrefix="enums.AgentModelId"
											values={entry.models}
											value={modelByProvider[entry.provider] ?? AgentModelIdEnum.DEFAULT}
											onValueChange={value => setModelByProvider(prev => ({ ...prev, [entry.provider]: value }))}
											aria-label={t('session.agentModel')}
											className="w-[125px] shrink-0"
											onClick={e => e.stopPropagation()}
											onKeyDown={e => e.stopPropagation()}
										/>
									)}
									{/* D3 — checkbox 22px (`asymmetric-3xs`), decorativo: o clique é da linha inteira,
									    igual ao marcador de check das outras duas listas do assistente. */}
									<span
										aria-hidden
										className={cn(
											'flex size-[22px] shrink-0 items-center justify-center rounded-asymmetric-3xs border',
											isSelected ? 'border-transparent bg-primary text-primary-foreground' : 'border-input bg-background',
										)}
									>
										{isSelected && <IconCheck className="size-3.5" />}
									</span>
								</div>
							)
						})}
					</div>
				)}
			</form.Subscribe>
		</form>
	)
}
