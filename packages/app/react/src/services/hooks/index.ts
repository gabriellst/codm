import type { Token } from '../core/token'
import { useContainer } from '../providers/ServicesProvider'
import { AutostartToken, BadgeToken, FilePickerToken, HostInfoToken, NotificationToken, SecretsToken } from '../tokens'
import type { AutostartService } from '../AutostartService/AutostartService'
import type { BadgeService } from '../BadgeService/BadgeService'
import type { FilePickerService } from '../FilePickerService/FilePickerService'
import type { HostInfoService } from '../HostInfoService/HostInfoService'
import type { NotificationService } from '../NotificationService/NotificationService'
import type { SecretsService } from '../SecretsService/SecretsService'

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
