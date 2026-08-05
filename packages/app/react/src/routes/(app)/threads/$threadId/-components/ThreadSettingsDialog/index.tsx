import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
	getHomeDashboardQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	getThreadSettingsQueryKey,
	useConfigureContextBuffer,
	useConfigureMentionGate,
	useConfigurePrompt,
	useDeleteThread,
	useGetSessionChat,
	useGetThreadSettings,
	useSetParticipantInvocation,
} from '@codm/client-typescript/typescript'
import type { BufferSize } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'
import { providerGlyph, providerLabel } from '@/components/console/glyphs'
import { useDialogStore } from '@/stores/useDialogStore'
import { cn } from '@/lib/utils'
import { LoopsSection } from './LoopsSection'

const BUFFER_SIZES: BufferSize[] = ['25', '50', '100', '200']

/**
 * A section heading in this dialog — sentence case, muted, with a hairline under it.
 *
 * Deliberately NOT `label-eyebrow`: that class is uppercase with letter-spacing, which is the
 * console's eyebrow voice for page sections. Inside a modal the design uses a quieter, plain label
 * whose job is to separate three short groups, and the rule under it does the separating.
 */
function SectionLabel({ children }: { children: ReactNode }) {
	return <h3 className="border-b border-border pb-2 text-sm font-medium text-muted-foreground">{children}</h3>
}

/**
 * Per-thread behavior modal (T10): respond trigger, who can invoke agents, and context buffer depth.
 *
 * Pure content driven by `useDialogStore` (component bp-24): the caller does
 * `show(<ThreadSettingsDialog threadId={…} />)` and MOUNTED is what "open" means here — which is why
 * the body is no longer gated on a local `open` flag. The store is what dismisses it.
 *
 * DUAS COLUNAS a partir de `lg`, e a divisão não é estética: as chaves da esquerda são escolhas de um
 * clique que salvam sozinhas, e a da direita é um texto que se escreve devagar e COMITA. Empilhá-las
 * numa coluna só empurrava o prompt para baixo da dobra — o operador rolava por quatro seções que ele
 * já configurou para chegar à única que ele voltou para editar. Lado a lado, as duas começam na mesma
 * linha e a caixa de texto cresce até a altura da coluna irmã (é o `flex-1` lá embaixo), que é o que
 * "equilibrado" quer dizer aqui.
 *
 * Abaixo de `lg` a grade vira uma coluna e a ordem de leitura volta a ser a de antes — ajustes, prompt,
 * zona de perigo. Por isso a zona de perigo atravessa as DUAS colunas em vez de morar dentro da
 * primeira: empilhada, ela tem que continuar sendo a última coisa da tela, nunca o que separa os
 * ajustes do prompt.
 */
export function ThreadSettingsDialog({
	threadId,
	className,
}: { threadId: string } & Pick<ComponentProps<typeof DialogContent>, 'className'>) {
	const { t } = useTranslation()
	// The thread's name, for the subtitle. Its own query rather than a prop: React Query already holds
	// this exact key (the header mounts it), so it costs no request and keeps the dialog owning its data.
	const { data: session } = useGetSessionChat(threadId)

	return (
		// A largura só cresce onde há espaço para duas colunas (`lg`), e cresce até um número escolhido, não
		// redondo: `56rem` menos o padding e a calha dá ~25rem por coluna — que é EXATAMENTE a largura útil
		// que este diálogo tinha quando era uma coluna só (`sm:max-w-md`). É o que mantém as linhas da
		// esquerda quebrando como quebravam. Abaixo de `lg` a base do primitivo segue valendo, intocada.
		<DialogContent className={cn('lg:max-w-4xl', className)}>
			<DialogHeader>
				<DialogTitle>{t('session.settingsTitle')}</DialogTitle>
				<DialogDescription>
					{session ? t('session.settingsDescriptionNamed', { name: session.thread.displayName }) : t('session.settingsDescription')}
				</DialogDescription>
			</DialogHeader>
			{/* O corpo rola, o cabeçalho e o botão de fechar não. O teto é o viewport menos a moldura do
			    diálogo (margem + padding + cabeçalho): numa janela baixa — o mínimo do shell é 520px de
			    altura — duas colunas ainda estouram, e um modal que cresce para fora da tela esconde o
			    botão que o operador precisa clicar. */}
			<div className="grid max-h-[calc(100dvh-11rem)] gap-6 overflow-y-auto lg:grid-cols-2 lg:gap-x-10">
				<ThreadSettingsBody threadId={threadId} />
				<CustomPromptSection threadId={threadId} />
				{/* Os LOOPS atravessam as duas colunas pela mesma razão que a zona de perigo: uma linha de loop
				    carrega um texto, um horário, os dias e três controles, e espremida numa coluna de ~25rem ela
				    quebra em quatro alturas diferentes. Empilhado, ela continua lendo entre o prompt e o perigo. */}
				<LoopsSection threadId={threadId} className="lg:col-span-2" />
				{/* The name is READ HERE and handed down, deliberately breaking the "each component owns its
				    data" habit for one prop: the confirmation must say WHICH conversation is about to go, and
				    this component already holds the query that knows. A second `useGetSessionChat` inside the
				    danger zone would be the same cache entry read twice. */}
				<DangerZone threadId={threadId} threadName={session?.thread.displayName} className="lg:col-span-2" />
			</div>
		</DialogContent>
	)
}

