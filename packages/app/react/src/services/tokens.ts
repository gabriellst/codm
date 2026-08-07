/**
 * One typed token per native-capability PORT. Tokens are the DI keys the per-env
 * registry records bind (to classes) and the hooks resolve — the frontend analogue
 * of the backend's abstract-class tokens in each context's registry.ts.
 */
import { token } from './core/token'
import type { AutostartService } from './AutostartService/AutostartService'
import type { BadgeService } from './BadgeService/BadgeService'
import type { CloudSessionService } from './CloudSessionService/CloudSessionService'
import type { FilePickerService } from './FilePickerService/FilePickerService'
import type { HostInfoService } from './HostInfoService/HostInfoService'
import type { LoggingService } from './LoggingService/LoggingService'
import type { NotificationService } from './NotificationService/NotificationService'
import type { SecretsService } from './SecretsService/SecretsService'
import type { SupervisionService } from './SupervisionService/SupervisionService'
import type { UpdateService } from './UpdateService/UpdateService'

export const FilePickerToken = token<FilePickerService>('FilePickerService')
export const NotificationToken = token<NotificationService>('NotificationService')
export const BadgeToken = token<BadgeService>('BadgeService')
export const SecretsToken = token<SecretsService>('SecretsService')
export const AutostartToken = token<AutostartService>('AutostartService')
export const HostInfoToken = token<HostInfoService>('HostInfoService')
export const SupervisionToken = token<SupervisionService>('SupervisionService')
export const CloudSessionToken = token<CloudSessionService>('CloudSessionService')
export const LoggingToken = token<LoggingService>('LoggingService')
export const UpdateToken = token<UpdateService>('UpdateService')
