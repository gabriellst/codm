/**
 * Tauri platform binding — one concrete service per contract port. This folder is
 * the ONLY place allowed to touch the tauri runtime (`invoke.ts`; `@tauri-apps/*`
 * imports are eslint-forbidden everywhere else). Loaded via dynamic import by the
 * NativeProvider binding, so the browser bundle never fetches this chunk.
 */
import type { NativeServices } from '../../contract'
import { TauriAutostartService } from './services/TauriAutostartService'
import { TauriBadgeService } from './services/TauriBadgeService'
import { TauriDialogService } from './services/TauriDialogService'
import { TauriHostInfoService } from './services/TauriHostInfoService'
import { TauriNotificationService } from './services/TauriNotificationService'
import { TauriSecretsService } from './services/TauriSecretsService'

export function createTauriServices(): NativeServices {
	return {
		dialog: new TauriDialogService(),
		notification: new TauriNotificationService(),
		badge: new TauriBadgeService(),
		secrets: new TauriSecretsService(),
		autostart: new TauriAutostartService(),
		hostInfo: new TauriHostInfoService(),
	}
}
