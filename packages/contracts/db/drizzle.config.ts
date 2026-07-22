import type { Config } from 'drizzle-kit'

export default {
	schema: './db/schema/index.ts',
	out: './db/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'postgresql://template:template@localhost:5432/template',
	},
	verbose: true,
	strict: true,
} satisfies Config
