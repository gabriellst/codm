import type { Container } from '../core/container'
import { AutostartToken, BadgeToken, FilePickerToken, HostInfoToken, NotificationToken, SecretsToken } from '../tokens'
import { BrowserAutostartService } from '../AutostartService/BrowserAutostartService'
import { BrowserBadgeService } from '../BadgeService/BrowserBadgeService'
import { BrowserFilePickerService } from '../FilePickerService/BrowserFilePickerService'
import { BrowserHostInfoService } from '../HostInfoService/BrowserHostInfoService'
import { BrowserNotificationService } from '../NotificationService/BrowserNotificationService'
import { BrowserSecretsService } from '../SecretsService/BrowserSecretsService'

/**
 * Browser composition root — dev server / e2e / any plain tab. This module is the
 * ONLY place `new Browser*Service()` is allowed; it is loaded via dynamic import
 * (see environments/index.ts) so the tauri bundle never pulls the browser chunk.
 */
export const registerBrowser = (c: Container): void => {
	c.register(FilePickerToken, () => new BrowserFilePickerService())
	c.register(NotificationToken, () => new BrowserNotificationService())
	c.register(BadgeToken, () => new BrowserBadgeService())
	c.register(SecretsToken, () => new BrowserSecretsService())
	c.register(AutostartToken, () => new BrowserAutostartService())
	c.register(HostInfoToken, () => new BrowserHostInfoService())
}
