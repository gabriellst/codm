import { useEffect, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useGetSettings } from '@codedm/client-typescript/typescript'
import { ConsoleButton, ListCard } from '@/components/console'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { clearStoredDaemonUrl, getEffectiveDaemonUrl, resolveDefaultDaemonUrl, setStoredDaemonUrl } from '@/lib/daemon'
import { resetOnboarding } from '@/lib/onboarding'
import { border, fg } from '@/lib/tokens'

/** General preferences: operator identity, the local-daemon connection, and app info. */
export function GeneralSection() {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data } = useGetSettings()

	const [url, setUrl] = useState('')
	const [dirty, setDirty] = useState(false)
	const [saved, setSaved] = useState(false)

	useEffect(() => {
		void getEffectiveDaemonUrl().then(setUrl)
	}, [])

	const save = async () => {
		await setStoredDaemonUrl(url)
		await queryClient.invalidateQueries()
		setDirty(false)
		setSaved(true)
	}

	const reset = async () => {
		await clearStoredDaemonUrl()
		const fallback = resolveDefaultDaemonUrl()
		setUrl(fallback)
		await queryClient.invalidateQueries()
		setDirty(false)
		setSaved(true)
	}

	const replay = async () => {
		await resetOnboarding()
		router.replace('/onboarding')
	}

	const rows = [
		{ label: t('settings.operatorName'), value: data?.general.operatorName, mono: false },
		{ label: t('settings.timezone'), value: data?.general.timezone, mono: false },
		{ label: t('settings.dataDir'), value: data?.general.dataDir, mono: true },
		{ label: t('settings.appVersion'), value: data?.appVersion, mono: false },
	]

	return (
		<View className="gap-6">
			{/* Daemon connection — operator-local client state persisted in SecureStore. */}
			<View className="gap-3">
				<View className="gap-1">
					<Eyebrow>{t('settings.connection')}</Eyebrow>
					<Text className="font-sans text-sm text-muted-foreground">{t('settings.connectionHint')}</Text>
				</View>
				<TextInput
					value={url}
					onChangeText={next => {
						setUrl(next)
						setDirty(true)
						setSaved(false)
					}}
					placeholder={t('settings.daemonUrlPlaceholder')}
					placeholderTextColor={fg.fg3}
					autoCapitalize="none"
					autoCorrect={false}
					keyboardType="url"
					className="rounded-lg border bg-card px-4 py-3 font-mono text-sm text-foreground"
					style={{ borderColor: border.border }}
				/>
				<View className="flex-row gap-2">
					<ConsoleButton size="sm" label={t('settings.saveConnection')} disabled={!dirty || !url.trim()} onPress={save} />
					<ConsoleButton size="sm" variant="outline" label={t('settings.resetConnection')} onPress={reset} />
					{saved ? <Text className="self-center font-sans text-xs text-success">{t('settings.connectionSaved')}</Text> : null}
				</View>
			</View>

			{/* Read-only general info from the daemon. */}
			<View className="gap-3">
				<Eyebrow>{t('settings.general')}</Eyebrow>
				<ListCard>
					{rows.map((row, i) => (
						<View key={row.label} className={`flex-row items-center justify-between gap-4 p-4 ${i === 0 ? '' : 'border-t border-border'}`}>
							<Text className="font-sans-medium text-sm text-foreground">{row.label}</Text>
							<Text numberOfLines={1} className={row.mono ? 'flex-1 text-right font-mono text-xs text-muted-foreground' : 'text-right font-sans text-sm text-muted-foreground'}>
								{row.value ?? '—'}
							</Text>
						</View>
					))}
				</ListCard>
			</View>

			<ConsoleButton variant="outline" label={t('settings.replayOnboarding')} onPress={replay} />
		</View>
	)
}
