import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where the cloud panel's React bundle lives at runtime (spec 2026-11-24 §6).
 *
 * Inside the bundle (`bun build --outfile dist/server.js`) the bundler rewrites `import.meta.url` to the OUTPUT
 * file, so this resolves to `dist/panel-web` — where `scripts/build.ts` stages `packages/app/react/dist-panel`
 * (pinned by the `build-output` rail, which reads the suffix below). Read with `node:fs`: the image runs on Node.
 */
export const panelWebDir = join(dirname(fileURLToPath(import.meta.url)), 'panel-web')

/**
 * Running the cloud profile FROM SOURCE (`dev:cloud`): the same module sits in `src/panel/services/PanelWebBundle`,
 * and the bundle is wherever the app's panel build put it — `packages/app/react/dist-panel`.
 */
export const panelWebSourceDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../app/react/dist-panel')
