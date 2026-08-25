import { type ComponentProps, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconMinus, IconPlus } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
	getHomeDashboardQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	getThreadSettingsQueryKey,
	useConfigureContextBuffer,
	useConfigureMentionGate,
	useConfigureModel,
	useConfigurePrompt,
	useConfigureReactions,
	useConfigureStreaming,
	useConfigureThinkingIndicator,
	useDeleteThread,
	useGetSessionChat,
	useGetThreadSettings,
	useSetParticipantInvocation,
	AgentModelIdEnum,
} from '@codm/client-typescript/typescript'
import type { BufferSize, ProviderKind } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@codm/app-ui/dialog'
import { Input } from '@codm/app-ui/input'
import { Select } from '@codm/app-ui/select'
import { Textarea } from '@codm/app-ui/textarea'
import { Switch } from '@codm/app-ui/switch'
import { Skeleton } from '@codm/app-ui/skeleton'
import { Badge } from '@codm/app-ui/badge'
import { sectionLabel } from '@codm/app-ui/surfaces'
import { ThreadAvatar, contactAvatarUrl } from '@/components/console/ThreadAvatar'
import { providerGlyph, providerLabel } from '@/components/console/glyphs'
import { useDialogStore } from '@/stores/useDialogStore'
import { cn } from '@/lib/utils'
import { LoopsSection } from './LoopsSection'

const BUFFER_SIZES: BufferSize[] = ['25', '50', '100', '200']

/**
 * The agent CLI's own binary name — literally what the operator types, e.g. `codex` for CODEX.
 *
 * A closed map keyed by the enum (same shape as `providerLabel`/`providerGlyph` in glyphs.tsx),
 * not a string transform off `ProviderKind` (`CLAUDE_CODE` → `claude` is not a case conversion,
 * it is a different word). Kept local rather than promoted to glyphs.tsx: nothing outside this
 * dialog's agent cards needs it.
 */
const providerCli: Record<ProviderKind, string> = {
	CLAUDE_CODE: 'claude',
	CODEX: 'codex',
	OPENCODE: 'opencode',
}

/**
 * Per-thread behavior modal (T10): respond trigger, who can invoke agents, and context buffer depth.
 *
 * Pure content driven by `useDialogStore` (component bp-24): the caller does
 * `show(<ThreadSettingsDialog threadId={…} />)` and MOUNTED is what "open" means here — which is why
 * the body is no longer gated on a local `open` flag. The store is what dismisses it.
 *
 * SINGLE COLUMN WITH SCROLL (D3, R12) — the design's 640×840 modal reads top to bottom as one list;
 * the two-column layout this used to have (a "settings on the left, prompt on the right" split,
 * justified by keeping the prompt off the fold) is retired. The header (`DialogHeader`) stays OUTSIDE
 * the scroll container, so it never moves while the body scrolls under it — the `max-h` on the body
 * is still governed by the 520px minimum window height the desktop shell allows, unchanged from
 * before.
 *
 * ORDER (D3, R13): Gatilho → Agentes → Buffer → Prompt → Participantes → Loops → Zona de perigo — the
 * reference's own reading order, which is why each section below is its OWN component with its own
 * `useGetThreadSettings` call (React Query dedupes to the one request) instead of one function
 * returning them in a fixed bundle: reordering is now a matter of reordering JSX, not restructuring
 * data flow.
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
		// 640px in the reference (D3, R12) — `sm:max-w-[40rem]` is that measurement, not a round Tailwind
		// step. Below `sm` the primitive's own base width still applies, untouched.
		<DialogContent className={cn('sm:max-w-[40rem]', className)}>
			<DialogHeader>
				<DialogTitle>{t('session.settingsTitle')}</DialogTitle>
				<DialogDescription>
					{session ? t('session.settingsDescriptionNamed', { name: session.thread.displayName }) : t('session.settingsDescription')}
				</DialogDescription>
			</DialogHeader>
			{/* O corpo rola, o cabeçalho e o botão de fechar não. O teto é o viewport menos a moldura do
			    diálogo (margem + padding + cabeçalho): numa janela baixa — o mínimo do shell é 520px de
			    altura — o modal ainda estoura, e um modal que cresce para fora da tela esconde o botão que
			    o operador precisa clicar.
			    `overflow-x-hidden` é deliberado, não decorativo: `Switch` alarga o alvo de toque com um
			    pseudo-elemento absoluto (`after:-inset-x-2`, invisível) que ultrapassa 8px a própria caixa —
			    isso conta para o scrollable-overflow do ancestral. Com só `overflow-y-auto` declarado, o
			    navegador promove `overflow-x` (default `visible`) para `auto` (regra do spec de overflow:
			    um eixo `auto`/`scroll` força o outro a sair de `visible`), e essa barra passa a aparecer de
			    verdade — sonda `bun probe`: div media 516×… vs 508 de `clientWidth` (8px = exatamente o
			    inset do Switch). Nenhum filho está genuinamente quebrado — nada aqui precisa rolar na
			    horizontal — então travar o eixo é o contrato certo, não um esconde-esconde; mesmo par já
			    usado em `select.tsx`/`dropdown-menu.tsx` para o mesmíssimo mecanismo. */}
			<div className="flex max-h-[calc(100dvh-11rem)] flex-col gap-6 overflow-x-hidden overflow-y-auto">
				<TriggerSection threadId={threadId} />
				<ThinkingIndicatorSection threadId={threadId} />
				<ReactionsSection threadId={threadId} />
				<StreamingSection threadId={threadId} />
				<AgentsSection threadId={threadId} />
				<BufferSection threadId={threadId} />
				<CustomPromptSection threadId={threadId} />
				<ParticipantsSection threadId={threadId} />
				<LoopsSection threadId={threadId} />
				{/* The name is READ HERE and handed down, deliberately breaking the "each component owns its
				    data" habit for one prop: the confirmation must say WHICH conversation is about to go, and
				    this component already holds the query that knows. A second `useGetSessionChat` inside the
				    danger zone would be the same cache entry read twice. */}
				<DangerZone threadId={threadId} threadName={session?.thread.displayName} />
			</div>
		</DialogContent>
	)
}

