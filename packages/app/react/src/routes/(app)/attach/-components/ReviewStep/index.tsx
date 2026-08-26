import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconFolder, IconInfoCircle, IconPencil } from '@tabler/icons-react'
import { attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { ChannelKind, GetAttachThreadWizardQueryResponse, ProviderKind } from '@codm/client-typescript/typescript'
import { Badge } from '@codm/app-ui/badge'
import { Button } from '@codm/app-ui/button'
import { Spinner } from '@codm/app-ui/spinner'
import { cn } from '@/lib/utils'
import { enumLabel } from '@/lib'
import { channelGlyph, providerGlyph, providerLabel } from '@/components/console/glyphs'
import { ThreadAvatar, contactAvatarUrl } from '@/components/console/ThreadAvatar'
import type { ContactStepData } from '../ContactStep'
import { StepHeading } from '../StepHeading'

/**
 * ReviewStep reads its selection as PLAIN PROPS now, not a `form: AttachForm` instance (D3, founder
 * review 12/08). Both wizards that reuse this component already hold the accumulated selection in a
 * Zustand store by the time they render this step — `/attach`'s `useAttachWizardStore` and
 * onboarding's `useOnboardingSetupStore` — and a Zustand store subscription is already reactive on its
 * own; wrapping it in a `useForm()` just to satisfy `form.Subscribe` here was indirection with no
 * payoff once BOTH call sites derive from a store. Removing it also retires the `AttachForm`/
 * `_inferAttachForm` FRM-P18 trick from `AttachThreadWizard` — that trick existed only to type an
 * empty accumulator form, and there is no longer an accumulator to type.
 */
type ReviewStepProps = ComponentProps<'div'> & {
	contactRef?: ContactStepData['contactRef']
	workspaceId?: string
	providers?: ProviderKind[]
	channelKindById: Map<string, ChannelKind>
	workspaces: GetAttachThreadWizardQueryResponse['workspaces']
	/**
	 * OPTIONAL now. `/attach`'s `AttachThreadWizard` owns a persistent footer (D3) whose Continuar
	 * button BECOMES the commit action on this step ("Vincular conversa") — so it does not pass
	 * `onFinish` here, and this component renders no button of its own. Onboarding's
	 * `OnboardingReviewStep` has no such footer awareness (its own `OnboardingFlow` footer only
	 * advances slides) and keeps passing `onFinish`/`isSubmitting`, so the inline commit button stays
	 * for that caller — same optional-prop shape `onEditContact` etc. already established here.
	 */
	onFinish?: () => void
	isSubmitting?: boolean
	// D3 (screen du3gx) — per-row "Editar" jumps straight back to the step that produced that row.
	// Optional: only `/attach`'s `AttachThreadWizard` can jump between steps by index; the onboarding
	// wizard reuses this SAME component (C2) without step-jump plumbing, so it simply omits these and
	// the buttons don't render.
	onEditContact?: () => void
	onEditWorkspace?: () => void
	onEditAgents?: () => void
}

function ReviewRow({
	icon,
	label,
	value,
	extra,
	onEdit,
	className,
	...props
}: ComponentProps<'div'> & {
	icon: ReactNode
	label: string
	value: string
	extra?: ReactNode
	onEdit?: () => void
}) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex items-center gap-4 p-5', className)} {...props}>
			{icon}
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="text-xs font-medium text-muted-foreground">{label}</span>
				<span className="truncate text-sm font-semibold text-foreground">{value}</span>
				{extra}
			</div>
			{onEdit && (
				<Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={onEdit}>
					<IconPencil className="size-3.5" />
					{t('attach.edit')}
				</Button>
			)}
		</div>
	)
}

/**
 * `Vincular conversa` NÃO É UM "CONTINUAR" — é o commit do wizard.
 *
 * NO `/attach` real, esse botão MORA NO FOOTER agora (D3, founder review 12/08): a varredura anterior
 * já tinha tirado a ação primária de contato e workspace porque lá ela era um segundo clique repetindo
 * o primeiro (escolher já grava); aqui, o botão de commit em si sobreviveu, só que MUDOU DE ENDEREÇO —
 * saiu de dentro deste componente para o rodapé persistente que `AttachThreadWizard` passou a
 * desenhar, no MESMO lugar onde Voltar/Continuar já vivem nos outros três passos. Por isso `onFinish`
 * é opcional aqui: quando ausente (o caso do `/attach` real), este componente é pura leitura — resumo
 * + links de editar, nada mais. Quando presente (onboarding, sem footer ciente do attach), o botão
 * inline sobrevive como estava.
 */
