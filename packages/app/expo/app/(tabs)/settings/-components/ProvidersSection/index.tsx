import { ActivityIndicator, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useDetectProviders } from '@codedm/client-typescript/typescript'
import { Chip, providerGlyph, providerLabelKey, providerStatusLabelKey } from '@/components/console'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { fg } from '@/lib/tokens'

/** Detected agent-provider CLIs with binary path, version and install status. */
export function ProvidersSection() {
	const { t } = useTranslation()
	const { data, isLoading } = useDetectProviders()
	const providers = data?.providers ?? []

	return (
		<View className="gap-3">
			<Eyebrow>{t('settings.agentProviders')}</Eyebrow>
			{isLoading && !data ? (
				<View className="items-center py-8">
					<ActivityIndicator color={fg.fg0} />
				</View>
			) : (
				<View className="gap-1">
					{providers.map(provider => {
						const Glyph = providerGlyph[provider.name]
						const detected = provider.status === 'DETECTED'
						const path = provider.binaryPath ?? 'not found in PATH'
						return (
							<View key={provider.name} className="flex-row items-center gap-4 py-3">
								<View className="h-11 w-11 items-center justify-center rounded-pill bg-secondary">
									<Glyph size={20} color={fg.fg0} strokeWidth={2} />
								</View>
								<View className="min-w-0 flex-1">
									<Text className="font-sans-semi text-sm text-foreground">{t(providerLabelKey(provider.name))}</Text>
									<Text numberOfLines={1} className="font-mono text-xs text-muted-foreground">
										{path}
										{provider.version ? ` · v${provider.version}` : ''}
									</Text>
								</View>
								<Chip tone={detected ? 'soft' : 'outline'} label={t(providerStatusLabelKey(provider.status))} />
							</View>
						)
					})}
				</View>
			)}
		</View>
	)
}
