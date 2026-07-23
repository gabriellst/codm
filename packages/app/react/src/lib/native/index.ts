import { browserShell } from './browser'
import { isTauri } from './isTauri'
import { tauriShell } from './tauri'
import type { NativeShell } from './types'

/**
 * The NativeShell seam — single entry point for OS integration.
 *
 * Import `native` (or `useNative()` semantics via plain import — the selection is
 * static per page load) anywhere in the console; NEVER import `./tauri` /
 * `./browser` directly outside this folder, and NEVER import `@tauri-apps/*`
 * outside `lib/native/` (eslint-enforced — see .claude/skills/desktop-shell/).
 */
export const native: NativeShell = isTauri() ? tauriShell : browserShell

export { isTauri } from './isTauri'
export type { NativeShell } from './types'