/**
 * The destructive corner of the settings dialog (thread-deletion spec, decision 7).
 *
 * Set apart by a rule and its own muted heading rather than by a red panel: the console has exactly one
 * destructive action per screen and the `destructive` button carries the weight. What makes it safe is
 * the CONFIRMATION, not the decoration — and the confirmation names the conversation, because "Apagar
 * conversa" with no subject is the dialog people dismiss on autopilot and regret.
 *
 * `confirm()` from `useDialogStore` replaces this dialog's content with the shared `ConfirmDialog` and
 * resolves a boolean, so cancelling costs the operator nothing but a re-open.
 */
function DangerZone({ threadId, threadName, className, ...props }: { threadId: string; threadName?: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const { confirm, hide } = useDialogStore()
	/**
	 * AS CALLBACKS VIVEM NO HOOK, NUNCA NO `mutate()`. A diferença não é estilo — é a diferença entre
	 * funcionar e não funcionar aqui.
	 *
	 * `confirm()` SUBSTITUI o conteúdo do dialog pelo ConfirmDialog, o que DESMONTA este componente
	 * enquanto o operador confirma. Callbacks passadas a `mutate(vars, { onSuccess })` vivem no observer
	 * do React Query, e ele não as chama quando o componente desmontou — a requisição sai, o servidor
	 * apaga, e o `onSuccess` inteiro simplesmente não roda. Foi esse o bug relatado: a conversa sumia do
	 * backend e a UI ficava parada na thread apagada.
	 *
	 * Callbacks no nível do hook vivem na MUTAÇÃO, não no observer, e sobrevivem ao desmonte.
	 */
	const deleteThread = useDeleteThread({
		mutation: {
			onSuccess: () => {
				hide()

				// REMOVE, não invalide, o que pertence à thread apagada: para uma thread que não existe mais,
				// "busque de novo" só pode responder THREAD_NOT_FOUND (spec de deleção, AC-3).
				queryClient.removeQueries({ queryKey: getSessionChatQueryKey(threadId) })
				queryClient.removeQueries({ queryKey: getThreadSettingsQueryKey(threadId) })
				queryClient.removeQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) })

				// A LISTA também sai do cache: a barra lateral lê `dashboard.threads`, e invalidar deixaria a
				// conversa apagada aparecendo enquanto o refetch corre. Remover troca o fantasma por skeleton.
				queryClient.removeQueries({ queryKey: getHomeDashboardQueryKey() })

				// Sempre para a home: com a thread apagada, qualquer rota que dependa daquele id responde
				// not-found.
				navigate({ to: '/dashboard' })
			},
		},
	})

	const onDelete = async () => {
		const ok = await confirm({
			title: t('session.deleteThread.confirmTitle'),
			description: t('session.deleteThread.confirmDescription', { name: threadName ?? t('session.deleteThread.fallbackName') }),
			actionLabel: t('session.deleteThread.confirmAction'),
			cancelLabel: t('common.cancel'),
			variant: 'destructive',
		})
		if (!ok) return

		deleteThread.mutate({ threadId })
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<SectionLabel>{t('session.deleteThread.sectionTitle')}</SectionLabel>
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm text-muted-foreground">{t('session.deleteThread.hint')}</p>
				<Button variant="destructive" className="shrink-0" disabled={deleteThread.isPending} onClick={onDelete}>
					{t('session.deleteThread.action')}
				</Button>
			</div>
		</section>
	)
}

