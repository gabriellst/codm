import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * RAIL (spec D14/AC-4): `process.env.` fora do módulo Config é proibido em src/. O Config tipado
 * (`RawEnvSchema`) é a única porta de entrada de ambiente — um site cru é um eixo paralelo em
 * gestação (foi assim que nasceram mais de um flag de teste solto por aí, extintos desde). Exceções
 * vivem no INVENTORY (shrink-only, motivo inline); a lista vazia é o estado final.
 */
const SRC = join(import.meta.dir, '../../src')
const INVENTORY: string[] = []

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
