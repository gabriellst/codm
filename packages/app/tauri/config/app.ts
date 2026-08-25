/**
 * Desktop APP config — identity + console wiring, owned by the shell package (was `REPO.desktop`,
 * minus the window/capabilities/sidecars which live in their own files in this folder). The only
 * things read from the abstract contract (template.config.ts) are `REPO.brand` (identity) and the
 * `WorkspaceId` union (the console is one of the repo's workspaces).
 *
 * `./generate.ts` renders these into `src-tauri/tauri.conf.json` (productName, identifier, the
 * build/devUrl block, CSP connect-src). The keychain service name is read back at RUNTIME from
 * `app.config().identifier` — no generated const.
 */
import { REPO, type WorkspaceId } from '../../../../template.config'

/** OS-facing display name (window title, productName). The ONE place the cased brand spelling
 *  lives — REPO.brand stays the lowercase token, so this is a deliberate literal, not derived. */
// Grafia da marca: "CoDM" — a única usada no redesign (2026-08-07), e a que o lockup da sidebar
// mostra ao lado do símbolo. Era 'CODM' (tudo maiúsculo), herança do rebrand de julho.
export const DISPLAY_NAME = REPO.brandDisplay

/** Reverse-DNS bundle identifier — DERIVED from brand. Rendered into tauri.conf.json `identifier`;
 *  the shell reads it back at runtime (`app.config().identifier`) as the keychain service name. */
export const IDENTIFIER = `app.${REPO.brand}.desktop`

/** Console (webview content) wiring — which workspace renders inside the shell. */
export const CONSOLE = {
	workspace: 'appReact',
	/** Dev-server port key (REPO.env) + path the console mounts under in WEB dev (nitro on,
	 *  base '/app/'). This is the browser mount — NOT what the desktop webview loads. */
	devPortEnvKey: 'VITE_PORT',
	devPath: '/app/',
	/** Desktop dev: the nx target that serves the console as a root-based SPA
	 *  (`CODM_DESKTOP=true vite --host` → nitro OFF, base '/', VITE_PORT). Symmetric to
	 *  `buildTarget`'s build-spa. The shell's beforeDevCommand runs THIS, not `dev`. */
	devTarget: 'dev-spa',
	/** Base path the tauri webview loads in dev. The desktop SPA serves at root '/' (dev-spa /
	 *  build-spa set base '/'), so devUrl is the ROOT — not the web '/app/' mount. Declared
	 *  explicitly rather than derived, so the generator never hardcodes a convention. */
	devBasePath: '/',
	/** SPA output inside the console workspace (produced by `buildTarget`). */
	distSubpath: 'dist/client',
	buildTarget: 'build-spa',
	/** Sidecar roles the webview talks to DIRECTLY (CSP connect-src derives from this —
	 *  the gateway is reached through the daemon proxy, so it is not listed). Roles resolve
	 *  against the package sidecar manifest (./sidecars.ts). */
	connectsTo: ['daemon'],
} as const satisfies {
	workspace: WorkspaceId
	devPortEnvKey: string
	devPath: string
	devTarget: string
	devBasePath: string
	distSubpath: string
	buildTarget: string
	connectsTo: readonly string[]
}
