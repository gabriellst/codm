import type { Bindings } from '../core/container'
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
import { TauriAutostartService } from '../AutostartService/TauriAutostartService'
import { TauriBadgeService } from '../BadgeService/TauriBadgeService'
import { TauriCloudSessionService } from '../CloudSessionService/TauriCloudSessionService'
import { TauriFilePickerService } from '../FilePickerService/TauriFilePickerService'
import { TauriHostInfoService } from '../HostInfoService/TauriHostInfoService'
import { TauriLoggingService } from '../LoggingService/TauriLoggingService'
import { TauriNotificationService } from '../NotificationService/TauriNotificationService'
import { AnalyticsServiceImpl } from '../AnalyticsService'
import { TauriSystemPreconditionsService } from '../SystemPreconditionsService/TauriSystemPreconditionsService'
import { TauriSecretsService } from '../SecretsService/TauriSecretsService'
import { TauriSupervisionService } from '../SupervisionService/TauriSupervisionService'
import { TauriUpdateService } from '../UpdateService/TauriUpdateService'
import { TauriWindowService } from '../WindowService/TauriWindowService'

/**
 * Tauri composition root — the desktop webview. DECLARATIVE: a record of
 * `[Token, Class]` references, ZERO `new` (the Container constructs). This module
 * (with the Tauri*Service files and services/utils/tauri/) is the ONLY place the
 * tauri runtime is reachable. Loaded via dynamic import (see registry/index.ts),
 * so the browser bundle never pulls this chunk — that async boundary is the code-split.
 */
export default [
	[FilePickerToken, TauriFilePickerService],
	[NotificationToken, TauriNotificationService],
	[BadgeToken, TauriBadgeService],
	[SecretsToken, TauriSecretsService],
	[AutostartToken, TauriAutostartService],
	[HostInfoToken, TauriHostInfoService],
	[SupervisionToken, TauriSupervisionService],
	[CloudSessionToken, TauriCloudSessionService],
	[LoggingToken, TauriLoggingService],
	[UpdateToken, TauriUpdateService],
	[SystemPreconditionsToken, TauriSystemPreconditionsService],
	[AnalyticsToken, AnalyticsServiceImpl],
	[WindowToken, TauriWindowService],
] as const satisfies Bindings
