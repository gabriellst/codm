/**
 * OS file-picker capability — folder/file pickers. PORT (interface) only: platform
 * implementations are the colocated {Tauri,Browser}FilePickerService in this folder,
 * bound per environment in services/environments and injected by the ServicesProvider.
 */
export interface FilePickerService {
	/**
	 * True when the host picker can hand back an ABSOLUTE filesystem path.
	 * UI branches on THIS (capability), never on the platform name — when false,
	 * keep the manual path input as the only affordance.
	 */
	supportsFolderPicker(): Promise<boolean>

	/**
	 * Open the OS folder picker and resolve the ABSOLUTE path of the chosen
	 * directory, or null when the user cancels or the host has no path-capable
	 * picker (browser: File System Access handles carry no fs path — honest null).
	 */
	pickFolder(options?: { title?: string }): Promise<string | null>
}
