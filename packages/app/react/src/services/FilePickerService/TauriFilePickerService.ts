import { open } from '@tauri-apps/plugin-dialog'
import type { FilePickerService } from './FilePickerService'

/** Folder picker via the typed tauri plugin-dialog `open()` API. The `dialog:allow-open`
 *  permission derives from REPO.desktop.capabilities.filePicker → CAPABILITY_PERMISSIONS
 *  (@codedm/app-tauri/capabilities); capabilities/default.json is generated. */
export class TauriFilePickerService implements FilePickerService {
	async supportsFolderPicker(): Promise<boolean> {
		return true
	}

	async pickFolder(options?: { title?: string }): Promise<string | null> {
		const selected = await open({ directory: true, multiple: false, title: options?.title })
		return Array.isArray(selected) ? (selected[0] ?? null) : selected
	}
}
