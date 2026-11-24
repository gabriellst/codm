import { z } from 'zod/v4'

/**
 * NO EVAL UNDER THE PANEL'S CSP (`script-src 'self'`). Zod 4 probes `new Function("")` when it BUILDS an object
 * schema, to decide whether to JIT-compile its parser; the probe is caught, but the browser still reports a CSP
 * violation for it (measured on the built bundle: one `script-src eval`). The schemas the panel runs (form
 * fields, the SDK's) are small — the interpreted path is the right one here.
 *
 * Its own module, imported FIRST by `main.tsx`: the SDK builds its schemas while it is being imported, so the
 * switch has to be thrown before any of them exists.
 */
z.config({ jitless: true })
