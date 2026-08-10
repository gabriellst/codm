import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * RAIL (spec D14/AC-4): `process.env.` fora do módulo Config é proibido em src/. O Config tipado
 * (`RawEnvSchema`) é a única porta de entrada de ambiente — um site cru é um eixo paralelo em
 * gestação (foi assim que CODM_E2E nasceu). Exceções vivem no INVENTORY (shrink-only, motivo
 * inline); a lista vazia é o estado final.
 */
const SRC = join(import.meta.dir, '../../src')
const INVENTORY: string[] = [
	// `PATH` is the OS's own executable search list, not application config — there is no default to
	// declare, no .env.example line a human would set, and RawEnvSchema exists to model THIS app's
	// config surface, not to wrap every inherited OS env var. Genuinely pre-Config in spirit even
	// though it runs after Config is parsed: the value has no product meaning outside `which`.
	'ProviderDetector/SystemProviderDetector.ts',
	// `CODM_PARENT_PID` is a SPAWN-TIME argument the desktop shell stamps on the child process, not
	// configuration — same class as `CODM_MIGRATIONS_DIR` (see the file's own "Why CODM_PARENT_PID is
	// not in REPO.env" section). Declaring it in Config/.env.example would put a pid in a file humans
	// edit, and a stale value there would make every `bun dev` daemon shut itself down a second after
	// boot; unset simply disables the watchdog, which is correct for dev/tests/e2e.
	'watchdog.ts',
]

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap(name => {
		const full = join(dir, name)
		return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
	})
}

describe('process.env é exclusivo do Config', () => {
	it('nenhum site cru fora do inventário', () => {
		const offenders = walk(SRC)
			.filter(file => !INVENTORY.some(entry => file.endsWith(entry)))
			.filter(file => /process\.env\./.test(readFileSync(file, 'utf8')))
		expect(offenders).toEqual([])
	})
	it('o inventário não tem entradas mortas', () => {
		for (const entry of INVENTORY) {
			const file = walk(SRC).find(f => f.endsWith(entry))
			expect(file, `entrada morta no INVENTORY: ${entry}`).toBeDefined()
			expect(/process\.env\./.test(readFileSync(file!, 'utf8')), `${entry} não usa mais process.env`).toBe(true)
		}
	})
})
