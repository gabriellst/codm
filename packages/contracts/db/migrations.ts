import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')
