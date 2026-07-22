import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@template/contracts/db'

export abstract class DrizzleClient extends NodePgDatabase<typeof schema> {}
