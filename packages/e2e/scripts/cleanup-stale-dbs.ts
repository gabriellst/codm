#!/usr/bin/env bun
import pg from 'pg'

const BASE_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres'
const ADMIN_DB = process.env.E2E_ADMIN_DATABASE ?? 'template1'

function withDatabase(baseUrl: string, name: string) {
	const url = new URL(baseUrl)
	url.pathname = `/${name}`
	return url.toString()
}

const client = new pg.Client({ connectionString: withDatabase(BASE_DATABASE_URL, ADMIN_DB) })
await client.connect()
try {
	const res = await client.query<{ datname: string }>("SELECT datname FROM pg_database WHERE datname LIKE 'e2e_%'")
	if (res.rowCount === 0) {
		console.log('No stale e2e databases found.')
	} else {
		for (const { datname } of res.rows) {
			console.log(`dropping ${datname}`)
			await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`)
		}
	}
} finally {
	await client.end()
}