export function ReviewStep({
	contactRef,
	workspaceId,
	providers,
	channelKindById,
	workspaces,
	onFinish,
	isSubmitting,
	onEditContact,
	onEditWorkspace,
	onEditAgents,
	className,
	...props
}: ReviewStepProps) {
	const { t } = useTranslation()

	const canFinish = attachThreadMutationRequestSchema.safeParse({ contactRef, workspaceId, providers }).success
	const channelKind = contactRef?.channelId ? channelKindById.get(contactRef.channelId) : undefined
	const ChannelGlyph = channelKind ? channelGlyph[channelKind] : undefined
	const workspacePath = workspaces.find(w => w.workspaceId === workspaceId)?.path ?? '—'
	const providerList = providers ?? []
	const firstProvider = providerList[0]
	const AgentGlyph = firstProvider ? providerGlyph[firstProvider] : undefined

	return (
		<div className={cn('flex flex-col gap-5', className)} {...props}>
			<StepHeading title={t('attach.stepReviewTitle')} subtitle={t('attach.stepReviewSubtitle')} />

			<div className="flex flex-col divide-y divide-border overflow-hidden rounded-asymmetric-xl border border-border bg-background">
				<ReviewRow
					icon={
						<ThreadAvatar
							name={contactRef?.displayName ?? '—'}
							src={
								contactRef?.channelId && contactRef.externalId ? contactAvatarUrl(contactRef.channelId, contactRef.externalId) : undefined
							}
							channelKind={channelKind}
							// `size="lg"` (42px) — the spec's "Foto" node is 44×44, matching the sibling
							// Projeto/Agentes rows' `size-11` (≈46px) icon boxes far closer than
							// `ThreadAvatar`'s unstated default (`size-8`≈34px, measured via the region
							// lane as visibly undersized against the target, F3 batch B3).
							size="lg"
						/>
					}
					label={t('attach.rowContact')}
					value={contactRef?.displayName ?? '—'}
					// D3 (spec du3gx, "Linha — Contato" → "Selos") — TWO chips, `Chip / WhatsApp` (fill
					// `$secondary`, icon+label) and `Chip / Contato` (fill `$muted`, label only,
					// cornerRadius `[9,9,9,3]` = `size="compact"`'s asymmetric-3xs on both) — not the
					// plain unstyled text this row used to render. Both fields (`channelKind` via
					// `channelKindById`, `contactRef.kind`) were already in scope; this is composition,
					// not a new data need (fence #3, F3 batch B3).
					extra={
						channelKind ? (
							<div className="flex items-center gap-1.5">
								<Badge variant="secondary" size="compact">
									{ChannelGlyph && <ChannelGlyph />}
									{enumLabel('ChannelKind', channelKind)}
								</Badge>
								{contactRef?.kind && (
									<Badge size="compact" className="text-muted-foreground">
										{enumLabel('ContactKind', contactRef.kind)}
									</Badge>
								)}
							</div>
						) : undefined
					}
					onEdit={onEditContact}
				/>
				<ReviewRow
					icon={
						<span className="flex size-11 shrink-0 items-center justify-center rounded-asymmetric-md bg-secondary text-secondary-foreground">
							<IconFolder className="size-5" />
						</span>
					}
					label={t('attach.rowWorkspace')}
					value={workspacePath}
					onEdit={onEditWorkspace}
				/>
				<ReviewRow
					icon={
						<span className="flex size-11 shrink-0 items-center justify-center rounded-asymmetric-md bg-secondary text-secondary-foreground">
							{AgentGlyph ? <AgentGlyph className="size-5" /> : null}
						</span>
					}
					label={t('attach.rowAgents')}
					value={providerList.map(p => providerLabel[p]).join(', ') || '—'}
					onEdit={onEditAgents}
				/>

				<div className="flex items-start gap-3 bg-muted/40 p-5">
					<IconInfoCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">{t('attach.reviewFooterNote')}</p>
				</div>
			</div>

			{onFinish && (
				<div className="flex justify-end">
					<Button type="button" onClick={onFinish} disabled={isSubmitting || !canFinish}>
						{isSubmitting && <Spinner className="mr-2" />}
						{isSubmitting ? t('attach.attaching') : t('attach.finish')}
					</Button>
				</div>
			)}
		</div>
	)
}