/**
 * The destructive corner of the settings dialog (thread-deletion spec, decision 7).
 *
 * Set apart by a rule and its own RED heading (D3 — `Section / Zona de perigo`'s label is the one
 * `sectionLabel` in the whole modal that isn't foreground-black; the reference measures it at
 * `$destructive`) rather than by a red panel: the console has exactly one destructive action per
 * screen and the `destructive` button carries the weight. What makes it safe is the CONFIRMATION,
 * not the decoration — and the confirmation names the conversation, because "Apagar conversa" with
 * no subject is the dialog people dismiss on autopilot and regret.
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
			<h3 className={cn(sectionLabel, 'text-destructive')}>{t('session.deleteThread.sectionTitle')}</h3>
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm text-muted-foreground">{t('session.deleteThread.hint')}</p>
				<Button variant="destructive" size="lg" className="shrink-0" disabled={deleteThread.isPending} onClick={onDelete}>
					{t('session.deleteThread.action')}
				</Button>
			</div>
		</section>
	)
}

/** Gatilho de resposta — the mention-gate switch, plus its own "Tag de menção" field (D3, R15). */
function TriggerSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const configureMentionGate = useConfigureMentionGate()

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
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-6 rounded-lg" />
				<Skeleton className="h-10 rounded-xl" />
			</div>
		)
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h3 className={sectionLabel}>{t('session.respondTrigger')}</h3>
			<label className="flex items-center gap-3">
				<Switch
					checked={gateEnabled}
					onCheckedChange={value => {
						setGateEnabled(value)
						saveGate(value, tag)
					}}
				/>
				<span className="flex-1 text-sm font-semibold text-foreground">{t('session.onlyWhenMentioned')}</span>
			</label>
			{/* Its OWN row (D3, R15) — the reference gives the tag a labeled field of its own below the
			    switch, not an input squeezed into the switch's row. Stays VISIBLE while the gate is off,
			    just disabled: hiding it made the row jump height on every toggle and hid the value the
			    operator was about to need. */}
			<div className="flex items-center gap-3.5">
				<label htmlFor="mention-tag" className="w-[9.375rem] shrink-0 text-sm text-muted-foreground">
					{t('session.mentionTag')}
				</label>
				<Input
					id="mention-tag"
					placeholder={t('session.mentionTagPlaceholder')}
					className="flex-1 font-mono text-sm"
					disabled={!gateEnabled}
					value={tag}
					onChange={e => setTag(e.target.value)}
					onBlur={() => saveGate(true, tag)}
				/>
			</div>
		</section>
	)
}

/**
 * Indicador de pensando — toggles the "✻ verbo…" channel placeholder the agent posts while it
 * works on a reply. Placed right after `TriggerSection` (D3): both sections govern how the agent
 * behaves IN THE CHANNEL, one deciding whether it answers at all, the other what it shows while it
 * does.
 *
 * A STRAIGHT switch bound to the query, no draft state — unlike `TriggerSection`'s mention tag,
 * there is no dependent field here, so this mirrors `ParticipantsSection`'s `canInvoke` toggle
 * (`checked` reads the query directly, `onCheckedChange` mutates + invalidates) rather than
 * `TriggerSection`'s buffered local state. Row layout (hint LEFT, control RIGHT) follows
 * `BufferSection`, since the description is prose rather than a one-word label the switch could
 * carry inline.
 */
function ThinkingIndicatorSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const configureThinkingIndicator = useConfigureThinkingIndicator()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-6 rounded-lg" />
			</div>
		)
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h3 className={sectionLabel}>{t('session.thinkingIndicator')}</h3>
			<div className="flex items-center gap-4">
				<p className="flex-1 text-sm text-muted-foreground">{t('session.thinkingIndicatorHint')}</p>
				<Switch
					checked={data.thinkingIndicator.enabled}
					disabled={configureThinkingIndicator.isPending}
					aria-label={t('session.thinkingIndicator')}
					onCheckedChange={value =>
						configureThinkingIndicator.mutate({ threadId, data: { enabled: value } }, { onSuccess: invalidate })
					}
				/>
			</div>
		</section>
	)
}

/**
 * Reações — the 👀/🤖 channel reaction cues (mirrors `ThinkingIndicatorSection`'s shape exactly: a
 * straight switch bound to the query, no draft state, hint LEFT / control RIGHT). Placed right after
 * the thinking indicator (founder, 2026-08-25): all three sections in this run of the dialog govern
 * how the agent behaves IN THE CHANNEL — whether it answers, what it shows while it works, and now
 * whether it marks the triggering message and its own reply with reaction emoji.
 */
function ReactionsSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const configureReactions = useConfigureReactions()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-6 rounded-lg" />
			</div>
		)
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h3 className={sectionLabel}>{t('session.reactions')}</h3>
			<div className="flex items-center gap-4">
				<p className="flex-1 text-sm text-muted-foreground">{t('session.reactionsHint')}</p>
				<Switch
					checked={data.reactions.enabled}
					disabled={configureReactions.isPending}
					aria-label={t('session.reactions')}
					onCheckedChange={value => configureReactions.mutate({ threadId, data: { enabled: value } }, { onSuccess: invalidate })}
				/>
			</div>
		</section>
	)
}

/**
 * Resposta em tempo real — whether the agent's reply streams into the channel by editing the same
 * message as it writes, or arrives whole once the agent finishes. Same shape as `ReactionsSection`
 * right above it.
 */
function StreamingSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const configureStreaming = useConfigureStreaming()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-6 rounded-lg" />
			</div>
		)
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h3 className={sectionLabel}>{t('session.streaming')}</h3>
			<div className="flex items-center gap-4">
				<p className="flex-1 text-sm text-muted-foreground">{t('session.streamingHint')}</p>
				<Switch
					checked={data.streaming.enabled}
					disabled={configureStreaming.isPending}
					aria-label={t('session.streaming')}
					onCheckedChange={value => configureStreaming.mutate({ threadId, data: { enabled: value } }, { onSuccess: invalidate })}
				/>
			</div>
		</section>
	)
}

/**
 * Agentes desta conversa (D3) — one CARD per bound provider, filled pastel-green while the daemon can
 * actually drive it and flat grey once it can't (`comingSoon`), instead of the old plain row list.
 *
 * The per-provider MODEL SELECT stays inline in each card rather than moving to the single shared
 * "Modelo" field the reference draws below the cards (código vence, C-style): the wire lets more than
 * one provider carry its own `models` catalog and its own `configureModel({ provider, model })` call,
 * so a single shared select would have nowhere to record WHICH provider it targets the moment two
 * providers are both bound. The reference's mock only ever shows one provider "on" at a time, which is
 * exactly the case this degrades to.
 */
function AgentsSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const configureModel = useConfigureModel()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-14 rounded-xl" />
				<Skeleton className="h-14 rounded-xl" />
			</div>
		)
	}

	return (
		<section className={cn('flex flex-col gap-2.5', className)} {...props}>
			<h3 className={sectionLabel}>{t('session.boundAgents')}</h3>
			<div className="flex flex-col gap-2">
				{data.providers.map(({ provider, comingSoon, model, models }) => {
					const Glyph = providerGlyph[provider]
					// "Bound" = the daemon can actually drive this CLI. The reference's card fill (pastel
					// green vs. flat grey) and its badge (brand green vs. `input` grey) both key off this
					// same boolean — there is no separate field for it on the wire.
					const bound = !comingSoon
					return (
						<div
							key={provider}
							className={cn('flex items-center gap-3 rounded-asymmetric-sm px-3.5 py-2.5', bound ? 'bg-secondary' : 'bg-card')}
						>
							<span
								className={cn(
									'flex size-[1.875rem] shrink-0 items-center justify-center rounded-asymmetric-2xs',
									bound ? 'bg-primary text-primary-foreground' : 'bg-input text-muted-foreground',
								)}
							>
								<Glyph className="size-4" />
							</span>
							<div className="min-w-0 flex-1">
								<p className={cn('truncate text-sm font-bold', bound ? 'text-secondary-foreground' : 'text-foreground')}>
									{providerLabel[provider]}
								</p>
								<p className={cn('truncate font-mono text-xs', bound ? 'text-secondary-foreground/80' : 'text-muted-foreground')}>
									{providerCli[provider]}
								</p>
							</div>
							{comingSoon ? (
								<Badge variant="outline" className="shrink-0">
									{t('common.comingSoon')}
								</Badge>
							) : null}
							{/*
							 * O MODELO, na linha do agente a que ele pertence — não numa seção própria (ver o
							 * comentário do componente). Só aparece quando há o que escolher: um provider que
							 * esta versão nunca dirigiu tem catálogo vazio, e um select de uma opção só é ruído.
							 * Salva no `onValueChange`, como as pilhas de buffer e ao contrário do prompt: é uma
							 * escolha de um clique, não um texto escrito aos poucos.
							 */}
							{models.length > 0 ? (
								<Select
									enum={AgentModelIdEnum}
									i18nPrefix="enums.AgentModelId"
									values={models}
									value={model}
									onValueChange={value => configureModel.mutate({ threadId, data: { provider, model: value } }, { onSuccess: invalidate })}
									aria-label={t('session.agentModel')}
									className="w-36 shrink-0 bg-background"
								/>
							) : (
								// The bound indicator the reference draws as a track/knob switch: it reflects
								// whether the daemon can drive this CLI, not a per-thread setting the operator
								// flips — so it renders read-only rather than as a `Switch` wired to a mutation
								// that does not exist on the wire.
								<Switch checked={bound} disabled aria-hidden className="shrink-0 opacity-100" />
							)}
						</div>
					)
				})}
			</div>
			{/*
			 * O AVISO QUE EVITA UM BUG APARENTE. Trocar o modelo invalida a sessão do CLI
			 * (`ResumeInvalidationReason.MODEL_CHANGED`: o binário fixa o modelo na sessão que retoma, então
			 * retomar ignoraria o pedido em silêncio). É o comportamento certo — e, sem estar escrito, o
			 * operador vê o agente "esquecer" a conversa e conclui que quebrou.
			 *
			 * Só quando há pelo menos um seletor: um aviso sobre uma ação indisponível é decoração, pela
			 * mesma razão que o aviso de `comingSoon` logo abaixo só aparece quando há um provider morto.
			 */}
			{data.providers.some(p => p.models.length > 0) ? (
				<p className="text-sm text-muted-foreground">{t('session.agentModelRestartHint')}</p>
			) : null}
			{/* A explicação só aparece quando há algo a explicar — um aviso permanente vira decoração. */}
			{data.providers.some(p => p.comingSoon) ? (
				<p className="text-sm text-muted-foreground">{t('session.boundAgentsComingSoonHint')}</p>
			) : null}
		</section>
	)
}

