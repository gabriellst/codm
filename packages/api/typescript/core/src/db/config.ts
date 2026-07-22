import { defineConfig, type Config as DrizzleKitConfig } from 'drizzle-kit'
import { config as loadDotenv } from 'dotenv'

export interface DrizzleConfigOptions {
	/** Path to a `.env` file to load before reading `DATABASE_URL`. Optional. */
	envFile?: string
	/** Directory (or glob) containing Drizzle schema files. */
	schema: string
	/** Output directory for generated migrations. */
	out: string
	/** Fallback DATABASE_URL when `process.env.DATABASE_URL` is unset. */
	databaseUrl?: string
}

/**
 * Build a drizzle-kit config for an app. Framework-level helper so apps don't have to
 * re-derive the boilerplate; pass in app-specific `schema`/`out`/`envFile`.
 */
export function createDrizzleConfig(options: DrizzleConfigOptions): DrizzleKitConfig {
	if (options.envFile) {
		loadDotenv({ path: options.envFile })
	}

	return defineConfig({
		dialect: 'postgresql',
		schema: options.schema,
		out: options.out,
		dbCredentials: {
			url: process.env.DATABASE_URL ?? options.databaseUrl ?? 'postgresql://postgres:postgres@localhost:5432/postgres',
		},
	})
}