function ThreadSettingsBody({ threadId }: { threadId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const configureMentionGate = useConfigureMentionGate()
	const configureBuffer = useConfigureContextBuffer()
	const setInvocation = useSetParticipantInvocation()

	const [gateEnabled, setGateEnabled] = useState(false)
	const [tag, setTag] = useState('')

	useEffect(() => {
		if (!data) return
		setGateEnabled(data.mentionGate.enabled)
		setTag(data.mentionGate.enabled ? data.mentionGate.tag : '')
	}, [data])

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	const saveGate = (enabled: boolean, nextTag: string) => {
		const mentionGate = enabled ? { enabled: true as const, tag: nextTag } : { enabled: false as const }
		configureMentionGate.mutate({ threadId, data: { mentionGate } }, { onSuccess: invalidate })
	}

	if (isLoading || !data) {
		// Uma barra por seção, com o MESMO `gap-6` da coluna carregada — o esqueleto tem que ocupar a
		// altura que o conteúdo vai ocupar, senão a grade encolhe e volta a crescer na frente do operador.
		return (
			<div className="flex flex-col gap-6">
				<Skeleton className="h-14 rounded-xl" />
				<Skeleton className="h-32 rounded-xl" />
				<Skeleton className="h-24 rounded-xl" />
				<Skeleton className="h-24 rounded-xl" />
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-6">
			<section className="flex flex-col gap-3">
				<SectionLabel>{t('session.respondTrigger')}</SectionLabel>
				{/* Switch FIRST, then the label, then the tag — the design reads left to right as
				    "[on/off] only respond when mentioned, with [@tag]", which is the sentence the control
				    actually makes. The tag input stays VISIBLE while the gate is off, just disabled: hiding
				    it made the row jump height on every toggle and hid the value the operator was about to
				    need. */}
				<label className="flex items-center gap-3">
					<Switch
						checked={gateEnabled}
						onCheckedChange={value => {
							setGateEnabled(value)
							saveGate(value, tag)
						}}
					/>
					<span className="flex-1 text-sm font-medium text-foreground">{t('session.onlyWhenMentioned')}</span>
					<Input
						aria-label={t('session.mentionTag')}
						placeholder={t('session.mentionTagPlaceholder')}
						className="w-36 shrink-0 rounded-full text-sm"
						disabled={!gateEnabled}
						value={tag}
						onChange={e => setTag(e.target.value)}
						onBlur={() => saveGate(true, tag)}
					/>
				</label>
			</section>

			{/*
			 * OS AGENTES DESTA CONVERSA — e, quando é o caso, o agente MORTO.
			 *
			 * `AttachThread` agora recusa anexar um provider que a engine não sabe dirigir, mas conversas
			 * anexadas ANTES disso continuam lá e continuam abrindo (é a decisão: fechar a escrita, não a
			 * leitura). Esta seção é onde o operador finalmente VÊ por que aquela conversa nunca responde —
			 * em vez de descobrir na primeira turn que morre. Mesma palavra do catálogo (`Em breve`) e mesma
			 * fonte (`AgentRunnerFactory.supported`) que a tela de Ajustes e o passo de agentes do wizard.
			 */}
			<section className="flex flex-col gap-3">
				<SectionLabel>{t('session.boundAgents')}</SectionLabel>
				<div className="flex flex-col gap-1">
					{data.providers.map(({ provider, comingSoon }) => {
						const Glyph = providerGlyph[provider]
						return (
							<div key={provider} className="flex items-center gap-3 py-1.5">
								<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
									<Glyph className="size-4" />
								</span>
								<span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{providerLabel[provider]}</span>
								{comingSoon ? <Badge variant="outline">{t('common.comingSoon')}</Badge> : null}
							</div>
						)
					})}
				</div>
				{/* A explicação só aparece quando há algo a explicar — um aviso permanente vira decoração. */}
				{data.providers.some(p => p.comingSoon) ? (
					<p className="text-sm text-muted-foreground">{t('session.boundAgentsComingSoonHint')}</p>
				) : null}
			</section>

			<section className="flex flex-col gap-3">
				<SectionLabel>{t('session.participantsWhoCanInvoke')}</SectionLabel>
				{/* Plain rows, no bordered card: the heading's rule already groups them, and a second box
				    inside a modal is one frame too many. The avatar is what makes a roster scannable. */}
				<div className="flex flex-col gap-1">
					{data.participants.map(participant => (
						<label key={participant.participantId} className="flex items-center gap-3 py-1.5">
							<ThreadAvatar name={participant.name} />
							<div className="flex min-w-0 flex-1 flex-col gap-1.5">
								<span className="truncate text-sm font-semibold text-foreground">{participant.name}</span>
								<span className="truncate text-xs text-muted-foreground">{participant.source}</span>
							</div>
							<span className="shrink-0 text-sm text-muted-foreground">{t('session.canInvokeToggle')}</span>
							<Switch
								checked={participant.canInvoke}
								onCheckedChange={value =>
									setInvocation.mutate(
										{ threadId, participantId: participant.participantId, data: { canInvoke: value } },
										{ onSuccess: invalidate },
									)
								}
							/>
						</label>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<SectionLabel>{t('session.contextBuffer')}</SectionLabel>
				{/* Explanation ABOVE the control — it says what the numbers mean, so reading it after
				    choosing is backwards. */}
				<p className="text-sm text-muted-foreground">{t('session.contextBufferHint')}</p>
				{/* Individual outlined pills rather than a segmented track: the sizes are four discrete
				    choices, and the filled one is the current depth. `messages` trails them as the unit. */}
				<div className="flex flex-wrap items-center gap-2">
					{BUFFER_SIZES.map(size => (
						<button
							key={size}
							type="button"
							aria-pressed={data.bufferSize === size}
							onClick={() => configureBuffer.mutate({ threadId, data: { bufferSize: size } }, { onSuccess: invalidate })}
							className={cn(
								'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
								data.bufferSize === size
									? 'border-transparent bg-primary text-primary-foreground'
									: 'border-input text-foreground hover:bg-muted',
							)}
						>
							{String(size)}
						</button>
					))}
					<span className="text-sm text-muted-foreground">{t('session.bufferMessages')}</span>
				</div>
			</section>
		</div>
	)
}

/**
 * PROMPT PERSONALIZADO — as instruções que o operador escreve para ESTA conversa.
 *
 * A única seção deste diálogo que NÃO salva sozinha, e a diferença é deliberada. O switch, a tag e as
 * pilhas de buffer são escolhas de um clique: salvar no `onChange`/`onBlur` é o comportamento óbvio
 * delas. Um prompt é texto escrito aos poucos, e um autosave no meio da frase muda como o agente fala
 * com pessoas de verdade antes de o operador ter terminado de pensar. Por isso ele COMITA, e o botão
 * habilitado é o que torna "não salvo" legível.
 *
 * Esvaziar a caixa e salvar é o caminho de apagar — `Thread.configurePrompt` transforma vazio em
 * ausência, então não há um segundo botão para a mesma intenção.
 *
 * É a SEGUNDA COLUNA do diálogo, e por isso lê a própria query em vez de receber `data` por prop
 * (CMP-P01): a chave já está no cache — a coluna irmã a montou — então é a mesma requisição, e a
 * coluna continua sendo dona do que mostra.
 */
function CustomPromptSection({ threadId }: { threadId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const configurePrompt = useConfigurePrompt()

	/**
	 * O RASCUNHO do prompt — o caso 5 do state-placement (draft local, transitório, não deep-linkável).
	 *
	 * Semeado a partir do servidor num efeito, e não derivado dele a cada render: uma textarea
	 * controlada por `data.customPrompt` seria reescrita por baixo dos dedos do operador no primeiro
	 * refetch da query.
	 */
	const [prompt, setPrompt] = useState('')

	useEffect(() => {
		if (!data) return
		setPrompt(data.customPrompt)
	}, [data])

	// "Não salvo" = o rascunho difere do que o servidor devolveu. Comparar com o SERVIDOR (e não guardar
	// um booleano `touched`) faz o botão desabilitar sozinho quando o operador desfaz a própria edição.
	const promptDirty = prompt !== (data?.customPrompt ?? '')

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	if (isLoading || !data) {
		// O esqueleto tem a FORMA da coluna carregada — rótulo, explicação, caixa alta e rodapé — para o
		// diálogo não pular de altura quando as duas colunas chegam.
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-10 rounded-lg" />
				<Skeleton className="min-h-40 flex-1 rounded-2xl" />
				<Skeleton className="h-9 rounded-lg" />
			</div>
		)
	}

	return (
		<section className="flex flex-col gap-3">
			<SectionLabel>{t('session.customPrompt')}</SectionLabel>
			<p className="text-sm text-muted-foreground">{t('session.customPromptHint')}</p>
			{/* `flex-1` é o que equilibra as alturas: a coluna é um item da grade, então ela já se estica
			    até a altura da coluna de ajustes, e a caixa de texto absorve essa sobra em vez de deixar um
			    vão. `resize-none` porque a altura passou a ser do LAYOUT — uma alça de arrastar aqui só
			    brigaria com ela; empilhado, `min-h-40` é o piso. */}
			<Textarea
				aria-label={t('session.customPrompt')}
				placeholder={t('session.customPromptPlaceholder')}
				className="min-h-40 flex-1 resize-none"
				maxLength={data.customPromptMaxLength}
				value={prompt}
				onChange={e => setPrompt(e.target.value)}
			/>
			<div className="flex items-center justify-between gap-4">
				<span className="text-xs text-muted-foreground">
					{/* O contador conta contra o MESMO limite que o backend valida — ele viaja no DTO
					    (`customPromptMaxLength`) em vez de ser redigitado aqui, porque um contador que
					    discorda do validador é pior que nenhum. */}
					{!promptDirty && configurePrompt.isSuccess
						? t('session.customPromptSaved')
						: t('session.customPromptCounter', { used: prompt.length, max: data.customPromptMaxLength })}
				</span>
				<Button
					variant="outline"
					className="shrink-0"
					disabled={!promptDirty || configurePrompt.isPending}
					onClick={() => configurePrompt.mutate({ threadId, data: { customPrompt: prompt } }, { onSuccess: invalidate })}
				>
					{t('session.customPromptSave')}
				</Button>
			</div>
		</section>
	)
}