/** Participantes — quem pode invocar. Split out of the old bundled body so it can move (D3, R13). */
function ParticipantsSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const setInvocation = useSetParticipantInvocation()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-10 rounded-lg" />
				<Skeleton className="h-10 rounded-lg" />
			</div>
		)
	}

	return (
		<section className={cn('flex flex-col gap-2', className)} {...props}>
			<h3 className={sectionLabel}>{t('session.participantsWhoCanInvoke')}</h3>
			{/* Plain rows, no bordered card: the heading's rule already groups them, and a second box
			    inside a modal is one frame too many. The avatar is what makes a roster scannable. */}
			<div className="flex flex-col">
				{data.participants.map(participant => (
					<label key={participant.participantId} className="flex items-center gap-3 py-1.5">
						{/* A CARA do participante quando a agenda do gateway tem uma — o `operator` nunca tem
						    (é uma palavra, não um JID), e um membro que a sincronização ainda não escreveu
						    também não: os dois caem nas iniciais sem caso especial aqui. */}
						<ThreadAvatar
							name={participant.name}
							src={participant.hasAvatar ? contactAvatarUrl(participant.channelId, participant.participantId) : undefined}
						/>
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="truncate text-sm font-bold text-foreground">{participant.name}</span>
							<span className="truncate text-xs text-muted-foreground">{participant.source}</span>
						</div>
						<span className="shrink-0 text-xs text-muted-foreground">{t('session.canInvokeToggle')}</span>
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
	)
}

/**
 * Buffer de contexto (D3, R14) — a STEPPER (− · valor · +) navigating the closed `BufferSize` list,
 * replacing the four discrete pills. The values are STILL the enum ('25'|'50'|'100'|'200'): the
 * stepper only changes how the same four-item list is navigated, never opens it up to a free
 * increment — `step()` clamps to the list's own bounds and looks up the neighbour by index, it never
 * does arithmetic on the number itself.
 */
function BufferSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const configureBuffer = useConfigureContextBuffer()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-10 rounded-xl" />
			</div>
		)
	}

	const index = BUFFER_SIZES.indexOf(data.bufferSize)
	const step = (delta: -1 | 1) => {
		const next = BUFFER_SIZES[index + delta]
		if (!next) return
		configureBuffer.mutate({ threadId, data: { bufferSize: next } }, { onSuccess: invalidate })
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h3 className={sectionLabel}>{t('session.contextBuffer')}</h3>
			<div className="flex items-center gap-3.5">
				{/* Explanation LEFT of the control, same reading order as the reference — it says what the
				    numbers mean before the operator reaches the control itself. */}
				<p className="flex-1 text-sm text-muted-foreground">{t('session.contextBufferHint')}</p>
				<div className="flex h-9 shrink-0 items-center overflow-hidden rounded-asymmetric-xs border border-input">
					<button
						type="button"
						aria-label={t('session.bufferDecrease')}
						disabled={index <= 0 || configureBuffer.isPending}
						onClick={() => step(-1)}
						className="flex h-full w-[2.125rem] items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
					>
						<IconMinus className="size-3.5" />
					</button>
					<span className="flex items-baseline gap-1 px-2.5">
						<span className="text-sm font-bold text-foreground">{String(data.bufferSize)}</span>
						<span className="text-xs text-muted-foreground">{t('session.bufferMessages')}</span>
					</span>
					<button
						type="button"
						aria-label={t('session.bufferIncrease')}
						disabled={index >= BUFFER_SIZES.length - 1 || configureBuffer.isPending}
						onClick={() => step(1)}
						className="flex h-full w-[2.125rem] items-center justify-center text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
					>
						<IconPlus className="size-3.5" />
					</button>
				</div>
			</div>
		</section>
	)
}

/**
 * PROMPT PERSONALIZADO — as instruções que o operador escreve para ESTA conversa.
 *
 * A única seção deste diálogo que NÃO salva sozinha, e a diferença é deliberada. O switch, a tag e o
 * stepper de buffer são escolhas de um clique: salvar no `onChange`/`onBlur` é o comportamento óbvio
 * delas. Um prompt é texto escrito aos poucos, e um autosave no meio da frase muda como o agente fala
 * com pessoas de verdade antes de o operador ter terminado de pensar. Por isso ele COMITA, e o botão
 * habilitado é o que torna "não salvo" legível.
 *
 * Esvaziar a caixa e salvar é o caminho de apagar — `Thread.configurePrompt` transforma vazio em
 * ausência, então não há um segundo botão para a mesma intenção.
 */
function CustomPromptSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
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
		// O esqueleto tem a FORMA da seção carregada — rótulo, explicação, caixa alta e rodapé — para o
		// diálogo não pular de altura enquanto os dados chegam.
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-7 rounded-lg" />
				<Skeleton className="h-10 rounded-lg" />
				<Skeleton className="min-h-40 rounded-2xl" />
				<Skeleton className="h-9 rounded-lg" />
			</div>
		)
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<h3 className={sectionLabel}>{t('session.customPrompt')}</h3>
			<Textarea
				aria-label={t('session.customPrompt')}
				placeholder={t('session.customPromptPlaceholder')}
				className="min-h-24 resize-none"
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
				{/* D3 (R16) — "Salvar prompt" is the PRIMARY action in the reference (solid brand green),
				    not the hollow `outline` it used to be: it is the one section in this dialog that
				    requires an explicit commit, and the filled button is what makes that commit visible. */}
				<Button
					variant="default"
					size="lg"
					className="shrink-0"
					disabled={!promptDirty || configurePrompt.isPending}
					onClick={() => configurePrompt.mutate({ threadId, data: { customPrompt: prompt } }, { onSuccess: invalidate })}
				>
					{t('session.customPromptSave')}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">{t('session.customPromptHint')}</p>
		</section>
	)
}
