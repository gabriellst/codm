import type { FilePickerService } from '../../../contract'
import { invoke } from '../invoke'

/** Folder picker via tauri plugin-dialog (`dialog:allow-open` — declared in
 *  template.config.ts REPO.desktop.services.filePicker, capability JSON is generated). */
export class TauriFilePickerService implements FilePickerService {
	async supportsFolderPicker(): Promise<boolean> {
		return true
	}

	async pickFolder(options?: { title?: string }): Promise<string | null> {
		const selected = await invoke<string | string[] | null>('plugin:dialog|open', {
			options: { directory: true, multiple: false, title: options?.title },
		})
		if (Array.isArray(selected)) return selected[0] ?? null
		return selected
	}
}
