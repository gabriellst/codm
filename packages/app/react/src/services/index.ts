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
	useFilePicker,
	useHostInfo,
	useNotification,
	useSecrets,
	useService,
} from './hooks'
export { ServicesProvider, useContainer } from './providers/ServicesProvider'
export {
	AutostartToken,
	BadgeToken,
	FilePickerToken,
	HostInfoToken,
	NotificationToken,
	SecretsToken,
} from './tokens'

// Port types — for consumers that need to annotate against a capability contract.
export type { AutostartService } from './AutostartService/AutostartService'
export type { BadgeService } from './BadgeService/BadgeService'
export type { FilePickerService } from './FilePickerService/FilePickerService'
export type { HostInfoService, NativePlatform } from './HostInfoService/HostInfoService'
export type { NotificationService } from './NotificationService/NotificationService'
export type { SecretsService } from './SecretsService/SecretsService'
