/**
 * NATIVE CONTRACT — platform-agnostic capability ports for everything the console
 * asks of its host (desktop shell, browser tab, future native modules).
 *
 * PURE TYPES ONLY. Nothing in `contract/` may import a platform SDK (`@tauri-apps/*`,
 * expo modules, DOM-only globals) — implementations live in `../platforms/<platform>/services/`
 * and are bound ONCE at bootstrap by the NativeProvider (see ../NativeProvider.tsx).
 * Components consume ports via `useNative()` / `useDialogService()` etc. and never know
 * which host they run in.
 *
 * EXTRACTION PATH (documented intent, founder-ratified): this folder is the future
 * `@codedm/native-contract` package — a shared home so an expo app (or any other host)
 * can implement the same ports (`platforms/expo/services/*`) against identical types.
 * It stays a folder inside lib/native until a second consumer exists: a workspace
 * package with zero external consumers would be premature weight (WORKSPACES entry,
 * create-template pruning, publish surface). When extracting: move `contract/` verbatim,
 * point this import path at the package, nothing else changes — the ports have no
 * react/browser/tauri dependency by construction.
 *
 * Rules (desktop-shell skill):
 * - One capability = one port (interface). All methods are Promise-based — bindings may
 *   resolve lazily, and remote/IPC-backed implementations stay contract-compatible.
 * - Capability, not host: UI may branch on what a port REPORTS (`supportsFolderPicker()`),
 *   never on the platform name. `HostInfoService.platform()` exists for diagnostics only.
 * - Honest degradation: an implementation that cannot deliver returns the honest value
 *   (null / false / no-op) — it never fakes success.
 */

export type { AutostartService } from './autostart'
export type { BadgeService } from './badge'
export type { DialogService } from './dialog'
export type { HostInfoService, NativePlatform } from './host-info'
export type { NotificationService } from './notification'
export type { SecretsService } from './secrets'

import type { AutostartService } from './autostart'
import type { BadgeService } from './badge'
import type { DialogService } from './dialog'
import type { HostInfoService } from './host-info'
import type { NotificationService } from './notification'
import type { SecretsService } from './secrets'

/**
 * The full set of ports a platform binding provides. A platform module
 * (`platforms/<name>/index.ts`) exports `create<Name>Services(): NativeServices`;
 * the NativeProvider injects one instance app-wide.
 *
 * NOTE: the tauri permissions each service needs are DECLARED in
 * template.config.ts `REPO.desktop.services` (capabilities/default.json is
 * generated from that map) — adding a port here that needs a shell permission
 * means extending the desktop contract, not hand-editing capability JSON.
 */
export interface NativeServices {
	dialog: DialogService
	notification: NotificationService
	badge: BadgeService
	secrets: SecretsService
	autostart: AutostartService
	hostInfo: HostInfoService
}
