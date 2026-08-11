import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconFolder, IconInfoCircle, IconPencil } from '@tabler/icons-react'
import { attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { ChannelKind, GetAttachThreadWizardQueryResponse, ProviderKind } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { enumLabel } from '@/lib'
import { providerGlyph, providerLabel } from '@/components/console/glyphs'
import { ThreadAvatar, contactAvatarUrl } from '@/components/console/ThreadAvatar'
import { StepHeading } from '../StepHeading'
import type { AttachForm } from '../AttachThreadWizard'

// ReviewStep is not a standard FRM-P17 step — it additionally receives the wizard's typed accumulated
// form (like the pair's ReviewStep) plus the read's option lists so it can render a live summary and
// gate the final schema-validated submission.
type ReviewStepProps = ComponentProps<'div'> & {
	form: AttachForm
	channelKindById: Map<string, ChannelKind>
	workspaces: GetAttachThreadWizardQueryResponse['workspaces']
	onBack?: () => void
	onFinish: () => void
	isSubmitting?: boolean
	// D3 (screen du3gx) — per-row "Editar" jumps straight back to the step that produced that row.
	// Optional: only `/attach`'s `AttachThreadWizard` can jump between steps by index; the onboarding
	// wizard reuses this SAME component (C2) without step-jump plumbing, so it simply omits these and
	// the buttons don't render — same optional-prop shape `onBack` already established here.
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
}: {
	icon: ReactNode
	label: string
	value: string
	extra?: ReactNode
	onEdit?: () => void
}) {
	const { t } = useTranslation()
	return (
		<div className="flex items-center gap-4 p-5">
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
 * `Anexar` NÃO É UM "CONTINUAR", É O COMMIT DO WIZARD — e por isso ficou.
 *
 * A varredura dos rodapés tirou a ação primária de contato e workspace porque lá ela era um segundo
 * clique repetindo o primeiro: escolher já era responder. Aqui não há linha para clicar e não há
 * próximo passo — este botão dispara a mutation `AttachThread`, que CRIA a conversa. Não existe outro
 * gesto do qual inferi-lo, e inferi-lo de algum seria criar a conversa sem ninguém ter confirmado: a
 * tela de revisão existe justamente para que o último ato seja deliberado.
 *
 * O Voltar, esse, subiu para o `StepHeading` como nos demais passos, e continua travado
 * (`backDisabled`) enquanto a mutation está no ar — recuar no meio de um commit é a única volta que
 * este passo não pode oferecer.
 */
export function ReviewStep({
	form,
	channelKindById,
	workspaces,
	onBack,
	onFinish,
	isSubmitting,
	onEditContact,
	onEditWorkspace,
	onEditAgents,
	className,
	...props
}: ReviewStepProps) {
	const { t } = useTranslation()

	return (
		<div className={cn('flex flex-col gap-5', className)} {...props}>
			{/* D3 (screen du3gx) draws "Voltar" as a footer button instead of the circular back this
			    `StepHeading` renders — NOT adopted: `index.stories.tsx`'s `Default`/`Submitting` assert
			    the back control lives at `[data-slot="step-heading"] button` and that the commit
			    footer holds exactly one button (`finish.parentElement…toHaveLength(1)`), matching the
			    "Anexar is a commit, not a Continuar" decision this step's docblock defends. Registered
			    divergence (code wins): `onBack` stays here, unmoved. */}
			<StepHeading
				title={t('attach.stepReviewTitle')}
				subtitle={t('attach.stepReviewSubtitle')}
				onBack={onBack}
				backDisabled={isSubmitting}
			/>

			<form.Subscribe selector={state => state.values}>
				{values => {
					const canFinish = attachThreadMutationRequestSchema.safeParse(values).success
					const channelKind = values.contactRef?.channelId ? channelKindById.get(values.contactRef.channelId) : undefined
					const workspacePath = workspaces.find(w => w.workspaceId === values.workspaceId)?.path ?? '—'
					const providers = (values.providers ?? []) as ProviderKind[]
					const firstProvider = providers[0]
					const AgentGlyph = firstProvider ? providerGlyph[firstProvider] : undefined

					return (
						<>
							<div className="flex flex-col divide-y divide-border overflow-hidden rounded-asymmetric-xl border border-border bg-background">
								<ReviewRow
									icon={
										<ThreadAvatar
											name={values.contactRef?.displayName ?? '—'}
											src={
												values.contactRef?.channelId && values.contactRef.externalId
													? contactAvatarUrl(values.contactRef.channelId, values.contactRef.externalId)
													: undefined
											}
											channelKind={channelKind}
										/>
									}
									label={t('attach.rowContact')}
									value={values.contactRef?.displayName ?? '—'}
									extra={
										channelKind ? <span className="text-xs text-muted-foreground">{enumLabel('ChannelKind', channelKind)}</span> : undefined
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
									value={providers.map(p => providerLabel[p]).join(', ') || '—'}
									onEdit={onEditAgents}
								/>

								<div className="flex items-start gap-3 bg-muted/40 p-5">
									<IconInfoCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
									<p className="text-sm text-muted-foreground">{t('attach.reviewFooterNote')}</p>
								</div>
							</div>

							{/* Só o commit. O Voltar mora no `StepHeading` acima, travado enquanto a mutation corre. */}
							<div className="flex justify-end">
								<Button type="button" onClick={onFinish} disabled={isSubmitting || !canFinish}>
									{isSubmitting && <Spinner className="mr-2" />}
									{isSubmitting ? t('attach.attaching') : t('attach.finish')}
								</Button>
							</div>
						</>
					)
				}}
			</form.Subscribe>
		</div>
	)
}
