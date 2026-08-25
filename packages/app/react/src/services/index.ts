/**
 * Client-side services — public surface. Components import capability hooks from
 * here; the ServicesProvider (mounted in routes/__root.tsx) owns the Container and
 * the environment binding. Concrete platform classes are NEVER exported — only the
 * ports (types), the tokens, the hooks, and the provider.
 *
 * Structure:
 *   core/         Container + Token (decorator-free DI primitives)
 *   tokens.ts     one token per port
 *   <Name>Service/  port interface + {Tauri,Browser}<Name>Service impls (colocated)
 *   registry/     per-env DECLARATIVE `[Token, Class]` records (browser | tauri | test) — ZERO `new`
 *   providers/    ServicesProvider (composition root)
 *   hooks/        useService + typed capability hooks
 */
export { Container } from './core/container'
export type { Bindings, Ctor } from './core/container'
export type { Token } from './core/token'
export type { Environment } from './registry'
export { detectEnvironment, ENVIRONMENTS } from './registry'
export {
	useAutostart,
	useBadge,
	useCloudSession,
	useFilePicker,
	useHostInfo,
	useLogging,
	useNotification,
	useAnalytics,
	useSystemPreconditions,
	useSecrets,
	useService,
	useSupervision,
	useUpdate,
} from './hooks'
export { ServicesProvider, useContainer } from './providers/ServicesProvider'
export {
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
} from './tokens'

// Port types — for consumers that need to annotate against a capability contract.
export type { AutostartService } from './AutostartService/AutostartService'
export type { BadgeService } from './BadgeService/BadgeService'
export { CLOUD_DEVICE_TOKEN_SECRET_KEY } from './CloudSessionService/CloudSessionService'
export type { CloudSessionService } from './CloudSessionService/CloudSessionService'
export type { FilePickerService } from './FilePickerService/FilePickerService'
export type { HostInfoService, NativePlatform } from './HostInfoService/HostInfoService'
export type { LoggingService } from './LoggingService/LoggingService'
export type { NotificationService } from './NotificationService/NotificationService'
export type { AnalyticsService } from './AnalyticsService/AnalyticsService'
export { SYSTEM_PRECONDITION_IDS } from './SystemPreconditionsService/SystemPreconditionsService'
export type {
	SystemPreconditionId,
	SystemPreconditionStatus,
	SystemPreconditionsService,
	RepairAvailability,
} from './SystemPreconditionsService/SystemPreconditionsService'
export type { SecretsService } from './SecretsService/SecretsService'
export type { SupervisedSidecar, SupervisionService, SupervisionState } from './SupervisionService/SupervisionService'
export type { UpdateService } from './UpdateService/UpdateService'
