import type { DialogService } from '../../../contract'

/**
 * Browsers cannot hand a filesystem PATH to a web page (the File System Access
 * API yields handles, not paths) — and the daemon needs a real absolute path.
 * Honest degradation: `supportsFolderPicker()` is false and the UI keeps its
 * manual path input as the only affordance.
 */
export class BrowserDialogService implements DialogService {
	async supportsFolderPicker(): Promise<boolean> {
		return false
	}

	async pickFolder(): Promise<string | null> {
		return null
	}
}
