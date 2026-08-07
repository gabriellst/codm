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
	// SP2's device-token flow (spec Decision 4): the system browser redirects to `codm://auth?code=…`
	// after OAuth completes, and the console listens for the resulting event
	// (`@tauri-apps/plugin-deep-link` `onOpenUrl`) — that listen call is what this permission grants.
	// The scheme itself is declared in ./deeplink.ts and registered by the Rust plugin (lib.rs).
	deepLink: ['deep-link:default'],
	// CloudSessionService's `openBrowser` (SP2 Task T6) hands the OAuth sign-in URL to the OS's
	// default browser via `@tauri-apps/plugin-shell`'s `open` — the desktop shell must never render
	// the cloud's sign-in page in its OWN webview (no cookie jar to share, and it would defeat the
	// point of a system-trusted browser for the OAuth consent screen). `shell:default` is the
	// plugin's own pre-scoped permission set (allows `http(s)://`, `tel:`, `mailto:` — see
	// gen/schemas/acl-manifests.json `shell.default_permission`), which already covers the
	// `https://…/api/auth/sign-in/social` URL this capability opens.
	cloudSession: ['shell:default'],
	// The integrated title bar (AppChrome) drags the window through `data-tauri-drag-region`. That
	// attribute is INERT without this permission — verified in gen/schemas/acl-manifests.json, where
	// `core:window` declares `allow-start-dragging` but its `default` set does NOT contain it, and
	// `core:default` does not grant it either. It was missing since the title bar was introduced, so
	// dragging never worked at all. No react service backs this one: the capability is consumed by a
	// DOM attribute rather than an injected port, which is why it has no <Name>Service counterpart.
	windowDrag: ['core:window:allow-start-dragging'],
	// DIAGNOSTICABILITY (2026-08-07 incident, part 2) — `LoggingService.attachConsole()` forwards
	// the webview's own `console.*` calls to the `tauri-plugin-log` file target (src/lib.rs) via
	// the plugin's `log` invoke command. Permission verified against the plugin's own
	// `permissions/default.toml` (identifier "log", default set `["allow-log"]`) — the name keeps
	// the tauri plugin's own spelling, same convention as `filePicker`'s `dialog:*`.
	logging: ['log:default'],
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
	'windowDrag',
	'deepLink',
	'cloudSession',
	'logging',
] as const satisfies readonly CapabilityKey[]
