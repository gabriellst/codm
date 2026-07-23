/**
 * Browser platform binding — dev server / e2e / any plain tab. Every service
 * degrades HONESTLY: no fake paths, no silent security downgrade pretending to
 * be a keychain. Loaded via dynamic import by the NativeProvider binding.
 */
import type { NativeServices } from '../../contract'
import { BrowserAutostartService } from './services/BrowserAutostartService'
import { BrowserBadgeService } from './services/BrowserBadgeService'
import { BrowserDialogService } from './services/BrowserDialogService'
import { BrowserHostInfoService } from './services/BrowserHostInfoService'
import { BrowserNotificationService } from './services/BrowserNotificationService'
import { BrowserSecretsService } from './services/BrowserSecretsService'

export function createBrowserServices(): NativeServices {
	return {
		dialog: new BrowserDialogService(),
		notification: new BrowserNotificationService(),
		badge: new BrowserBadgeService(),
		secrets: new BrowserSecretsService(),
		autostart: new BrowserAutostartService(),
		hostInfo: new BrowserHostInfoService(),
	}
}
