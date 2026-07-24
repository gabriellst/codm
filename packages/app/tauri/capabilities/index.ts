/**
 * CAPABILITY → Tauri permissions map — owned by the desktop shell package.
 *
 * The abstract contract (`template.config.ts` REPO.desktop.capabilities) holds ONLY
 * platform-agnostic capability keys — the shell package knows how each capability maps
 * to Tauri's permission grammar. `scripts/desktop/generate.ts` imports THIS map to render
 * `src-tauri/capabilities/default.json` (fail-loud on a capability with no mapping), so the
 * permission vocabulary lives next to the shell that grants it, not in the abstract contract.
 *
 * Lifted verbatim from the old `REPO.desktop.services` map — behavior-preserving:
 * `capabilities/default.json` is byte-identical, only re-sourced. Adding a native capability
 * means adding a key here + listing the key in REPO.desktop.capabilities, then regenerating.
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
