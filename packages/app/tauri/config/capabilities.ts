/**
 * Native capabilities — owned by the desktop shell package, colocated with the rest of the config
 * surface (this folder). Two pieces:
 *
 *  - CAPABILITIES: the ABSTRACT capability keys the react console consumes through the platform
 *    contract (packages/app/react/src/services). Platform-agnostic key names ONLY — never a Tauri
 *    permission string. (Was `REPO.desktop.capabilities`.)
 *  - CAPABILITY_PERMISSIONS: how each abstract key maps to Tauri's permission grammar. The shell
 *    package knows the mapping; the abstract list stays free of Tauri vocabulary.
 *
 * `./generate.ts` maps each CAPABILITIES key through CAPABILITY_PERMISSIONS to render
 * `src-tauri/capabilities/default.json` (fail-loud on a capability with no mapping). Adding a
 * native capability = add the key to CAPABILITIES + its permission list to CAPABILITY_PERMISSIONS,
 * then regenerate.
 *
 * Key = capability port name in the react console's service contract
 * (packages/app/react/src/services/<Name>Service). Empty list = backed by custom shell
 * commands or webview APIs (core:default covers invoke, so no extra permission is needed).
 */
export const CAPABILITY_PERMISSIONS = {
	// filePicker (contract: FilePickerService) is backed by the tauri plugin-dialog `open`
	// command — the permission name keeps the tauri plugin's own spelling (`dialog:*`).
	filePicker: ['dialog:allow-open'],
	notification: ['notification:default'],
	badge: ['core:window:allow-set-badge-count'],
	secrets: [],
	autostart: ['autostart:allow-is-enabled', 'autostart:allow-enable', 'autostart:allow-disable'],
	hostInfo: [],
} as const satisfies Record<string, readonly string[]>

export type CapabilityKey = keyof typeof CAPABILITY_PERMISSIONS

/** The abstract native capabilities the console consumes — ABSTRACT keys only, in render order.
 *  Every key MUST have a mapping in CAPABILITY_PERMISSIONS (enforced by `satisfies` + the render). */
export const CAPABILITIES = [
	'filePicker',
	'notification',
	'badge',
	'secrets',
	'autostart',
	'hostInfo',
] as const satisfies readonly CapabilityKey[]
