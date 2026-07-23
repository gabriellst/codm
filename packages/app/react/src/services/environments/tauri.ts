import type { Container } from '../core/container'
import { AutostartToken, BadgeToken, FilePickerToken, HostInfoToken, NotificationToken, SecretsToken } from '../tokens'
import { TauriAutostartService } from '../AutostartService/TauriAutostartService'
import { TauriBadgeService } from '../BadgeService/TauriBadgeService'
import { TauriFilePickerService } from '../FilePickerService/TauriFilePickerService'
import { TauriHostInfoService } from '../HostInfoService/TauriHostInfoService'
import { TauriNotificationService } from '../NotificationService/TauriNotificationService'
import { TauriSecretsService } from '../SecretsService/TauriSecretsService'

/**
 * Tauri composition root — the desktop webview. This module (with the Tauri*Service
 * files and services/utils/tauri/) is the ONLY place `new Tauri*Service()` and the
 * tauri runtime are allowed. Loaded via dynamic import (see environments/index.ts),
 * so the browser bundle never pulls this chunk — that async boundary is the code-split.
 */
export const registerTauri = (c: Container): void => {
	c.register(FilePickerToken, () => new TauriFilePickerService())
	c.register(NotificationToken, () => new TauriNotificationService())
	c.register(BadgeToken, () => new TauriBadgeService())
	c.register(SecretsToken, () => new TauriSecretsService())
	c.register(AutostartToken, () => new TauriAutostartService())
	c.register(HostInfoToken, () => new TauriHostInfoService())
}
