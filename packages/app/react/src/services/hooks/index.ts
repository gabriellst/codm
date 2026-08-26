import { useEffect, useState } from 'react'
import type { Token } from '../core/token'
import { useContainer } from '../providers/ServicesProvider'
import {
	AutostartToken,
	BadgeToken,
	CloudSessionToken,
	FilePickerToken,
	HostInfoToken,
	LoggingToken,
	NotificationToken,
	AnalyticsToken,
	SecretsToken,
	SupervisionToken,
	UpdateToken,
	SystemPreconditionsToken,
	WindowToken,
} from '../tokens'
import type { AutostartService } from '../AutostartService/AutostartService'
import type { BadgeService } from '../BadgeService/BadgeService'
import type { CloudSessionService } from '../CloudSessionService/CloudSessionService'
import type { FilePickerService } from '../FilePickerService/FilePickerService'
import type { HostInfoService } from '../HostInfoService/HostInfoService'
import type { LoggingService } from '../LoggingService/LoggingService'
import type { NotificationService } from '../NotificationService/NotificationService'
import type { AnalyticsService } from '../AnalyticsService/AnalyticsService'
import type { SystemPreconditionsService } from '../SystemPreconditionsService/SystemPreconditionsService'
import type { SecretsService } from '../SecretsService/SecretsService'
import type { SupervisionService } from '../SupervisionService/SupervisionService'
import type { UpdateService } from '../UpdateService/UpdateService'
import type { WindowChrome, WindowService } from '../WindowService/WindowService'

/** Resolve any service by its token from the bound Container. Throws outside the provider. */
export function useService<T>(t: Token<T>): T {
	return useContainer().resolve(t)
}

/** Typed capability hooks — the everyday surface; components consume PORTS, never a platform class. */
export const useFilePicker = (): FilePickerService => useService(FilePickerToken)
export const useNotification = (): NotificationService => useService(NotificationToken)
export const useBadge = (): BadgeService => useService(BadgeToken)
export const useSecrets = (): SecretsService => useService(SecretsToken)
export const useAutostart = (): AutostartService => useService(AutostartToken)
export const useHostInfo = (): HostInfoService => useService(HostInfoToken)
export const useSupervision = (): SupervisionService => useService(SupervisionToken)
export const useCloudSession = (): CloudSessionService => useService(CloudSessionToken)
export const useLogging = (): LoggingService => useService(LoggingToken)
export const useUpdate = (): UpdateService => useService(UpdateToken)
export const useAnalytics = (): AnalyticsService => useService(AnalyticsToken)
export const useSystemPreconditions = (): SystemPreconditionsService => useService(SystemPreconditionsToken)
export const useWindow = (): WindowService => useService(WindowToken)

/**
 * O chrome desta janela, resolvido — o PULL de `WindowService.chrome()` com cancelamento no
 * unmount (mesma disciplina de `UpdateReadyPill`). `null` enquanto o host não respondeu: quem
 * consome decide o que desenhar nesse instante SEM adivinhar a plataforma (AppChrome espelha a
 * faixa dos dois lados, então a resposta tardia nunca move o centro). O nome da variável local
 * evita o global `window` de propósito.
 */
export function useWindowChrome(): WindowChrome | null {
	const windowService = useWindow()
	const [chrome, setChrome] = useState<WindowChrome | null>(null)

	useEffect(() => {
		let cancelled = false
		void windowService.chrome().then(value => {
			if (!cancelled) setChrome(value)
		})
		return () => {
			cancelled = true
		}
	}, [windowService])

	return chrome
}
