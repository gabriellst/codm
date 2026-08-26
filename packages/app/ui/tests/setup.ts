import { GlobalRegistrator } from '@happy-dom/global-registrator'

/**
 * A DOM for this package's own colocated tests, registered as a bun PRELOAD (`bunfig.toml`) so it
 * exists before any module — React's included — is evaluated. `virtual-list.test.tsx` mounts a real
 * tree via `react-dom/client`'s `createRoot`, which reads `document` at import time.
 *
 * Scoped-down sibling of `packages/app/react/tests/setup.ts`: this package has no tsyringe-neo
 * decorators to polyfill and no integration harness port to pin, so only the DOM registration and
 * the `act()` environment flag travel here.
 */
GlobalRegistrator.register()

/**
 * React only runs `act()` for real when it is told it is in a test environment; without this it warns
 * "the current testing environment is not configured to support act(...)" and does NOT flush effects.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
