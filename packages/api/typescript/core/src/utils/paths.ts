import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

// Derives paths relative to this file's location at compile/runtime.
// Source layout: packages/api/typescript/core/src/utils/paths.ts → API_ROOT = packages/api/typescript/.
// Bundled layout: packages/api/typescript/dist/server.js → API_ROOT = packages/api/typescript/.
const __dirname = dirname(fileURLToPath(import.meta.url))
const isBundled = __dirname.endsWith(`${'/'}dist`) || __dirname.endsWith(`${'\\'}dist`)

export const API_ROOT = isBundled ? resolve(__dirname, '..') : resolve(__dirname, '../../..')
export const MONOREPO_ROOT = resolve(API_ROOT, '../../..')

export const ROOT_ENV = join(MONOREPO_ROOT, '.env')
export const API_SRC = join(API_ROOT, 'src')
export const API_PUBLIC = join(API_ROOT, 'public')
export const API_SCRIPTS = join(API_ROOT, 'scripts')
export const API_OPENAPI_SPEC = join(API_PUBLIC, 'docs/openapi.json')
export const DRIZZLE_DIR = join(API_SRC, 'shared/db/drizzle')
export const MIGRATIONS_DIR = join(DRIZZLE_DIR, 'migrations')

export const CLIENT_ROOT = join(MONOREPO_ROOT, 'packages/client')
export const APP_ROOT = join(MONOREPO_ROOT, 'packages/app')
