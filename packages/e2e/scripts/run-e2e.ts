#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MONOREPO_ROOT = resolve(E2E_ROOT, '../..')
// Schema is owned by contracts-drizzle (root `migrate:dev` delegates there).
const CONTRACTS_DIR = resolve(MONOREPO_ROOT, 'packages/contracts')

const BASE_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/1'
const ADMIN_DB = process.env.E2E_ADMIN_DATABASE ?? 'template1'

function withDatabase(baseUrl: string, name: string) {
	const url = new URL(baseUrl)
	url.pathname = `/${name}`
	return url.toString()
}

async function withAdminClient<T>(fn: (client: pg.Client) => Promise<T>) {
	const client = new pg.Client({ connectionString: withDatabase(BASE_DATABASE_URL, ADMIN_DB) })
	await client.connect()
	try {
		return await fn(client)
	} finally {
		await client.end()
	}
}

function run(command: string, cwd: string, env: NodeJS.ProcessEnv) {
	return new Promise<void>((resolvePromise, rejectPromise) => {
		const child = spawn(command, { cwd, env, shell: true, stdio: 'inherit' })
		child.on('exit', code => (code === 0 ? resolvePromise() : rejectPromise(new Error(`${command} exited with code ${code}`))))
		child.on('error', rejectPromise)
	})
}

function runCaptureExitCode(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
	return new Promise<number>(resolvePromise => {
		const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
		child.on('exit', code => resolvePromise(code ?? 1))
		child.on('error', err => {
			console.error(`[e2e] failed to spawn ${command}:`, err)
			resolvePromise(1)
		})
	})
}

async function main() {
	const dbName = `e2e_${Date.now()}_${randomBytes(3).toString('hex')}`
	const databaseUrl = withDatabase(BASE_DATABASE_URL, dbName)
	const childEnv: NodeJS.ProcessEnv = {
		...process.env,
		DATABASE_URL: databaseUrl,
		REDIS_URL,
		// Pin ports so the webServer entries don't collide on $PORT from the root .env.
		API_PORT: process.env.API_PORT ?? '3030',
		PORT: process.env.PORT ?? '3030',
		VITE_PORT: process.env.VITE_PORT ?? '5173',
		// One host runs the whole suite - per-IP auth windows would 429 legitimate specs.
		RATE_LIMIT_DISABLED: 'true',
		// Canonical flow 4 subscribes on the SANDBOX gateway (fake money) - never the live Pagar.me.
		BILLING_SANDBOX: 'true',
	}

	// This runner OWNS the two dev ports for the duration of the run: its servers must be wired
	// to THIS run's ephemeral database, so a leftover listener from a previous run (watch-mode
	// orphan pointing at a dropped DB) is always wrong — kill it, never reuse it.
	for (const port of [childEnv.API_PORT, childEnv.VITE_PORT]) {
		const found = Bun.spawnSync(['lsof', '-ti', `:${port}`]).stdout.toString().trim()
		if (found) {
			console.log(`[e2e] killing stale listener(s) on :${port} (${found.split('\n').join(', ')})`)
			for (const pid of found.split('\n')) Bun.spawnSync(['kill', '-9', pid])
		}
	}

	console.log(`[e2e] creating ephemeral database: ${dbName}`)
	await withAdminClient(client => client.query(`CREATE DATABASE "${dbName}"`))

	let exitCode = 1
	try {
		// Contracts owns the whole DB schema via drizzle-kit (drizzle.config reads DATABASE_URL).
		console.log(`[e2e] running migrations (contracts drizzle)`)
		await run('bun run drizzle:migrate', CONTRACTS_DIR, childEnv)

		const extraArgs = process.argv.slice(2)
		console.log(`[e2e] running playwright${extraArgs.length ? ` ${extraArgs.join(' ')}` : ''}`)
		// bun-first repo: npx may not exist at all (spawn 'error' used to be swallowed as a silent
		// exit 1 with zero output). bun ships with the workspace — always present.
		exitCode = await runCaptureExitCode(
			'bun',
			['x', 'playwright', 'test', '--config', 'playwright.config.ts', '--project=e2e', ...extraArgs],
			childEnv,
			E2E_ROOT,
		)
	} finally {
		console.log(`[e2e] dropping ephemeral database: ${dbName}`)
		try {
			await withAdminClient(client => client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`))
		} catch (err) {
			console.error(`[e2e] teardown failed:`, err)
		}
	}

	process.exit(exitCode)
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
