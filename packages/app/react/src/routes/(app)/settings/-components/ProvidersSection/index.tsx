import { useTranslation } from 'react-i18next'
import { useDetectProviders } from '@codedm/client-typescript/typescript'
import { enumLabel } from '@/lib'
import { providerGlyph, providerLabel } from '@/components/console/glyphs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

/** Detected agent-provider CLIs with binary path, version and install status. */
export function ProvidersSection() {
	const { t } = useTranslation()
	const { data, isLoading } = useDetectProviders()
	const providers = data?.providers ?? []

	return (
		<section className="flex flex-col gap-3">
			<h2 className="label-eyebrow">{t('settings.agentProviders')}</h2>
			{isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-14 rounded-2xl" />
					<Skeleton className="h-14 rounded-2xl" />
				</div>
			) : (
				<div className="flex flex-col gap-1">
					{providers.map(provider => {
						const Glyph = providerGlyph[provider.name]
						const detected = provider.status === 'DETECTED'
						const path = provider.binaryPath ?? t('settings.providerNotFound')
						return (
							<div key={provider.name} className="flex items-center gap-4 rounded-2xl px-2 py-3">
								<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
									<Glyph className="size-5" />
								</span>
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="font-semibold text-foreground">{providerLabel[provider.name]}</span>
									<span className="truncate font-mono text-xs text-muted-foreground">
										{path}
										{provider.version ? ` · v${provider.version}` : ''}
									</span>
								</div>
								<Badge variant={detected ? 'secondary' : 'outline'}>{enumLabel('ProviderStatus', provider.status)}</Badge>
							</div>
						)
					})}
				</div>
			)}
		</section>
	)
}
