/**
 * One typed token per native-capability PORT. Tokens are the DI keys the
 * environments bind and the hooks resolve — the frontend analogue of the
 * backend's abstract-class tokens in each context's registry.ts.
 */
import { token } from './core/token'
import type { AutostartService } from './AutostartService/AutostartService'
import type { BadgeService } from './BadgeService/BadgeService'
import type { FilePickerService } from './FilePickerService/FilePickerService'
import type { HostInfoService } from './HostInfoService/HostInfoService'
import type { NotificationService } from './NotificationService/NotificationService'
import type { SecretsService } from './SecretsService/SecretsService'

export const FilePickerToken = token<FilePickerService>('FilePickerService')
export const NotificationToken = token<NotificationService>('NotificationService')
export const BadgeToken = token<BadgeService>('BadgeService')
export const SecretsToken = token<SecretsService>('SecretsService')
export const AutostartToken = token<AutostartService>('AutostartService')
export const HostInfoToken = token<HostInfoService>('HostInfoService')
