/**
 * The native seam — single entry point for OS integration.
 *
 * Components consume capability PORTS (contract/) through hooks bound ONCE at
 * the composition root (NativeProvider in routes/__root.tsx). Platform
 * implementations live in platforms/<name>/services/ — `@tauri-apps/*` (and the
 * tauri runtime in any form) is legal ONLY under platforms/tauri/
 * (eslint-enforced — see .claude/skills/desktop-shell/SKILL.md).
 */
export type {
	AutostartService,
	BadgeService,
	FilePickerService,
	HostInfoService,
	NativePlatform,
	NativeServices,
	NotificationService,
	SecretsService,
} from './contract'
export { NativeProvider, useFilePickerService, useNative } from './NativeProvider'
export { useFolderPicker } from './useFolderPicker'
