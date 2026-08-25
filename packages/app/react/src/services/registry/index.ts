import type { Bindings } from '../core/container'
import { isTauri } from '../utils/tauri/isTauri'

/** The runtime-detectable hosts. `test` is deliberately excluded — tests wire it by hand. */
export type Environment = 'browser' | 'tauri'

/**
 * env → lazy loader of that env's DECLARATIVE bindings record. The DYNAMIC import is
 * the code-split boundary: only the chosen env's chunk (and, for tauri, its @tauri
 * runtime touchpoints) is ever fetched — the browser entry never inlines the tauri
 * chunk and vice versa. Each module default-exports a `[Token, Class]` record; the
 * ServicesProvider hands it to `Container.load` and the container does the `new`.
 */
export const ENVIRONMENTS: Record<Environment, () => Promise<Bindings>> = {
	browser: () => import('./browser').then(m => m.default),
	tauri: () => import('./tauri').then(m => m.default),
}

/**
 * Pick the environment ONCE at bootstrap. `VITE_FORCE_ENV` overrides detection
 * (e2e/storybook/dev pinning); otherwise the tauri webview is detected by its
 * injected globals and everything else is a browser tab.
 */
export const detectEnvironment = (): Environment =>
	(import.meta.env.VITE_FORCE_ENV as Environment | undefined) ?? (isTauri() ? 'tauri' : 'browser')
