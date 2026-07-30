import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from '@tanstack/react-form'
import { IconArrowLeft, IconArrowRight, IconCheck } from '@tabler/icons-react'
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
			<StepHeading title={t('attach.stepAgentsTitle')} subtitle={t('attach.stepAgentsSubtitle')} />

			<form.Subscribe selector={state => (state.values.providers as ProviderKind[] | undefined) ?? []}>
				{selected => (
					<div className="flex flex-col gap-2">
						{providers.map(entry => {
							const Glyph = providerGlyph[entry.provider]
							const available = entry.available
							const isSelected = selected.includes(entry.provider)
							return (
								<button
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
										<span className="text-sm text-muted-foreground">{enumLabel('ProviderStatus', entry.status)}</span>
									</div>
									<span
										className={cn(
											'flex size-6 items-center justify-center rounded-full border',
											isSelected ? 'border-transparent bg-primary text-primary-foreground' : 'border-border',
										)}
									>
										{isSelected && <IconCheck className="size-3.5" />}
									</span>
								</button>
							)
						})}
					</div>
				)}
			</form.Subscribe>

			<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, values: state.values })}>
				{({ canSubmit, values }) => {
					const isDisabled = isSubmitting || !canSubmit || !AgentsStepSchema.safeParse(values).success
					return (
						<div className="flex justify-between">
							<div>
								{onBack && (
									<Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting}>
										<IconArrowLeft data-icon="inline-start" /> {t('attach.back')}
									</Button>
								)}
							</div>
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
