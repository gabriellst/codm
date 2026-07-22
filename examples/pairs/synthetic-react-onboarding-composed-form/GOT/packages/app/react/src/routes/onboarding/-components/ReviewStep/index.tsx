// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-onboarding-composed-form
// task:        synthetic-react-onboarding-composed-form
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-21T23:05:55.662Z
// source:      packages/app/react/src/routes/onboarding/-components/ReviewStep/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { IconArrowLeft } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { enumLabel } from '@/lib'
import { pickUnionVariant } from '@/lib/union'
import { connectIntegrationMutationRequestSchema, IntegrationPlatformEnum } from '@template/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { TARGET_COPY, TARGETS } from '../TargetStep'
import type { ConnectForm } from '../ConnectWizard'

// A plain ternary of two string literals infers a closed literal-union type, which trips the
// no-raw-enum-render lint rule (it can't tell a masked secret from a raw enum value structurally)
// — a function call is exempt by the rule's own shape, and a masking helper is the right home
// for this anyway.
function maskSecret(value: string | undefined): string {
	return value ? '••••••••' : '—'
}

// ReviewStep is not a standard FRM-P17 step — it additionally receives the wizard's typed
// accumulated form (per-task requirement) so it can render a live summary and gate the final
// union-validated submission.
type ReviewStepProps = ComponentProps<'div'> & {
	form: ConnectForm
	onBack?: () => void
	onFinish: () => void
	isSubmitting?: boolean
}

export function ReviewStep({ form, onBack, onFinish, isSubmitting, className, ...props }: ReviewStepProps) {
	const { t } = useTranslation()

	return (
		<div className={cn('flex flex-col gap-6 p-2', className)} {...props}>
			<div className="text-center">
				<h2 className="text-2xl font-semibold tracking-tight">{t('onboarding.review.title')}</h2>
				<p className="text-muted-foreground mt-2">{t('onboarding.review.subtitle')}</p>
			</div>

			<form.Subscribe selector={state => state.values}>
				{values => {
					// TARGETS[platform] is the canonical, non-DeepPartial source for the full
					// discriminant tuple — see ConnectWizard.handleFinish for why the accumulated
					// form's own type/platform/connectionMode fields aren't used as the match here.
					const target = values.platform ? TARGETS[values.platform] : undefined
					const canFinish = !!target && pickUnionVariant(connectIntegrationMutationRequestSchema, target).safeParse(values).success

					return (
						<>
							<Card className="flex flex-col gap-3 p-4">
								<div className="flex justify-between">
									<span className="text-muted-foreground text-sm">{t('onboarding.review.connectionModeLabel')}</span>
									<span className="text-sm font-medium">
										{values.connectionMode ? enumLabel('ConnectionMode', values.connectionMode) : '—'}
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground text-sm">{t('onboarding.review.targetLabel')}</span>
									<span className="text-sm font-medium">{values.platform ? t(TARGET_COPY[values.platform].name) : '—'}</span>
								</div>

								{(values.platform === IntegrationPlatformEnum.SHOPIFY || values.platform === IntegrationPlatformEnum.TICTO) && (
									<div className="flex flex-col gap-2 border-t pt-3">
										<span className="text-muted-foreground text-sm">{t('onboarding.review.credentialsLabel')}</span>

										{values.platform === IntegrationPlatformEnum.SHOPIFY && (
											<>
												<div className="flex justify-between">
													<span className="text-sm">{t('onboarding.shopifyCredentials.shopDomain')}</span>
													<span className="font-mono text-sm">{values.credentials?.shopDomain || '—'}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-sm">{t('onboarding.shopifyCredentials.clientId')}</span>
													<span className="font-mono text-sm">{values.credentials?.clientId || '—'}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-sm">{t('onboarding.shopifyCredentials.clientSecret')}</span>
													<span className="font-mono text-sm">{maskSecret(values.credentials?.clientSecret)}</span>
												</div>
											</>
										)}

										{values.platform === IntegrationPlatformEnum.TICTO && (
											<>
												<div className="flex justify-between">
													<span className="text-sm">{t('onboarding.tictoCredentials.storeAlias')}</span>
													<span className="font-mono text-sm">{values.credentials?.storeAlias || '—'}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-sm">{t('onboarding.tictoCredentials.token')}</span>
													<span className="font-mono text-sm">{maskSecret(values.credentials?.token)}</span>
												</div>
												<div className="flex justify-between">
													<span className="text-sm">{t('onboarding.tictoCredentials.secretKey')}</span>
													<span className="font-mono text-sm">{maskSecret(values.credentials?.secretKey)}</span>
												</div>
											</>
										)}
									</div>
								)}
							</Card>

							<div className="flex justify-between">
								<div>
									{onBack && (
										<Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
											<IconArrowLeft className="mr-1 size-4" />
											{t('common.back')}
										</Button>
									)}
								</div>
								<Button type="button" onClick={onFinish} disabled={isSubmitting || !canFinish}>
									{isSubmitting && <Spinner className="mr-2" />}
									{t('onboarding.review.connectCta')}
								</Button>
							</div>
						</>
					)
				}}
			</form.Subscribe>
		</div>
	)
}
