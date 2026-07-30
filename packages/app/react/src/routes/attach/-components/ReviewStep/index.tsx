import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowLeft } from '@tabler/icons-react'
import { attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { ChannelKind, GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { enumLabel } from '@/lib'
import { providerLabel } from '@/components/console/glyphs'
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
}

export function ReviewStep({ form, channelKindById, workspaces, onBack, onFinish, isSubmitting, className, ...props }: ReviewStepProps) {
	const { t } = useTranslation()

	return (
		<div className={cn('flex flex-col gap-5', className)} {...props}>
			<StepHeading title={t('attach.stepReviewTitle')} subtitle={t('attach.stepReviewSubtitle')} />

			<form.Subscribe selector={state => state.values}>
				{values => {
					const canFinish = attachThreadMutationRequestSchema.safeParse(values).success
					const channelKind = values.contactRef?.channelId ? channelKindById.get(values.contactRef.channelId) : undefined
					const workspacePath = workspaces.find(w => w.workspaceId === values.workspaceId)?.path ?? '—'
					const rows = [
						{
							label: t('attach.rowContact'),
							value: `${values.contactRef?.displayName ?? '—'}${channelKind ? ` · ${enumLabel('ChannelKind', channelKind)}` : ''}`,
						},
						{ label: t('attach.rowWorkspace'), value: workspacePath, mono: true },
						{ label: t('attach.rowAgents'), value: (values.providers ?? []).map(p => providerLabel[p]).join(', ') || '—' },
					]
					return (
						<>
							<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
								{rows.map(row => (
									<div key={row.label} className="flex items-center justify-between gap-4 p-4">
										<span className="text-sm font-medium text-muted-foreground">{row.label}</span>
										<span className={cn('truncate text-sm text-foreground', row.mono && 'font-mono')}>{row.value}</span>
									</div>
								))}
							</div>

							<div className="flex justify-between">
								<div>
									{onBack && (
										<Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting}>
											<IconArrowLeft data-icon="inline-start" /> {t('attach.back')}
										</Button>
									)}
								</div>
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
